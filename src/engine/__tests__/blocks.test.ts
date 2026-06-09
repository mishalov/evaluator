/**
 * engine/__tests__/blocks.test.ts
 *
 * Per-block unit tests.
 *
 * NOTE (v3 refactor): Rate fields moved to global Assumptions.
 * Block fixtures no longer carry annualReturnRate, capitalGainsTaxRate,
 * annualInterestRate, appreciationRate, maintenanceRate, annualRentGrowth,
 * landlordTaxRate, etc. Those are passed as assumptions slices to each step
 * function instead.
 */
import { describe, it, expect } from 'vitest'
import { initCashBlockState, stepCashBlock } from '../blocks/cash'
import { initMortgageBlockState, stepMortgageBlock } from '../blocks/mortgage'
import { initRentBlockState, stepRentBlock } from '../blocks/rent'
import { initRentalBlockState, stepRentalBlock } from '../blocks/rental'
import { blockPhase, sortBlocksByPhase } from '../blocks/registry'
import { rentalIncomeTax } from '../math/rentalTax'
import type { CashBlock, MortgageBlock, RentBlock, RentalPropertyBlock, Assumptions } from '../types'

// ---------------------------------------------------------------------------
// Shared assumptions slices used across tests
// ---------------------------------------------------------------------------

const INVESTMENT: Assumptions['investment'] = {
  annualReturnRate: 0.07,
  capitalGainsTaxRate: 0.15,
}

const PROPERTY: Assumptions['property'] = {
  mortgageInterestRate: 0.06,
  appreciationRate: 0.04,
  maintenanceRate: 0.01,
}

const LANDLORD_TAX: Assumptions['landlordTax'] = {
  rate: 0.15,
  rateHigh: 0.23,
  threshold: 1_762_812,
}

const RENT_GROWTH = 0.03

const RENTAL_ASSUMPTIONS: Pick<Assumptions, 'property' | 'rentGrowth' | 'landlordTax'> = {
  property: { mortgageInterestRate: 0.052, appreciationRate: 0.04, maintenanceRate: 0.01 },
  rentGrowth: RENT_GROWTH,
  landlordTax: LANDLORD_TAX,
}

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
  }

  it('initializes state correctly', () => {
    const state = initCashBlockState(block)
    expect(state.balance).toBe(10_000)
    expect(state.totalContributions).toBe(10_000) // initial counts as contribution
  })

  it('grows by interest and adds contribution each month', () => {
    const state = initCashBlockState(block)
    const next = stepCashBlock(state, block, INVESTMENT, 500)
    const r_m = 0.07 / 12
    const expected = 10_000 * (1 + r_m) + 500
    expect(next.balance).toBeCloseTo(expected, 4)
    expect(next.totalContributions).toBe(10_500)
  })

  it('reaches ≈ $691k after 360 months (step-form, monthly compounding)', () => {
    let state = initCashBlockState(block)
    for (let m = 0; m < 360; m++) {
      state = stepCashBlock(state, block, INVESTMENT, 500)
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
    termYears: 30,
  }

  it('initializes with correct loan amount and P+I payment', () => {
    const state = initMortgageBlockState(block, PROPERTY)
    expect(state.mortgageBalance).toBeCloseTo(240_000, 0)
    expect(state.monthlyPI).toBeCloseTo(1438.92, 0)
    expect(state.termMonths).toBe(360)
  })

  it('first step reduces mortgage balance and computes interest', () => {
    const state = initMortgageBlockState(block, PROPERTY)
    const result = stepMortgageBlock(state, block, PROPERTY, 0)
    // Interest = 240000 * 0.005 = 1200
    expect(result.interest).toBeCloseTo(1200, 1)
    expect(result.principal).toBeCloseTo(238.92, 1) // 1438.92 - 1200
    expect(result.mortgageBalance).toBeCloseTo(240_000 - 238.92, 1)
  })

  it('property value appreciates monthly (not yearly staircase)', () => {
    const state = initMortgageBlockState(block, PROPERTY)
    // At month 6, value > initial
    const result = stepMortgageBlock(state, block, PROPERTY, 6)
    expect(result.propertyValue).toBeGreaterThan(300_000)
    expect(result.propertyValue).toBeCloseTo(300_000 * Math.pow(1.04, 0.5), 1)
  })

  it('amortization invariants hold over full 30-year term', () => {
    let state = initMortgageBlockState(block, PROPERTY)
    for (let m = 0; m < 360; m++) {
      const result = stepMortgageBlock(state, block, PROPERTY, m)
      state = result.state
    }
    // Final balance ≈ 0
    expect(Math.abs(state.mortgageBalance)).toBeLessThan(0.01)
    // Sum of principal ≈ original loan
    expect(Math.abs(state.totalPrincipalPaid - 240_000)).toBeLessThan(0.01)
  })

  it('MortgageStepResult has no propertyTax field (removed in v3)', () => {
    const state = initMortgageBlockState(block, PROPERTY)
    const result = stepMortgageBlock(state, block, PROPERTY, 0)
    expect((result as unknown as Record<string, unknown>).propertyTax).toBeUndefined()
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
    const result = stepRentBlock(state, block, RENT_GROWTH, 0, 1_438.92)
    expect(result.rent).toBeCloseTo(2_000, 4)
    // M_ref < rent → differential = 0
    expect(result.differentialAmount).toBe(0)
  })

  it('rent steps up at month 12 (year 1)', () => {
    const state = initRentBlockState()
    const result = stepRentBlock(state, block, RENT_GROWTH, 12, 1_438.92)
    expect(result.rent).toBeCloseTo(2_000 * 1.03, 4)
  })

  it('rent stays flat between year steps (months 12-23)', () => {
    const state = initRentBlockState()
    const r12 = stepRentBlock(state, block, RENT_GROWTH, 12, 1_438.92)
    const r23 = stepRentBlock(state, block, RENT_GROWTH, 23, 1_438.92)
    expect(r12.rent).toBeCloseTo(r23.rent, 6)
  })

  it('differential is zero when differentialInvesting is false', () => {
    const blockNoDiff: RentBlock = { ...block, differentialInvesting: false }
    const state = initRentBlockState()
    const result = stepRentBlock(state, blockNoDiff, RENT_GROWTH, 0, 3_000)
    expect(result.differentialAmount).toBe(0)
  })

  it('differential is positive when M_ref > rent', () => {
    const state = initRentBlockState()
    // M_ref = 3000, rent = 2000 → diff = 1000
    const result = stepRentBlock(state, block, RENT_GROWTH, 0, 3_000)
    expect(result.differentialAmount).toBeCloseTo(1_000, 4)
  })
})

// ---------------------------------------------------------------------------
// RentalPropertyBlock
// ---------------------------------------------------------------------------

const RENTAL_BLOCK: RentalPropertyBlock = {
  kind: 'rental',
  id: 'rnt1',
  label: 'Prague Flat',
  propertyValue: 7_500_000,
  downPayment: 1_500_000, // 20% → loan = 6_000_000
  termYears: 30,
  monthlyRentIncome: 28_000,
  vacancyRate: 0.05,
  expenseMethod: 'lumpSum30',
}

describe('RentalPropertyBlock — initialization', () => {
  it('initializes with correct loan amount and monthly PI', () => {
    const state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    // loan = 7_500_000 - 1_500_000 = 6_000_000
    expect(state.mortgageBalance).toBeCloseTo(6_000_000, 0)
    expect(state.monthlyPI).toBeGreaterThan(30_000) // 5.2% / 30y on 6M CZK
    expect(state.termMonths).toBe(360)
  })

  it('initializes all lifetime totals and YTD accumulators to 0', () => {
    const state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    expect(state.totalRentalIncome).toBe(0)
    expect(state.totalLandlordTax).toBe(0)
    expect(state.totalInterestPaid).toBe(0)
    expect(state.totalPropertyCosts).toBe(0)
    expect(state.ytdRentalIncome).toBe(0)
    expect(state.ytdInterest).toBe(0)
    // ytdPropertyTax removed in v3
    expect((state as unknown as Record<string, unknown>).ytdPropertyTax).toBeUndefined()
    expect(state.ytdMaintenance).toBe(0)
  })
})

describe('RentalPropertyBlock — stepRentalBlock', () => {
  it('computes correct netCashFlow = rent - PI - maintenance at month 0 (no tax settlement)', () => {
    const state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, 0)

    // rentReceived = 28_000 * (1 - 0.05) = 26_600
    expect(result.rentReceived).toBeCloseTo(28_000 * 0.95, 4)
    // landlordTaxThisMonth = 0 (only settles at month 11, 23, …)
    expect(result.landlordTaxThisMonth).toBe(0)
    // netCashFlow = rentReceived - piPayment - maintenance (no property tax in v3)
    const expected = result.rentReceived - result.piPayment - result.maintenance
    expect(result.netCashFlow).toBeCloseTo(expected, 4)
  })

  it('RentalStepResult has no propertyTax field (removed in v3)', () => {
    const state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, 0)
    expect((result as unknown as Record<string, unknown>).propertyTax).toBeUndefined()
  })

  it('landlordTaxThisMonth = 0 for months 0–10 (not yet settlement)', () => {
    let state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    for (let m = 0; m <= 10; m++) {
      const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, m)
      expect(result.landlordTaxThisMonth).toBe(0)
      state = result.state
    }
  })

  it('landlordTaxThisMonth > 0 at month 11 (first annual settlement)', () => {
    // Step through months 0–11, verifying tax fires only at month 11
    let state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    let settlementTax = 0
    for (let m = 0; m <= 11; m++) {
      const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, m)
      if (m === 11) {
        settlementTax = result.landlordTaxThisMonth
      }
      state = result.state
    }
    expect(settlementTax).toBeGreaterThan(0)
  })

  it('YTD accumulators reset to 0 after annual settlement (month 11)', () => {
    let state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    for (let m = 0; m <= 11; m++) {
      const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, m)
      state = result.state
    }
    // After settlement at month 11 (end of year 1), YTD fields reset
    expect(state.ytdRentalIncome).toBe(0)
    expect(state.ytdInterest).toBe(0)
    expect(state.ytdMaintenance).toBe(0)
  })

  it('landlordTaxThisMonth > 0 also at month 23 (second annual settlement)', () => {
    let state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    let taxAtMonth23 = 0
    for (let m = 0; m <= 23; m++) {
      const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, m)
      if (m === 23) taxAtMonth23 = result.landlordTaxThisMonth
      state = result.state
    }
    expect(taxAtMonth23).toBeGreaterThan(0)
  })

  it('vacancy reduces effective rent by (1 - vacancyRate)', () => {
    const state = initRentalBlockState(RENTAL_BLOCK, RENTAL_ASSUMPTIONS.property)
    const result = stepRentalBlock(state, RENTAL_BLOCK, RENTAL_ASSUMPTIONS, 0)
    // With 5% vacancy, rentReceived = 28_000 * 0.95
    expect(result.rentReceived).toBeCloseTo(28_000 * (1 - RENTAL_BLOCK.vacancyRate), 4)

    // Confirm that zero vacancy yields full rent
    const fullBlock: RentalPropertyBlock = { ...RENTAL_BLOCK, vacancyRate: 0 }
    const fullState = initRentalBlockState(fullBlock, RENTAL_ASSUMPTIONS.property)
    const fullResult = stepRentalBlock(fullState, fullBlock, RENTAL_ASSUMPTIONS, 0)
    expect(fullResult.rentReceived).toBeCloseTo(28_000, 4)
  })

  it("'actual' method uses the year's accumulated interest (not month-1 × 12)", () => {
    // Under 'actual', deductions use YTD accumulated interest and maintenance
    // (property tax removed in v3). The settlement tax at month 11 must exactly
    // equal rentalIncomeTax computed independently from those YTD totals.
    const actualBlock: RentalPropertyBlock = {
      ...RENTAL_BLOCK,
      expenseMethod: 'actual',
    }
    const actualAssumptions = RENTAL_ASSUMPTIONS

    let state = initRentalBlockState(actualBlock, actualAssumptions.property)
    const step0 = stepRentalBlock(state, actualBlock, actualAssumptions, 0)
    const naiveAnnualInterest = step0.interest * 12 // incorrect approximation

    // Accumulate actual YTD figures over months 0..10, then settle at month 11
    state = initRentalBlockState(actualBlock, actualAssumptions.property)
    let ytdIncome = 0
    let ytdInterest = 0
    let ytdMaint = 0

    for (let m = 0; m <= 10; m++) {
      const r = stepRentalBlock(state, actualBlock, actualAssumptions, m)
      ytdIncome += r.rentReceived
      ytdInterest += r.interest
      ytdMaint += r.maintenance
      state = r.state
    }
    const settlementResult = stepRentalBlock(state, actualBlock, actualAssumptions, 11)
    ytdIncome += settlementResult.rentReceived
    ytdInterest += settlementResult.interest
    ytdMaint += settlementResult.maintenance

    // Independently compute what the tax should be from the YTD accumulators
    // (no annualPropertyTax in v3)
    const expectedTax = rentalIncomeTax({
      annualRentalIncome: ytdIncome,
      expenseMethod: 'actual',
      annualMortgageInterest: ytdInterest,
      annualMaintenance: ytdMaint,
      annualDepreciation: actualBlock.annualDepreciation,
      taxThreshold: actualAssumptions.landlordTax.threshold,
      rateLow: actualAssumptions.landlordTax.rate,
      rateHigh: actualAssumptions.landlordTax.rateHigh,
    }).incomeTax

    // The engine's tax must exactly match the independently computed value
    expect(settlementResult.landlordTaxThisMonth).toBeCloseTo(expectedTax, 6)

    // Actual accumulated interest < naive (balance decreases with each payment),
    // so a regression to naiveAnnualInterest would give a different (lower) tax
    expect(ytdInterest).toBeLessThan(naiveAnnualInterest)
  })
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('blockPhase', () => {
  it('mortgage, rent, and rental are cost phase', () => {
    expect(blockPhase('mortgage')).toBe('cost')
    expect(blockPhase('rent')).toBe('cost')
    expect(blockPhase('rental')).toBe('cost')
  })

  it('cash is asset phase', () => {
    expect(blockPhase('cash')).toBe('asset')
  })
})

describe('sortBlocksByPhase', () => {
  it('places cost blocks before asset blocks (including rental)', () => {
    const blocks = [
      { kind: 'cash' as const, id: '1' },
      { kind: 'mortgage' as const, id: '2' },
      { kind: 'rent' as const, id: '3' },
      { kind: 'rental' as const, id: '4' },
    ]
    const sorted = sortBlocksByPhase(blocks)
    const kinds = sorted.map((b) => b.kind)
    expect(kinds.indexOf('cash')).toBeGreaterThan(kinds.indexOf('mortgage'))
    expect(kinds.indexOf('cash')).toBeGreaterThan(kinds.indexOf('rent'))
    expect(kinds.indexOf('cash')).toBeGreaterThan(kinds.indexOf('rental'))
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
