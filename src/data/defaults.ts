/**
 * data/defaults.ts
 *
 * Last-resort placeholder market data.
 * Used only when both live fetches AND cached values are unavailable.
 * No bundled estimates: CPI is 0 and FX is identity (EUR=1) so the user
 * sees an obviously empty state rather than stale numbers from a snapshot.
 */
import type { MarketData } from '../engine/types'

export const DEFAULT_MARKET_DATA: MarketData = {
  cpiAnnual: 0,
  fxRates: {
    // EUR retained as the base (= 1.0 by convention) so convertCurrency
    // does not divide by undefined when no live/cached rates are present.
    EUR: 1.0,
  },
  source: 'fallback',
  fetchedAt: '1970-01-01T00:00:00.000Z',
}

/** Supported currency list with display names */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
]

/** Supported country list with ISO codes */
export const SUPPORTED_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NZ', name: 'New Zealand' },
]
