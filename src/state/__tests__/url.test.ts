/**
 * state/__tests__/url.test.ts
 *
 * Roundtrip and edge-case tests for the URL hash codec (M5).
 *
 * Tests:
 *   - encodeAppState → decodeHash roundtrip with all 3 block types
 *   - Roundtrip with 3 scenarios
 *   - Invalid hash returns null without throwing
 */
import { describe, it, expect } from 'vitest'
import { encodeAppState, decodeHash } from '../url'
import type { AppState, RentalPropertyBlock } from '../../engine/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SALARY = { annualAmount: 75_000, growthRate: 0.02, incomeTaxRate: 0.22 }

const STATE_ALL_BLOCK_TYPES: AppState = {
  schemaVersion: 2,
  currency: 'USD',
  country: 'US',
  horizonYears: 20,
  displayMode: 'nominal',
  scenarios: [
    {
      id: 'sc-all',
      name: 'All Block Types',
      salary: SALARY,
      blocks: [
        {
          kind: 'cash',
          id: 'c1',
          label: 'Investment',
          initialBalance: 50_000,
          monthlyContribution: 1_000,
          annualReturnRate: 0.07,
          capitalGainsTaxRate: 0.15,
        },
        {
          kind: 'mortgage',
          id: 'm1',
          label: 'Home',
          propertyValue: 400_000,
          downPayment: 80_000,
          annualInterestRate: 0.065,
          termYears: 30,
          appreciationRate: 0.03,
          propertyTaxRate: 0.011,
          maintenanceRate: 0.01,
        },
        {
          kind: 'rent',
          id: 'r1',
          label: 'Apartment',
          monthlyRent: 1_800,
          annualRentGrowth: 0.03,
          differentialInvesting: true,
          referenceMonthlyPayment: 1_500,
        },
      ],
    },
  ],
}

const STATE_THREE_SCENARIOS: AppState = {
  schemaVersion: 2,
  currency: 'EUR',
  country: 'DE',
  horizonYears: 30,
  displayMode: 'real',
  inflationOverridePct: 0.025,
  scenarios: [
    {
      id: 'sc-1',
      name: 'Rent Only',
      salary: SALARY,
      blocks: [
        {
          kind: 'rent',
          id: 'r-a',
          label: 'Apt',
          monthlyRent: 1_200,
          annualRentGrowth: 0.02,
          differentialInvesting: false,
        },
      ],
    },
    {
      id: 'sc-2',
      name: 'Buy Home',
      salary: SALARY,
      blocks: [
        {
          kind: 'mortgage',
          id: 'm-a',
          label: 'House',
          propertyValue: 350_000,
          downPayment: 70_000,
          annualInterestRate: 0.04,
          termYears: 25,
          appreciationRate: 0.02,
          propertyTaxRate: 0.006,
          maintenanceRate: 0.008,
        },
      ],
    },
    {
      id: 'sc-3',
      name: 'Cash Only',
      salary: SALARY,
      blocks: [
        {
          kind: 'cash',
          id: 'c-a',
          label: 'ETF',
          initialBalance: 100_000,
          monthlyContribution: 600,
          annualReturnRate: 0.08,
          capitalGainsTaxRate: 0.26,
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundtrip(state: AppState): AppState | null {
  const hash = encodeAppState(state)
  return decodeHash(hash)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('URL codec roundtrip', () => {
  it('state with all 3 block types survives encode → decode unmodified', () => {
    const decoded = roundtrip(STATE_ALL_BLOCK_TYPES)
    expect(decoded).not.toBeNull()
    expect(decoded).toEqual(STATE_ALL_BLOCK_TYPES)
  })

  it('state with 3 scenarios survives encode → decode unmodified', () => {
    const decoded = roundtrip(STATE_THREE_SCENARIOS)
    expect(decoded).not.toBeNull()
    expect(decoded).toEqual(STATE_THREE_SCENARIOS)
  })

  it('optional referenceMonthlyPayment is preserved when set', () => {
    const decoded = roundtrip(STATE_ALL_BLOCK_TYPES)!
    const rentBlock = decoded.scenarios[0].blocks.find((b) => b.kind === 'rent')!
    expect(rentBlock.kind).toBe('rent')
    if (rentBlock.kind === 'rent') {
      expect(rentBlock.referenceMonthlyPayment).toBe(1_500)
    }
  })

  it('optional referenceMonthlyPayment is omitted when not set', () => {
    const state: AppState = {
      ...STATE_THREE_SCENARIOS,
      scenarios: [
        {
          ...STATE_THREE_SCENARIOS.scenarios[0],
          blocks: [
            {
              kind: 'rent',
              id: 'r-x',
              label: 'Rent',
              monthlyRent: 1_000,
              annualRentGrowth: 0,
              differentialInvesting: false,
              // referenceMonthlyPayment intentionally omitted
            },
          ],
        },
      ],
    }
    const decoded = roundtrip(state)!
    const rentBlock = decoded.scenarios[0].blocks[0]
    if (rentBlock.kind === 'rent') {
      expect(rentBlock.referenceMonthlyPayment).toBeUndefined()
    }
  })

  it('optional inflationOverridePct is preserved', () => {
    const decoded = roundtrip(STATE_THREE_SCENARIOS)!
    expect(decoded.inflationOverridePct).toBe(0.025)
  })

  it('displayMode real is preserved', () => {
    const decoded = roundtrip(STATE_THREE_SCENARIOS)!
    expect(decoded.displayMode).toBe('real')
  })
})

describe('URL codec invalid input', () => {
  it('returns null for an empty string without throwing', () => {
    expect(() => decodeHash('')).not.toThrow()
    expect(decodeHash('')).toBeNull()
  })

  it('returns null for a bare hash without throwing', () => {
    expect(() => decodeHash('#')).not.toThrow()
    expect(decodeHash('#')).toBeNull()
  })

  it('returns null for a hash with no s= param without throwing', () => {
    expect(() => decodeHash('#v=1')).not.toThrow()
    expect(decodeHash('#v=1')).toBeNull()
  })

  it('returns null for a corrupted compressed payload without throwing', () => {
    expect(() => decodeHash('#v=1&s=NOTVALIDCOMPRESSED')).not.toThrow()
    expect(decodeHash('#v=1&s=NOTVALIDCOMPRESSED')).toBeNull()
  })

  it('returns null for a valid hash containing schema-invalid data without throwing', async () => {
    // Encode something that looks like state but has invalid schemaVersion
    const LZString = (await import('lz-string')).default
    const badPayload = LZString.compressToEncodedURIComponent(
      JSON.stringify({ v: -999, cur: 'USD', co: 'US', hy: 30, dm: 'nominal', sc: [] }),
    )
    expect(() => decodeHash(`#v=-999&s=${badPayload}`)).not.toThrow()
    expect(decodeHash(`#v=-999&s=${badPayload}`)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rental block URL codec
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

const STATE_WITH_RENTAL: AppState = {
  schemaVersion: 2,
  currency: 'CZK',
  country: 'CZ',
  horizonYears: 30,
  displayMode: 'nominal',
  scenarios: [
    {
      id: 'sc-landlord',
      name: 'Landlord',
      salary: SALARY,
      blocks: [
        VALID_RENTAL_BLOCK,
        {
          kind: 'cash',
          id: 'c1',
          label: 'Savings',
          initialBalance: 2_000_000,
          monthlyContribution: 5_000,
          annualReturnRate: 0.05,
          capitalGainsTaxRate: 0.15,
        },
      ],
    },
  ],
}

describe('URL codec — rental block roundtrip', () => {
  it('rental block without annualDepreciation round-trips encode → decode unmodified', () => {
    const decoded = roundtrip(STATE_WITH_RENTAL)
    expect(decoded).not.toBeNull()
    expect(decoded).toEqual(STATE_WITH_RENTAL)
  })

  it('optional annualDepreciation is preserved when set', () => {
    const withDepr: AppState = {
      ...STATE_WITH_RENTAL,
      scenarios: [
        {
          ...STATE_WITH_RENTAL.scenarios[0],
          blocks: [
            { ...VALID_RENTAL_BLOCK, annualDepreciation: 50_000 },
            STATE_WITH_RENTAL.scenarios[0].blocks[1],
          ],
        },
      ],
    }
    const decoded = roundtrip(withDepr)!
    expect(decoded).not.toBeNull()
    const rentalBlock = decoded.scenarios[0].blocks[0]
    if (rentalBlock.kind === 'rental') {
      expect(rentalBlock.annualDepreciation).toBe(50_000)
    }
  })

  it('optional annualDepreciation is absent when not set', () => {
    const decoded = roundtrip(STATE_WITH_RENTAL)!
    const rentalBlock = decoded.scenarios[0].blocks[0]
    if (rentalBlock.kind === 'rental') {
      expect(rentalBlock.annualDepreciation).toBeUndefined()
    }
  })

  it('rental short key "rnt" does not collide with consumption rent key "rent"', () => {
    // Encode a state containing both block types and verify both decode correctly
    const stateWithBoth: AppState = {
      schemaVersion: 2,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 20,
      displayMode: 'nominal',
      scenarios: [
        {
          id: 'sc-both',
          name: 'Both Rent Types',
          salary: SALARY,
          blocks: [
            VALID_RENTAL_BLOCK,              // short key 'rnt'
            {
              kind: 'rent',                   // short key 'rent'
              id: 'r1',
              label: 'Own Rent',
              monthlyRent: 20_000,
              annualRentGrowth: 0.03,
              differentialInvesting: false,
            },
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 0,
              annualReturnRate: 0.05,
              capitalGainsTaxRate: 0.15,
            },
          ],
        },
      ],
    }
    const decoded = roundtrip(stateWithBoth)
    expect(decoded).not.toBeNull()
    // Both block kinds must survive and decode to their correct kind
    const blocks = decoded!.scenarios[0].blocks
    const kinds = blocks.map((b) => b.kind)
    expect(kinds).toContain('rental')
    expect(kinds).toContain('rent')
  })

  it('all rental block fields survive the roundtrip (values spot-check)', () => {
    const decoded = roundtrip(STATE_WITH_RENTAL)!
    const b = decoded.scenarios[0].blocks[0]
    expect(b.kind).toBe('rental')
    if (b.kind === 'rental') {
      expect(b.propertyValue).toBe(7_500_000)
      expect(b.downPayment).toBe(1_500_000)
      expect(b.annualInterestRate).toBe(0.052)
      expect(b.expenseMethod).toBe('lumpSum30')
      expect(b.landlordTaxThreshold).toBe(1_762_812)
      expect(b.vacancyRate).toBe(0.05)
    }
  })
})
