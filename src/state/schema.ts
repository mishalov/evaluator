/**
 * state/schema.ts
 *
 * Zod schemas for AppState validation and migration system.
 *
 * CURRENT_VERSION: 3 (see the exported constant below — keep this comment in sync).
 * Migration format: migrations[n] transforms schema version n → n+1.
 *
 * On load from URL/localStorage: validate with zod, run migrations if needed.
 * On parse failure: fall back to localStorage, then defaults.
 */
import { z } from 'zod'
import type { AppState, Assumptions } from '../engine/types'

export const CURRENT_VERSION = 3

// ---------------------------------------------------------------------------
// Zod schemas (mirrors engine/types.ts domain model)
// ---------------------------------------------------------------------------

export const AssumptionsSchema = z.object({
  salary: z.object({
    annualAmount: z.number().min(0),
    growthRate: z.number().min(0).max(1),
    incomeTaxRate: z.number().min(0).max(1),
  }),
  investment: z.object({
    annualReturnRate: z.number().min(0).max(5),
    capitalGainsTaxRate: z.number().min(0).max(1),
  }),
  property: z.object({
    mortgageInterestRate: z.number().min(0).max(1),
    appreciationRate: z.number().min(-0.5).max(1),
    maintenanceRate: z.number().min(0).max(0.5),
  }),
  rentGrowth: z.number().min(-0.5).max(1),
  landlordTax: z.object({
    rate: z.number().min(0).max(1),
    rateHigh: z.number().min(0).max(1),
    threshold: z.number().min(0),
  }),
})

export const CashBlockSchema = z.object({
  kind: z.literal('cash'),
  id: z.string(),
  label: z.string(),
  initialBalance: z.number().min(0),
  monthlyContribution: z.number().min(0),
})

export const MortgageBlockSchema = z.object({
  kind: z.literal('mortgage'),
  id: z.string(),
  label: z.string(),
  propertyValue: z.number().min(0),
  downPayment: z.number().min(0),
  termYears: z.number().int().min(1).max(50),
})

export const RentBlockSchema = z.object({
  kind: z.literal('rent'),
  id: z.string(),
  label: z.string(),
  monthlyRent: z.number().min(0),
  differentialInvesting: z.boolean(),
  referenceMonthlyPayment: z.number().min(0).optional(),
})

export const RentalPropertyBlockSchema = z.object({
  kind: z.literal('rental'),
  id: z.string(),
  label: z.string(),
  propertyValue: z.number().min(0),
  downPayment: z.number().min(0),
  termYears: z.number().int().min(1).max(50),
  monthlyRentIncome: z.number().min(0),
  vacancyRate: z.number().min(0).max(1),
  expenseMethod: z.enum(['lumpSum30', 'actual']),
  annualDepreciation: z.number().min(0).optional(),
})

export const BlockSchema = z.discriminatedUnion('kind', [
  CashBlockSchema,
  MortgageBlockSchema,
  RentBlockSchema,
  RentalPropertyBlockSchema,
])

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  blocks: z.array(BlockSchema).min(1),
})

export const AppStateSchema = z.object({
  schemaVersion: z.number().int().min(1),
  currency: z.string().length(3),
  country: z.string().length(2),
  horizonYears: z.number().int().min(1).max(50),
  displayMode: z.enum(['nominal', 'real']),
  assumptions: AssumptionsSchema,
  scenarios: z.array(ScenarioSchema).min(1).max(3),
  inflationOverridePct: z.number().min(0).max(0.5).optional(),
})

export type ValidatedAppState = z.infer<typeof AppStateSchema>

// ---------------------------------------------------------------------------
// Compile-time structural assertion: AppState (hand-written) must exactly
// match ValidatedAppState (zod-inferred). If the two types drift, TypeScript
// will fail to build here — alerting the developer before any runtime issue.
//
// Using the canonical "Equal" trick that checks mutual assignability via
// conditional types. This catches both missing fields and type mismatches.
// ---------------------------------------------------------------------------
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type Expect<T extends true> = T
export type _AssertAppStateMatchesSchema = Expect<Equal<AppState, ValidatedAppState>>

// ---------------------------------------------------------------------------
// Default assumptions (exported for use by store and migrations)
// ---------------------------------------------------------------------------

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  salary: { annualAmount: 0, growthRate: 0.02, incomeTaxRate: 0.25 },
  investment: { annualReturnRate: 0.07, capitalGainsTaxRate: 0.15 },
  property: { mortgageInterestRate: 0.06, appreciationRate: 0.04, maintenanceRate: 0.01 },
  rentGrowth: 0.03,
  landlordTax: { rate: 0.15, rateHigh: 0.23, threshold: 1_762_812 },
}

// ---------------------------------------------------------------------------
// Migration system
// ---------------------------------------------------------------------------

export type Migration = (state: Record<string, unknown>) => Record<string, unknown>

/**
 * Migrations map: key is the schema version to migrate FROM.
 * Each migration transforms state from version N to version N+1.
 * Add new entries here as the schema evolves.
 */
export const migrations: Record<number, Migration> = {
  // v1 → v2: added RentalPropertyBlock to the Block discriminated union.
  // Existing states without a rental block are structurally compatible — no
  // field transformation is required. The harness bumps schemaVersion after
  // this no-op runs.
  1: (s) => s,

  // v2 → v3: Hoisted all shared economic assumptions out of per-block/per-scenario
  // fields into a new global `assumptions` object.
  //
  // Strategy: read from scenarios[0] (the first scenario is canonical for the hoist).
  // Any field missing in the v2 data falls back to DEFAULT_ASSUMPTIONS.
  //
  // Fields removed:
  //   - Scenario.salary           → assumptions.salary
  //   - CashBlock.annualReturnRate / capitalGainsTaxRate  → assumptions.investment
  //   - MortgageBlock.annualInterestRate / appreciationRate / propertyTaxRate / maintenanceRate
  //                               → assumptions.property (propertyTaxRate dropped)
  //   - RentBlock.annualRentGrowth → assumptions.rentGrowth
  //   - RentalPropertyBlock.annualInterestRate / appreciationRate / propertyTaxRate /
  //     maintenanceRate / annualRentGrowth / landlordTaxRate / landlordTaxRateHigh /
  //     landlordTaxThreshold      → assumptions.property + assumptions.rentGrowth +
  //                                  assumptions.landlordTax (propertyTaxRate dropped)
  //
  // Note: if an old state has no scenarios[0], DEFAULT_ASSUMPTIONS is used entirely.
  2: (s): Record<string, unknown> => {
    const scenarios = Array.isArray(s.scenarios) ? s.scenarios : []
    const sc0 = (scenarios[0] ?? {}) as Record<string, unknown>

    // --- Hoist salary from scenarios[0].salary ---
    const v2Salary = (sc0.salary ?? {}) as Record<string, unknown>
    const salary = {
      annualAmount: typeof v2Salary.annualAmount === 'number'
        ? v2Salary.annualAmount
        : DEFAULT_ASSUMPTIONS.salary.annualAmount,
      growthRate: typeof v2Salary.growthRate === 'number'
        ? v2Salary.growthRate
        : DEFAULT_ASSUMPTIONS.salary.growthRate,
      incomeTaxRate: typeof v2Salary.incomeTaxRate === 'number'
        ? v2Salary.incomeTaxRate
        : DEFAULT_ASSUMPTIONS.salary.incomeTaxRate,
    }

    // --- Find per-block rate values by scanning ALL scenarios ---
    // Scanning only scenarios[0] was a bug: the default layout has no mortgage
    // or rental block on scenarios[0] ("Rent & Invest"), so rates on scenarios[1]
    // ("Buy a Home") and scenarios[2] ("Landlord") would be silently discarded.
    const allBlocks = scenarios.flatMap((rawSc) => {
      const sc = rawSc as Record<string, unknown>
      return Array.isArray(sc.blocks) ? sc.blocks as Record<string, unknown>[] : []
    })
    const cashBlock0 = allBlocks.find((b) => b.kind === 'cash') ?? {}
    const mortgageBlock0 = allBlocks.find((b) => b.kind === 'mortgage') ?? {}
    const rentBlock0 = allBlocks.find((b) => b.kind === 'rent') ?? {}
    const rentalBlock0 = allBlocks.find((b) => b.kind === 'rental') ?? {}

    // --- Hoist investment from CashBlock ---
    const investment = {
      annualReturnRate: typeof (cashBlock0 as Record<string, unknown>).annualReturnRate === 'number'
        ? (cashBlock0 as Record<string, unknown>).annualReturnRate as number
        : DEFAULT_ASSUMPTIONS.investment.annualReturnRate,
      capitalGainsTaxRate: typeof (cashBlock0 as Record<string, unknown>).capitalGainsTaxRate === 'number'
        ? (cashBlock0 as Record<string, unknown>).capitalGainsTaxRate as number
        : DEFAULT_ASSUMPTIONS.investment.capitalGainsTaxRate,
    }

    // --- Hoist property from MortgageBlock (prefer mortgage, fall back to rental, then default) ---
    const mortgageInterestRate =
      typeof (mortgageBlock0 as Record<string, unknown>).annualInterestRate === 'number'
        ? (mortgageBlock0 as Record<string, unknown>).annualInterestRate as number
        : typeof (rentalBlock0 as Record<string, unknown>).annualInterestRate === 'number'
          ? (rentalBlock0 as Record<string, unknown>).annualInterestRate as number
          : DEFAULT_ASSUMPTIONS.property.mortgageInterestRate

    const appreciationRate =
      typeof (mortgageBlock0 as Record<string, unknown>).appreciationRate === 'number'
        ? (mortgageBlock0 as Record<string, unknown>).appreciationRate as number
        : typeof (rentalBlock0 as Record<string, unknown>).appreciationRate === 'number'
          ? (rentalBlock0 as Record<string, unknown>).appreciationRate as number
          : DEFAULT_ASSUMPTIONS.property.appreciationRate

    const maintenanceRate =
      typeof (mortgageBlock0 as Record<string, unknown>).maintenanceRate === 'number'
        ? (mortgageBlock0 as Record<string, unknown>).maintenanceRate as number
        : typeof (rentalBlock0 as Record<string, unknown>).maintenanceRate === 'number'
          ? (rentalBlock0 as Record<string, unknown>).maintenanceRate as number
          : DEFAULT_ASSUMPTIONS.property.maintenanceRate

    const property = { mortgageInterestRate, appreciationRate, maintenanceRate }

    // --- Hoist rentGrowth from RentBlock (prefer rent, fall back to rental, then default) ---
    const rentGrowth =
      typeof (rentBlock0 as Record<string, unknown>).annualRentGrowth === 'number'
        ? (rentBlock0 as Record<string, unknown>).annualRentGrowth as number
        : typeof (rentalBlock0 as Record<string, unknown>).annualRentGrowth === 'number'
          ? (rentalBlock0 as Record<string, unknown>).annualRentGrowth as number
          : DEFAULT_ASSUMPTIONS.rentGrowth

    // --- Hoist landlordTax from RentalBlock ---
    const landlordTax = {
      rate: typeof (rentalBlock0 as Record<string, unknown>).landlordTaxRate === 'number'
        ? (rentalBlock0 as Record<string, unknown>).landlordTaxRate as number
        : DEFAULT_ASSUMPTIONS.landlordTax.rate,
      rateHigh: typeof (rentalBlock0 as Record<string, unknown>).landlordTaxRateHigh === 'number'
        ? (rentalBlock0 as Record<string, unknown>).landlordTaxRateHigh as number
        : DEFAULT_ASSUMPTIONS.landlordTax.rateHigh,
      threshold: typeof (rentalBlock0 as Record<string, unknown>).landlordTaxThreshold === 'number'
        ? (rentalBlock0 as Record<string, unknown>).landlordTaxThreshold as number
        : DEFAULT_ASSUMPTIONS.landlordTax.threshold,
    }

    const assumptions: Assumptions = { salary, investment, property, rentGrowth, landlordTax }

    // --- Strip moved/removed fields from each scenario's blocks ---
    const migratedScenarios = scenarios.map((rawSc) => {
      const sc = rawSc as Record<string, unknown>
      const scBlocks = Array.isArray(sc.blocks) ? sc.blocks as Record<string, unknown>[] : []
      const migratedBlocks = scBlocks.map((b) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { annualReturnRate, capitalGainsTaxRate,
                annualInterestRate, appreciationRate: _apr, propertyTaxRate,
                maintenanceRate: _mr, annualRentGrowth,
                landlordTaxRate, landlordTaxRateHigh, landlordTaxThreshold,
                ...rest } = b as Record<string, unknown>
        void annualReturnRate; void capitalGainsTaxRate
        void annualInterestRate; void _apr; void propertyTaxRate
        void _mr; void annualRentGrowth
        void landlordTaxRate; void landlordTaxRateHigh; void landlordTaxThreshold
        return rest
      })
      // Remove salary from scenario, keep the rest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { salary: _sc0salary, ...scWithoutSalary } = sc
      void _sc0salary
      return { ...scWithoutSalary, blocks: migratedBlocks }
    })

    return {
      ...s,
      assumptions,
      scenarios: migratedScenarios,
    }
  },
}

/**
 * Run all pending migrations from `fromVersion` up to `CURRENT_VERSION`.
 *
 * The harness is responsible for bumping `schemaVersion` after each migration
 * runs. Individual migration functions must NOT set `schemaVersion` themselves
 * — that responsibility belongs here so it is always consistent.
 *
 * Pattern:
 *   migrations[v] transforms the shape of state from version v to v+1.
 *   After the transform, this loop sets current.schemaVersion = v + 1.
 */
export function runMigrations(
  state: Record<string, unknown>,
  fromVersion: number,
): Record<string, unknown> {
  let current = { ...state }
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const migrate = migrations[v]
    if (migrate) {
      current = migrate(current)
    }
    // Harness enforces the version bump — migrations must not set schemaVersion.
    current.schemaVersion = v + 1
  }
  return current
}

/**
 * Validate and migrate an unknown payload to AppState.
 * Returns null if validation fails after migration.
 *
 * The return type is AppState (not ValidatedAppState) because the compile-time
 * assertion above guarantees the two are structurally identical, so callers
 * need not cast the result.
 */
export function validateAndMigrate(raw: unknown): AppState | null {
  try {
    if (typeof raw !== 'object' || raw === null) return null

    const withVersion = raw as Record<string, unknown>
    const fromVersion = typeof withVersion.schemaVersion === 'number'
      ? withVersion.schemaVersion
      : 0

    const migrated = fromVersion < CURRENT_VERSION
      ? runMigrations(withVersion, fromVersion)
      : withVersion

    const result = AppStateSchema.safeParse(migrated)
    // The Equal assertion above means ValidatedAppState === AppState structurally,
    // so this cast is safe by construction and will never drift silently.
    return result.success ? (result.data as AppState) : null
  } catch {
    return null
  }
}
