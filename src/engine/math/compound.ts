/**
 * engine/math/compound.ts
 *
 * Compound interest with periodic contributions.
 *
 * Two forms:
 *
 * 1. **Step form** (used by the simulator):
 *    balance_{m+1} = balance_m * (1 + r_m) + contribution_{m+1}
 *    where r_m = annualRate / 12 (monthly compounding convention).
 *
 * 2. **Closed form** (used by tests to verify the step form):
 *    FV = P * (1 + r_m)^n + C * ((1 + r_m)^n - 1) / r_m
 *    where P = initial balance, C = fixed monthly contribution, n = months.
 *    Edge case r_m = 0: FV = P + C * n.
 *
 * Capital gains tax is NOT applied per-period — it is applied at the horizon
 * only, on gains = (finalBalance - totalContributions). This matches common
 * long-term investment tax treatment.
 */

/**
 * Closed-form future value of an investment with periodic contributions.
 * Uses monthly compounding: r_m = annualRate / 12.
 *
 * @param initialBalance    Starting balance (P)
 * @param monthlyContribution Fixed contribution each month (C)
 * @param annualRate        Annual return rate as a decimal
 * @param months            Total number of months (n)
 * @returns Future value (nominal)
 */
export function fvWithContributions(
  initialBalance: number,
  monthlyContribution: number,
  annualRate: number,
  months: number,
): number {
  const r_m = annualRate / 12
  if (r_m === 0) {
    return initialBalance + monthlyContribution * months
  }
  const factor = Math.pow(1 + r_m, months)
  const fvPrincipal = initialBalance * factor
  const fvContributions = monthlyContribution * ((factor - 1) / r_m)
  return fvPrincipal + fvContributions
}

/**
 * Advance an investment balance by one month (step form for the simulator).
 *
 * @param balance      Current balance at start of month
 * @param annualRate   Annual return rate as a decimal
 * @param contribution Contribution added this month
 * @returns New balance after growth and contribution
 *
 * TODO (m2 — out of scope): Support a yearlyCap compounding mode where
 * within-year contributions accumulate at zero return and the full annual
 * rate is applied once at year-end: balance * (1+annualRate) + yearContribs.
 * See plan ref: noble-painting-cocke.md §m2.
 */
export function compoundStep(
  balance: number,
  annualRate: number,
  contribution: number,
): number {
  const r_m = annualRate / 12
  return balance * (1 + r_m) + contribution
}

/**
 * Compute capital gains tax owed at horizon.
 * Applied only to gains (balance - totalContributions).
 * Never negative (no tax credit on losses).
 *
 * @param finalBalance       Investment balance at horizon
 * @param totalContributions Sum of all contributions made (including initial)
 * @param taxRate            Capital gains tax rate as a decimal
 * @returns Tax owed (nominal)
 */
export function capitalGainsTax(
  finalBalance: number,
  totalContributions: number,
  taxRate: number,
): number {
  const gains = finalBalance - totalContributions
  if (gains <= 0) return 0
  return gains * taxRate
}
