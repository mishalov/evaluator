/**
 * engine/simulate.ts
 *
 * Top-level simulation loop.
 *
 * Block ordering rule:
 *   cost blocks (mortgage, rent) step BEFORE asset blocks (cash).
 *   This ensures cash block receives all routed inflows in the same month.
 *
 * Monthly loop:
 *   1. Compute salary net income
 *   2. Step cost blocks (mortgage → deduct, rent → compute differential)
 *   3. Compute total cash inflow = base contribution + differential + salary routing
 *   4. Step cash block with total inflow
 *   5. Snapshot MonthlyPoint
 *
 * The engine is ALWAYS nominal. Real values are computed only in the display
 * layer by dividing nominal by cpiIndex(month, cpiAnnual).
 *
 * --- SALARY ROUTING DECISION (architect, 2026) ---
 * `salaryNet` in MonthlyPoint is INFORMATIONAL / DISPLAY-ONLY.
 * It is computed and recorded each month so the UI can show "net monthly
 * income" in context, but it is NOT routed into any block's cash flow.
 * Cash contributions come solely from:
 *   - CashBlock.monthlyContribution (user-configured fixed amount)
 *   - The rent/mortgage differential (when differentialInvesting is enabled)
 * This is a deliberate product decision: the calculator compares investment
 * strategies, not personal budgets. Routing salary would require modelling
 * spending, which is out of scope. Any future change to route salary into
 * the cash block must be an intentional feature addition, not a silent fix.
 *
 * --- DOWN-PAYMENT DEBIT (architect, 2026) ---
 * When a scenario contains both a MortgageBlock (or RentalPropertyBlock) and
 * a CashBlock, the down payment is debited from the cash block at month 0
 * (before the month-0 snapshot). This avoids double-counting: previously
 * the down payment reduced the loan principal but was not removed from
 * cash, so net worth = cash + (propertyValue - mortgageBalance) included
 * the down payment twice. We do NOT clamp at zero — a negative cash
 * balance is a meaningful signal that the scenario is under-funded.
 * Both the mortgage and rental down payments are debited when present.
 */
import { Scenario, SimulationResult, MonthlyPoint, SimulationSummary } from './types'
import { cpiIndex } from './math/inflation'
import { monthlyNetSalary } from './math/growth'
import { capitalGainsTax } from './math/compound'
import { initCashBlockState, stepCashBlock, CashBlockState } from './blocks/cash'
import {
  initMortgageBlockState,
  stepMortgageBlock,
  MortgageBlockState,
} from './blocks/mortgage'
import { initRentBlockState, stepRentBlock, RentBlockState } from './blocks/rent'
import {
  initRentalBlockState,
  stepRentalBlock,
  RentalBlockState,
} from './blocks/rental'
import { sortBlocksByPhase } from './blocks/registry'
import type { CashBlock, MortgageBlock, RentBlock, RentalPropertyBlock } from './types'

/**
 * Simulate a single scenario over the given horizon.
 *
 * @param scenario      Scenario configuration
 * @param horizonYears  Simulation horizon in years
 * @param cpiAnnual     Annual CPI rate as a decimal (used for cpiIndex recording only)
 * @returns SimulationResult with monthly + yearly data and summary
 */
export function simulate(
  scenario: Scenario,
  horizonYears: number,
  cpiAnnual: number,
): SimulationResult {
  const totalMonths = horizonYears * 12

  // Sort blocks: cost first, then asset
  const sortedBlocks = sortBlocksByPhase(scenario.blocks)

  // Find block instances by kind
  const cashBlocks = sortedBlocks.filter((b): b is CashBlock => b.kind === 'cash')
  const mortgageBlocks = sortedBlocks.filter((b): b is MortgageBlock => b.kind === 'mortgage')
  const rentBlocks = sortedBlocks.filter((b): b is RentBlock => b.kind === 'rent')
  const rentalBlocks = sortedBlocks.filter((b): b is RentalPropertyBlock => b.kind === 'rental')

  // We support one of each block type per scenario (as per spec)
  const cashBlock = cashBlocks[0] ?? null
  const mortgageBlock = mortgageBlocks[0] ?? null
  const rentBlock = rentBlocks[0] ?? null
  const rentalBlock = rentalBlocks[0] ?? null

  // Initialize mutable state
  let cashState: CashBlockState = cashBlock
    ? initCashBlockState(cashBlock)
    : { balance: 0, totalContributions: 0 }
  let mortgageState: MortgageBlockState | null = mortgageBlock
    ? initMortgageBlockState(mortgageBlock)
    : null
  let rentState: RentBlockState | null = rentBlock ? initRentBlockState() : null
  let rentalState: RentalBlockState | null = rentalBlock
    ? initRentalBlockState(rentalBlock)
    : null

  // Down-payment debit. Both the mortgage and rental block init take downPayment
  // off their respective loan principals, so the cash block must shed those amounts
  // to avoid double-counting net worth.
  // No clamping — negative cash is a meaningful signal of an under-funded scenario.
  //
  // We deliberately do NOT debit totalContributions: the down payment is a
  // withdrawal of capital, not a reversal of a prior contribution. Reducing
  // the cost basis here would inflate capital-gains tax at horizon by treating
  // already-taxed principal as taxable gain. (See capitalGainsTax in
  // engine/math/compound.ts: gains = balance - totalContributions.)
  if (mortgageBlock && cashBlock) {
    cashState = {
      balance: cashState.balance - mortgageBlock.downPayment,
      totalContributions: cashState.totalContributions,
    }
  }
  if (rentalBlock && cashBlock) {
    cashState = {
      balance: cashState.balance - rentalBlock.downPayment,
      totalContributions: cashState.totalContributions,
    }
  }

  // Determine M_ref for differential investing:
  // Use referenceMonthlyPayment if explicitly set, otherwise use sibling mortgage's PI.
  // Intentionally excludes the rental block's PI — rental is a landlord income source,
  // not a housing-cost reference for consumption-rent differential investing.
  const referenceMonthlyPI =
    rentBlock?.referenceMonthlyPayment ??
    mortgageState?.monthlyPI ??
    0

  const monthly: MonthlyPoint[] = []

  // Month 0 snapshot (initial state before any steps)
  monthly.push(snapshotMonth(0, cashState, mortgageState, rentalState, 0, 0, 0, 0, 0, 0, cpiAnnual))

  // Run monthly loop
  for (let month = 1; month <= totalMonths; month++) {
    // --- 1. Salary net income ---
    const salaryNet = monthlyNetSalary(
      scenario.salary.annualAmount,
      scenario.salary.growthRate,
      scenario.salary.incomeTaxRate,
      month - 1, // month 1 uses year-0 salary
    )

    // --- 2. Step cost blocks ---
    let mortgagePI = 0
    let mortgageInterest = 0
    let mortgagePrincipal = 0
    let propertyTax = 0
    let maintenance = 0

    if (mortgageBlock && mortgageState) {
      const result = stepMortgageBlock(mortgageState, mortgageBlock, month - 1)
      mortgageState = result.state
      mortgagePI = result.piPayment
      mortgageInterest = result.interest
      mortgagePrincipal = result.principal
      propertyTax = result.propertyTax
      maintenance = result.maintenance
    }

    let rentPayment = 0
    let differentialAmount = 0

    if (rentBlock && rentState) {
      const result = stepRentBlock(rentState, rentBlock, month - 1, referenceMonthlyPI)
      rentState = result.state
      rentPayment = result.rent
      differentialAmount = result.differentialAmount
    }

    // Step rental block and route its net cash flow into cash.
    // Net cash flow may be negative (e.g. vacancy + tax year exceeds rent income).
    // We do NOT clamp to zero — a negative-cash-flow rental is a meaningful signal.
    let rentalNetCashFlow = 0
    let rentalIncome = 0
    let landlordTax = 0

    if (rentalBlock && rentalState) {
      const result = stepRentalBlock(rentalState, rentalBlock, month - 1)
      rentalState = result.state
      rentalNetCashFlow = result.netCashFlow
      rentalIncome = result.rentReceived
      landlordTax = result.landlordTaxThisMonth
    }

    // --- 3. Compute total cash contribution ---
    // Base contribution from cash block config + differential investing surplus
    // + rental net cash flow (may be negative).
    // Note: salaryNet is informational only and is NOT added here (see JSDoc at top).
    const baseCashContribution = cashBlock ? cashBlock.monthlyContribution : 0
    const totalCashContribution = baseCashContribution + differentialAmount + rentalNetCashFlow

    // --- 4. Step cash block ---
    if (cashBlock) {
      cashState = stepCashBlock(cashState, cashBlock, totalCashContribution)
    }

    // --- 5. Snapshot ---
    monthly.push(
      snapshotMonth(
        month,
        cashState,
        mortgageState,
        rentalState,
        mortgagePI,
        mortgageInterest,
        mortgagePrincipal,
        propertyTax,
        maintenance,
        rentPayment,
        cpiAnnual,
        salaryNet,
        totalCashContribution,
        rentalIncome,
        landlordTax,
        rentalNetCashFlow,
      ),
    )
  }

  // Compute yearly samples (months 0, 12, 24, …)
  const yearly: MonthlyPoint[] = []
  for (let y = 0; y <= horizonYears; y++) {
    yearly.push(monthly[y * 12])
  }

  // Compute summary
  const finalPoint = monthly[totalMonths]
  const cpiAtHorizon = cpiIndex(totalMonths, cpiAnnual)

  const totalRent = rentState ? rentState.totalRentPaid : 0
  // Sum mortgage + rental interest and costs so summary reflects all property costs
  const totalInterest =
    (mortgageState ? mortgageState.totalInterestPaid : 0) +
    (rentalState ? rentalState.totalInterestPaid : 0)
  const totalPropertyCosts =
    (mortgageState ? mortgageState.totalPropertyCosts : 0) +
    (rentalState ? rentalState.totalPropertyCosts : 0)
  const downPayment =
    (mortgageBlock ? mortgageBlock.downPayment : 0) +
    (rentalBlock ? rentalBlock.downPayment : 0)

  const totalRentalIncome = rentalState ? rentalState.totalRentalIncome : 0
  const totalLandlordTax = rentalState ? rentalState.totalLandlordTax : 0

  const cgTax = cashBlock
    ? capitalGainsTax(
        cashState.balance,
        cashState.totalContributions,
        cashBlock.capitalGainsTaxRate,
      )
    : 0

  const summary: SimulationSummary = {
    finalNetWorthNominal: finalPoint.netWorth,
    finalNetWorthReal: finalPoint.netWorth / cpiAtHorizon,
    totalContributions: cashState.totalContributions,
    totalInterest,
    totalRent,
    totalPropertyCosts,
    downPayment,
    capitalGainsTaxAtHorizon: cgTax,
    totalRentalIncome,
    totalLandlordTax,
  }

  return {
    scenarioId: scenario.id,
    monthly,
    yearly,
    summary,
  }
}

/** Build a MonthlyPoint snapshot */
function snapshotMonth(
  month: number,
  cashState: CashBlockState,
  mortgageState: MortgageBlockState | null,
  rentalState: RentalBlockState | null,
  mortgagePayment: number,
  mortgageInterest: number,
  mortgagePrincipal: number,
  propertyTax: number,
  maintenance: number,
  rent: number,
  cpiAnnual: number,
  salaryNet = 0,
  cashContribution = 0,
  rentalIncome = 0,
  landlordTax = 0,
  rentalNetCashFlow = 0,
): MonthlyPoint {
  // Aggregate property value and mortgage balance across ALL property blocks.
  // When a scenario has both a mortgage block and a rental block, we must sum
  // both contributions — using ?? would drop the rental equity when the mortgage
  // block is present, understating net worth by the rental's equity.
  // Single-property scenarios (only mortgage, or only rental) are unaffected:
  // the missing state contributes 0 through the fallback `?? 0`.
  const propertyValue =
    (mortgageState?.propertyValue ?? 0) + (rentalState?.propertyValue ?? 0)
  const mortgageBalance =
    (mortgageState?.mortgageBalance ?? 0) + (rentalState?.mortgageBalance ?? 0)
  const propertyEquity = propertyValue - mortgageBalance
  const netWorth = cashState.balance + propertyEquity

  return {
    month,
    year: Math.floor(month / 12),
    cashBalance: cashState.balance,
    propertyValue,
    mortgageBalance,
    propertyEquity,
    netWorth,
    mortgagePayment,
    mortgageInterest,
    mortgagePrincipal,
    propertyTax,
    maintenance,
    rent,
    salaryNet,
    cashContribution,
    cpiIndex: cpiIndex(month, cpiAnnual),
    rentalIncome,
    landlordTax,
    rentalNetCashFlow,
  }
}

// Re-export for convenience
export { simulate as runSimulation }
