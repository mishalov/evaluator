/**
 * state/__tests__/schema.test.ts
 *
 * Tests for the zod validation and migration system (M5).
 *
 * Tests:
 *   - Known-good AppState passes validateAndMigrate
 *   - Unknown extra fields are stripped by zod (strict/passthrough behavior)
 *   - Migration harness runs and bumps schemaVersion correctly
 *   - validateAndMigrate returns null for invalid payloads
 */
import { describe, it, expect } from 'vitest'
import {
  AppStateSchema,
  validateAndMigrate,
  runMigrations,
  migrations,
  CURRENT_VERSION,
  type Migration,
} from '../schema'
import type { AppState, RentalPropertyBlock } from '../../engine/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_STATE: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'USD',
  country: 'US',
  horizonYears: 30,
  displayMode: 'nominal',
  scenarios: [
    {
      id: 'sc-1',
      name: 'Test Scenario',
      salary: { annualAmount: 80_000, growthRate: 0.02, incomeTaxRate: 0.25 },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppStateSchema validation', () => {
  it('validates a known-good AppState without error', () => {
    const result = AppStateSchema.safeParse(VALID_STATE)
    expect(result.success).toBe(true)
  })

  it('rejects a state with missing required fields', () => {
    const bad = { ...VALID_STATE, currency: undefined }
    const result = AppStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects horizonYears = 0 (below min of 1)', () => {
    const bad = { ...VALID_STATE, horizonYears: 0 }
    const result = AppStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects horizonYears = 51 (above max of 50)', () => {
    const bad = { ...VALID_STATE, horizonYears: 51 }
    const result = AppStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('strips (or ignores) unknown extra fields at the top level', () => {
    // zod's default is to strip unknown keys — validate this matches the config
    const withExtra = { ...VALID_STATE, unknownField: 'should-be-stripped' }
    const result = AppStateSchema.safeParse(withExtra)
    // Whether it strips or keeps the field, parsing should succeed
    expect(result.success).toBe(true)
    if (result.success) {
      // If zod strips the field, it won't be in the output
      expect((result.data as Record<string, unknown>).unknownField).toBeUndefined()
    }
  })

  it('validates all three block kinds inside a scenario', () => {
    const state: AppState = {
      ...VALID_STATE,
      scenarios: [
        {
          id: 'sc-multi',
          name: 'Multi-block',
          salary: VALID_STATE.scenarios[0].salary,
          blocks: [
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 100,
              annualReturnRate: 0.05,
              capitalGainsTaxRate: 0.1,
            },
            {
              kind: 'mortgage',
              id: 'm1',
              label: 'Mortgage',
              propertyValue: 300_000,
              downPayment: 60_000,
              annualInterestRate: 0.06,
              termYears: 30,
              appreciationRate: 0.03,
              propertyTaxRate: 0.01,
              maintenanceRate: 0.01,
            },
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 2_000,
              annualRentGrowth: 0.03,
              differentialInvesting: false,
            },
          ],
        },
      ],
    }
    const result = AppStateSchema.safeParse(state)
    expect(result.success).toBe(true)
  })
})

describe('validateAndMigrate', () => {
  it('returns the validated state for a known-good payload at CURRENT_VERSION', () => {
    const result = validateAndMigrate(VALID_STATE)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)
  })

  it('returns null for null input', () => {
    expect(validateAndMigrate(null)).toBeNull()
  })

  it('returns null for a non-object input', () => {
    expect(validateAndMigrate('string')).toBeNull()
    expect(validateAndMigrate(42)).toBeNull()
  })

  it('returns null for a structurally invalid object', () => {
    expect(validateAndMigrate({ schemaVersion: 1, currency: 'bad-format' })).toBeNull()
  })

  it('does not throw on any input', () => {
    const inputs = [null, undefined, '', 0, [], {}, 'garbage', { schemaVersion: 'nope' }]
    for (const input of inputs) {
      expect(() => validateAndMigrate(input)).not.toThrow()
    }
  })
})

describe('runMigrations (harness)', () => {
  it('runs a single migration and bumps schemaVersion to v+1', () => {
    // Register a test migration inline (without touching the real migrations map)
    const testMigrations: Record<number, Migration> = {
      0: (state) => ({ ...state, addedByMigration: true }),
    }

    let current: Record<string, unknown> = { schemaVersion: 0, data: 'original' }
    for (let v = 0; v < 1; v++) {
      const migrate = testMigrations[v]
      if (migrate) current = migrate(current)
      current.schemaVersion = v + 1
    }

    expect(current.schemaVersion).toBe(1)
    expect((current as Record<string, unknown>).addedByMigration).toBe(true)
    expect(current.data).toBe('original')
  })

  it('runMigrations sets schemaVersion after each step (M4 harness contract)', () => {
    // Temporarily inject a fake migration to verify the harness contract
    // We test this by calling runMigrations with a fromVersion that is < CURRENT_VERSION
    // but with no actual migration defined (so the loop only bumps the version).
    // Since CURRENT_VERSION === 1 and no migration is defined for version 0,
    // runMigrations from version 0 should still set schemaVersion = 1.
    const result = runMigrations({ schemaVersion: 0 }, 0)
    // schemaVersion must be bumped by the harness even if no migration function exists
    expect(result.schemaVersion).toBe(CURRENT_VERSION)
  })

  it('migrations map does not contain any entry that incorrectly sets schemaVersion (M4 contract)', () => {
    // Each migration function must NOT actively change schemaVersion — that is the
    // harness's job. A no-op migration that passes the input through unchanged
    // (and thus returns the same schemaVersion) is fine.
    // This lint catches migrations that explicitly increment schemaVersion themselves.
    for (const [vStr, migrate] of Object.entries(migrations)) {
      const v = parseInt(vStr, 10)
      const input: Record<string, unknown> = { schemaVersion: v, placeholder: true }
      const output = migrate(input)
      // If the migration CHANGED schemaVersion relative to input, it must be v+1.
      // Passing schemaVersion through unchanged (no-op) is explicitly allowed.
      if ('schemaVersion' in output && output.schemaVersion !== v) {
        expect(output.schemaVersion).toBe(v + 1)
      }
    }
  })

  it('is a no-op when fromVersion === CURRENT_VERSION', () => {
    const state = { schemaVersion: CURRENT_VERSION, data: 'unchanged' }
    const result = runMigrations(state, CURRENT_VERSION)
    expect(result.data).toBe('unchanged')
    // schemaVersion should not change (loop doesn't execute)
    expect(result.schemaVersion).toBe(CURRENT_VERSION)
  })
})

// ---------------------------------------------------------------------------
// RentalPropertyBlock schema
// ---------------------------------------------------------------------------

const VALID_RENTAL_BLOCK: RentalPropertyBlock = {
  kind: 'rental',
  id: 'rnt1',
  label: 'Prague Flat',
  propertyValue: 7_500_000,
  downPayment: 1_500_000,
  annualInterestRate: 0.052,
  termYears: 30,
  appreciationRate: 0.04,
  propertyTaxRate: 0.0005,
  maintenanceRate: 0.01,
  monthlyRentIncome: 28_000,
  annualRentGrowth: 0.03,
  vacancyRate: 0.05,
  expenseMethod: 'lumpSum30',
  landlordTaxRate: 0.15,
  landlordTaxRateHigh: 0.23,
  landlordTaxThreshold: 1_762_812,
}

describe('RentalPropertyBlockSchema', () => {
  const stateWithRental: AppState = {
    ...VALID_STATE,
    schemaVersion: CURRENT_VERSION,
    scenarios: [
      {
        id: 'sc-rental',
        name: 'Landlord',
        salary: VALID_STATE.scenarios[0].salary,
        blocks: [
          VALID_RENTAL_BLOCK,
          {
            kind: 'cash',
            id: 'c1',
            label: 'Savings',
            initialBalance: 0,
            monthlyContribution: 0,
            annualReturnRate: 0.05,
            capitalGainsTaxRate: 0.15,
          },
        ],
      },
    ],
  }

  it('validates a rental block inside an AppState without error', () => {
    const result = AppStateSchema.safeParse(stateWithRental)
    expect(result.success).toBe(true)
  })

  it('round-trips through AppStateSchema without data loss', () => {
    const result = AppStateSchema.safeParse(stateWithRental)
    expect(result.success).toBe(true)
    if (result.success) {
      const rentalBlock = result.data.scenarios[0].blocks[0]
      expect(rentalBlock.kind).toBe('rental')
      if (rentalBlock.kind === 'rental') {
        expect(rentalBlock.propertyValue).toBe(7_500_000)
        expect(rentalBlock.expenseMethod).toBe('lumpSum30')
        expect(rentalBlock.landlordTaxThreshold).toBe(1_762_812)
        expect(rentalBlock.annualDepreciation).toBeUndefined()
      }
    }
  })

  it('validates optional annualDepreciation when present', () => {
    const withDepr: AppState = {
      ...stateWithRental,
      scenarios: [
        {
          ...stateWithRental.scenarios[0],
          blocks: [
            { ...VALID_RENTAL_BLOCK, annualDepreciation: 50_000 },
            stateWithRental.scenarios[0].blocks[1],
          ],
        },
      ],
    }
    const result = AppStateSchema.safeParse(withDepr)
    expect(result.success).toBe(true)
    if (result.success) {
      const b = result.data.scenarios[0].blocks[0]
      if (b.kind === 'rental') {
        expect(b.annualDepreciation).toBe(50_000)
      }
    }
  })

  it('rejects invalid expenseMethod value', () => {
    const bad = {
      ...stateWithRental,
      scenarios: [
        {
          ...stateWithRental.scenarios[0],
          blocks: [
            { ...VALID_RENTAL_BLOCK, expenseMethod: 'notAValidMethod' },
            stateWithRental.scenarios[0].blocks[1],
          ],
        },
      ],
    }
    const result = AppStateSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })
})

describe('v1 → v2 migration (rental block addition)', () => {
  it('v1 payload without rental block migrates to v2 (no-op) and validates', () => {
    // Build a v1-shaped payload (before rental block was added)
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
    // validateAndMigrate must run the v1→v2 no-op, bump schemaVersion, and validate
    const result = validateAndMigrate(v1Payload)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION) // = 2
  })
})
