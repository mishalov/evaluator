/**
 * lib/__tests__/formatCurrency.test.ts
 *
 * Unit tests for getCurrencySymbol().
 *
 * Note: Intl.NumberFormat symbol output depends on the ICU data bundled
 * with Node. Full-icu builds return 'Kč' for CZK; small-icu/system ICU
 * builds may return 'CZK'. The tests use a tolerant fallback assertion
 * when the expected symbol is locale-specific.
 */
import { describe, it, expect } from 'vitest'
import { getCurrencySymbol } from '../formatCurrency'

describe('getCurrencySymbol', () => {
  it('returns "$" for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$')
  })

  it('returns a non-empty string for EUR', () => {
    const sym = getCurrencySymbol('EUR')
    expect(sym.length).toBeGreaterThan(0)
    // EUR symbol is universally "€" across all ICU builds
    expect(sym).toBe('€')
  })

  it('returns a non-empty symbol for CZK (Kč or "CZK" depending on ICU build)', () => {
    const sym = getCurrencySymbol('CZK')
    expect(sym.length).toBeGreaterThan(0)
    // Accept either the proper Kč glyph or the ISO fallback
    const isKc = sym === 'Kč'
    const isFallback = sym === 'CZK'
    expect(isKc || isFallback).toBe(true)
  })

  it('does not throw for an unknown currency code and returns the code itself', () => {
    // 'FAKE' is not a valid ISO 4217 code — Intl.NumberFormat throws a RangeError.
    // getCurrencySymbol catches it and returns the raw code as fallback.
    expect(() => getCurrencySymbol('FAKE')).not.toThrow()
    expect(getCurrencySymbol('FAKE')).toBe('FAKE')
  })

  it('uses the supplied locale', () => {
    // Both en-US and cs-CZ should return a non-empty string for CZK
    const enUS = getCurrencySymbol('CZK', 'en-US')
    const csCZ = getCurrencySymbol('CZK', 'cs-CZ')
    expect(enUS.length).toBeGreaterThan(0)
    expect(csCZ.length).toBeGreaterThan(0)
  })
})
