/**
 * data/ecb.ts
 *
 * Fetches current FX rates from the European Central Bank.
 * Endpoint: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 * EUR is the base currency (= 1.0).
 *
 * Cross-rates for non-EUR pairs: rate_A_to_B = fxRates[B] / fxRates[A].
 * Engine works in scenario currency, FX conversion happens at input boundary.
 *
 * Never throws to caller — returns null on any failure.
 */
import { readCache, writeCache, isCacheStale, FX_TTL_MS } from './cache'

const CACHE_KEY = 'fx:ecb'
// Browsers block this direct fetch via CORS; the fallback path in useExternalData is intentional.
const ECB_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

/**
 * Fetch ECB FX rates.
 * @returns Record of currency code → units per EUR, or null on failure
 */
export async function fetchFxRates(): Promise<Record<string, number> | null> {
  const stale = readCache<Record<string, number>>(CACHE_KEY, true)
  if (stale !== null && !isCacheStale(CACHE_KEY)) {
    return stale
  }

  try {
    const response = await fetch(ECB_URL, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return stale

    const text = await response.text()
    const rates = parseEcbXml(text)
    if (!rates) return stale

    writeCache(CACHE_KEY, rates, FX_TTL_MS)
    return rates
  } catch {
    if ((import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV) {
      console.info('[fx] ECB direct fetch blocked (likely CORS); using cached/default rates')
    }
    return stale
  }
}

/**
 * Parse ECB XML response into a rates map.
 * EUR is always 1.0 (base currency).
 *
 * Uses a regex-based approach instead of DOMParser so that this function
 * works in both browser and Node (enabling unit tests without jsdom).
 *
 * The ECB daily XML is well-structured and small (~30 lines). Each rate
 * appears as one of:
 *   <Cube currency='USD' rate='1.0823'/>
 *   <Cube currency="USD" rate="1.0823"/>
 *
 * Both single and double quote styles are matched.
 *
 * Exported for testing.
 */
export function parseEcbXml(xml: string): Record<string, number> | null {
  try {
    const rates: Record<string, number> = { EUR: 1.0 }
    // Match both single-quoted and double-quoted attribute values
    const cubeRegex = /<Cube\s+currency=["'](\w+)["']\s+rate=["']([\d.]+)["']\s*\/>/g
    let match: RegExpExecArray | null
    while ((match = cubeRegex.exec(xml)) !== null) {
      const currency = match[1]
      const rate = parseFloat(match[2])
      if (currency && !isNaN(rate) && rate > 0) {
        rates[currency] = rate
      }
    }
    return Object.keys(rates).length > 1 ? rates : null
  } catch {
    return null
  }
}
