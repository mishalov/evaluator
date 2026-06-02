/**
 * data/index.ts
 *
 * Public data layer API.
 *
 * Fetches live CPI and FX data with stale-while-revalidate caching.
 * Falls back to bundled defaults on any failure.
 *
 * INVARIANT: This function NEVER throws. It always returns a valid MarketData.
 *
 * Source priority: live > cached > fallback
 */
import type { MarketData } from '../engine/types'
import { DEFAULT_MARKET_DATA } from './defaults'
import { fetchCpiRate } from './worldbank'
import { fetchFxRates } from './ecb'
import { readCache } from './cache'

/**
 * Load market data for a given country.
 *
 * Attempts live fetches in parallel; on any failure, falls back to
 * cached data, then to bundled defaults.
 *
 * @param countryCode  ISO 3166-1 alpha-2 code (e.g. "US")
 * @returns MarketData with source tag indicating origin
 */
export async function loadMarketData(countryCode: string): Promise<MarketData> {
  try {
    const [cpiRate, fxRates] = await Promise.all([
      fetchCpiRate(countryCode).catch(() => null),
      fetchFxRates().catch(() => null),
    ])

    // Check what we actually got
    const hasCpi = cpiRate !== null
    const hasFx = fxRates !== null

    if (hasCpi && hasFx) {
      return {
        cpiAnnual: cpiRate,
        fxRates,
        source: 'live',
        fetchedAt: new Date().toISOString(),
      }
    }

    // Partial live data — fill gaps from cache/defaults
    const cachedCpi = readCache<number>(`cpi:${countryCode}`, true)
    const cachedFx = readCache<Record<string, number>>('fx:ecb', true)

    const finalCpi = cpiRate ?? cachedCpi ?? DEFAULT_MARKET_DATA.cpiAnnual
    const finalFx = fxRates ?? cachedFx ?? DEFAULT_MARKET_DATA.fxRates

    const source: MarketData['source'] =
      (hasCpi || cachedCpi !== null) && (hasFx || cachedFx !== null)
        ? 'cached'
        : 'fallback'

    return {
      cpiAnnual: finalCpi,
      fxRates: finalFx,
      source,
      fetchedAt: new Date().toISOString(),
    }
  } catch {
    return { ...DEFAULT_MARKET_DATA, fetchedAt: new Date().toISOString() }
  }
}

/**
 * Convert a monetary value from one currency to another using ECB cross-rates.
 * Uses EUR as intermediate.
 *
 * @param amount       Amount in `fromCurrency`
 * @param fromCurrency ISO 4217 code
 * @param toCurrency   ISO 4217 code
 * @param fxRates      Rate map (units per EUR)
 * @returns Converted amount in `toCurrency`
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  fxRates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount
  const fromRate = fxRates[fromCurrency] ?? 1
  const toRate = fxRates[toCurrency] ?? 1
  // amount in EUR = amount / fromRate; amount in toCurrency = amountEur * toRate
  return (amount / fromRate) * toRate
}

export { DEFAULT_MARKET_DATA, SUPPORTED_CURRENCIES, SUPPORTED_COUNTRIES } from './defaults'
