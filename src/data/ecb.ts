/**
 * data/ecb.ts
 *
 * ECB FX rate XML parser.
 *
 * The runtime no longer fetches the ECB feed from the browser — that path
 * was blocked by CORS on GitHub Pages, and public CORS proxies proved
 * unreliable. Instead, `scripts/fetch-market-data.mjs` runs in Node at
 * build time, fetches the feed, and bakes the result into
 * `src/data/snapshot.json` (consumed via `data/snapshot.ts`).
 *
 * This file retains `parseEcbXml` because the build script needs an
 * identical parser and the existing unit tests cover this implementation.
 *
 * EUR is the base currency (= 1.0).
 * Cross-rates: rate_A_to_B = fxRates[B] / fxRates[A].
 */

/**
 * Parse ECB XML response into a rates map.
 * EUR is always 1.0 (base currency).
 *
 * Uses a regex-based approach instead of DOMParser so that this function
 * works in both browser and Node (no jsdom needed in tests).
 *
 * The ECB daily XML is well-structured and small (~30 lines). Each rate
 * appears as one of:
 *   <Cube currency='USD' rate='1.0823'/>
 *   <Cube currency="USD" rate="1.0823"/>
 *
 * Both single and double quote styles are matched.
 */
export function parseEcbXml(xml: string): Record<string, number> | null {
  try {
    const rates: Record<string, number> = { EUR: 1.0 }
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
