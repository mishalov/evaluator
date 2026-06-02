/**
 * engine/blocks/mortgage.ts
 *
 * Mortgage block step function.
 *
 * Phase: 'cost' — steps before the cash (asset) block each month.
 *
 * M_ref (used for differential investing) = P+I only (excludes property
 * tax and maintenance). This is by architect design — differential investing
 * compares the full mortgage commitment to rent, but only the P+I portion
 * is the "financing cost" analogous to rent.
 *
 * Property value uses monthly compounding to avoid staircase artifacts.
 */
import { MortgageBlock } from '../types'
import { monthlyPayment, amortizationStep } from '../math/mortgage'
import { propertyValueAtMonth } from '../math/growth'

export interface MortgageBlockState {
  mortgageBalance: number
  propertyValue: number
  /** Sum of all principal paid so far (for verification) */
  totalPrincipalPaid: number
  /** Sum of all interest paid so far */
  totalInterestPaid: number
  /** Sum of all property tax + maintenance paid */
  totalPropertyCosts: number
  /** Cached P+I payment (constant for fixed-rate) */
  monthlyPI: number
  /** Total loan term in months */
  termMonths: number
  /** Current month index (for property appreciation) */
  currentMonth: number
}

/**
 * Initialize mortgage block state from block config.
 *
 * @param block     Mortgage block configuration
 * @param startMonth  Starting month index (usually 0)
 */
export function initMortgageBlockState(
  block: MortgageBlock,
  startMonth = 0,
): MortgageBlockState {
  const loanAmount = block.propertyValue - block.downPayment
  const termMonths = block.termYears * 12
  const M = monthlyPayment(loanAmount, block.annualInterestRate, termMonths)

  return {
    mortgageBalance: loanAmount,
    propertyValue: block.propertyValue,
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    totalPropertyCosts: 0,
    monthlyPI: M,
    termMonths,
    currentMonth: startMonth,
  }
}

export interface MortgageStepResult {
  state: MortgageBlockState
  /** P+I payment made this month */
  piPayment: number
  /** Interest portion of P+I */
  interest: number
  /** Principal portion of P+I */
  principal: number
  /** Property tax this month */
  propertyTax: number
  /** Maintenance cost this month */
  maintenance: number
  /** Total out-of-pocket cost this month (P+I + tax + maintenance) */
  totalCost: number
  /** Current property value */
  propertyValue: number
  /** Current mortgage balance after payment */
  mortgageBalance: number
  /** Property equity = propertyValue - mortgageBalance */
  equity: number
}

/**
 * Advance the mortgage block by one month.
 *
 * @param state   Current mortgage block state
 * @param block   Static block configuration
 * @param month   Global month index (for property value calculation)
 * @returns Step result with payment breakdown and updated state
 */
export function stepMortgageBlock(
  state: MortgageBlockState,
  block: MortgageBlock,
  month: number,
): MortgageStepResult {
  // Property value at this month (monthly-compounded appreciation)
  const propValue = propertyValueAtMonth(block.propertyValue, block.appreciationRate, month)

  // Property tax and maintenance (based on current property value).
  // Compute the parts once; total is the sum — no double-divide.
  const propTax = (propValue * block.propertyTaxRate) / 12
  const maintenance = (propValue * block.maintenanceRate) / 12
  const holdingCost = propTax + maintenance

  let piPayment = 0
  let interest = 0
  let principal = 0
  let newMortgageBalance = state.mortgageBalance

  if (state.mortgageBalance > 0) {
    const isFinal = month >= state.termMonths - 1
    const step = amortizationStep(
      state.mortgageBalance,
      block.annualInterestRate,
      state.monthlyPI,
      isFinal,
    )
    interest = step.interest
    principal = step.principal
    newMortgageBalance = step.remainingBalance
    piPayment = state.monthlyPI
  }

  const equity = propValue - newMortgageBalance
  const totalCost = piPayment + holdingCost

  const newState: MortgageBlockState = {
    ...state,
    mortgageBalance: newMortgageBalance,
    propertyValue: propValue,
    totalPrincipalPaid: state.totalPrincipalPaid + principal,
    totalInterestPaid: state.totalInterestPaid + interest,
    totalPropertyCosts: state.totalPropertyCosts + holdingCost,
    currentMonth: month + 1,
  }

  return {
    state: newState,
    piPayment,
    interest,
    principal,
    propertyTax: propTax,
    maintenance,
    totalCost,
    propertyValue: propValue,
    mortgageBalance: newMortgageBalance,
    equity,
  }
}
