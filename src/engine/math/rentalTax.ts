/**
 * engine/math/rentalTax.ts
 *
 * Czech §9 landlord income tax calculations (2026).
 *
 * Two expense-deduction methods:
 *   1. lumpSum30: deduct min(income * 0.30, CZK 600_000). The 600k cap binds
 *      when annual rental income exceeds CZK 2,000,000.
 *   2. actual: deduct real costs (mortgage interest, maintenance, optional
 *      depreciation). Mortgage PRINCIPAL is NOT deductible.
 *      Property tax was removed in v3 — the 'actual' deduction is now
 *      interest + maintenance + optional depreciation.
 *
 * Tax brackets (both methods share the same bracket structure):
 *   base ≤ threshold  → tax = base * rateLow
 *   base >  threshold → tax = threshold * rateLow + (base - threshold) * rateHigh
 *
 * Statutory defaults for 2026:
 *   threshold = CZK 1,762,812 (36× average wage)
 *   rateLow   = 0.15
 *   rateHigh  = 0.23
 *
 * No social or health insurance applies to §9 rental income.
 * No capital gains / transfer tax (out of scope v1).
 */

/**
 * Maximum lump-sum deduction under the 30% flat-expense method (CZK, 2026).
 * When annual rental income > CZK 2,000,000 the cap binds instead of 30%.
 */
export const LUMP_SUM_30_CAP = 600_000

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface RentalTaxInputs {
  /** Annual gross rental income received (before deductions) */
  annualRentalIncome: number
  /** Expense deduction method */
  expenseMethod: 'lumpSum30' | 'actual'

  // ---- Fields used by 'actual' method only ----
  /** Annual mortgage interest paid (PRINCIPAL excluded) */
  annualMortgageInterest?: number
  /** Annual maintenance cost paid */
  annualMaintenance?: number
  /** Annual depreciation allowance (optional; 0 if omitted) */
  annualDepreciation?: number

  // ---- Tax bracket parameters ----
  /** Income threshold separating the low and high rate (default: CZK 1,762,812) */
  taxThreshold: number
  /** Lower tax rate, applied up to taxThreshold (e.g. 0.15) */
  rateLow: number
  /** Higher tax rate, applied above taxThreshold (e.g. 0.23) */
  rateHigh: number
}

export interface RentalTaxResult {
  /** Annual taxable base after deductions (≥ 0) */
  taxableBase: number
  /** Annual income tax owed (≥ 0) */
  incomeTax: number
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Compute the annual taxable base for Czech §9 rental income.
 *
 * The base is clamped to ≥ 0: if allowable deductions exceed income (e.g.
 * when using actual costs in a high-expense year), the base is zero and no
 * tax is owed.
 *
 * @param inputs  Tax calculation inputs
 * @returns       Taxable base (nominal CZK, ≥ 0)
 */
export function rentalTaxableBase(inputs: RentalTaxInputs): number {
  const { annualRentalIncome, expenseMethod } = inputs

  let deduction: number

  if (expenseMethod === 'lumpSum30') {
    // Deduct the LESSER of (income × 30%) and the statutory cap.
    deduction = Math.min(annualRentalIncome * 0.30, LUMP_SUM_30_CAP)
  } else {
    // Actual costs: interest + maintenance + optional depreciation.
    // Property tax was removed in v3 — not included in the deduction.
    const interest = inputs.annualMortgageInterest ?? 0
    const maintenance = inputs.annualMaintenance ?? 0
    const depreciation = inputs.annualDepreciation ?? 0
    deduction = interest + maintenance + depreciation
  }

  return Math.max(0, annualRentalIncome - deduction)
}

/**
 * Compute the annual landlord income tax under Czech §9 (2026 bracket rules).
 *
 * Two-bracket progressive tax:
 *   base ≤ threshold  → tax = base * rateLow
 *   base >  threshold → tax = threshold * rateLow + (base - threshold) * rateHigh
 *
 * Both taxableBase and incomeTax are clamped to ≥ 0.
 *
 * @param inputs  Tax calculation inputs
 * @returns       Taxable base and income tax (both ≥ 0)
 */
export function rentalIncomeTax(inputs: RentalTaxInputs): RentalTaxResult {
  const { taxThreshold, rateLow, rateHigh } = inputs
  const taxableBase = rentalTaxableBase(inputs)

  let incomeTax: number
  if (taxableBase <= taxThreshold) {
    incomeTax = taxableBase * rateLow
  } else {
    incomeTax = taxThreshold * rateLow + (taxableBase - taxThreshold) * rateHigh
  }

  return {
    taxableBase,
    incomeTax: Math.max(0, incomeTax),
  }
}
