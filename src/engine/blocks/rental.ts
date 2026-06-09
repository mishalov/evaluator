/**
 * engine/blocks/rental.ts
 *
 * Rental property block step function (Czech landlord / §9 income tax).
 *
 * Phase: 'cost' — steps before the cash (asset) block each month.
 *
 * Annual tax settlement:
 *   Landlord income tax is computed and debited once per year at month 11,
 *   23, 35, … (i.e. when (month + 1) % 12 === 0). YTD accumulators
 *   (rent, interest, maintenance) are reset to 0 after settlement. Months
 *   0–10 within each year carry landlordTaxThisMonth = 0.
 *
 * Net cash flow (may be negative):
 *   netCashFlow = rentReceived − piPayment − maintenance − landlordTaxThisMonth
 *
 * Property tax has been removed entirely in v3. The 'actual' deduction now
 * covers: interest + maintenance + optional depreciation.
 *
 * The netCashFlow is routed into the sibling CashBlock by simulate.ts.
 * Negative flow is NOT clamped — an under-rented property reducing the
 * cash balance is a meaningful signal.
 *
 * Down payment:
 *   simulate.ts debits the rental downPayment from the cash block at month 0.
 *   This mirrors the mortgage block's down-payment debit pattern.
 *
 * All rates (mortgageInterestRate, appreciationRate, maintenanceRate, rentGrowth,
 * landlordTax) come from AppState.assumptions.
 */
import { RentalPropertyBlock } from '../types'
import type { Assumptions } from '../types'
import { monthlyPayment, amortizationStep } from '../math/mortgage'
import { propertyValueAtMonth, monthlyRent } from '../math/growth'
import { rentalIncomeTax } from '../math/rentalTax'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface RentalBlockState {
  /** Outstanding mortgage balance on the rental property */
  mortgageBalance: number
  /** Current property market value (appreciates monthly) */
  propertyValue: number
  /** Lifetime cumulative rental income received (after vacancy) */
  totalRentalIncome: number
  /** Lifetime cumulative landlord income tax paid */
  totalLandlordTax: number
  /** Lifetime cumulative mortgage interest paid */
  totalInterestPaid: number
  /** Lifetime cumulative maintenance paid (property tax removed in v3) */
  totalPropertyCosts: number
  /** Cached P+I monthly payment (constant for fixed-rate) */
  monthlyPI: number
  /** Total loan term in months */
  termMonths: number

  // --- YTD accumulators (reset to 0 after each annual tax settlement) ---
  /** YTD gross rental income (resets at settlement) */
  ytdRentalIncome: number
  /** YTD mortgage interest (resets at settlement) */
  ytdInterest: number
  /** YTD maintenance (resets at settlement) */
  ytdMaintenance: number
}

/**
 * Initialize rental block state from block config.
 *
 * @param block       Rental property block configuration
 * @param property    Property assumptions (mortgageInterestRate for P+I calc)
 * @param startMonth  Starting month index (usually 0)
 */
export function initRentalBlockState(
  block: RentalPropertyBlock,
  property: Assumptions['property'],
  startMonth = 0,
): RentalBlockState {
  const loanAmount = block.propertyValue - block.downPayment
  const termMonths = block.termYears * 12
  const M = monthlyPayment(loanAmount, property.mortgageInterestRate, termMonths)

  // Suppress unused parameter warning — kept for API symmetry with mortgage block
  void startMonth

  return {
    mortgageBalance: loanAmount,
    propertyValue: block.propertyValue,
    totalRentalIncome: 0,
    totalLandlordTax: 0,
    totalInterestPaid: 0,
    totalPropertyCosts: 0,
    monthlyPI: M,
    termMonths,
    ytdRentalIncome: 0,
    ytdInterest: 0,
    ytdMaintenance: 0,
  }
}

// ---------------------------------------------------------------------------
// Step result
// ---------------------------------------------------------------------------

export interface RentalStepResult {
  state: RentalBlockState
  /** Gross rent received this month (after vacancy, before tax) */
  rentReceived: number
  /** Mortgage P+I payment this month (0 when balance = 0) */
  piPayment: number
  /** Interest portion of P+I this month */
  interest: number
  /** Principal portion of P+I this month */
  principal: number
  /** Maintenance cost this month */
  maintenance: number
  /**
   * Landlord income tax debited this month.
   * Non-zero ONLY at annual settlement (when (month + 1) % 12 === 0).
   * Zero for months 0–10 within each year.
   */
  landlordTaxThisMonth: number
  /** Net cash flow this month = rentReceived − piPayment − maintenance − landlordTaxThisMonth */
  netCashFlow: number
  /** Current property market value */
  propertyValue: number
  /** Remaining mortgage balance after this month's payment */
  mortgageBalance: number
  /** Property equity = propertyValue − mortgageBalance */
  equity: number
}

// ---------------------------------------------------------------------------
// Step function
// ---------------------------------------------------------------------------

/**
 * Advance the rental property block by one month.
 *
 * @param state        Current rental block state
 * @param block        Static block configuration
 * @param assumptions  Full assumptions object (property, rentGrowth, landlordTax)
 * @param month        Global month index (0-based; passed by simulate.ts as month − 1)
 * @returns Step result with full cash-flow breakdown and updated state
 */
export function stepRentalBlock(
  state: RentalBlockState,
  block: RentalPropertyBlock,
  assumptions: Pick<Assumptions, 'property' | 'rentGrowth' | 'landlordTax'>,
  month: number,
): RentalStepResult {
  const { property, rentGrowth, landlordTax } = assumptions

  // --- Property value (monthly-compounded appreciation) ---
  const propValue = propertyValueAtMonth(block.propertyValue, property.appreciationRate, month)

  // --- Monthly holding costs: maintenance only (property tax removed in v3) ---
  const maintenance = (propValue * property.maintenanceRate) / 12

  // --- Mortgage amortization ---
  let piPayment = 0
  let interest = 0
  let principal = 0
  let newMortgageBalance = state.mortgageBalance

  if (state.mortgageBalance > 0) {
    const isFinal = month >= state.termMonths - 1
    const step = amortizationStep(
      state.mortgageBalance,
      property.mortgageInterestRate,
      state.monthlyPI,
      isFinal,
    )
    interest = step.interest
    principal = step.principal
    newMortgageBalance = step.remainingBalance
    piPayment = state.monthlyPI
  }

  // --- Rental income (lease-style annual step, adjusted for vacancy) ---
  const grossRent = monthlyRent(block.monthlyRentIncome, rentGrowth, month)
  const rentReceived = grossRent * (1 - block.vacancyRate)

  // --- Update YTD accumulators ---
  const newYtdRentalIncome = state.ytdRentalIncome + rentReceived
  const newYtdInterest = state.ytdInterest + interest
  const newYtdMaintenance = state.ytdMaintenance + maintenance

  // --- Annual tax settlement ---
  // Settle at the end of each 12-month tax year: engine months 11, 23, 35, …
  // since (month + 1) % 12 === 0.
  let landlordTaxThisMonth = 0
  let resetYtd = false

  if ((month + 1) % 12 === 0) {
    // Annual settlement: compute tax on the full year's accumulation.
    // 'actual' deduction: interest + maintenance + optional depreciation.
    // Property tax was removed in v3 — no annualPropertyTax passed.
    const taxResult = rentalIncomeTax({
      annualRentalIncome: newYtdRentalIncome,
      expenseMethod: block.expenseMethod,
      annualMortgageInterest: newYtdInterest,
      annualMaintenance: newYtdMaintenance,
      annualDepreciation: block.annualDepreciation,
      taxThreshold: landlordTax.threshold,
      rateLow: landlordTax.rate,
      rateHigh: landlordTax.rateHigh,
    })
    landlordTaxThisMonth = taxResult.incomeTax
    resetYtd = true
  }

  // --- Net cash flow (property tax removed in v3) ---
  const netCashFlow = rentReceived - piPayment - maintenance - landlordTaxThisMonth

  // --- Build updated state ---
  const equity = propValue - newMortgageBalance
  const newState: RentalBlockState = {
    mortgageBalance: newMortgageBalance,
    propertyValue: propValue,
    totalRentalIncome: state.totalRentalIncome + rentReceived,
    totalLandlordTax: state.totalLandlordTax + landlordTaxThisMonth,
    totalInterestPaid: state.totalInterestPaid + interest,
    totalPropertyCosts: state.totalPropertyCosts + maintenance,
    monthlyPI: state.monthlyPI,
    termMonths: state.termMonths,
    ytdRentalIncome: resetYtd ? 0 : newYtdRentalIncome,
    ytdInterest: resetYtd ? 0 : newYtdInterest,
    ytdMaintenance: resetYtd ? 0 : newYtdMaintenance,
  }

  return {
    state: newState,
    rentReceived,
    piPayment,
    interest,
    principal,
    maintenance,
    landlordTaxThisMonth,
    netCashFlow,
    propertyValue: propValue,
    mortgageBalance: newMortgageBalance,
    equity,
  }
}
