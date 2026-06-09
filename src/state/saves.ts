/**
 * state/saves.ts
 *
 * Named saves — a SEPARATE localStorage namespace from the auto-persist key.
 *
 * Key: 'evaluator:saves'  (never touches 'evaluator:state')
 *
 * Envelope format: { v: 1, saves: NamedSave[] }
 *
 * The codec from url.ts (encodeAppState / decodeHash) is reused verbatim so
 * every save is the same compressed lz-string format as the URL hash.
 *
 * resetToDefaults does NOT clear this namespace — saves are intentionally
 * independent of the transient input state.
 *
 * None of the functions in this module throw; localStorage access is always
 * wrapped in try/catch so storage errors are surfaced as typed return values.
 */
import { encodeAppState, decodeHash } from './url'
import type { AppState } from '../engine/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NamedSave {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  schemaVersion: number
  encoded: string
}

export interface SavesEnvelope {
  v: number
  saves: NamedSave[]
}

export type SaveResult =
  | { ok: true; save: NamedSave }
  | { ok: false; error: 'cap-reached' | 'quota' | 'not-found' | 'invalid-name' }

export type LoadResult =
  | { ok: true; state: AppState }
  | { ok: false; error: 'not-found' | 'corrupt' }

export const MAX_SAVES = 50

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const SAVES_KEY = 'evaluator:saves'
const ENVELOPE_VERSION = 1

// ---------------------------------------------------------------------------
// Envelope read / write
// ---------------------------------------------------------------------------

/**
 * Read the saves envelope from localStorage.
 * Returns a fresh empty envelope on any error (missing key, corrupt JSON,
 * unexpected shape) — never throws.
 */
export function readEnvelope(): SavesEnvelope {
  try {
    const raw = localStorage.getItem(SAVES_KEY)
    if (!raw) return { v: ENVELOPE_VERSION, saves: [] }
    const parsed: unknown = JSON.parse(raw)
    // Minimal shape check — if it looks wrong, return empty rather than corrupt data
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).saves)
    ) {
      return { v: ENVELOPE_VERSION, saves: [] }
    }
    return parsed as SavesEnvelope
  } catch {
    return { v: ENVELOPE_VERSION, saves: [] }
  }
}

/**
 * Persist the envelope to localStorage.
 * Returns false on quota error or any other localStorage failure.
 */
export function writeEnvelope(env: SavesEnvelope): boolean {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(env))
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all saves sorted by updatedAt descending (most recent first).
 */
export function listSaves(): NamedSave[] {
  const { saves } = readEnvelope()
  return [...saves].sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Look up a single save by id.
 * Returns null when not found.
 */
export function getSave(id: string): NamedSave | null {
  const { saves } = readEnvelope()
  return saves.find((s) => s.id === id) ?? null
}

// ---------------------------------------------------------------------------
// Name validation (shared by create + rename)
// ---------------------------------------------------------------------------

function validateName(raw: string): { ok: true; name: string } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 80) return { ok: false }
  return { ok: true, name: trimmed }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new named save from the current AppState.
 *
 * Errors:
 *  - 'invalid-name'  — name is empty/whitespace or longer than 80 chars
 *  - 'cap-reached'   — already at MAX_SAVES (no eviction)
 *  - 'quota'         — localStorage write failed (storage full)
 */
export function createSave(name: string, appState: AppState): SaveResult {
  const nameResult = validateName(name)
  if (!nameResult.ok) return { ok: false, error: 'invalid-name' }

  const env = readEnvelope()
  if (env.saves.length >= MAX_SAVES) return { ok: false, error: 'cap-reached' }

  const now = Date.now()
  // Generate a unique id using timestamp base-36 + random suffix. At MAX_SAVES=50
  // the probability of a collision across saves is negligible (~1 in 10^8 per save).
  const id = `sv_${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

  const save: NamedSave = {
    id,
    name: nameResult.name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: appState.schemaVersion,
    encoded: encodeAppState(appState),
  }

  const updated: SavesEnvelope = { ...env, saves: [...env.saves, save] }
  const written = writeEnvelope(updated)
  if (!written) return { ok: false, error: 'quota' }

  return { ok: true, save }
}

/**
 * Overwrite an existing save with new AppState, bumping updatedAt.
 * Keeps id and createdAt unchanged.
 *
 * Errors:
 *  - 'not-found'  — no save with this id
 *  - 'quota'      — localStorage write failed
 */
export function updateSave(id: string, appState: AppState): SaveResult {
  const env = readEnvelope()
  const index = env.saves.findIndex((s) => s.id === id)
  if (index === -1) return { ok: false, error: 'not-found' }

  const existing = env.saves[index]
  const updated: NamedSave = {
    ...existing,
    updatedAt: Date.now(),
    schemaVersion: appState.schemaVersion,
    encoded: encodeAppState(appState),
  }

  const newSaves = [...env.saves]
  newSaves[index] = updated
  const written = writeEnvelope({ ...env, saves: newSaves })
  if (!written) return { ok: false, error: 'quota' }

  return { ok: true, save: updated }
}

/**
 * Rename an existing save.
 *
 * Errors:
 *  - 'not-found'    — no save with this id
 *  - 'invalid-name' — name is empty/whitespace or longer than 80 chars
 *  - 'quota'        — localStorage write failed
 */
export function renameSave(id: string, name: string): SaveResult {
  const nameResult = validateName(name)
  if (!nameResult.ok) return { ok: false, error: 'invalid-name' }

  const env = readEnvelope()
  const index = env.saves.findIndex((s) => s.id === id)
  if (index === -1) return { ok: false, error: 'not-found' }

  const existing = env.saves[index]
  const updated: NamedSave = { ...existing, name: nameResult.name, updatedAt: Date.now() }

  const newSaves = [...env.saves]
  newSaves[index] = updated
  const written = writeEnvelope({ ...env, saves: newSaves })
  if (!written) return { ok: false, error: 'quota' }

  return { ok: true, save: updated }
}

/**
 * Delete a save by id.
 * Returns true on success, false if not found or on localStorage failure.
 */
export function deleteSave(id: string): boolean {
  try {
    const env = readEnvelope()
    const index = env.saves.findIndex((s) => s.id === id)
    if (index === -1) return false

    const newSaves = env.saves.filter((s) => s.id !== id)
    return writeEnvelope({ ...env, saves: newSaves })
  } catch {
    return false
  }
}

/**
 * Decode an encoded save payload back to AppState.
 * Returns null when the encoded string is corrupt or fails migration/validation.
 * Thin wrapper around decodeHash — keeps callers from importing url.ts directly.
 */
export function decodeSave(encoded: string): AppState | null {
  return decodeHash(encoded)
}
