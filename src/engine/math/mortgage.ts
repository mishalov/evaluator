/**
 * engine/math/mortgage.ts
 *
 * Fixed-rate mortgage math using US-mortgage convention:
 *   - Nominal monthly rate: r_m = annualRate / 12
 *   - Monthly payment: M = L * r_m * (1 + r_m)^n / ((1 + r_m)^n - 1)
 *   - Edge case r_m = 0 (0% APR): M = L / n
 *
 * Amortization invariants (must hold within 1¢):
 *   sum(principal_k, k=1..n) ≈ L
 *   B_n ≈ 0
 *
 * The final payment floors B at 0 to absorb floating-point dust.
 */

/**
 * Compute the fixed monthly payment (principal + interest only).
 *
 * @param principal   Loan amount (L)
 * @param annualRate  Annual interest rate as a decimal (e.g. 0.06 for 6%)
 * @param termMonths  Loan term in months (n)
 * @returns Monthly P+I payment
 */
export function monthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number,
): number {
  if (principal <= 0) return 0
  const r_m = annualRate / 12
  if (r_m === 0) {
    // Zero-interest edge case
    return principal / termMonths
  }
  const factor = Math.pow(1 + r_m, termMonths)
  return (principal * r_m * factor) / (factor - 1)
}

/**
 * Result of a single amortization step.
 */
export interface AmortizationStep {
  /** Interest paid this period */
  interest: number
  /** Principal repaid this period */
  principal: number
  /** Remaining balance after this payment */
  remainingBalance: number
}

/**
 * Advance the mortgage by one month.
 *
 * @param balance      Current outstanding principal (B_k)
 * @param annualRate   Annual interest rate as a decimal
 * @param payment      Fixed monthly P+I payment (M)
 * @param isFinalMonth When true, floors remaining balance at 0 to absorb FP dust
 * @returns AmortizationStep with interest, principal, and new balance
 */
export function amortizationStep(
  balance: number,
  annualRate: number,
  payment: number,
  isFinalMonth = false,
): AmortizationStep {
  const r_m = annualRate / 12
  const interest = balance * r_m
  const principal = payment - interest
  let remainingBalance = balance - principal

  if (isFinalMonth) {
    // Floor at 0 to absorb any floating-point dust on the last payment
    remainingBalance = Math.max(0, remainingBalance)
  }

  return { interest, principal, remainingBalance }
}

/**
 * Generate the complete amortization schedule for a loan.
 * Useful for tests — engine uses amortizationStep per month.
 *
 * @param principal   Loan amount
 * @param annualRate  Annual interest rate as a decimal
 * @param termMonths  Loan term in months
 * @returns Array of length termMonths, one entry per payment
 */
export function amortizationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
): AmortizationStep[] {
  const M = monthlyPayment(principal, annualRate, termMonths)
  const schedule: AmortizationStep[] = []
  let balance = principal

  for (let k = 1; k <= termMonths; k++) {
    const isFinal = k === termMonths
    const step = amortizationStep(balance, annualRate, M, isFinal)
    schedule.push(step)
    balance = step.remainingBalance
  }

  return schedule
}
