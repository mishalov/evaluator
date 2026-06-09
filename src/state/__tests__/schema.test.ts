/**
 * state/__tests__/schema.test.ts
 *
 * Tests for the zod validation and migration system.
 *
 * Coverage:
 *   - Known-good AppState passes validateAndMigrate (v3 shape with assumptions)
 *   - Unknown extra fields are stripped by zod
 *   - Migration harness runs and bumps schemaVersion correctly
 *   - validateAndMigrate returns null for invalid payloads
 *   - v2 → v3 migration: assumptions hoisted from scenario[0] blocks/salary
 */
import { describe, it, expect } from 'vitest'
import {
  AppStateSchema,
  validateAndMigrate,
  runMigrations,
  migrations,
  CURRENT_VERSION,
  DEFAULT_ASSUMPTIONS,
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
  assumptions: DEFAULT_ASSUMPTIONS,
  scenarios: [
    {
      id: 'sc-1',
      name: 'Test Scenario',
      blocks: [
        {
          kind: 'cash',
          id: 'c1',
          label: 'Savings',
          initialBalance: 10_000,
          monthlyContribution: 500,
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
    const withExtra = { ...VALID_STATE, unknownField: 'should-be-stripped' }
    const result = AppStateSchema.safeParse(withExtra)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as unknown as Record<string, unknown>).unknownField).toBeUndefined()
    }
  })

  it('validates all three block kinds inside a scenario', () => {
    const state: AppState = {
      ...VALID_STATE,
      scenarios: [
        {
          id: 'sc-multi',
          name: 'Multi-block',
          blocks: [
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 100,
            },
            {
              kind: 'mortgage',
              id: 'm1',
              label: 'Mortgage',
              propertyValue: 300_000,
              downPayment: 60_000,
              termYears: 30,
            },
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 2_000,
              differentialInvesting: false,
            },
          ],
        },
      ],
    }
    const result = AppStateSchema.safeParse(state)
    expect(result.success).toBe(true)
  })

  it('rejects a scenario with salary field (moved to assumptions in v3)', () => {
    // A Scenario must not have a salary field in v3
    const badState = {
      ...VALID_STATE,
      scenarios: [
        {
          ...VALID_STATE.scenarios[0],
          salary: { annualAmount: 60_000, growthRate: 0.02, incomeTaxRate: 0.22 },
        },
      ],
    }
    // zod strips unknown fields, so this should still succeed (the extra salary is dropped)
    const result = AppStateSchema.safeParse(badState)
    expect(result.success).toBe(true)
    if (result.success) {
      // salary must not be present in the output (stripped)
      expect((result.data.scenarios[0] as unknown as Record<string, unknown>).salary).toBeUndefined()
    }
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
    expect((current as unknown as Record<string, unknown>).addedByMigration).toBe(true)
    expect(current.data).toBe('original')
  })

  it('runMigrations sets schemaVersion after each step (M4 harness contract)', () => {
    const result = runMigrations({ schemaVersion: 0 }, 0)
    expect(result.schemaVersion).toBe(CURRENT_VERSION)
  })

  it('migrations map does not contain any entry that incorrectly sets schemaVersion (M4 contract)', () => {
    for (const [vStr, migrate] of Object.entries(migrations)) {
      const v = parseInt(vStr, 10)
      const input: Record<string, unknown> = { schemaVersion: v, placeholder: true }
      const output = migrate(input)
      if ('schemaVersion' in output && output.schemaVersion !== v) {
        expect(output.schemaVersion).toBe(v + 1)
      }
    }
  })

  it('is a no-op when fromVersion === CURRENT_VERSION', () => {
    const state = { schemaVersion: CURRENT_VERSION, data: 'unchanged' }
    const result = runMigrations(state, CURRENT_VERSION)
    expect(result.data).toBe('unchanged')
    expect(result.schemaVersion).toBe(CURRENT_VERSION)
  })
})

// ---------------------------------------------------------------------------
// RentalPropertyBlock schema (v3 shape)
// ---------------------------------------------------------------------------

const VALID_RENTAL_BLOCK: RentalPropertyBlock = {
  kind: 'rental',
  id: 'rnt1',
  label: 'Prague Flat',
  propertyValue: 7_500_000,
  downPayment: 1_500_000,
  termYears: 30,
  monthlyRentIncome: 28_000,
  vacancyRate: 0.05,
  expenseMethod: 'lumpSum30',
}

describe('RentalPropertyBlockSchema (v3)', () => {
  const stateWithRental: AppState = {
    ...VALID_STATE,
    scenarios: [
      {
        id: 'sc-rental',
        name: 'Landlord',
        blocks: [
          VALID_RENTAL_BLOCK,
          {
            kind: 'cash',
            id: 'c1',
            label: 'Savings',
            initialBalance: 0,
            monthlyContribution: 0,
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

  it('rental block has no rate fields in v3 (annualInterestRate, appreciationRate, etc.)', () => {
    const result = AppStateSchema.safeParse(stateWithRental)
    if (result.success) {
      const b = result.data.scenarios[0].blocks[0]
      expect((b as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).appreciationRate).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).maintenanceRate).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).landlordTaxRate).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

describe('v1 → v2 migration (rental block addition)', () => {
  it('v1 payload without rental block migrates to v2 then v3 and validates', () => {
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
    const result = validateAndMigrate(v1Payload)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION) // = 3
    // assumptions should have been hoisted
    expect(result!.assumptions).toBeDefined()
    expect(result!.assumptions.rentGrowth).toBe(0.03)
    expect(result!.assumptions.salary.growthRate).toBe(0.02)
  })
})

// ---------------------------------------------------------------------------
// v2 → v3 migration
// ---------------------------------------------------------------------------

describe('v2 → v3 migration (assumptions hoist)', () => {
  it('v2 payload migrates to v3 with assumptions hoisted from scenario[0]', () => {
    const v2Payload = {
      schemaVersion: 2,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 30,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Rent & Invest',
          salary: { annualAmount: 60_000, growthRate: 0.025, incomeTaxRate: 0.22 },
          blocks: [
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 15_000,
              annualRentGrowth: 0.04,
              differentialInvesting: false,
            },
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 100_000,
              monthlyContribution: 5_000,
              annualReturnRate: 0.08,
              capitalGainsTaxRate: 0.19,
            },
          ],
        },
        {
          id: 'sc-2',
          name: 'Buy a Home',
          salary: { annualAmount: 60_000, growthRate: 0.025, incomeTaxRate: 0.22 },
          blocks: [
            {
              kind: 'mortgage',
              id: 'm1',
              label: 'Home',
              propertyValue: 5_000_000,
              downPayment: 1_000_000,
              annualInterestRate: 0.055,
              termYears: 25,
              appreciationRate: 0.03,
              propertyTaxRate: 0.001,
              maintenanceRate: 0.008,
            },
            {
              kind: 'cash',
              id: 'c2',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 2_000,
              annualReturnRate: 0.06,
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
      ],
    }

    const result = validateAndMigrate(v2Payload)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION) // 3

    // Salary hoisted from scenarios[0].salary
    expect(result!.assumptions.salary.annualAmount).toBe(60_000)
    expect(result!.assumptions.salary.growthRate).toBe(0.025)
    expect(result!.assumptions.salary.incomeTaxRate).toBe(0.22)

    // Investment hoisted from scenarios[0].cash block
    expect(result!.assumptions.investment.annualReturnRate).toBe(0.08)
    expect(result!.assumptions.investment.capitalGainsTaxRate).toBe(0.19)

    // rentGrowth hoisted from scenarios[0].rent block
    expect(result!.assumptions.rentGrowth).toBe(0.04)

    // Property rates: migration scans ALL scenarios for the first mortgage block.
    // scenarios[0] has no mortgage block but scenarios[1] ("Buy a Home") does —
    // those rates must be hoisted, not silently replaced by DEFAULT_ASSUMPTIONS.
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.055)
    expect(result!.assumptions.property.appreciationRate).toBe(0.03)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.008)

    // propertyTaxRate must be DROPPED (not in assumptions)
    expect((result!.assumptions as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()

    // Per-block rate fields stripped from blocks
    const cashBlock1 = result!.scenarios[0].blocks.find((b) => b.kind === 'cash')!
    expect((cashBlock1 as unknown as Record<string, unknown>).annualReturnRate).toBeUndefined()
    expect((cashBlock1 as unknown as Record<string, unknown>).capitalGainsTaxRate).toBeUndefined()

    const mortgageBlock = result!.scenarios[1].blocks.find((b) => b.kind === 'mortgage')!
    expect((mortgageBlock as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
    expect((mortgageBlock as unknown as Record<string, unknown>).appreciationRate).toBeUndefined()
    expect((mortgageBlock as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
    expect((mortgageBlock as unknown as Record<string, unknown>).maintenanceRate).toBeUndefined()

    // Salary stripped from scenarios
    expect((result!.scenarios[0] as unknown as Record<string, unknown>).salary).toBeUndefined()
    expect((result!.scenarios[1] as unknown as Record<string, unknown>).salary).toBeUndefined()

    // Per-block fields that should remain are still present
    const mortBlock = result!.scenarios[1].blocks.find((b) => b.kind === 'mortgage')
    if (mortBlock?.kind === 'mortgage') {
      expect(mortBlock.propertyValue).toBe(5_000_000)
      expect(mortBlock.downPayment).toBe(1_000_000)
      expect(mortBlock.termYears).toBe(25)
    }
  })

  it('v2 payload with rental block hoists landlordTax into assumptions', () => {
    const v2WithRental = {
      schemaVersion: 2,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 30,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-land',
          name: 'Landlord',
          salary: { annualAmount: 0, growthRate: 0.02, incomeTaxRate: 0.25 },
          blocks: [
            {
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
            },
            {
              kind: 'cash',
              id: 'c1',
              label: 'Savings',
              initialBalance: 2_000_000,
              monthlyContribution: 0,
              annualReturnRate: 0.05,
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
      ],
    }

    const result = validateAndMigrate(v2WithRental)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // landlordTax hoisted
    expect(result!.assumptions.landlordTax.rate).toBe(0.15)
    expect(result!.assumptions.landlordTax.rateHigh).toBe(0.23)
    expect(result!.assumptions.landlordTax.threshold).toBe(1_762_812)

    // property hoisted from rental block (no mortgage block present)
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.052)
    expect(result!.assumptions.property.appreciationRate).toBe(0.04)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.01)

    // rentGrowth from rental block
    expect(result!.assumptions.rentGrowth).toBe(0.03)

    // Rental block per-block rates stripped, per-property amounts remain
    const rentalBlock = result!.scenarios[0].blocks.find((b) => b.kind === 'rental')
    if (rentalBlock?.kind === 'rental') {
      expect(rentalBlock.propertyValue).toBe(7_500_000)
      expect(rentalBlock.monthlyRentIncome).toBe(28_000)
      expect(rentalBlock.vacancyRate).toBe(0.05)
      expect((rentalBlock as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((rentalBlock as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
      expect((rentalBlock as unknown as Record<string, unknown>).landlordTaxRate).toBeUndefined()
    }
  })

  it('v2 payload with missing rates falls back to DEFAULT_ASSUMPTIONS', () => {
    const v2Minimal = {
      schemaVersion: 2,
      currency: 'USD',
      country: 'US',
      horizonYears: 20,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-1',
          name: 'Cash Only',
          salary: { annualAmount: 0, growthRate: 0, incomeTaxRate: 0 },
          blocks: [
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 10_000,
              monthlyContribution: 500,
              // annualReturnRate intentionally absent → uses DEFAULT_ASSUMPTIONS
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
      ],
    }

    const result = validateAndMigrate(v2Minimal)
    expect(result).not.toBeNull()
    // annualReturnRate absent in old cash block → DEFAULT_ASSUMPTIONS.investment.annualReturnRate
    expect(result!.assumptions.investment.annualReturnRate).toBe(
      DEFAULT_ASSUMPTIONS.investment.annualReturnRate,
    )
    // capitalGainsTaxRate was present
    expect(result!.assumptions.investment.capitalGainsTaxRate).toBe(0.15)
  })

  it('v2 payload: mortgage block on scenario[1] (not scenario[0]) — rates ARE hoisted', () => {
    // This is the canonical real-world case: the default v2 layout had "Rent & Invest"
    // as scenarios[0] (no mortgage) and "Buy a Home" as scenarios[1] (has mortgage).
    // The migration must scan all scenarios, not only scenarios[0].
    const v2MultiScenario = {
      schemaVersion: 2,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 30,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-0',
          name: 'Rent & Invest',
          salary: { annualAmount: 50_000, growthRate: 0.02, incomeTaxRate: 0.22 },
          blocks: [
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 12_000,
              annualRentGrowth: 0.035,
              differentialInvesting: false,
            },
            {
              kind: 'cash',
              id: 'c0',
              label: 'Cash',
              initialBalance: 500_000,
              monthlyContribution: 3_000,
              annualReturnRate: 0.07,
              capitalGainsTaxRate: 0.19,
            },
          ],
        },
        {
          id: 'sc-1',
          name: 'Buy a Home',
          salary: { annualAmount: 50_000, growthRate: 0.02, incomeTaxRate: 0.22 },
          blocks: [
            {
              kind: 'mortgage',
              id: 'm1',
              label: 'Apartment',
              propertyValue: 6_000_000,
              downPayment: 1_200_000,
              annualInterestRate: 0.049,
              termYears: 30,
              appreciationRate: 0.035,
              propertyTaxRate: 0.001,
              maintenanceRate: 0.012,
            },
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 1_000,
              annualReturnRate: 0.05,
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
      ],
    }

    const result = validateAndMigrate(v2MultiScenario)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // Salary from scenarios[0] (canonical — every scenario had the same salary in v2)
    expect(result!.assumptions.salary.annualAmount).toBe(50_000)
    expect(result!.assumptions.salary.growthRate).toBe(0.02)

    // Investment from first cash block found (scenarios[0].c0)
    expect(result!.assumptions.investment.annualReturnRate).toBe(0.07)
    expect(result!.assumptions.investment.capitalGainsTaxRate).toBe(0.19)

    // rentGrowth from scenarios[0] rent block
    expect(result!.assumptions.rentGrowth).toBe(0.035)

    // Property rates from scenarios[1] mortgage block — must NOT fall back to defaults
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.049)
    expect(result!.assumptions.property.appreciationRate).toBe(0.035)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.012)

    // propertyTaxRate must be dropped
    expect((result!.assumptions as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
  })

  it('v2 payload: no mortgage or rental block in any scenario → property falls back to DEFAULT_ASSUMPTIONS', () => {
    const v2CashAndRent = {
      schemaVersion: 2,
      currency: 'USD',
      country: 'US',
      horizonYears: 20,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-0',
          name: 'Cash Only',
          salary: { annualAmount: 0, growthRate: 0, incomeTaxRate: 0 },
          blocks: [
            {
              kind: 'cash',
              id: 'c0',
              label: 'Cash',
              initialBalance: 100_000,
              monthlyContribution: 1_000,
              annualReturnRate: 0.07,
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
        {
          id: 'sc-1',
          name: 'Rent Only',
          salary: { annualAmount: 0, growthRate: 0, incomeTaxRate: 0 },
          blocks: [
            {
              kind: 'rent',
              id: 'r1',
              label: 'Rent',
              monthlyRent: 1_500,
              annualRentGrowth: 0.03,
              differentialInvesting: false,
            },
          ],
        },
      ],
    }

    const result = validateAndMigrate(v2CashAndRent)
    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // No mortgage or rental block anywhere → property falls back to DEFAULT_ASSUMPTIONS
    expect(result!.assumptions.property.mortgageInterestRate).toBe(
      DEFAULT_ASSUMPTIONS.property.mortgageInterestRate,
    )
    expect(result!.assumptions.property.appreciationRate).toBe(
      DEFAULT_ASSUMPTIONS.property.appreciationRate,
    )
    expect(result!.assumptions.property.maintenanceRate).toBe(
      DEFAULT_ASSUMPTIONS.property.maintenanceRate,
    )

    // No rental block → landlordTax falls back to DEFAULT_ASSUMPTIONS
    expect(result!.assumptions.landlordTax.rate).toBe(DEFAULT_ASSUMPTIONS.landlordTax.rate)
    expect(result!.assumptions.landlordTax.rateHigh).toBe(DEFAULT_ASSUMPTIONS.landlordTax.rateHigh)
    expect(result!.assumptions.landlordTax.threshold).toBe(DEFAULT_ASSUMPTIONS.landlordTax.threshold)
  })
})
