/**
 * engine/math/inflation.ts
 *
 * CPI index computation for real vs nominal conversion.
 *
 * Convention:
 *   cpiIndex(m) = (1 + cpiAnnual)^(m / 12)
 *
 * This is the cumulative price level at month m relative to month 0.
 * To convert a nominal value to real: realValue = nominalValue / cpiIndex(m).
 *
 * The engine ALWAYS operates in nominal values. This module is used
 * only for the display-layer real/nominal transform and for recording
 * cpiIndex in MonthlyPoint (so the UI can switch modes without re-running).
 */

/**
 * Compute the CPI index at a given month.
 *
 * @param month      Month index (0-based; m=0 → index=1.0 exactly)
 * @param cpiAnnual  Annual CPI rate as a decimal (e.g. 0.02 for 2%)
 * @returns CPI index (dimensionless multiplier; 1.0 at month 0)
 */
export function cpiIndex(month: number, cpiAnnual: number): number {
  return Math.pow(1 + cpiAnnual, month / 12)
}

/**
 * Convert a nominal value to real by deflating with the CPI index.
 *
 * @param nominalValue  Nominal amount
 * @param month         Month index
 * @param cpiAnnual     Annual CPI rate as a decimal
 * @returns Real (inflation-adjusted) value
 */
export function toReal(nominalValue: number, month: number, cpiAnnual: number): number {
  return nominalValue / cpiIndex(month, cpiAnnual)
}

/**
 * Compute the geometric mean annual CPI rate from a series of annual rates.
 * Used by the data layer to derive a forward inflation estimate from
 * World Bank historical data.
 *
 * @param annualRates  Array of annual CPI rates as decimals (e.g. [0.02, 0.025, ...])
 * @returns Geometric mean rate as a decimal
 */
export function geometricMeanCpi(annualRates: number[]): number {
  if (annualRates.length === 0) return 0
  const product = annualRates.reduce((acc, r) => acc * (1 + r), 1)
  return Math.pow(product, 1 / annualRates.length) - 1
}
