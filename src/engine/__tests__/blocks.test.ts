/**
 * engine/__tests__/blocks.test.ts
 *
 * Per-block unit tests.
 */
import { describe, it, expect } from 'vitest'
import { initCashBlockState, stepCashBlock } from '../blocks/cash'
import { initMortgageBlockState, stepMortgageBlock } from '../blocks/mortgage'
import { initRentBlockState, stepRentBlock } from '../blocks/rent'
import { blockPhase, sortBlocksByPhase } from '../blocks/registry'
import type { CashBlock, MortgageBlock, RentBlock } from '../types'

// ---------------------------------------------------------------------------
// CashBlock
// ---------------------------------------------------------------------------

describe('CashBlock', () => {
  const block: CashBlock = {
    kind: 'cash',
    id: 'c1',
    label: 'Investment Account',
    initialBalance: 10_000,
    monthlyContribution: 500,
    annualReturnRate: 0.07,
    capitalGainsTaxRate: 0.15,
  }

  it('initializes state correctly', () => {
    const state = initCashBlockState(block)
    expect(state.balance).toBe(10_000)
    expect(state.totalContributions).toBe(10_000) // initial counts as contribution
  })

  it('grows by interest and adds contribution each month', () => {
    const state = initCashBlockState(block)
    const next = stepCashBlock(state, block, 500)
    const r_m = 0.07 / 12
    const expected = 10_000 * (1 + r_m) + 500
    expect(next.balance).toBeCloseTo(expected, 4)
    expect(next.totalContributions).toBe(10_500)
  })

  it('reaches ≈ $691k after 360 months (step-form, monthly compounding)', () => {
    let state = initCashBlockState(block)
    for (let m = 0; m < 360; m++) {
      state = stepCashBlock(state, block, 500)
    }
    expect(state.balance).toBeGreaterThan(690_000)
    expect(state.balance).toBeLessThan(693_000)
  })
})

// ---------------------------------------------------------------------------
// MortgageBlock
// ---------------------------------------------------------------------------

describe('MortgageBlock', () => {
  const block: MortgageBlock = {
    kind: 'mortgage',
    id: 'm1',
    label: 'Primary Home',
    propertyValue: 300_000,
    downPayment: 60_000, // 20% → loan = $240k
    annualInterestRate: 0.06,
    termYears: 30,
    appreciationRate: 0.04,
    propertyTaxRate: 0.01,
    maintenanceRate: 0.01,
  }

  it('initializes with correct loan amount and P+I payment', () => {
    const state = initMortgageBlockState(block)
    expect(state.mortgageBalance).toBeCloseTo(240_000, 0)
    expect(state.monthlyPI).toBeCloseTo(1438.92, 0)
    expect(state.termMonths).toBe(360)
  })

  it('first step reduces mortgage balance and computes interest', () => {
    const state = initMortgageBlockState(block)
    const result = stepMortgageBlock(state, block, 0)
    // Interest = 240000 * 0.005 = 1200
    expect(result.interest).toBeCloseTo(1200, 1)
    expect(result.principal).toBeCloseTo(238.92, 1) // 1438.92 - 1200
    expect(result.mortgageBalance).toBeCloseTo(240_000 - 238.92, 1)
  })

  it('property value appreciates monthly (not yearly staircase)', () => {
    const state = initMortgageBlockState(block)
    // At month 6, value > initial
    const result = stepMortgageBlock(state, block, 6)
    expect(result.propertyValue).toBeGreaterThan(300_000)
    expect(result.propertyValue).toBeCloseTo(300_000 * Math.pow(1.04, 0.5), 1)
  })

  it('amortization invariants hold over full 30-year term', () => {
    let state = initMortgageBlockState(block)
    for (let m = 0; m < 360; m++) {
      const result = stepMortgageBlock(state, block, m)
      state = result.state
    }
    // Final balance ≈ 0
    expect(Math.abs(state.mortgageBalance)).toBeLessThan(0.01)
    // Sum of principal ≈ original loan
    expect(Math.abs(state.totalPrincipalPaid - 240_000)).toBeLessThan(0.01)
  })
})

// ---------------------------------------------------------------------------
// RentBlock
// ---------------------------------------------------------------------------

describe('RentBlock', () => {
  const block: RentBlock = {
    kind: 'rent',
    id: 'r1',
    label: 'Apartment',
    monthlyRent: 2_000,
    annualRentGrowth: 0.03,
    differentialInvesting: true,
    referenceMonthlyPayment: 1_438.92,
  }

  it('initializes state with zeros', () => {
    const state = initRentBlockState()
    expect(state.totalRentPaid).toBe(0)
    expect(state.totalDifferentialInvested).toBe(0)
  })

  it('step 0: rent = base, differential = max(0, M_ref - rent)', () => {
    const state = initRentBlockState()
    const result = stepRentBlock(state, block, 0, 1_438.92)
    expect(result.rent).toBeCloseTo(2_000, 4)
    // M_ref < rent → differential = 0
    expect(result.differentialAmount).toBe(0)
  })

  it('rent steps up at month 12 (year 1)', () => {
    const state = initRentBlockState()
    const result = stepRentBlock(state, block, 12, 1_438.92)
    expect(result.rent).toBeCloseTo(2_000 * 1.03, 4)
  })

  it('rent stays flat between year steps (months 12-23)', () => {
    const state = initRentBlockState()
    const r12 = stepRentBlock(state, block, 12, 1_438.92)
    const r23 = stepRentBlock(state, block, 23, 1_438.92)
    expect(r12.rent).toBeCloseTo(r23.rent, 6)
  })

  it('differential is zero when differentialInvesting is false', () => {
    const blockNoDiff: RentBlock = { ...block, differentialInvesting: false }
    const state = initRentBlockState()
    const result = stepRentBlock(state, blockNoDiff, 0, 3_000)
    expect(result.differentialAmount).toBe(0)
  })

  it('differential is positive when M_ref > rent', () => {
    const state = initRentBlockState()
    // M_ref = 3000, rent = 2000 → diff = 1000
    const result = stepRentBlock(state, block, 0, 3_000)
    expect(result.differentialAmount).toBeCloseTo(1_000, 4)
  })
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('blockPhase', () => {
  it('mortgage and rent are cost phase', () => {
    expect(blockPhase('mortgage')).toBe('cost')
    expect(blockPhase('rent')).toBe('cost')
  })

  it('cash is asset phase', () => {
    expect(blockPhase('cash')).toBe('asset')
  })
})

describe('sortBlocksByPhase', () => {
  it('places cost blocks before asset blocks', () => {
    const blocks = [
      { kind: 'cash' as const, id: '1' },
      { kind: 'mortgage' as const, id: '2' },
      { kind: 'rent' as const, id: '3' },
    ]
    const sorted = sortBlocksByPhase(blocks)
    expect(sorted[0].kind).toBe('mortgage')
    expect(sorted[1].kind).toBe('rent')
    expect(sorted[2].kind).toBe('cash')
  })

  it('preserves relative order within phase', () => {
    const blocks = [
      { kind: 'mortgage' as const, id: 'a' },
      { kind: 'mortgage' as const, id: 'b' },
      { kind: 'cash' as const, id: 'c' },
    ]
    const sorted = sortBlocksByPhase(blocks)
    expect(sorted[0].id).toBe('a')
    expect(sorted[1].id).toBe('b')
    expect(sorted[2].id).toBe('c')
  })
})
