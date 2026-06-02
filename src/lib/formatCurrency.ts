/**
 * formatCurrency — locale-aware currency formatting helper.
 *
 * Uses Intl.NumberFormat under the hood. Rounds to nearest integer for
 * display (financial amounts don't need sub-cent precision in the UI).
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value)
}

/**
 * formatPercent — format a decimal fraction as a percentage string.
 * e.g. formatPercent(0.065) → "6.50%"
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}
