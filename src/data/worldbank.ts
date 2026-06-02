/**
 * data/worldbank.ts
 *
 * World Bank CPI JSON parser.
 *
 * The runtime no longer fetches from the browser — `scripts/fetch-market-data.mjs`
 * does it at build time and bakes results into `src/data/snapshot.json`.
 *
 * This file retains `parseCpiResponse` for symmetry with `ecb.ts` and so the
 * existing tests remain meaningful.
 *
 * Forward inflation rate = geometric mean of the most recent 10 years of
 * available CPI data (World Bank often lags 1-2 years).
 */
import { geometricMeanCpi } from '../engine/math/inflation'

interface WorldBankRecord {
  date: string
  value: number | null
}

/** Parse the raw World Bank JSON response. */
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
