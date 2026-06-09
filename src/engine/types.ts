/**
 * engine/types.ts
 *
 * Core domain types for the investment comparison engine.
 * All monetary values are in the scenario's chosen currency (nominal).
 * The engine never performs real/nominal conversions — that is a display concern.
 */

// ---------------------------------------------------------------------------
// Global assumptions (shared across all scenarios)
// ---------------------------------------------------------------------------

/**
 * Assumptions — global economic parameters shared by all scenarios.
 *
 * These fields used to live on individual blocks or scenarios. Hoisting them
 * here ensures a single source of truth for rates that should not vary by
 * scenario (investment return, property appreciation, tax rates, etc.).
 *
 * Salary is stored here rather than per-Scenario because salary is
 * informational only (never routed into blocks) and does not benefit from
 * per-scenario variation in this tool's scope.
 */
export interface Assumptions {
  /** Salary parameters (informational; never routed into cash flow) */
  salary: {
    /** Current gross annual salary (nominal currency units) */
    annualAmount: number
    /** Annual salary growth rate as a decimal */
    growthRate: number
    /**
     * Flat income tax rate as a decimal.
     * UI must label this "gross salary" so users don't double-deduct.
     */
    incomeTaxRate: number
  }
  /** Investment / portfolio parameters */
  investment: {
    /**
     * Annual return rate as a decimal (e.g. 0.07 for 7%).
     * Uses monthly compounding: r_m = annualRate / 12.
     */
    annualReturnRate: number
    /** Capital gains tax rate as a decimal, applied at horizon on gains only */
    capitalGainsTaxRate: number
  }
  /** Property parameters (shared across mortgage and rental blocks) */
  property: {
    /** Annual mortgage interest rate as a decimal (e.g. 0.06 for 6%) */
    mortgageInterestRate: number
    /** Annual property appreciation rate as a decimal */
    appreciationRate: number
    /**
     * Annual maintenance cost as a decimal of property value.
     * Monthly cost = propertyValue_m * maintenanceRate / 12.
     */
    maintenanceRate: number
  }
  /**
   * Annual rent growth rate as a decimal (lease-style annual step).
   * Applies to both consumption-rent (RentBlock) and rental-income (RentalPropertyBlock).
   */
  rentGrowth: number
  /** Czech §9 landlord income tax brackets and threshold */
  landlordTax: {
    /** Lower Czech income tax rate (15% up to threshold, 2026) */
    rate: number
    /** Higher Czech income tax rate (23% above threshold, 2026) */
    rateHigh: number
    /**
     * Annual taxable income threshold (CZK 1,762,812 = 36× avg wage, 2026).
     * Base ≤ threshold → taxed at rate; excess taxed at rateHigh.
     */
    threshold: number
  }
}

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

/**
 * CashBlock — a pure investment account (brokerage, ETF, savings, etc.).
 *
 * Contributions are made monthly. Capital gains tax is applied at horizon
 * only, on gains = (balance - sumContributions), never per period.
 *
 * Investment rate and CG tax rate are read from AppState.assumptions.investment,
 * not stored here.
 */
export interface CashBlock {
  kind: 'cash'
  id: string
  label: string
  /** Initial lump-sum investment (nominal currency units) */
  initialBalance: number
  /** Fixed monthly contribution (nominal currency units) */
  monthlyContribution: number
}

/**
 * MortgageBlock — a property purchase financed by a fixed-rate mortgage.
 *
 * M_ref (used for differential investing) = P+I only (excludes maintenance).
 * This is documented here and surfaced as a UI tooltip so users understand
 * what "differential" means.
 *
 * Property value appreciates monthly: v_{m+1} = v_m * (1 + appreciationRate)^(1/12).
 * All rates (interest, appreciation, maintenance) are read from
 * AppState.assumptions.property.
 */
export interface MortgageBlock {
  kind: 'mortgage'
  id: string
  label: string
  /** Total property purchase price */
  propertyValue: number
  /** Down payment (reduces loan principal). Debited from the sibling CashBlock at month 0. */
  downPayment: number
  /** Loan term in years */
  termYears: number
}

/**
 * RentBlock — renting a property (consumption rent, not landlord income).
 *
 * Rent grows annually (lease-style, not monthly compounded):
 *   rent(m) = monthlyRent * (1 + rentGrowth)^floor(m/12)
 * where rentGrowth comes from AppState.assumptions.rentGrowth.
 *
 * When differentialInvesting is enabled, the surplus vs the reference
 * mortgage payment (M_ref = P+I only) is routed into the sibling CashBlock.
 */
export interface RentBlock {
  kind: 'rent'
  id: string
  label: string
  /** Initial monthly rent (nominal currency units) */
  monthlyRent: number
  /**
   * When true, routes (M_ref - rent(m)) into the scenario's cash block each
   * month (clamped to ≥ 0). M_ref is the P+I-only mortgage payment of the
   * reference MortgageBlock in the same scenario, or a user-supplied override.
   * See differential investing docs for details.
   */
  differentialInvesting: boolean
  /**
   * Optional explicit reference monthly P+I payment to use for differential
   * investing. If omitted, the engine looks for a sibling MortgageBlock.
   * Units: nominal currency / month.
   */
  referenceMonthlyPayment?: number
}

/**
 * Rental expense deduction method for Czech §9 landlord tax:
 *   - 'lumpSum30': deduct the lesser of (income × 30%) and CZK 600,000
 *   - 'actual':    deduct real costs (mortgage interest, maintenance,
 *                  optional depreciation). Principal is NOT deductible.
 *                  Property tax was removed — deduction = interest + maintenance + depreciation.
 */
export type RentalExpenseMethod = 'lumpSum30' | 'actual'

/**
 * RentalPropertyBlock — owning a residential rental property.
 *
 * The landlord receives monthly rent income, pays mortgage P+I (if any)
 * and maintenance. Czech §9 landlord income tax is settled annually (at
 * month 11, 23, 35, …) using YTD accumulators, then reset.
 *
 * Property value appreciates monthly: v_{m+1} = v_m * (1 + appreciationRate)^(1/12).
 * Rental net cash flow (may be negative) is routed into the sibling CashBlock.
 *
 * Rates (interest, appreciation, maintenance, rentGrowth, landlordTax) are
 * read from AppState.assumptions; only per-property amounts and settings live here.
 *
 * Note: rental PI does NOT feed the consumption-RentBlock's differential
 * investing calculation — M_ref is resolved from the MortgageBlock only.
 */
export interface RentalPropertyBlock {
  kind: 'rental'
  id: string
  label: string
  /** Total property purchase price */
  propertyValue: number
  /** Down payment (reduces loan principal). Debited from the sibling CashBlock at month 0. */
  downPayment: number
  /** Loan term in years */
  termYears: number
  /** Base monthly rent income at month 0 (nominal currency units) */
  monthlyRentIncome: number
  /**
   * Vacancy rate as a decimal (0 = always occupied, 0.05 = 5% vacant).
   * Effective monthly rent = rent(m) * (1 - vacancyRate).
   */
  vacancyRate: number
  /** Czech §9 expense deduction method for landlord income tax */
  expenseMethod: RentalExpenseMethod
  /**
   * Optional annual depreciation deduction (nominal currency units).
   * Only applicable when expenseMethod = 'actual'. If omitted, no depreciation is applied.
   */
  annualDepreciation?: number
}

/** Discriminated union of all block types */
export type Block = CashBlock | MortgageBlock | RentBlock | RentalPropertyBlock

/** Block kinds as a string literal union */
export type BlockKind = Block['kind']

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface Scenario {
  id: string
  name: string
  blocks: Block[]
}

// ---------------------------------------------------------------------------
// App-level state
// ---------------------------------------------------------------------------

export type DisplayMode = 'nominal' | 'real'

export interface AppState {
  schemaVersion: number
  /** ISO 4217 currency code, e.g. "USD", "EUR" */
  currency: string
  /** ISO 3166-1 alpha-2 country code for CPI lookup, e.g. "US" */
  country: string
  /** Simulation horizon in years (1..50) */
  horizonYears: number
  displayMode: DisplayMode
  /** Global economic assumptions shared across all scenarios */
  assumptions: Assumptions
  /** 1 to 3 scenarios */
  scenarios: Scenario[]
  /**
   * Optional user override for the forward inflation rate.
   * If absent, the engine uses the live/cached/fallback CPI mean.
   * Stored as a decimal (e.g. 0.03 for 3%).
   */
  inflationOverridePct?: number
}

// ---------------------------------------------------------------------------
// Simulation output
// ---------------------------------------------------------------------------

/** A snapshot of all financial positions at month m */
export interface MonthlyPoint {
  /** Month index (0-based, where 0 = start of month 1) */
  month: number
  /** Year index (floor(month / 12)) */
  year: number
  /** Liquid cash / investment balance (nominal) */
  cashBalance: number
  /** Sum of all property market values across all property blocks (nominal) */
  propertyValue: number
  /** Sum of all outstanding mortgage principals across all property blocks (nominal) */
  mortgageBalance: number
  /** Property equity = propertyValue - mortgageBalance (nominal) */
  propertyEquity: number
  /** Total net worth = cashBalance + propertyEquity (nominal) */
  netWorth: number
  // --- Month-level cash-flow breakdown ---
  /** Mortgage P+I payment this month (0 if no mortgage) */
  mortgagePayment: number
  /** Interest portion of mortgage payment this month */
  mortgageInterest: number
  /** Principal portion of mortgage payment this month */
  mortgagePrincipal: number
  /** Maintenance paid this month */
  maintenance: number
  /** Rent paid this month */
  rent: number
  /** Salary net income this month */
  salaryNet: number
  /** Total contributions to cash block this month (base + differential) */
  cashContribution: number
  /** CPI index at this month: (1 + cpiAnnual)^(month/12) */
  cpiIndex: number
  /** Gross rental income received this month (0 if no rental block) */
  rentalIncome: number
  /** Landlord income tax paid this month (non-zero only at annual settlement, month 11/23/…) */
  landlordTax: number
  /** Rental net cash flow this month = rentReceived − piPayment − maintenance − landlordTax */
  rentalNetCashFlow: number
}

export interface SimulationSummary {
  /** Final net worth, nominal */
  finalNetWorthNominal: number
  /** Final net worth, real (= finalNetWorthNominal / cpiIndex_final) */
  finalNetWorthReal: number
  /** Sum of all cash contributions across the horizon */
  totalContributions: number
  /** Sum of all mortgage interest payments */
  totalInterest: number
  /** Sum of all rent payments */
  totalRent: number
  /** Sum of all maintenance payments (property tax was removed in v3) */
  totalPropertyCosts: number
  /** Down payment amount (out-of-band, shown separately) */
  downPayment: number
  /** Capital gains tax owed at horizon (not deducted from balance by default) */
  capitalGainsTaxAtHorizon: number
  /** Total gross rental income received across the horizon (0 if no rental block) */
  totalRentalIncome: number
  /** Total landlord income tax paid across the horizon (0 if no rental block) */
  totalLandlordTax: number
}

export interface SimulationResult {
  scenarioId: string
  /** All monthly data points, length = horizonYears * 12 + 1 (includes month 0) */
  monthly: MonthlyPoint[]
  /** Yearly samples (month 0, 12, 24, …, horizonYears*12) */
  yearly: MonthlyPoint[]
  summary: SimulationSummary
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export type DataSource = 'live' | 'cached' | 'fallback'

export interface MarketData {
  /** Forward CPI annual rate as a decimal (e.g. 0.025 for 2.5%) */
  cpiAnnual: number
  /**
   * FX rates relative to a common base.
   * Keys are ISO 4217 currency codes; values are units-per-EUR
   * (consistent with ECB convention). To convert between non-EUR currencies:
   *   rate_A_to_B = fxRates[B] / fxRates[A]
   */
  fxRates: Record<string, number>
  source: DataSource
  /** ISO timestamp of when this data was fetched */
  fetchedAt: string
}
