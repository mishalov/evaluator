/**
 * data/worldbank.ts
 *
 * Fetches historical CPI data from the World Bank API.
 * Endpoint: https://api.worldbank.org/v2/country/{ISO}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=60
 *
 * The forward inflation rate is the geometric mean of the last 10 years
 * of available data (World Bank often lags 1-2 years).
 *
 * Never throws to caller — returns null on any failure.
 */
import { geometricMeanCpi } from '../engine/math/inflation'
import { readCache, writeCache, isCacheStale, CPI_TTL_MS } from './cache'

const CACHE_KEY_PREFIX = 'cpi:'

interface WorldBankRecord {
  date: string
  value: number | null
}

/**
 * Fetch and parse World Bank CPI data for a given country.
 * @param countryCode  ISO 3166-1 alpha-2 country code (e.g. "US")
 * @returns Forward CPI rate as a decimal, or null on failure
 */
export async function fetchCpiRate(countryCode: string): Promise<number | null> {
  const cacheKey = CACHE_KEY_PREFIX + countryCode

  // Stale-while-revalidate: return stale immediately and revalidate in background
  const stale = readCache<number>(cacheKey, true)
  if (stale !== null && !isCacheStale(cacheKey)) {
    return stale
  }

  try {
    const url =
      `https://api.worldbank.org/v2/country/${countryCode}/indicator/FP.CPI.TOTL.ZG` +
      `?format=json&per_page=60`
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return stale

    const json = await response.json() as [unknown, WorldBankRecord[]] | null
    if (!Array.isArray(json) || json.length < 2) return stale

    const records: WorldBankRecord[] = json[1]
    if (!Array.isArray(records)) return stale

    // Get last 10 years with valid non-null values, sorted newest first
    const validRates = records
      .filter((r): r is WorldBankRecord & { value: number } => r.value !== null)
      .sort((a, b) => parseInt(b.date) - parseInt(a.date))
      .slice(0, 10)
      .map((r) => r.value / 100) // World Bank returns percent, convert to decimal

    if (validRates.length === 0) return stale

    const rate = geometricMeanCpi(validRates)
    writeCache(cacheKey, rate, CPI_TTL_MS)
    return rate
  } catch {
    return stale
  }
}

/** Parse the raw World Bank JSON for testing */
export function parseCpiResponse(json: unknown): number | null {
  try {
    if (!Array.isArray(json) || json.length < 2) return null
    const records = json[1] as WorldBankRecord[]
    const validRates = records
      .filter((r): r is WorldBankRecord & { value: number } => r.value !== null)
      .sort((a, b) => parseInt(b.date) - parseInt(a.date))
      .slice(0, 10)
      .map((r) => r.value / 100)
    if (validRates.length === 0) return null
    return geometricMeanCpi(validRates)
  } catch {
    return null
  }
}
