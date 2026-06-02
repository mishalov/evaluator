/**
 * data/cache.ts
 *
 * localStorage-backed cache for market data.
 * Namespace: `evaluator:cache:v1:`
 * TTL policy: CPI = 7 days, FX = 24 hours.
 * Strategy: stale-while-revalidate.
 *
 * The data layer NEVER throws to the UI. On any error, returns null
 * so callers can fall through to defaults.
 */

const CACHE_NAMESPACE = 'evaluator:cache:v1:'

interface CacheEntry<T> {
  data: T
  fetchedAt: string // ISO timestamp
  ttlMs: number
}

export const CPI_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days
export const FX_TTL_MS  = 24 * 60 * 60 * 1000       // 24 hours

/**
 * Read a cached entry. Returns null if missing or expired.
 * Returns the entry even if stale when `allowStale` is true (SWR).
 */
export function readCache<T>(key: string, allowStale = false): T | null {
  try {
    const raw = localStorage.getItem(CACHE_NAMESPACE + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const age = Date.now() - new Date(entry.fetchedAt).getTime()
    if (age > entry.ttlMs && !allowStale) return null
    return entry.data
  } catch {
    return null
  }
}

/**
 * Check if a cache entry is stale (but present).
 */
export function isCacheStale(key: string): boolean {
  try {
    const raw = localStorage.getItem(CACHE_NAMESPACE + key)
    if (!raw) return true
    const entry: CacheEntry<unknown> = JSON.parse(raw)
    const age = Date.now() - new Date(entry.fetchedAt).getTime()
    return age > entry.ttlMs
  } catch {
    return true
  }
}

/**
 * Write a value to cache with a TTL.
 */
export function writeCache<T>(key: string, data: T, ttlMs: number): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      fetchedAt: new Date().toISOString(),
      ttlMs,
    }
    localStorage.setItem(CACHE_NAMESPACE + key, JSON.stringify(entry))
  } catch {
    // Storage full or not available — silently ignore
  }
}

/** Clear a specific cache entry */
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(CACHE_NAMESPACE + key)
  } catch {
    // Ignore
  }
}
