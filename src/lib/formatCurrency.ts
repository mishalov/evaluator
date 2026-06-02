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
 * getCurrencySymbol — extract the localised currency symbol for a given code.
 *
 * Uses Intl.NumberFormat to format 0 and picks the 'currency' part from
 * formatToParts. Falls back to the raw currency code if no symbol part is
 * found (e.g. unknown/custom codes).
 *
 * Examples (en-US locale):
 *   getCurrencySymbol('USD') → '$'
 *   getCurrencySymbol('CZK') → 'Kč'   (may vary by Node ICU build)
 *   getCurrencySymbol('EUR') → '€'
 */
export function getCurrencySymbol(currency: string, locale = 'en-US'): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
    return parts.find(p => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}
