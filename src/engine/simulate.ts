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
import { sortBlocksByPhase } from './blocks/registry'
import type { CashBlock, MortgageBlock, RentBlock } from './types'

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

  // We support one of each block type per scenario (as per spec)
  const cashBlock = cashBlocks[0] ?? null
  const mortgageBlock = mortgageBlocks[0] ?? null
  const rentBlock = rentBlocks[0] ?? null

  // Initialize mutable state
  let cashState: CashBlockState = cashBlock
    ? initCashBlockState(cashBlock)
    : { balance: 0, totalContributions: 0 }
  let mortgageState: MortgageBlockState | null = mortgageBlock
    ? initMortgageBlockState(mortgageBlock)
    : null
  let rentState: RentBlockState | null = rentBlock ? initRentBlockState() : null

  // Determine M_ref for differential investing:
  // Use referenceMonthlyPayment if explicitly set, otherwise use sibling mortgage's PI
  const referenceMonthlyPI =
    rentBlock?.referenceMonthlyPayment ??
    mortgageState?.monthlyPI ??
    0

  const monthly: MonthlyPoint[] = []

  // Month 0 snapshot (initial state before any steps)
  monthly.push(snapshotMonth(0, cashState, mortgageState, 0, 0, 0, 0, 0, 0, cpiAnnual))

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

    // --- 3. Compute total cash contribution ---
    // Base contribution from cash block config + differential investing surplus.
    // Note: salaryNet is informational only and is NOT added here (see JSDoc at top).
    const baseCashContribution = cashBlock ? cashBlock.monthlyContribution : 0
    const totalCashContribution = baseCashContribution + differentialAmount

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
        mortgagePI,
        mortgageInterest,
        mortgagePrincipal,
        propertyTax,
        maintenance,
        rentPayment,
        cpiAnnual,
        salaryNet,
        totalCashContribution,
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
  const totalInterest = mortgageState ? mortgageState.totalInterestPaid : 0
  const totalPropertyCosts = mortgageState ? mortgageState.totalPropertyCosts : 0
  const downPayment = mortgageBlock ? mortgageBlock.downPayment : 0

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
  mortgagePayment: number,
  mortgageInterest: number,
  mortgagePrincipal: number,
  propertyTax: number,
  maintenance: number,
  rent: number,
  cpiAnnual: number,
  salaryNet = 0,
  cashContribution = 0,
): MonthlyPoint {
  const propertyValue = mortgageState?.propertyValue ?? 0
  const mortgageBalance = mortgageState?.mortgageBalance ?? 0
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
  }
}

// Re-export for convenience
export { simulate as runSimulation }
