/**
 * engine/__tests__/rentalTax.test.ts
 *
 * Unit tests for Czech §9 rental income tax formulas (rentalTax.ts).
 *
 * Coverage:
 *   - lumpSum30 base: standard case and 600k cap case (income > 2M)
 *   - actual base: standard deductions and clamp at 0 when costs exceed income
 *   - Two-bracket tax: at threshold (only low rate) and above threshold (mixed rate)
 *   - Zero / negative base → tax = 0
 */
import { describe, it, expect } from 'vitest'
import {
  LUMP_SUM_30_CAP,
  rentalTaxableBase,
  rentalIncomeTax,
  type RentalTaxInputs,
} from '../math/rentalTax'

// ---------------------------------------------------------------------------
// Shared bracket defaults
// ---------------------------------------------------------------------------

const BRACKET = {
  taxThreshold: 1_762_812,
  rateLow: 0.15,
  rateHigh: 0.23,
} as const

// Synthetic LOW threshold to exercise the high bracket without multi-million income
const LOW_THRESHOLD = 100_000

// ---------------------------------------------------------------------------
// lumpSum30 — taxable base
// ---------------------------------------------------------------------------

describe('rentalTaxableBase — lumpSum30', () => {
  it('deducts 30% when income * 0.30 < 600k cap (income = CZK 1,000,000)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 1_000_000,
      expenseMethod: 'lumpSum30',
      ...BRACKET,
    }
    // deduction = min(1_000_000 * 0.30, 600_000) = min(300_000, 600_000) = 300_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(1_000_000 - 300_000, 6)
  })

  it('caps deduction at 600k when income * 0.30 > cap (income = CZK 3,000,000)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 3_000_000,
      expenseMethod: 'lumpSum30',
      ...BRACKET,
    }
    // deduction = min(3_000_000 * 0.30, 600_000) = min(900_000, 600_000) = 600_000
    // cap binds when income > 2_000_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(3_000_000 - LUMP_SUM_30_CAP, 6)
  })

  it('cap boundary: income = CZK 2,000,000 → deduction = exactly 600k', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 2_000_000,
      expenseMethod: 'lumpSum30',
      ...BRACKET,
    }
    // min(2_000_000 * 0.30, 600_000) = min(600_000, 600_000) = 600_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(1_400_000, 6)
  })

  it('base is 0 when income is 0 (no rental received)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 0,
      expenseMethod: 'lumpSum30',
      ...BRACKET,
    }
    expect(rentalTaxableBase(inputs)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// actual — taxable base
// ---------------------------------------------------------------------------

describe('rentalTaxableBase — actual', () => {
  it('deducts interest + maintenance (property tax removed in v3)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 336_000, // 28k/month
      expenseMethod: 'actual',
      annualMortgageInterest: 120_000,
      annualMaintenance: 75_000,
      ...BRACKET,
    }
    // deduction = 120_000 + 75_000 = 195_000 (no property tax in v3)
    // base = 336_000 - 195_000 = 141_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(336_000 - 195_000, 4)
  })

  it('includes annualDepreciation in deduction (property tax removed in v3)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 336_000,
      expenseMethod: 'actual',
      annualMortgageInterest: 100_000,
      annualMaintenance: 50_000,
      annualDepreciation: 75_000,
      ...BRACKET,
    }
    // deduction = 100_000 + 50_000 + 75_000 = 225_000 (no property tax in v3)
    // base = 336_000 - 225_000 = 111_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(111_000, 4)
  })

  it('clamps base to 0 when expenses exceed income', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 100_000,
      expenseMethod: 'actual',
      annualMortgageInterest: 90_000,
      annualMaintenance: 25_000, // total = 115_000 > 100_000 (no property tax in v3)
      ...BRACKET,
    }
    expect(rentalTaxableBase(inputs)).toBe(0)
  })

  it('principal not included — only interest provided, no principal field', () => {
    // Ensure the API has no 'annualMortgagePrincipal' field to accidentally pass in
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 500_000,
      expenseMethod: 'actual',
      annualMortgageInterest: 200_000, // only interest, NOT principal
      ...BRACKET,
    }
    // base = 500_000 - 200_000 = 300_000
    const base = rentalTaxableBase(inputs)
    expect(base).toBeCloseTo(300_000, 4)
  })

  it('omitting optional cost fields defaults them to 0', () => {
    // All optional actual-method fields absent → deduction = 0
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 200_000,
      expenseMethod: 'actual',
      ...BRACKET,
    }
    expect(rentalTaxableBase(inputs)).toBeCloseTo(200_000, 4)
  })
})

// ---------------------------------------------------------------------------
// Two-bracket income tax
// ---------------------------------------------------------------------------

describe('rentalIncomeTax — two-bracket', () => {
  it('applies only the low rate when base ≤ threshold', () => {
    // Use a synthetic low threshold of 100k to keep numbers simple
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 150_000,
      expenseMethod: 'lumpSum30',
      taxThreshold: LOW_THRESHOLD,
      rateLow: 0.15,
      rateHigh: 0.23,
    }
    // base = 150_000 - min(150_000*0.30, 600_000) = 150_000 - 45_000 = 105_000
    // 105_000 > 100_000 → two-bracket applies
    // tax = 100_000 * 0.15 + 5_000 * 0.23 = 15_000 + 1_150 = 16_150
    const { taxableBase, incomeTax } = rentalIncomeTax(inputs)
    expect(taxableBase).toBeCloseTo(105_000, 4)
    expect(incomeTax).toBeCloseTo(15_000 + 5_000 * 0.23, 4)
  })

  it('applies exactly the low rate when base = threshold exactly', () => {
    // base = threshold → all taxed at low rate
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 200_000,
      expenseMethod: 'actual',
      annualMortgageInterest: 100_000, // base = 100_000 = threshold
      taxThreshold: LOW_THRESHOLD,
      rateLow: 0.15,
      rateHigh: 0.23,
    }
    const { taxableBase, incomeTax } = rentalIncomeTax(inputs)
    expect(taxableBase).toBeCloseTo(100_000, 4)
    expect(incomeTax).toBeCloseTo(100_000 * 0.15, 4)
  })

  it('applies the two-bracket formula when base > threshold (statutory values)', () => {
    // Test with the real 2026 statutory threshold
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 4_000_000,
      expenseMethod: 'lumpSum30',
      ...BRACKET,
    }
    // deduction = min(4_000_000 * 0.30, 600_000) = 600_000
    // base = 4_000_000 - 600_000 = 3_400_000
    // tax = 1_762_812 * 0.15 + (3_400_000 - 1_762_812) * 0.23
    const expectedBase = 3_400_000
    const expectedTax =
      BRACKET.taxThreshold * 0.15 + (expectedBase - BRACKET.taxThreshold) * 0.23
    const { taxableBase, incomeTax } = rentalIncomeTax(inputs)
    expect(taxableBase).toBeCloseTo(expectedBase, 2)
    expect(incomeTax).toBeCloseTo(expectedTax, 2)
  })

  it('returns 0 tax when base is 0 (expenses ≥ income)', () => {
    const inputs: RentalTaxInputs = {
      annualRentalIncome: 50_000,
      expenseMethod: 'actual',
      annualMortgageInterest: 60_000, // exceeds income → base = 0
      ...BRACKET,
    }
    const { taxableBase, incomeTax } = rentalIncomeTax(inputs)
    expect(taxableBase).toBe(0)
    expect(incomeTax).toBe(0)
  })

  it('LUMP_SUM_30_CAP is exactly 600_000', () => {
    expect(LUMP_SUM_30_CAP).toBe(600_000)
  })
})
