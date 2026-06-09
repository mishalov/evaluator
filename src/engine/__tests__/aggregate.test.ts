/**
 * engine/__tests__/aggregate.test.ts
 *
 * Tests for the chart-data aggregators. Focused on the bits that are easy
 * to get wrong: the includeBreakdown shape and the real/nominal transform.
 */
import { describe, it, expect } from 'vitest'
import { simulate } from '../simulate'
import {
  buildNetWorthChartData,
  buildNetWorthBreakdownData,
  buildCashFlowChartData,
} from '../aggregate'
import type { Scenario } from '../types'

const HORIZON_YEARS = 10
const CPI_ANNUAL = 0.025

const BUY_SCENARIO: Scenario = {
  id: 'buy',
  name: 'Buy',
  salary: { annualAmount: 80_000, growthRate: 0.02, incomeTaxRate: 0.25 },
  blocks: [
    {
      kind: 'mortgage',
      id: 'm',
      label: 'Home',
      propertyValue: 300_000,
      downPayment: 60_000,
      annualInterestRate: 0.06,
      termYears: 30,
      appreciationRate: 0.04,
      propertyTaxRate: 0.01,
      maintenanceRate: 0.01,
    },
    {
      kind: 'cash',
      id: 'c',
      label: 'Cash',
      initialBalance: 100_000,
      monthlyContribution: 200,
      annualReturnRate: 0.05,
      capitalGainsTaxRate: 0.15,
    },
  ],
}

const RENT_SCENARIO: Scenario = {
  id: 'rent',
  name: 'Rent',
  salary: { annualAmount: 80_000, growthRate: 0.02, incomeTaxRate: 0.25 },
  blocks: [
    {
      kind: 'rent',
      id: 'r',
      label: 'Apt',
      monthlyRent: 1_500,
      annualRentGrowth: 0.03,
      differentialInvesting: false,
    },
    {
      kind: 'cash',
      id: 'c',
      label: 'Investment',
      initialBalance: 50_000,
      monthlyContribution: 500,
      annualReturnRate: 0.07,
      capitalGainsTaxRate: 0.15,
    },
  ],
}

describe('buildNetWorthChartData', () => {
  it('emits one row per year + one key per scenario by default', () => {
    const buy = simulate(BUY_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const rent = simulate(RENT_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const data = buildNetWorthChartData([buy, rent], 'nominal')

    expect(data.length).toBe(HORIZON_YEARS + 1)
    for (let y = 0; y <= HORIZON_YEARS; y++) {
      expect(data[y].year).toBe(y)
      expect(data[y].buy).toBe(buy.yearly[y].netWorth)
      expect(data[y].rent).toBe(rent.yearly[y].netWorth)
      // breakdown keys absent by default
      expect(data[y].buy_propertyValue).toBeUndefined()
      expect(data[y].buy_mortgageBalance).toBeUndefined()
    }
  })

  it('emits propertyValue and mortgageBalance keys when includeBreakdown=true', () => {
    const buy = simulate(BUY_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const data = buildNetWorthChartData([buy], 'nominal', true)

    expect(data[0].buy_propertyValue).toBe(buy.yearly[0].propertyValue)
    expect(data[0].buy_mortgageBalance).toBe(buy.yearly[0].mortgageBalance)
    expect(data[5].buy_propertyValue).toBe(buy.yearly[5].propertyValue)
    expect(data[5].buy_mortgageBalance).toBe(buy.yearly[5].mortgageBalance)
  })

  it('applies real-mode transform consistently to all series', () => {
    const buy = simulate(BUY_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const data = buildNetWorthChartData([buy], 'real', true)

    // Net worth, property value, and mortgage balance should all be divided
    // by the same cpiIndex for the same year.
    const y = 5
    const cpi = buy.yearly[y].cpiIndex
    expect(data[y].buy).toBeCloseTo(buy.yearly[y].netWorth / cpi, 4)
    expect(data[y].buy_propertyValue).toBeCloseTo(
      buy.yearly[y].propertyValue / cpi,
      4,
    )
    expect(data[y].buy_mortgageBalance).toBeCloseTo(
      buy.yearly[y].mortgageBalance / cpi,
      4,
    )
  })

  it('returns an empty array when no scenarios are passed', () => {
    expect(buildNetWorthChartData([], 'nominal')).toEqual([])
    expect(buildNetWorthChartData([], 'real', true)).toEqual([])
  })
})

describe('buildNetWorthBreakdownData', () => {
  it('produces one row per year with cashBalance + propertyEquity summing to net worth', () => {
    const buy = simulate(BUY_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const rows = buildNetWorthBreakdownData(buy, 'nominal')

    expect(rows.length).toBe(HORIZON_YEARS + 1)
    rows.forEach((row, y) => {
      expect(row.year).toBe(y)
      expect(row.cashBalance + row.propertyEquity).toBeCloseTo(
        buy.yearly[y].netWorth,
        4,
      )
    })
  })

  it('applies the real-mode transform via cpiIndex per year', () => {
    const buy = simulate(BUY_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const rows = buildNetWorthBreakdownData(buy, 'real')

    rows.forEach((row, y) => {
      const cpi = buy.yearly[y].cpiIndex
      expect(row.cashBalance).toBeCloseTo(buy.yearly[y].cashBalance / cpi, 4)
      expect(row.propertyEquity).toBeCloseTo(
        buy.yearly[y].propertyEquity / cpi,
        4,
      )
    })
  })

  it('handles negative cash (down payment exceeds initial balance) without clamping', () => {
    // initialBalance=0, downPayment=60k → month 0 cash is -60k
    const underfunded: Scenario = {
      ...BUY_SCENARIO,
      blocks: BUY_SCENARIO.blocks.map((b) =>
        b.kind === 'cash' ? { ...b, initialBalance: 0 } : b,
      ),
    }
    const result = simulate(underfunded, HORIZON_YEARS, CPI_ANNUAL)
    const rows = buildNetWorthBreakdownData(result, 'nominal')

    // Year 0 cash should be negative — the chart expects this and stacks below zero.
    expect(rows[0].cashBalance).toBeLessThan(0)
    // Property equity should still be positive (down payment of 60k = 60k initial equity)
    expect(rows[0].propertyEquity).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// buildCashFlowChartData — rentalIncome and landlordTax fields
// ---------------------------------------------------------------------------

const LANDLORD_SCENARIO: Scenario = {
  id: 'landlord-agg',
  name: 'Landlord',
  salary: { annualAmount: 0, growthRate: 0, incomeTaxRate: 0 },
  blocks: [
    {
      kind: 'rental',
      id: 'rnt',
      label: 'Flat',
      propertyValue: 7_500_000,
      downPayment: 1_500_000,
      annualInterestRate: 0.052,
      termYears: 30,
      appreciationRate: 0.04,
      propertyTaxRate: 0.0005,
      maintenanceRate: 0.01,
      monthlyRentIncome: 28_000,
      annualRentGrowth: 0.03,
      vacancyRate: 0.05,
      expenseMethod: 'lumpSum30',
      landlordTaxRate: 0.15,
      landlordTaxRateHigh: 0.23,
      landlordTaxThreshold: 1_762_812,
    },
    {
      kind: 'cash',
      id: 'c',
      label: 'Cash',
      initialBalance: 2_000_000,
      monthlyContribution: 0,
      annualReturnRate: 0.05,
      capitalGainsTaxRate: 0.15,
    },
  ],
}

describe('buildCashFlowChartData — rentalIncome and landlordTax', () => {
  it('emits positive rentalIncome per year for a landlord scenario', () => {
    const result = simulate(LANDLORD_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const chart = buildCashFlowChartData(result)

    // Each year should have some rental income
    for (const row of chart) {
      expect(row.rentalIncome).toBeGreaterThan(0)
    }
  })

  it('emits positive landlordTax in year 1 (tax settles at month 11)', () => {
    const result = simulate(LANDLORD_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const chart = buildCashFlowChartData(result)

    // Year 1 (months 1–12) includes the settlement at month 11 → tax > 0
    expect(chart[0].landlordTax).toBeGreaterThan(0)
  })

  it('rentalIncome in chart equals sum of monthly rentalIncome for that year', () => {
    const result = simulate(LANDLORD_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const chart = buildCashFlowChartData(result)

    // Spot-check year 2 (months 13–24)
    const expectedYear2RentalIncome = result.monthly
      .slice(13, 25)
      .reduce((sum, p) => sum + p.rentalIncome, 0)
    expect(chart[1].rentalIncome).toBeCloseTo(expectedYear2RentalIncome, 4)
  })

  it('emits 0 rentalIncome and 0 landlordTax for a non-landlord scenario', () => {
    const result = simulate(RENT_SCENARIO, HORIZON_YEARS, CPI_ANNUAL)
    const chart = buildCashFlowChartData(result)

    for (const row of chart) {
      expect(row.rentalIncome).toBe(0)
      expect(row.landlordTax).toBe(0)
    }
  })
})
