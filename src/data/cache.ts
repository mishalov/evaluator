/**
 * data/cache.ts
 *
 * localStorage-backed cache for market data.
 * Namespace: `evaluator:cache:v1:`
 * TTL policy: CPI = 30 days, FX = 24 hours.
 * Grace window: entries up to 90 days old are served as last-resort fallback
 *   even after they have expired — see readCacheWithGrace().
 *
 * Used by loadMarketData() as a SECONDARY source: the primary source is the
 * build-time snapshot bundled into the app. Cache entries here are written
 * from snapshot data so that an offline visitor opening an old tab still has
 * something to render even if the snapshot module somehow fails to load.
 *
 * The data layer NEVER throws to the UI. On any error, returns null so
 * callers can fall through to defaults.
 */

const CACHE_NAMESPACE = 'evaluator:cache:v1:'

interface CacheEntry<T> {
  data: T
  fetchedAt: string // ISO timestamp
  ttlMs: number
}

export const CPI_TTL_MS    = 30 * 24 * 60 * 60 * 1000  // 30 days
export const FX_TTL_MS     = 24 * 60 * 60 * 1000        // 24 hours
export const STALE_GRACE_MS = 90 * 24 * 60 * 60 * 1000  // 90 days

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
 * Read a cached entry even if it has expired, as long as it is within the
 * STALE_GRACE_MS window (90 days). Returns null if missing or older than the
 * grace window. Intended as a last-resort fallback after live fetch fails and
 * the normal cache TTL has also passed.
 *
 * Used internally by loadWithFallback() as step 4 of the fallback chain:
 *   live → fresh cache (readCache) → grace-window cache (readCacheWithGrace)
 *   → null (caller falls through to DEFAULT_MARKET_DATA)
 */
export function readCacheWithGrace<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_NAMESPACE + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const age = Date.now() - new Date(entry.fetchedAt).getTime()
    if (age > STALE_GRACE_MS) return null
    return entry.data
  } catch {
    return null
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
