/**
 * state/__tests__/url.test.ts
 *
 * Roundtrip and edge-case tests for the URL hash codec.
 *
 * Tests:
 *   - encodeAppState → decodeHash roundtrip with all block types (v3)
 *   - Roundtrip with 3 scenarios
 *   - Invalid hash returns null without throwing
 *   - Rental block roundtrip
 *   - v3 assumptions roundtrip (all fields preserved)
 *   - Dual-migration seam: a hand-crafted v2 short-key hash decodes correctly
 *     with salary/rates preserved into assumptions (no silent loss)
 */
import { describe, it, expect } from 'vitest'
import LZString from 'lz-string'
import { encodeAppState, decodeHash } from '../url'
import type { AppState, RentalPropertyBlock } from '../../engine/types'
import { DEFAULT_ASSUMPTIONS, CURRENT_VERSION } from '../schema'

// ---------------------------------------------------------------------------
// Fixtures (v3 — no per-block rate fields, assumptions object present)
// ---------------------------------------------------------------------------

const STATE_ALL_BLOCK_TYPES: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'USD',
  country: 'US',
  horizonYears: 20,
  displayMode: 'nominal',
  assumptions: DEFAULT_ASSUMPTIONS,
  scenarios: [
    {
      id: 'sc-all',
      name: 'All Block Types',
      blocks: [
        {
          kind: 'cash',
          id: 'c1',
          label: 'Investment',
          initialBalance: 50_000,
          monthlyContribution: 1_000,
        },
        {
          kind: 'mortgage',
          id: 'm1',
          label: 'Home',
          propertyValue: 400_000,
          downPayment: 80_000,
          termYears: 30,
        },
        {
          kind: 'rent',
          id: 'r1',
          label: 'Apartment',
          monthlyRent: 1_800,
          differentialInvesting: true,
          referenceMonthlyPayment: 1_500,
        },
      ],
    },
  ],
}

const STATE_THREE_SCENARIOS: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'EUR',
  country: 'DE',
  horizonYears: 30,
  displayMode: 'real',
  inflationOverridePct: 0.025,
  assumptions: {
    salary: { annualAmount: 75_000, growthRate: 0.02, incomeTaxRate: 0.22 },
    investment: { annualReturnRate: 0.08, capitalGainsTaxRate: 0.26 },
    property: { mortgageInterestRate: 0.04, appreciationRate: 0.02, maintenanceRate: 0.008 },
    rentGrowth: 0.025,
    landlordTax: { rate: 0.15, rateHigh: 0.23, threshold: 1_762_812 },
  },
  scenarios: [
    {
      id: 'sc-1',
      name: 'Rent Only',
      blocks: [
        {
          kind: 'rent',
          id: 'r-a',
          label: 'Apt',
          monthlyRent: 1_200,
          differentialInvesting: false,
        },
      ],
    },
    {
      id: 'sc-2',
      name: 'Buy Home',
      blocks: [
        {
          kind: 'mortgage',
          id: 'm-a',
          label: 'House',
          propertyValue: 350_000,
          downPayment: 70_000,
          termYears: 25,
        },
      ],
    },
    {
      id: 'sc-3',
      name: 'Cash Only',
      blocks: [
        {
          kind: 'cash',
          id: 'c-a',
          label: 'ETF',
          initialBalance: 100_000,
          monthlyContribution: 600,
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
// v3 roundtrip tests
// ---------------------------------------------------------------------------

describe('URL codec roundtrip (v3)', () => {
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

  it('assumptions object survives roundtrip with all sub-fields intact', () => {
    const decoded = roundtrip(STATE_THREE_SCENARIOS)!
    const a = decoded.assumptions
    expect(a.salary.annualAmount).toBe(75_000)
    expect(a.salary.growthRate).toBe(0.02)
    expect(a.salary.incomeTaxRate).toBe(0.22)
    expect(a.investment.annualReturnRate).toBe(0.08)
    expect(a.investment.capitalGainsTaxRate).toBe(0.26)
    expect(a.property.mortgageInterestRate).toBe(0.04)
    expect(a.property.appreciationRate).toBe(0.02)
    expect(a.property.maintenanceRate).toBe(0.008)
    expect(a.rentGrowth).toBe(0.025)
    expect(a.landlordTax.rate).toBe(0.15)
    expect(a.landlordTax.rateHigh).toBe(0.23)
    expect(a.landlordTax.threshold).toBe(1_762_812)
  })

  it('blocks have no rate fields in v3 roundtrip', () => {
    const decoded = roundtrip(STATE_ALL_BLOCK_TYPES)!
    for (const block of decoded.scenarios[0].blocks) {
      expect((block as unknown as Record<string, unknown>).annualReturnRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).capitalGainsTaxRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).appreciationRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).maintenanceRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).annualRentGrowth).toBeUndefined()
    }
  })

  it('scenarios have no salary field in v3 roundtrip', () => {
    const decoded = roundtrip(STATE_ALL_BLOCK_TYPES)!
    for (const sc of decoded.scenarios) {
      expect((sc as unknown as Record<string, unknown>).salary).toBeUndefined()
    }
  })

  it('encoded hash has v=3 in the URL param', () => {
    const hash = encodeAppState(STATE_ALL_BLOCK_TYPES)
    expect(hash).toMatch(/^#v=3&s=/)
  })
})

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

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
    const LZStr = (await import('lz-string')).default
    const badPayload = LZStr.compressToEncodedURIComponent(
      JSON.stringify({ v: -999, cur: 'USD', co: 'US', hy: 30, dm: 'nominal', sc: [] }),
    )
    expect(() => decodeHash(`#v=-999&s=${badPayload}`)).not.toThrow()
    expect(decodeHash(`#v=-999&s=${badPayload}`)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rental block URL codec (v3)
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

const STATE_WITH_RENTAL: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'CZK',
  country: 'CZ',
  horizonYears: 30,
  displayMode: 'nominal',
  assumptions: {
    salary: { annualAmount: 0, growthRate: 0.02, incomeTaxRate: 0.25 },
    investment: { annualReturnRate: 0.05, capitalGainsTaxRate: 0.15 },
    property: { mortgageInterestRate: 0.052, appreciationRate: 0.04, maintenanceRate: 0.01 },
    rentGrowth: 0.03,
    landlordTax: { rate: 0.15, rateHigh: 0.23, threshold: 1_762_812 },
  },
  scenarios: [
    {
      id: 'sc-landlord',
      name: 'Landlord',
      blocks: [
        VALID_RENTAL_BLOCK,
        {
          kind: 'cash',
          id: 'c1',
          label: 'Savings',
          initialBalance: 2_000_000,
          monthlyContribution: 5_000,
        },
      ],
    },
  ],
}

describe('URL codec — rental block roundtrip (v3)', () => {
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
    const stateWithBoth: AppState = {
      schemaVersion: CURRENT_VERSION,
      currency: 'CZK',
      country: 'CZ',
      horizonYears: 20,
      displayMode: 'nominal',
      assumptions: STATE_WITH_RENTAL.assumptions,
      scenarios: [
        {
          id: 'sc-both',
          name: 'Both Rent Types',
          blocks: [
            VALID_RENTAL_BLOCK,              // short key 'rnt'
            {
              kind: 'rent',                   // short key 'rent'
              id: 'r1',
              label: 'Own Rent',
              monthlyRent: 20_000,
              differentialInvesting: false,
            },
            {
              kind: 'cash',
              id: 'c1',
              label: 'Cash',
              initialBalance: 0,
              monthlyContribution: 0,
            },
          ],
        },
      ],
    }
    const decoded = roundtrip(stateWithBoth)
    expect(decoded).not.toBeNull()
    const blocks = decoded!.scenarios[0].blocks
    const kinds = blocks.map((b) => b.kind)
    expect(kinds).toContain('rental')
    expect(kinds).toContain('rent')
  })

  it('all rental block per-property fields survive the roundtrip (values spot-check)', () => {
    const decoded = roundtrip(STATE_WITH_RENTAL)!
    const b = decoded.scenarios[0].blocks[0]
    expect(b.kind).toBe('rental')
    if (b.kind === 'rental') {
      expect(b.propertyValue).toBe(7_500_000)
      expect(b.downPayment).toBe(1_500_000)
      expect(b.expenseMethod).toBe('lumpSum30')
      expect(b.vacancyRate).toBe(0.05)
      // rate fields should NOT be on the block in v3
      expect((b as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).landlordTaxThreshold).toBeUndefined()
      expect((b as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Dual-migration seam: v2 short-key hash → v3 state with assumptions
//
// This is the most important backward-compat test. A v2 URL share-link stores
// per-block rates and per-scenario salary in the compressed payload using the
// OLD short keys (ar/cg for cash rates, ai/apr/pt/mr for mortgage, rg for
// rent growth, s.a/s.g/s.t for salary, lt/lth/ltt for landlord tax).
//
// decodeHash must decode a v2 hash through the object-level migration path
// and return a valid v3 AppState with ALL those values hoisted into assumptions
// and NONE of the per-block rate fields present.
// ---------------------------------------------------------------------------

describe('Dual-migration seam: v2 hash → v3 AppState', () => {
  /**
   * Build a hand-crafted v2 short-key compressed hash exactly as the old
   * (pre-v3) encodeAppState would have produced it:
   *   { v:2, cur, co, hy, dm, sc: [ { id, n, s:{a,g,t}, bs:[...] } ] }
   * The short keys inside blocks are the OLD v2 forms:
   *   cash:     k,id,lb,ib,mc,ar,cg
   *   mortgage: k,id,lb,pv,dp,ai,ty,apr,pt,mr
   *   rent:     k,id,lb,r,rg,di
   */
  function makeV2Hash(v2Payload: unknown): string {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(v2Payload))
    return `#v=2&s=${compressed}`
  }

  it('v2 hash with rent + cash scenario hoists salary and investment rates into assumptions', () => {
    const v2Short = {
      v: 2,
      cur: 'CZK',
      co: 'CZ',
      hy: 25,
      dm: 'nominal',
      sc: [
        {
          id: 'sc-1',
          n: 'Rent & Invest',
          s: { a: 60_000, g: 0.025, t: 0.22 },  // v2 salary short keys
          bs: [
            {
              k: 'rent', id: 'r1', lb: 'Apt',
              r: 15_000, rg: 0.04, di: false,    // rg = annualRentGrowth
            },
            {
              k: 'cash', id: 'c1', lb: 'Cash',
              ib: 100_000, mc: 5_000,
              ar: 0.08, cg: 0.19,                // ar = annualReturnRate, cg = capitalGainsTaxRate
            },
          ],
        },
      ],
    }

    const hash = makeV2Hash(v2Short)
    const result = decodeHash(hash)

    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // Salary hoisted correctly
    expect(result!.assumptions.salary.annualAmount).toBe(60_000)
    expect(result!.assumptions.salary.growthRate).toBe(0.025)
    expect(result!.assumptions.salary.incomeTaxRate).toBe(0.22)

    // Investment rates hoisted from v2 cash block
    expect(result!.assumptions.investment.annualReturnRate).toBe(0.08)
    expect(result!.assumptions.investment.capitalGainsTaxRate).toBe(0.19)

    // rentGrowth hoisted from v2 rent block
    expect(result!.assumptions.rentGrowth).toBe(0.04)

    // horizonYears preserved
    expect(result!.horizonYears).toBe(25)

    // No per-block rate fields on the resulting blocks
    for (const block of result!.scenarios[0].blocks) {
      expect((block as unknown as Record<string, unknown>).annualReturnRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).capitalGainsTaxRate).toBeUndefined()
      expect((block as unknown as Record<string, unknown>).annualRentGrowth).toBeUndefined()
    }

    // No salary on scenarios
    expect((result!.scenarios[0] as unknown as Record<string, unknown>).salary).toBeUndefined()
  })

  it('v2 hash with mortgage scenario hoists property rates into assumptions', () => {
    const v2Short = {
      v: 2,
      cur: 'USD',
      co: 'US',
      hy: 30,
      dm: 'nominal',
      sc: [
        {
          id: 'sc-buy',
          n: 'Buy Home',
          s: { a: 80_000, g: 0.03, t: 0.25 },
          bs: [
            {
              k: 'mtg', id: 'm1', lb: 'Home',
              pv: 5_000_000, dp: 1_000_000,
              ai: 0.055, ty: 25,               // ai = annualInterestRate
              apr: 0.03,                        // apr = appreciationRate
              pt: 0.001,                        // pt = propertyTaxRate (should be DROPPED)
              mr: 0.009,                        // mr = maintenanceRate
            },
            {
              k: 'cash', id: 'c1', lb: 'Savings',
              ib: 0, mc: 3_000,
              ar: 0.06, cg: 0.15,
            },
          ],
        },
      ],
    }

    const hash = makeV2Hash(v2Short)
    const result = decodeHash(hash)

    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // Property rates hoisted from v2 mortgage block
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.055)
    expect(result!.assumptions.property.appreciationRate).toBe(0.03)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.009)

    // propertyTaxRate must be ABSENT from assumptions (dropped in v3)
    expect((result!.assumptions as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()

    // mortgage block should still have its per-property fields
    const mortgageBlock = result!.scenarios[0].blocks.find((b) => b.kind === 'mortgage')
    if (mortgageBlock?.kind === 'mortgage') {
      expect(mortgageBlock.propertyValue).toBe(5_000_000)
      expect(mortgageBlock.downPayment).toBe(1_000_000)
      expect(mortgageBlock.termYears).toBe(25)
      // rate fields must be gone
      expect((mortgageBlock as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((mortgageBlock as unknown as Record<string, unknown>).appreciationRate).toBeUndefined()
      expect((mortgageBlock as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
      expect((mortgageBlock as unknown as Record<string, unknown>).maintenanceRate).toBeUndefined()
    }
  })

  it('v2 hash with rental block hoists landlordTax into assumptions', () => {
    const v2Short = {
      v: 2,
      cur: 'CZK',
      co: 'CZ',
      hy: 30,
      dm: 'nominal',
      sc: [
        {
          id: 'sc-land',
          n: 'Landlord',
          s: { a: 0, g: 0.02, t: 0.25 },
          bs: [
            {
              k: 'rnt', id: 'rnt1', lb: 'Prague Flat',
              pv: 7_500_000, dp: 1_500_000,
              ai: 0.052, ty: 30,
              apr: 0.04, pt: 0.0005, mr: 0.01,
              ri: 28_000, rg: 0.03, vr: 0.05,
              em: 'lumpSum30',
              lt: 0.15, lth: 0.23, ltt: 1_762_812, // landlord tax short keys
            },
            {
              k: 'cash', id: 'c1', lb: 'Savings',
              ib: 2_000_000, mc: 0,
              ar: 0.05, cg: 0.15,
            },
          ],
        },
      ],
    }

    const hash = makeV2Hash(v2Short)
    const result = decodeHash(hash)

    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // landlordTax hoisted correctly from rental block
    expect(result!.assumptions.landlordTax.rate).toBe(0.15)
    expect(result!.assumptions.landlordTax.rateHigh).toBe(0.23)
    expect(result!.assumptions.landlordTax.threshold).toBe(1_762_812)

    // property rates hoisted from rental block (no mortgage block present)
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.052)
    expect(result!.assumptions.property.appreciationRate).toBe(0.04)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.01)

    // rentGrowth from rental block's rg field
    expect(result!.assumptions.rentGrowth).toBe(0.03)

    // Per-property rental fields must survive
    const rentalBlock = result!.scenarios[0].blocks.find((b) => b.kind === 'rental')
    if (rentalBlock?.kind === 'rental') {
      expect(rentalBlock.propertyValue).toBe(7_500_000)
      expect(rentalBlock.monthlyRentIncome).toBe(28_000)
      expect(rentalBlock.vacancyRate).toBe(0.05)
      expect(rentalBlock.expenseMethod).toBe('lumpSum30')
      // rate fields stripped
      expect((rentalBlock as unknown as Record<string, unknown>).annualInterestRate).toBeUndefined()
      expect((rentalBlock as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
      expect((rentalBlock as unknown as Record<string, unknown>).landlordTaxRate).toBeUndefined()
    }
  })

  it('v2 hash: mortgage on scenario[1] (not scenario[0]) — property rates hoisted, not defaulted', () => {
    // Mirrors the typical real-world layout: scenarios[0]="Rent & Invest" (no mortgage),
    // scenarios[1]="Buy a Home" (has mortgage). The migration must scan all scenarios.
    const v2Short = {
      v: 2,
      cur: 'CZK',
      co: 'CZ',
      hy: 30,
      dm: 'nominal',
      sc: [
        {
          id: 'sc-0',
          n: 'Rent & Invest',
          s: { a: 50_000, g: 0.02, t: 0.22 },
          bs: [
            { k: 'rent', id: 'r1', lb: 'Apt', r: 12_000, rg: 0.035, di: false },
            { k: 'cash', id: 'c0', lb: 'Cash', ib: 500_000, mc: 3_000, ar: 0.07, cg: 0.19 },
          ],
        },
        {
          id: 'sc-1',
          n: 'Buy a Home',
          s: { a: 50_000, g: 0.02, t: 0.22 },
          bs: [
            {
              k: 'mtg', id: 'm1', lb: 'Flat',
              pv: 6_000_000, dp: 1_200_000,
              ai: 0.049, ty: 30,
              apr: 0.035, pt: 0.001, mr: 0.012,
            },
            { k: 'cash', id: 'c1', lb: 'Cash', ib: 0, mc: 1_000, ar: 0.05, cg: 0.15 },
          ],
        },
      ],
    }

    const hash = makeV2Hash(v2Short)
    const result = decodeHash(hash)

    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)

    // Property rates from scenarios[1] mortgage — must NOT be DEFAULT_ASSUMPTIONS
    expect(result!.assumptions.property.mortgageInterestRate).toBe(0.049)
    expect(result!.assumptions.property.appreciationRate).toBe(0.035)
    expect(result!.assumptions.property.maintenanceRate).toBe(0.012)

    // Investment rates from first cash block found (scenarios[0])
    expect(result!.assumptions.investment.annualReturnRate).toBe(0.07)
    expect(result!.assumptions.investment.capitalGainsTaxRate).toBe(0.19)

    // rentGrowth from scenarios[0] rent block
    expect(result!.assumptions.rentGrowth).toBe(0.035)

    // propertyTaxRate must not appear in assumptions
    expect((result!.assumptions as unknown as Record<string, unknown>).propertyTaxRate).toBeUndefined()
  })

  it('v1 hash (rent-only, pre-rental-block) migrates to v3 via both v1→v2 and v2→v3', () => {
    const v1Short = {
      v: 1,
      cur: 'CZK',
      co: 'CZ',
      hy: 30,
      dm: 'nominal',
      sc: [
        {
          id: 'sc-1',
          n: 'Rent Only',
          s: { a: 0, g: 0.02, t: 0.25 },
          bs: [
            { k: 'rent', id: 'r1', lb: 'Rent', r: 0, rg: 0.03, di: false },
          ],
        },
      ],
    }

    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(v1Short))
    const hash = `#v=1&s=${compressed}`
    const result = decodeHash(hash)

    expect(result).not.toBeNull()
    expect(result!.schemaVersion).toBe(CURRENT_VERSION)
    expect(result!.assumptions).toBeDefined()
    // rentGrowth comes from v1 rent block rg field (via v2 path then migration[2])
    expect(result!.assumptions.rentGrowth).toBe(0.03)
    expect(result!.assumptions.salary.growthRate).toBe(0.02)
  })
})
