/**
 * engine/types.ts
 *
 * Core domain types for the investment comparison engine.
 * All monetary values are in the scenario's chosen currency (nominal).
 * The engine never performs real/nominal conversions — that is a display concern.
 */

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

/**
 * CashBlock — a pure investment account (brokerage, ETF, savings, etc.).
 *
 * Contributions are made monthly. Capital gains tax is applied at horizon
 * only, on gains = (balance - sumContributions), never per period.
 */
export interface CashBlock {
  kind: 'cash'
  id: string
  label: string
  /** Initial lump-sum investment (nominal currency units) */
  initialBalance: number
  /** Fixed monthly contribution (nominal currency units) */
  monthlyContribution: number
  /**
   * Annual return rate as a decimal (e.g. 0.07 for 7%).
   * Uses monthly compounding: r_m = annualRate / 12.
   */
  annualReturnRate: number
  /** Capital gains tax rate as a decimal, applied at horizon on gains only */
  capitalGainsTaxRate: number
}

/**
 * MortgageBlock — a property purchase financed by a fixed-rate mortgage.
 *
 * M_ref (used for differential investing) = P+I only (excludes taxes and
 * maintenance). This is documented here and surfaced as a UI tooltip so
 * users understand what "differential" means.
 *
 * Property value appreciates monthly: v_{m+1} = v_m * (1 + appreciationRate)^(1/12).
 */
export interface MortgageBlock {
  kind: 'mortgage'
  id: string
  label: string
  /** Total property purchase price */
  propertyValue: number
  /** Down payment (reduces loan principal). Treated as out-of-band lump-sum. */
  downPayment: number
  /** Annual mortgage interest rate as a decimal (e.g. 0.06 for 6%) */
  annualInterestRate: number
  /** Loan term in years */
  termYears: number
  /** Annual property appreciation rate as a decimal */
  appreciationRate: number
  /**
   * Annual property tax rate as a decimal.
   * Monthly cost = propertyValue_m * propertyTaxRate / 12.
   */
  propertyTaxRate: number
  /**
   * Annual maintenance cost as a decimal of property value.
   * Monthly cost = propertyValue_m * maintenanceRate / 12.
   */
  maintenanceRate: number
}

/**
 * RentBlock — renting a property.
 *
 * Rent grows annually (lease-style, not monthly compounded):
 *   rent(m) = monthlyRent * (1 + annualRentGrowth)^floor(m/12)
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
  /** Annual rent growth rate as a decimal (e.g. 0.03 for 3%) */
  annualRentGrowth: number
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

/** Discriminated union of all block types */
export type Block = CashBlock | MortgageBlock | RentBlock

/** Block kinds as a string literal union */
export type BlockKind = Block['kind']

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface SalaryConfig {
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

export interface Scenario {
  id: string
  name: string
  blocks: Block[]
  salary: SalaryConfig
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
  /** Current property market value (nominal) */
  propertyValue: number
  /** Outstanding mortgage principal (nominal) */
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
  /** Property tax paid this month */
  propertyTax: number
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
  /** Sum of all property tax + maintenance payments */
  totalPropertyCosts: number
  /** Down payment amount (out-of-band, shown separately) */
  downPayment: number
  /** Capital gains tax owed at horizon (not deducted from balance by default) */
  capitalGainsTaxAtHorizon: number
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
