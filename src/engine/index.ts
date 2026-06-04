/**
 * engine/index.ts
 *
 * Public API surface for the engine layer.
 * UI and state layers import from here, not from internal modules.
 */
export * from './types'
export { simulate, runSimulation } from './simulate'
export { buildNetWorthChartData, buildNetWorthBreakdownData, buildCashFlowChartData, getNetWorth } from './aggregate'
export { monthlyPayment, amortizationSchedule } from './math/mortgage'
export { fvWithContributions, capitalGainsTax } from './math/compound'
export { cpiIndex, toReal, geometricMeanCpi } from './math/inflation'
export { monthlyRent, monthlyNetSalary, propertyValueAtMonth } from './math/growth'
