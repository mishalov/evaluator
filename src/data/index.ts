/**
 * data/index.ts
 *
 * Public data layer API.
 *
 * Source priority:
 *   1. Build-time snapshot (src/data/snapshot.json, refreshed daily by CI)
 *   2. localStorage cache (within TTL or 90-day grace window)
 *   3. DEFAULT_MARKET_DATA (last-resort placeholder)
 *
 * No runtime cross-origin fetches — GitHub Pages friendly.
 *
 * INVARIANT: This function NEVER throws. It always returns a valid MarketData.
 */
import type { MarketData } from '../engine/types'
import { DEFAULT_MARKET_DATA } from './defaults'
import { readCache, readCacheWithGrace, writeCache, CPI_TTL_MS, FX_TTL_MS } from './cache'
import {
  getSnapshotFxRates,
  getSnapshotCpi,
  getSnapshotFetchedAt,
} from './snapshot'

/**
 * Load market data for a given country.
 *
 * Reads the bundled build-time snapshot first. Falls back to localStorage
 * cache (a previous good snapshot saved during a prior visit), then to
 * DEFAULT_MARKET_DATA.
 *
 * @param countryCode  ISO 3166-1 alpha-2 code (e.g. "CZ")
 */
export async function loadMarketData(countryCode: string): Promise<MarketData> {
  try {
    const fxFromSnapshot = getSnapshotFxRates()
    const cpiFromSnapshot = getSnapshotCpi(countryCode)

    // The snapshot at minimum contains EUR=1; treat anything richer as usable.
    const snapshotHasFx = Object.keys(fxFromSnapshot).length > 1
    const snapshotHasCpi = cpiFromSnapshot !== null

    if (snapshotHasFx && snapshotHasCpi) {
      // Cache the snapshot values too, so a subsequent visit with a stale
      // (but valid) older bundle still has data if the user opens an old tab.
      writeCache('fx:ecb', fxFromSnapshot, FX_TTL_MS)
      writeCache(`cpi:${countryCode}`, cpiFromSnapshot, CPI_TTL_MS)
      return {
        cpiAnnual: cpiFromSnapshot,
        fxRates: fxFromSnapshot,
        source: 'live',
        fetchedAt: getSnapshotFetchedAt(),
      }
    }

    // Snapshot was incomplete — fill gaps from cache, then defaults.
    const cachedCpi =
      readCache<number>(`cpi:${countryCode}`) ??
      readCacheWithGrace<number>(`cpi:${countryCode}`)
    const cachedFx =
      readCache<Record<string, number>>('fx:ecb') ??
      readCacheWithGrace<Record<string, number>>('fx:ecb')

    const finalCpi =
      (snapshotHasCpi ? cpiFromSnapshot : null) ??
      cachedCpi ??
      DEFAULT_MARKET_DATA.cpiAnnual
    const finalFx =
      (snapshotHasFx ? fxFromSnapshot : null) ??
      cachedFx ??
      DEFAULT_MARKET_DATA.fxRates

    const usedSnapshot = snapshotHasFx || snapshotHasCpi
    const usedCache = (!snapshotHasFx && cachedFx !== null) || (!snapshotHasCpi && cachedCpi !== null)

    const source: MarketData['source'] = usedSnapshot
      ? 'live'
      : usedCache
        ? 'cached'
        : 'fallback'

    return {
      cpiAnnual: finalCpi,
      fxRates: finalFx,
      source,
      fetchedAt: usedSnapshot ? getSnapshotFetchedAt() : new Date().toISOString(),
    }
  } catch {
    return { ...DEFAULT_MARKET_DATA, fetchedAt: new Date().toISOString() }
  }
}

/**
 * Convert a monetary value from one currency to another using ECB cross-rates.
 * Uses EUR as intermediate.
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
  return (amount / fromRate) * toRate
}

export { DEFAULT_MARKET_DATA, SUPPORTED_CURRENCIES, SUPPORTED_COUNTRIES } from './defaults'
