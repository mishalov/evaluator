/**
 * state/schema.ts
 *
 * Zod schemas for AppState validation and migration system.
 *
 * CURRENT_VERSION: 2 (see the exported constant below — keep this comment in sync).
 * Migration format: migrations[n] transforms schema version n → n+1.
 *
 * On load from URL/localStorage: validate with zod, run migrations if needed.
 * On parse failure: fall back to localStorage, then defaults.
 */
import { z } from 'zod'
import type { AppState } from '../engine/types'

export const CURRENT_VERSION = 2

// ---------------------------------------------------------------------------
// Zod schemas (mirrors engine/types.ts domain model)
// ---------------------------------------------------------------------------

export const SalaryConfigSchema = z.object({
  annualAmount: z.number().min(0),
  growthRate: z.number().min(0).max(1),
  incomeTaxRate: z.number().min(0).max(1),
})

export const CashBlockSchema = z.object({
  kind: z.literal('cash'),
  id: z.string(),
  label: z.string(),
  initialBalance: z.number().min(0),
  monthlyContribution: z.number().min(0),
  annualReturnRate: z.number().min(0).max(5),
  capitalGainsTaxRate: z.number().min(0).max(1),
})

export const MortgageBlockSchema = z.object({
  kind: z.literal('mortgage'),
  id: z.string(),
  label: z.string(),
  propertyValue: z.number().min(0),
  downPayment: z.number().min(0),
  annualInterestRate: z.number().min(0).max(1),
  termYears: z.number().int().min(1).max(50),
  appreciationRate: z.number().min(-0.5).max(1),
  propertyTaxRate: z.number().min(0).max(0.5),
  maintenanceRate: z.number().min(0).max(0.5),
})

export const RentBlockSchema = z.object({
  kind: z.literal('rent'),
  id: z.string(),
  label: z.string(),
  monthlyRent: z.number().min(0),
  annualRentGrowth: z.number().min(-0.5).max(1),
  differentialInvesting: z.boolean(),
  referenceMonthlyPayment: z.number().min(0).optional(),
})

export const RentalPropertyBlockSchema = z.object({
  kind: z.literal('rental'),
  id: z.string(),
  label: z.string(),
  propertyValue: z.number().min(0),
  downPayment: z.number().min(0),
  annualInterestRate: z.number().min(0).max(1),
  termYears: z.number().int().min(1).max(50),
  appreciationRate: z.number().min(-0.5).max(1),
  propertyTaxRate: z.number().min(0).max(0.5),
  maintenanceRate: z.number().min(0).max(0.5),
  monthlyRentIncome: z.number().min(0),
  annualRentGrowth: z.number().min(-0.5).max(1),
  vacancyRate: z.number().min(0).max(1),
  expenseMethod: z.enum(['lumpSum30', 'actual']),
  landlordTaxRate: z.number().min(0).max(1),
  landlordTaxRateHigh: z.number().min(0).max(1),
  landlordTaxThreshold: z.number().min(0),
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
  salary: SalaryConfigSchema,
})

export const AppStateSchema = z.object({
  schemaVersion: z.number().int().min(1),
  currency: z.string().length(3),
  country: z.string().length(2),
  horizonYears: z.number().int().min(1).max(50),
  displayMode: z.enum(['nominal', 'real']),
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
