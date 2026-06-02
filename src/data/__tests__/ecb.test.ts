/**
 * data/__tests__/ecb.test.ts
 *
 * Unit tests for parseEcbXml (M5).
 *
 * Uses canned XML strings — no network, no DOMParser dependency.
 * Works in both jsdom and Node environments because the implementation
 * was converted from DOMParser to a regex-based parser (M6).
 */
import { describe, it, expect } from 'vitest'
import { parseEcbXml } from '../ecb'

// ---------------------------------------------------------------------------
// Canned XML fixtures
// ---------------------------------------------------------------------------

/** Minimal valid ECB XML with double-quoted attributes */
const VALID_XML_DOUBLE_QUOTES = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-06-02">
      <Cube currency="USD" rate="1.0823"/>
      <Cube currency="GBP" rate="0.8573"/>
      <Cube currency="JPY" rate="163.47"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

/** Same data with single-quoted attributes */
const VALID_XML_SINGLE_QUOTES = `<?xml version='1.0' encoding='UTF-8'?>
<gesmes:Envelope>
  <Cube>
    <Cube time='2026-06-02'>
      <Cube currency='USD' rate='1.0823'/>
      <Cube currency='GBP' rate='0.8573'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

/** XML with no rate cubes */
const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope><Cube></Cube></gesmes:Envelope>`

/** Totally invalid content */
const GARBAGE = 'this is not xml at all <<<>>>'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseEcbXml', () => {
  it('parses well-formed XML with double-quoted attributes', () => {
    const rates = parseEcbXml(VALID_XML_DOUBLE_QUOTES)
    expect(rates).not.toBeNull()
    expect(rates!.EUR).toBe(1.0)
    expect(rates!.USD).toBeCloseTo(1.0823, 4)
    expect(rates!.GBP).toBeCloseTo(0.8573, 4)
    expect(rates!.JPY).toBeCloseTo(163.47, 2)
  })

  it('parses well-formed XML with single-quoted attributes', () => {
    const rates = parseEcbXml(VALID_XML_SINGLE_QUOTES)
    expect(rates).not.toBeNull()
    expect(rates!.EUR).toBe(1.0)
    expect(rates!.USD).toBeCloseTo(1.0823, 4)
    expect(rates!.GBP).toBeCloseTo(0.8573, 4)
  })

  it('always includes EUR = 1.0 as base currency', () => {
    const rates = parseEcbXml(VALID_XML_DOUBLE_QUOTES)
    expect(rates!.EUR).toBe(1.0)
  })

  it('returns null when no currency cubes are found', () => {
    const rates = parseEcbXml(EMPTY_XML)
    expect(rates).toBeNull()
  })

  it('returns null for garbage input without throwing', () => {
    expect(() => parseEcbXml(GARBAGE)).not.toThrow()
    const rates = parseEcbXml(GARBAGE)
    expect(rates).toBeNull()
  })

  it('returns null for an empty string without throwing', () => {
    expect(() => parseEcbXml('')).not.toThrow()
    expect(parseEcbXml('')).toBeNull()
  })

  it('correctly extracts only numeric rates and ignores invalid entries', () => {
    const xml = `<Cube currency="XXX" rate="not-a-number"/>
                 <Cube currency="USD" rate="1.05"/>`
    const rates = parseEcbXml(xml)
    // USD should be parsed; XXX should be ignored
    expect(rates!.USD).toBeCloseTo(1.05, 4)
    expect(rates!.XXX).toBeUndefined()
  })
})
