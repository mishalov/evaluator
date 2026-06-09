/**
 * engine/aggregate.ts
 *
 * Helpers for aggregating simulation results across multiple scenarios.
 * Used by the UI to build chart data.
 */
import { SimulationResult, MonthlyPoint, DisplayMode } from './types'

/**
 * Get the display value of net worth at a point,
 * applying real/nominal transform based on displayMode.
 */
export function getNetWorth(point: MonthlyPoint, displayMode: DisplayMode): number {
  if (displayMode === 'real') {
    return point.netWorth / point.cpiIndex
  }
  return point.netWorth
}

/** Apply real/nominal transform to an arbitrary nominal value at a given point. */
function displayValue(nominal: number, point: MonthlyPoint, displayMode: DisplayMode): number {
  return displayMode === 'real' ? nominal / point.cpiIndex : nominal
}

/**
 * Build yearly chart data for NetWorthChart from multiple simulation results.
 * Returns an array of objects with year + one key per scenarioId.
 *
 * When `includeBreakdown` is true, also emits two extra series per scenario:
 *   - `${scenarioId}_propertyValue`  (current property market value)
 *   - `${scenarioId}_mortgageBalance` (outstanding mortgage principal)
 * These let the UI overlay the components that drive net worth so the user
 * can see *why* equity behaves the way it does.
 */
export function buildNetWorthChartData(
  results: SimulationResult[],
  displayMode: DisplayMode,
  includeBreakdown = false,
): Array<Record<string, number>> {
  if (results.length === 0) return []

  const horizonYears = results[0].yearly.length - 1
  return Array.from({ length: horizonYears + 1 }, (_, y) => {
    const row: Record<string, number> = { year: y }
    for (const result of results) {
      const point = result.yearly[y]
      if (point) {
        row[result.scenarioId] = getNetWorth(point, displayMode)
        if (includeBreakdown) {
          row[`${result.scenarioId}_propertyValue`] = displayValue(
            point.propertyValue,
            point,
            displayMode,
          )
          row[`${result.scenarioId}_mortgageBalance`] = displayValue(
            point.mortgageBalance,
            point,
            displayMode,
          )
        }
      }
    }
    return row
  })
}

/**
 * Build yearly stacked-area data for a single scenario.
 * Returns one row per year with the two components of net worth:
 *   - cashBalance     (lower stack, can be negative when down payment > initial cash)
 *   - propertyEquity  (upper stack, = propertyValue - mortgageBalance)
 *
 * The sum of the two equals net worth at that year.
 */
export function buildNetWorthBreakdownData(
  result: SimulationResult,
  displayMode: DisplayMode,
): Array<{ year: number; cashBalance: number; propertyEquity: number }> {
  return result.yearly.map((point, y) => ({
    year: y,
    cashBalance: displayValue(point.cashBalance, point, displayMode),
    propertyEquity: displayValue(point.propertyEquity, point, displayMode),
  }))
}

/**
 * Build monthly cash flow chart data for a single scenario.
 * Returns stacked bar data: mortgage P&I, tax, maintenance, rent, contributions.
 *
 * Year y covers months y*12+1 .. y*12+12 (1-indexed months within the year).
 * Each flow field is the SUM of all 12 monthly values in that year — NOT a
 * single month multiplied by 12. This matters for any quantity that varies
 * within a year (property tax and maintenance grow with property appreciation;
 * rent steps annually; contributions can include a variable differential).
 *
 * Property value snapshot uses the end-of-year month (month y*12+12) to
 * represent the value "at year y" for display purposes.
 *
 * Year 0 is excluded (it is the initial snapshot with no cash-flow events).
 * This matches the previous filter `p.month % 12 === 0 && p.month > 0`.
 */
export function buildCashFlowChartData(
  result: SimulationResult,
): Array<Record<string, number>> {
  const { monthly } = result
  // horizonYears = (monthly.length - 1) / 12
  const horizonYears = (monthly.length - 1) / 12

  const rows: Array<Record<string, number>> = []

  for (let y = 1; y <= horizonYears; y++) {
    // Months belonging to year y: indices y*12-11 .. y*12 (1-based within year)
    // i.e. monthly[y*12 - 11] through monthly[y*12]
    let mortgagePI = 0
    let propertyTax = 0
    let maintenance = 0
    let rent = 0
    let cashContribution = 0
    let rentalIncome = 0
    let landlordTax = 0

    for (let m = y * 12 - 11; m <= y * 12; m++) {
      const p = monthly[m]
      if (!p) continue
      mortgagePI += p.mortgagePayment
      propertyTax += p.propertyTax
      maintenance += p.maintenance
      rent += p.rent
      cashContribution += p.cashContribution
      rentalIncome += p.rentalIncome
      landlordTax += p.landlordTax
    }

    rows.push({ year: y, mortgagePI, propertyTax, maintenance, rent, cashContribution, rentalIncome, landlordTax })
  }

  return rows
}
