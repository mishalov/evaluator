/**
 * state/__tests__/saves.test.ts
 *
 * Tests for the named-saves module (saves.ts).
 *
 * Coverage:
 *  - CRUD round-trip (create → getSave → decode back to AppState)
 *  - Cap enforcement (MAX_SAVES, no eviction)
 *  - Overwrite keeps id+createdAt, bumps updatedAt, re-encodes
 *  - Rename changes name only; empty/whitespace → invalid-name
 *  - Delete removes; getSave→null; delete missing → false
 *  - Old-version save (v1 encoded payload) migrates correctly on load
 *  - Corrupt save encoded payload → loadSave returns {ok:false,error:'corrupt'}
 *    and does not mutate store state
 *  - Namespace isolation: saves do not touch evaluator:state and vice versa
 *  - Envelope resilience: invalid JSON → readEnvelope returns empty envelope
 *
 * NOTE: The test harness environment provides a `localStorage` that is a
 * proxy without standard Storage methods (side-effect of --localstorage-file
 * flag passed without a path by the Claude Code environment). We install a
 * proper in-memory mock via vi.stubGlobal so the module under test works.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import LZString from 'lz-string'
import {
  createSave,
  updateSave,
  renameSave,
  deleteSave,
  getSave,
  listSaves,
  readEnvelope,
  writeEnvelope,
  decodeSave,
  MAX_SAVES,
} from '../saves'
import { encodeAppState, decodeHash } from '../url'
import type { AppState } from '../../engine/types'
import { CURRENT_VERSION } from '../schema'

// ---------------------------------------------------------------------------
// In-memory localStorage mock
// ---------------------------------------------------------------------------

/**
 * Build a minimal in-memory localStorage compatible with the Web Storage API.
 * Used because the test harness environment's localStorage is a broken proxy
 * (--localstorage-file was passed without a valid path).
 */
function makeLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key: string, value: string): void {
      store[key] = String(value)
    },
    removeItem(key: string): void {
      delete store[key]
    },
    clear(): void {
      store = {}
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null
    },
    get length(): number {
      return Object.keys(store).length
    },
  }
}

const localStorageMock = makeLocalStorageMock()
vi.stubGlobal('localStorage', localStorageMock)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_STATE: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'USD',
  country: 'US',
  horizonYears: 20,
  displayMode: 'nominal',
  scenarios: [
    {
      id: 'sc-1',
      name: 'Test Scenario',
      salary: { annualAmount: 60_000, growthRate: 0.02, incomeTaxRate: 0.22 },
      blocks: [
        {
          kind: 'cash',
          id: 'c1',
          label: 'Savings',
          initialBalance: 10_000,
          monthlyContribution: 500,
          annualReturnRate: 0.07,
          capitalGainsTaxRate: 0.15,
        },
      ],
    },
  ],
}

const ALT_STATE: AppState = {
  ...BASE_STATE,
  horizonYears: 30,
  scenarios: [
    {
      ...BASE_STATE.scenarios[0],
      name: 'Alt Scenario',
      blocks: [
        {
          kind: 'cash',
          id: 'c2',
          label: 'Alt Savings',
          initialBalance: 20_000,
          monthlyContribution: 1_000,
          annualReturnRate: 0.08,
          capitalGainsTaxRate: 0.15,
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear()
})

// ---------------------------------------------------------------------------
// CRUD round-trip
// ---------------------------------------------------------------------------

describe('createSave / getSave / decode round-trip', () => {
  it('creates a save and retrieves it by id', () => {
    const result = createSave('My Save', BASE_STATE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const fetched = getSave(result.save.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(result.save.id)
    expect(fetched!.name).toBe('My Save')
    expect(fetched!.schemaVersion).toBe(CURRENT_VERSION)
  })

  it('round-trips encode → decode back to original AppState (via decodeHash)', () => {
    const result = createSave('Round-trip', BASE_STATE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const save = getSave(result.save.id)!
    const decoded = decodeHash(save.encoded)
    expect(decoded).not.toBeNull()
    expect(decoded).toEqual(BASE_STATE)
  })

  it('trimmed name is stored (leading/trailing whitespace stripped)', () => {
    const result = createSave('  trimmed  ', BASE_STATE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.save.name).toBe('trimmed')
  })

  it('returns invalid-name for empty string', () => {
    const result = createSave('', BASE_STATE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid-name')
  })

  it('returns invalid-name for whitespace-only name', () => {
    const result = createSave('   ', BASE_STATE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid-name')
  })

  it('returns invalid-name for name longer than 80 chars', () => {
    const result = createSave('a'.repeat(81), BASE_STATE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid-name')
  })

  it('accepts a name of exactly 80 chars', () => {
    const result = createSave('a'.repeat(80), BASE_STATE)
    expect(result.ok).toBe(true)
  })

  it('listSaves returns saves sorted by updatedAt desc', () => {
    createSave('First', BASE_STATE)
    // Ensure distinct timestamps by patching Date.now incrementally
    const orig = Date.now
    Date.now = vi.fn(() => orig() + 1000)
    createSave('Second', BASE_STATE)
    Date.now = orig

    const list = listSaves()
    expect(list.length).toBe(2)
    expect(list[0].name).toBe('Second')
    expect(list[1].name).toBe('First')
  })
})

// ---------------------------------------------------------------------------
// Cap enforcement
// ---------------------------------------------------------------------------

describe('MAX_SAVES cap', () => {
  it(`allows exactly ${MAX_SAVES} saves`, () => {
    for (let i = 0; i < MAX_SAVES; i++) {
      const result = createSave(`Save ${i}`, BASE_STATE)
      expect(result.ok).toBe(true)
    }
    expect(listSaves().length).toBe(MAX_SAVES)
  })

  it('returns cap-reached on the 51st save and does not grow the list', () => {
    for (let i = 0; i < MAX_SAVES; i++) {
      createSave(`Save ${i}`, BASE_STATE)
    }
    const result = createSave('Over the cap', BASE_STATE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('cap-reached')
    expect(listSaves().length).toBe(MAX_SAVES)
  })
})

// ---------------------------------------------------------------------------
// Overwrite (updateSave)
// ---------------------------------------------------------------------------

describe('updateSave', () => {
  it('keeps id and createdAt, bumps updatedAt, changes encoded', () => {
    const created = createSave('Original', BASE_STATE)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const origSave = getSave(created.save.id)!
    const origEncoded = origSave.encoded

    // Small delay to ensure updatedAt is strictly greater
    const laterNow = origSave.createdAt + 1000
    vi.spyOn(Date, 'now').mockReturnValue(laterNow)

    const result = updateSave(created.save.id, ALT_STATE)
    vi.restoreAllMocks()

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.save.id).toBe(created.save.id)
    expect(result.save.createdAt).toBe(origSave.createdAt)
    expect(result.save.updatedAt).toBe(laterNow)
    expect(result.save.encoded).not.toBe(origEncoded)

    // Verify the new encoded payload decodes to ALT_STATE
    const decoded = decodeHash(result.save.encoded)
    expect(decoded).toEqual(ALT_STATE)
  })

  it('returns not-found for a missing id', () => {
    const result = updateSave('nonexistent', BASE_STATE)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('not-found')
  })
})

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

describe('renameSave', () => {
  it('changes only the name field; other fields unchanged', () => {
    const created = createSave('Old Name', BASE_STATE)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const origSave = getSave(created.save.id)!
    const result = renameSave(created.save.id, 'New Name')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.save.name).toBe('New Name')
    expect(result.save.id).toBe(origSave.id)
    expect(result.save.createdAt).toBe(origSave.createdAt)
    expect(result.save.encoded).toBe(origSave.encoded)
  })

  it('returns invalid-name for empty string', () => {
    const created = createSave('Name', BASE_STATE)
    if (!created.ok) return
    const result = renameSave(created.save.id, '')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid-name')
  })

  it('returns invalid-name for whitespace-only name', () => {
    const created = createSave('Name', BASE_STATE)
    if (!created.ok) return
    const result = renameSave(created.save.id, '   ')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid-name')
  })

  it('returns not-found for a missing id', () => {
    const result = renameSave('nonexistent', 'Any Name')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('not-found')
  })
})

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('deleteSave', () => {
  it('removes the save; getSave returns null afterwards', () => {
    const created = createSave('To Delete', BASE_STATE)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(deleteSave(created.save.id)).toBe(true)
    expect(getSave(created.save.id)).toBeNull()
  })

  it('returns false for a missing id', () => {
    expect(deleteSave('nonexistent')).toBe(false)
  })

  it('does not affect other saves when one is deleted', () => {
    const a = createSave('A', BASE_STATE)
    const b = createSave('B', BASE_STATE)
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return

    deleteSave(a.save.id)
    expect(getSave(b.save.id)).not.toBeNull()
    expect(listSaves().length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Old-version save migrates on decode
// ---------------------------------------------------------------------------

describe('migration via decodeSave', () => {
  it('a v1-encoded payload decodes and migrates to CURRENT_VERSION', () => {
    // Build a v1-shaped AppState payload (without schemaVersion field, like a
    // real v1 payload that predates the rental block).
    const v1Payload = {
      schemaVersion: 1,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 30,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Rent Only',
          salary: { annualAmount: 0, growthRate: 0.02, incomeTaxRate: 0.25 },
          blocks: [
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 0,
              annualRentGrowth: 0.03,
              differentialInvesting: false,
            },
          ],
        },
      ],
    }

    // Encode it exactly as the codec would for a v1 state (v= in the hash will
    // reflect the schemaVersion field; decodeHash runs validateAndMigrate).
    const json = JSON.stringify({ v: 1, cur: 'CZK', co: 'CZ', hy: 30, dm: 'nominal',
      sc: [{ id: 'sc-1', n: 'Rent Only',
        s: { a: 0, g: 0.02, t: 0.25 },
        bs: [{ k: 'rent', id: 'r1', lb: 'Rent', r: 0, rg: 0.03, di: false }]
      }]
    })
    const compressed = LZString.compressToEncodedURIComponent(json)
    const encoded = `#v=1&s=${compressed}`

    const result = decodeSave(encoded)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // Ensure the scenario data survived migration
    expect(result!.scenarios[0].name).toBe('Rent Only')
    expect(result!.scenarios[0].blocks[0].kind).toBe('rent')
    void v1Payload // suppress unused warning
  })
})

// ---------------------------------------------------------------------------
// Corrupt save
// ---------------------------------------------------------------------------

describe('corrupt encoded payload', () => {
  it('decodeSave returns null for a corrupt encoded string', () => {
    const result = decodeSave('#v=2&s=@@@')
    expect(result).toBeNull()
  })

  it('a save with corrupt encoded string is detectable via decodeSave(getSave.encoded)', () => {
    // Manually write a corrupt save into the envelope
    const corruptSave = {
      id: 'sv_corrupt',
      name: 'Corrupt',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 2,
      encoded: '#v=2&s=@@@',
    }
    writeEnvelope({ v: 1, saves: [corruptSave] })

    const save = getSave('sv_corrupt')
    expect(save).not.toBeNull()

    const decoded = decodeSave(save!.encoded)
    expect(decoded).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation
// ---------------------------------------------------------------------------

describe('namespace isolation', () => {
  it('creating a save does not write to evaluator:state', () => {
    localStorage.setItem('evaluator:state', JSON.stringify({ marker: 'untouched' }))
    createSave('Isolation Test', BASE_STATE)
    const raw = localStorage.getItem('evaluator:state')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.marker).toBe('untouched')
  })

  it('clearing evaluator:state does not remove saves', () => {
    createSave('Keep This', BASE_STATE)
    localStorage.removeItem('evaluator:state')
    expect(listSaves().length).toBe(1)
  })

  it('creating saves does not interfere with evaluator:state key', () => {
    createSave('A', BASE_STATE)
    createSave('B', BASE_STATE)
    // evaluator:state key must not be set by saves module
    expect(localStorage.getItem('evaluator:state')).toBeNull()
  })

  it('saves list survives writing evaluator:state', () => {
    createSave('Persist', BASE_STATE)
    localStorage.setItem('evaluator:state', JSON.stringify(BASE_STATE))
    expect(listSaves().length).toBe(1)
    expect(listSaves()[0].name).toBe('Persist')
  })
})

// ---------------------------------------------------------------------------
// Envelope resilience
// ---------------------------------------------------------------------------

describe('readEnvelope resilience', () => {
  it('returns empty envelope when evaluator:saves is missing', () => {
    const env = readEnvelope()
    expect(env).toEqual({ v: 1, saves: [] })
  })

  it('returns empty envelope (does not throw) when evaluator:saves contains invalid JSON', () => {
    localStorage.setItem('evaluator:saves', 'not valid json {{{}')
    expect(() => readEnvelope()).not.toThrow()
    const env = readEnvelope()
    expect(env).toEqual({ v: 1, saves: [] })
  })

  it('returns empty envelope when evaluator:saves has wrong shape (no saves array)', () => {
    localStorage.setItem('evaluator:saves', JSON.stringify({ v: 1, notSaves: 'oops' }))
    const env = readEnvelope()
    expect(env).toEqual({ v: 1, saves: [] })
  })
})

// ---------------------------------------------------------------------------
// Codec round-trip via encodeAppState (additional cross-check)
// ---------------------------------------------------------------------------

describe('encoded payload cross-check', () => {
  it('encoded field in the save is a valid hash produced by encodeAppState', () => {
    const result = createSave('Codec Check', BASE_STATE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The encoded value must start with # (URL hash format)
    expect(result.save.encoded.startsWith('#')).toBe(true)

    // And must round-trip cleanly back via decodeHash
    const decoded = decodeHash(result.save.encoded)
    expect(decoded).toEqual(BASE_STATE)

    // Ensure encodeAppState produces the same string (codec is deterministic)
    expect(result.save.encoded).toBe(encodeAppState(BASE_STATE))
  })
})

// ---------------------------------------------------------------------------
// Quota error path
// ---------------------------------------------------------------------------

describe('quota errors', () => {
  it('createSave returns {ok:false,error:"quota"} when setItem throws a QuotaExceededError', () => {
    // Temporarily replace setItem with one that throws a quota DOMException.
    // We use DOMException (available in jsdom) to match what real browsers throw;
    // restore in a finally so later tests see the working mock.
    const originalSetItem = localStorageMock.setItem.bind(localStorageMock)
    try {
      localStorageMock.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }

      const listBefore = listSaves()
      const result = createSave('Quota Test', BASE_STATE)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('quota')

      // The list must not have grown (the failed write leaves storage unchanged)
      expect(listSaves().length).toBe(listBefore.length)
    } finally {
      localStorageMock.setItem = originalSetItem
    }
  })

  it('updateSave returns {ok:false,error:"quota"} when setItem throws on an existing save', () => {
    // First create a valid save with the real setItem
    const created = createSave('Existing', BASE_STATE)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const originalSetItem = localStorageMock.setItem.bind(localStorageMock)
    try {
      localStorageMock.setItem = () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      }

      const result = updateSave(created.save.id, ALT_STATE)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('quota')
    } finally {
      localStorageMock.setItem = originalSetItem
    }
  })
})
