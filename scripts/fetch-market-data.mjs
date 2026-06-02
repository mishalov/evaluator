/**
 * scripts/fetch-market-data.mjs
 *
 * Build-time fetch of ECB FX rates and World Bank CPI data.
 * Runs in Node (no browser CORS), writes a snapshot to src/data/snapshot.json
 * which the bundled app reads at runtime — no proxy, no third-party
 * dependency at runtime.
 *
 * Run via `npm run fetch-data` or automatically via `prebuild`.
 *
 * Fail-soft: if a fetch fails, we keep the previous snapshot rather than
 * blocking the build. The runtime still has DEFAULT_MARKET_DATA as a
 * last-resort fallback.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_PATH = resolve(__dirname, '../src/data/snapshot.json')
const TIMEOUT_MS = 15_000

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'

// Countries we want CPI for. Keep aligned with SUPPORTED_COUNTRIES in defaults.ts.
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'JP', 'CA', 'AU', 'CH', 'CZ', 'SE', 'NZ']

// ---------------------------------------------------------------------------
// Parsers (kept identical to the runtime parsers in src/data/ecb.ts and
// src/data/worldbank.ts so the snapshot shape matches what the runtime expects).
// ---------------------------------------------------------------------------

function parseEcbXml(xml) {
  const rates = { EUR: 1.0 }
  const cubeRegex = /<Cube\s+currency=["'](\w+)["']\s+rate=["']([\d.]+)["']\s*\/>/g
  let match
  while ((match = cubeRegex.exec(xml)) !== null) {
    const currency = match[1]
    const rate = parseFloat(match[2])
    if (currency && !Number.isNaN(rate) && rate > 0) {
      rates[currency] = rate
    }
  }
  return Object.keys(rates).length > 1 ? rates : null
}

/** Geometric mean of (1+r) - 1, matching engine/math/inflation.ts */
function geometricMeanCpi(rates) {
  if (rates.length === 0) return 0
  const product = rates.reduce((acc, r) => acc * (1 + r), 1)
  return Math.pow(product, 1 / rates.length) - 1
}

function parseCpiResponse(json) {
  if (!Array.isArray(json) || json.length < 2) return null
  const records = json[1]
  if (!Array.isArray(records)) return null
  const validRates = records
    .filter((r) => r && typeof r.value === 'number')
    .sort((a, b) => parseInt(b.date) - parseInt(a.date))
    .slice(0, 10)
    .map((r) => r.value / 100)
  if (validRates.length === 0) return null
  return geometricMeanCpi(validRates)
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return res
  } finally {
    clearTimeout(t)
  }
}

async function fetchEcb() {
  const res = await fetchWithTimeout(ECB_URL)
  const text = await res.text()
  const rates = parseEcbXml(text)
  if (!rates) throw new Error('ECB XML parse returned null')
  return rates
}

async function fetchCpi(countryCode) {
  const url =
    `https://api.worldbank.org/v2/country/${countryCode}/indicator/FP.CPI.TOTL.ZG` +
    `?format=json&per_page=60`
  const res = await fetchWithTimeout(url)
  const json = await res.json()
  return parseCpiResponse(json)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadPrevious() {
  if (!existsSync(SNAPSHOT_PATH)) return null
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const previous = loadPrevious()
  const fetchedAt = new Date().toISOString()

  // FX rates
  let fxRates
  try {
    fxRates = await fetchEcb()
    console.log(`[snapshot] ECB: ${Object.keys(fxRates).length} currencies`)
  } catch (err) {
    console.warn(`[snapshot] ECB fetch failed: ${err.message}`)
    fxRates = previous?.fxRates
    if (!fxRates) {
      console.warn('[snapshot] No previous FX rates; using EUR-only fallback')
      fxRates = { EUR: 1.0 }
    } else {
      console.log('[snapshot] Reusing previous FX rates')
    }
  }

  // CPI per country
  const cpiByCountry = {}
  for (const code of COUNTRIES) {
    try {
      const rate = await fetchCpi(code)
      if (rate !== null) {
        cpiByCountry[code] = rate
        console.log(`[snapshot] CPI ${code}: ${(rate * 100).toFixed(2)}%`)
      } else {
        throw new Error('parseCpiResponse returned null')
      }
    } catch (err) {
      console.warn(`[snapshot] CPI ${code} failed: ${err.message}`)
      const prev = previous?.cpiByCountry?.[code]
      if (typeof prev === 'number') {
        cpiByCountry[code] = prev
        console.log(`[snapshot] CPI ${code}: reusing previous ${(prev * 100).toFixed(2)}%`)
      }
    }
  }

  const snapshot = {
    schemaVersion: 1,
    fetchedAt,
    fxRates,
    cpiByCountry,
  }

  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
  console.log(`[snapshot] wrote ${SNAPSHOT_PATH}`)
}

main().catch((err) => {
  console.error('[snapshot] fatal:', err)
  process.exit(1)
})
