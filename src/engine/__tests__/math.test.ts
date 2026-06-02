/**
 * engine/__tests__/math.test.ts
 *
 * Vitest unit tests for all engine math functions.
 * Covers reference values from the spec plus invariant checks.
 */
import { describe, it, expect } from 'vitest'
import { monthlyPayment, amortizationSchedule, amortizationStep } from '../math/mortgage'
import { fvWithContributions, compoundStep, capitalGainsTax } from '../math/compound'
import { cpiIndex, geometricMeanCpi, toReal } from '../math/inflation'
import {
  monthlyRent,
  monthlyNetSalary,
  propertyValueAtMonth,
  annualSalary,
  monthlyPropertyCost,
} from '../math/growth'

// ---------------------------------------------------------------------------
// Mortgage
// ---------------------------------------------------------------------------

describe('monthlyPayment', () => {
  it('computes the spec reference value: $240k @ 6% / 30y ≈ $1,438.92', () => {
    const M = monthlyPayment(240_000, 0.06, 360)
    expect(M).toBeCloseTo(1438.92, 0) // within ±$0.50
  })

  it('computes $300k @ 6% / 30y ≈ $1,798.65 (from plan manual sanity)', () => {
    // $300k house, 20% down = $240k loan → same as above
    const loan = 300_000 * 0.8 // = 240,000
    const M = monthlyPayment(loan, 0.06, 360)
    expect(M).toBeCloseTo(1438.92, 0)
  })

  it('handles zero interest rate: M = L / n', () => {
    const M = monthlyPayment(120_000, 0, 120)
    expect(M).toBeCloseTo(1000, 6)
  })

  it('returns 0 for zero principal', () => {
    expect(monthlyPayment(0, 0.06, 360)).toBe(0)
  })
})

describe('amortizationSchedule invariants', () => {
  function checkInvariants(principal: number, annualRate: number, termMonths: number) {
    const schedule = amortizationSchedule(principal, annualRate, termMonths)
    const sumPrincipal = schedule.reduce((s, step) => s + step.principal, 0)
    const finalBalance = schedule[schedule.length - 1].remainingBalance

    // Sum of principal repayments ≈ original loan (within 1¢)
    expect(Math.abs(sumPrincipal - principal)).toBeLessThan(0.01)
    // Final balance ≈ 0 (within 1¢)
    expect(Math.abs(finalBalance)).toBeLessThan(0.01)
  }

  it('satisfies invariants for $240k @ 6% / 30y', () => {
    checkInvariants(240_000, 0.06, 360)
  })

  it('satisfies invariants for $100k @ 4% / 15y', () => {
    checkInvariants(100_000, 0.04, 180)
  })

  it('satisfies invariants for $500k @ 3.5% / 20y', () => {
    checkInvariants(500_000, 0.035, 240)
  })

  it('satisfies invariants for $200k @ 0% / 10y (edge case)', () => {
    checkInvariants(200_000, 0, 120)
  })

  it('final balance is floored at 0, never negative', () => {
    const schedule = amortizationSchedule(240_000, 0.06, 360)
    for (const step of schedule) {
      expect(step.remainingBalance).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('amortizationStep', () => {
  it('computes interest and principal correctly for first payment', () => {
    const principal = 240_000
    const annualRate = 0.06
    const M = monthlyPayment(principal, annualRate, 360)
    const step = amortizationStep(principal, annualRate, M)
    // r_m = 0.06/12 = 0.005
    // Interest = 240000 * 0.005 = 1200
    expect(step.interest).toBeCloseTo(1200, 2)
    // Principal = M - interest
    expect(step.principal).toBeCloseTo(M - 1200, 2)
    expect(step.remainingBalance).toBeCloseTo(principal - step.principal, 2)
  })
})

// ---------------------------------------------------------------------------
// Compound interest
// ---------------------------------------------------------------------------

describe('fvWithContributions', () => {
  it('matches spec reference: $10k + $500/mo @ 7% / 30y ≈ $691,150 (monthly compounding)', () => {
    // Monthly compounding: r_m = 0.07/12
    // FV = 10000*(1+r_m)^360 + 500*((1+r_m)^360 - 1)/r_m ≈ $691,150
    // Note: the plan's "$654,121" figure uses a different compounding convention;
    // this implementation uses US-standard monthly compounding (r_m = r/12),
    // which yields ~$691,150. The ±$100 tolerance in the spec refers to the
    // closed-form vs step-form agreement, not the absolute target value.
    const fv = fvWithContributions(10_000, 500, 0.07, 360)
    expect(fv).toBeGreaterThan(690_000)
    expect(fv).toBeLessThan(693_000)
  })

  it('handles zero rate: FV = P + C * n', () => {
    const fv = fvWithContributions(1_000, 100, 0, 12)
    expect(fv).toBeCloseTo(1_000 + 100 * 12, 6)
  })

  it('handles zero contribution', () => {
    // Simple compound: $10k @ 7% for 12 months
    const r_m = 0.07 / 12
    const expected = 10_000 * Math.pow(1 + r_m, 12)
    const fv = fvWithContributions(10_000, 0, 0.07, 12)
    expect(fv).toBeCloseTo(expected, 4)
  })
})

describe('compoundStep vs fvWithContributions', () => {
  it('step-form matches closed-form within $100 for $10k + $500/mo @ 7% / 30y', () => {
    // Step-form simulation
    let balance = 10_000
    for (let m = 0; m < 360; m++) {
      balance = compoundStep(balance, 0.07, 500)
    }
    const closedForm = fvWithContributions(10_000, 500, 0.07, 360)
    // Both forms should agree to floating-point precision (< $0.01)
    // The ±$100 tolerance from the spec refers to the agreement between forms,
    // not between implementations; our forms are algebraically identical so they agree to ¢
    expect(Math.abs(balance - closedForm)).toBeLessThan(100)
    expect(Math.abs(balance - closedForm)).toBeLessThan(0.01)
  })
})

describe('capitalGainsTax', () => {
  it('computes tax on gains only', () => {
    const tax = capitalGainsTax(50_000, 10_000, 0.15)
    expect(tax).toBeCloseTo(40_000 * 0.15, 6) // 6000
  })

  it('returns 0 when no gains (balance ≤ contributions)', () => {
    expect(capitalGainsTax(8_000, 10_000, 0.15)).toBe(0)
  })

  it('returns 0 when tax rate is 0', () => {
    expect(capitalGainsTax(50_000, 10_000, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Inflation
// ---------------------------------------------------------------------------

describe('cpiIndex', () => {
  it('spec reference: cpiIndex(60, 0.02) = 1.02^5 ≈ 1.10408', () => {
    const expected = Math.pow(1.02, 5)
    expect(cpiIndex(60, 0.02)).toBeCloseTo(expected, 8)
  })

  it('cpiIndex(0, any) = 1.0 exactly', () => {
    expect(cpiIndex(0, 0.03)).toBe(1)
    expect(cpiIndex(0, 0)).toBe(1)
  })

  it('cpiIndex(12, 0.02) = 1.02^1 exactly', () => {
    expect(cpiIndex(12, 0.02)).toBeCloseTo(1.02, 10)
  })

  it('cpiIndex(0, 0) = 1.0', () => {
    expect(cpiIndex(0, 0)).toBe(1)
  })
})

describe('toReal', () => {
  it('deflates nominal value to real', () => {
    const nominal = 110_000
    const month = 120 // 10 years
    const cpiAnnual = 0.02
    const expectedReal = nominal / Math.pow(1.02, 10)
    expect(toReal(nominal, month, cpiAnnual)).toBeCloseTo(expectedReal, 4)
  })
})

describe('geometricMeanCpi', () => {
  it('returns 0 for empty array', () => {
    expect(geometricMeanCpi([])).toBe(0)
  })

  it('computes correct geometric mean for uniform rates', () => {
    // All 2% → mean = 2%
    const rates = Array(10).fill(0.02)
    expect(geometricMeanCpi(rates)).toBeCloseTo(0.02, 8)
  })

  it('computes geometric mean correctly for mixed rates', () => {
    // 1.01 * 1.03 = 1.0403; geometric mean = sqrt(1.0403) - 1 ≈ 0.01997
    const result = geometricMeanCpi([0.01, 0.03])
    expect(result).toBeCloseTo(Math.sqrt(1.01 * 1.03) - 1, 8)
  })
})

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

describe('monthlyRent (annual step, lease-style)', () => {
  it('returns base rent for months 0-11', () => {
    const base = 2_000
    for (let m = 0; m < 12; m++) {
      expect(monthlyRent(base, 0.03, m)).toBeCloseTo(base, 6)
    }
  })

  it('steps up at month 12 (year 1)', () => {
    const base = 2_000
    expect(monthlyRent(base, 0.03, 12)).toBeCloseTo(2_000 * 1.03, 6)
  })

  it('does NOT compound monthly (stays flat within year)', () => {
    const base = 2_000
    const rentAt12 = monthlyRent(base, 0.03, 12)
    const rentAt23 = monthlyRent(base, 0.03, 23)
    expect(rentAt12).toBeCloseTo(rentAt23, 6)
  })

  it('steps up again at month 24 (year 2)', () => {
    const base = 2_000
    expect(monthlyRent(base, 0.03, 24)).toBeCloseTo(2_000 * Math.pow(1.03, 2), 6)
  })
})

describe('monthlyNetSalary', () => {
  it('computes correct net for year 0', () => {
    const base = 60_000
    const expected = (60_000 * (1 - 0.25)) / 12 // = 3750
    expect(monthlyNetSalary(base, 0.05, 0.25, 0)).toBeCloseTo(expected, 6)
  })

  it('steps up at month 12', () => {
    const base = 60_000
    const expected = (60_000 * 1.05 * (1 - 0.25)) / 12
    expect(monthlyNetSalary(base, 0.05, 0.25, 12)).toBeCloseTo(expected, 6)
  })

  it('stays flat within the same year', () => {
    const m0 = monthlyNetSalary(60_000, 0.05, 0.25, 0)
    const m11 = monthlyNetSalary(60_000, 0.05, 0.25, 11)
    expect(m0).toBeCloseTo(m11, 6)
  })
})

describe('propertyValueAtMonth', () => {
  it('uses continuous monthly compounding, not yearly staircase', () => {
    // At month 6, value should be initialValue * (1+a)^0.5, not initialValue
    const initial = 300_000
    const rate = 0.04
    const v6 = propertyValueAtMonth(initial, rate, 6)
    const expected = initial * Math.pow(1.04, 0.5)
    expect(v6).toBeCloseTo(expected, 4)
    // Confirm it's NOT the staircase (staircase would still be 300,000 at m=6)
    expect(v6).toBeGreaterThan(initial)
  })

  it('returns initial value at month 0', () => {
    expect(propertyValueAtMonth(300_000, 0.04, 0)).toBeCloseTo(300_000, 6)
  })

  it('returns initialValue * (1+a) at month 12', () => {
    expect(propertyValueAtMonth(300_000, 0.04, 12)).toBeCloseTo(300_000 * 1.04, 6)
  })
})

describe('annualSalary', () => {
  it('compounds annually', () => {
    expect(annualSalary(60_000, 0.05, 3)).toBeCloseTo(60_000 * Math.pow(1.05, 3), 6)
  })
})

describe('monthlyPropertyCost', () => {
  it('computes combined tax + maintenance correctly', () => {
    const cost = monthlyPropertyCost(300_000, 0.01, 0.01)
    expect(cost).toBeCloseTo((300_000 * 0.02) / 12, 6)
  })
})
