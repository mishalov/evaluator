/**
 * state/url.ts
 *
 * URL hash codec for AppState persistence.
 *
 * Format: #v=<schemaVersion>&s=<lz-string-compressed-json>
 *
 * Serialization uses short stable keys to minimize URL length.
 * The codec is explicit (not a generic JSON serializer) so key names
 * can never change accidentally when domain types are refactored.
 *
 * Compression via lz-string achieves ~70-80% size reduction.
 * A 3-scenario state typically compresses to 300-500 chars.
 *
 * --- DUAL-MIGRATION SEAM (v2 → v3) ---
 * Old v2 share-links and named saves store per-block/per-scenario rate fields
 * in the short-key compressed payload. decodeHash decodes the compressed JSON
 * into a plain domain-object-shaped value and then passes it through
 * validateAndMigrate (the object-level migration system).
 *
 * For v2 hashes the short-key decoder reproduces the v2 domain shape (with
 * per-block fields intact) so that the schema migration[2] can hoist those
 * fields into global assumptions. No separate short-key-layer migration is
 * needed — the object-level migration is the single source of truth.
 *
 * Key collision note: 'rent' = consumption rent block, 'rnt' = rental property.
 */
import LZString from 'lz-string'
import type {
  AppState, Block, CashBlock, MortgageBlock, RentBlock, RentalPropertyBlock,
  Scenario, Assumptions,
} from '../engine/types'
import { CURRENT_VERSION, validateAndMigrate } from './schema'

// ---------------------------------------------------------------------------
// Short-key codec types (v3 serialized form)
// ---------------------------------------------------------------------------

/** v3 cash block: only per-block fields (rates removed) */
interface SCashBlock {
  k: 'cash'; id: string; lb: string
  ib: number; mc: number
}
/** v3 mortgage block: only per-block fields */
interface SMortgageBlock {
  k: 'mtg'; id: string; lb: string
  pv: number; dp: number; ty: number
}
/** v3 rent block: only per-block fields */
interface SRentBlock {
  k: 'rent'; id: string; lb: string
  r: number; di: boolean; rp?: number
}
/**
 * v3 rental-property block.
 * Short key: 'rnt' — distinct from the consumption rent block's key 'rent'.
 */
interface SRentalPropertyBlock {
  k: 'rnt'; id: string; lb: string
  pv: number; dp: number; ty: number
  ri: number; vr: number
  em: string; ad?: number
}
type SBlock = SCashBlock | SMortgageBlock | SRentBlock | SRentalPropertyBlock

/** v3 assumptions object */
interface SAssumptions {
  // salary
  sa: number; sg: number; st: number
  // investment
  iar: number; cgt: number
  // property
  mir: number; apr: number; mtr: number
  // rent growth
  rg: number
  // landlord tax
  ltr: number; ltrh: number; ltt: number
}

interface SScenario {
  id: string; n: string; bs: SBlock[]
}
interface SAppState {
  v: number; cur: string; co: string; hy: number; dm: 'nominal' | 'real'
  asmp: SAssumptions
  sc: SScenario[]; inf?: number
}

// ---------------------------------------------------------------------------
// Encode AppState → short-key object → compressed hash (v3)
// ---------------------------------------------------------------------------

function encodeBlock(block: Block): SBlock {
  switch (block.kind) {
    case 'cash': return {
      k: 'cash', id: block.id, lb: block.label,
      ib: block.initialBalance, mc: block.monthlyContribution,
    }
    case 'mortgage': return {
      k: 'mtg', id: block.id, lb: block.label,
      pv: block.propertyValue, dp: block.downPayment,
      ty: block.termYears,
    }
    case 'rent': return {
      k: 'rent', id: block.id, lb: block.label,
      r: block.monthlyRent,
      di: block.differentialInvesting,
      ...(block.referenceMonthlyPayment !== undefined ? { rp: block.referenceMonthlyPayment } : {}),
    }
    case 'rental': return {
      k: 'rnt', id: block.id, lb: block.label,
      pv: block.propertyValue, dp: block.downPayment,
      ty: block.termYears,
      ri: block.monthlyRentIncome, vr: block.vacancyRate,
      em: block.expenseMethod,
      ...(block.annualDepreciation !== undefined ? { ad: block.annualDepreciation } : {}),
    } satisfies SRentalPropertyBlock
  }
}

function encodeAssumptions(a: Assumptions): SAssumptions {
  return {
    sa: a.salary.annualAmount, sg: a.salary.growthRate, st: a.salary.incomeTaxRate,
    iar: a.investment.annualReturnRate, cgt: a.investment.capitalGainsTaxRate,
    mir: a.property.mortgageInterestRate, apr: a.property.appreciationRate, mtr: a.property.maintenanceRate,
    rg: a.rentGrowth,
    ltr: a.landlordTax.rate, ltrh: a.landlordTax.rateHigh, ltt: a.landlordTax.threshold,
  }
}

function encodeScenario(sc: Scenario): SScenario {
  return { id: sc.id, n: sc.name, bs: sc.blocks.map(encodeBlock) }
}

export function encodeAppState(state: AppState): string {
  const short: SAppState = {
    v: state.schemaVersion,
    cur: state.currency,
    co: state.country,
    hy: state.horizonYears,
    dm: state.displayMode,
    asmp: encodeAssumptions(state.assumptions),
    sc: state.scenarios.map(encodeScenario),
    ...(state.inflationOverridePct !== undefined ? { inf: state.inflationOverridePct } : {}),
  }
  const json = JSON.stringify(short)
  const compressed = LZString.compressToEncodedURIComponent(json)
  return `#v=${state.schemaVersion}&s=${compressed}`
}

// ---------------------------------------------------------------------------
// Decode hash → AppState
//
// Strategy: decode the compressed JSON into a plain object that looks like
// either a v3 or v2 domain shape, then pass through validateAndMigrate.
//
// For v3 hashes: decodeShortStateV3 produces a proper AppState-shaped object.
// For v2 hashes: decodeShortStateV2 reconstructs the old per-block-rate
//   domain shape so that migration[2] can hoist those fields correctly.
// ---------------------------------------------------------------------------

function decodeBlockV3(sb: SBlock): Block {
  switch (sb.k) {
    case 'cash': {
      const b = sb as SCashBlock
      return {
        kind: 'cash', id: b.id, label: b.lb,
        initialBalance: b.ib, monthlyContribution: b.mc,
      } satisfies CashBlock
    }
    case 'mtg': {
      const b = sb as SMortgageBlock
      return {
        kind: 'mortgage', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        termYears: b.ty,
      } satisfies MortgageBlock
    }
    case 'rent': {
      const b = sb as SRentBlock
      return {
        kind: 'rent', id: b.id, label: b.lb,
        monthlyRent: b.r,
        differentialInvesting: b.di,
        ...(b.rp !== undefined ? { referenceMonthlyPayment: b.rp } : {}),
      } satisfies RentBlock
    }
    case 'rnt': {
      const b = sb as SRentalPropertyBlock
      return {
        kind: 'rental', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        termYears: b.ty,
        monthlyRentIncome: b.ri, vacancyRate: b.vr,
        expenseMethod: b.em as RentalPropertyBlock['expenseMethod'],
        ...(b.ad !== undefined ? { annualDepreciation: b.ad } : {}),
      } satisfies RentalPropertyBlock
    }
  }
}

function decodeAssumptions(a: SAssumptions): Assumptions {
  return {
    salary: { annualAmount: a.sa, growthRate: a.sg, incomeTaxRate: a.st },
    investment: { annualReturnRate: a.iar, capitalGainsTaxRate: a.cgt },
    property: { mortgageInterestRate: a.mir, appreciationRate: a.apr, maintenanceRate: a.mtr },
    rentGrowth: a.rg,
    landlordTax: { rate: a.ltr, rateHigh: a.ltrh, threshold: a.ltt },
  }
}

function decodeScenarioV3(ss: SScenario): Scenario {
  return {
    id: ss.id,
    name: ss.n,
    blocks: ss.bs.map(decodeBlockV3),
  }
}

/** Decode a v3 short-key payload into a proper AppState-shaped object. */
function decodeShortStateV3(s: SAppState): AppState {
  return {
    schemaVersion: s.v,
    currency: s.cur,
    country: s.co,
    horizonYears: s.hy,
    displayMode: s.dm,
    assumptions: decodeAssumptions(s.asmp),
    scenarios: s.sc.map(decodeScenarioV3),
    ...(s.inf !== undefined ? { inflationOverridePct: s.inf } : {}),
  }
}

// ---------------------------------------------------------------------------
// v2 short-key types (for backward compat decode)
// ---------------------------------------------------------------------------

interface V2SCashBlock {
  k: 'cash'; id: string; lb: string
  ib: number; mc: number; ar: number; cg: number
}
interface V2SMortgageBlock {
  k: 'mtg'; id: string; lb: string
  pv: number; dp: number; ai: number; ty: number; apr: number; pt: number; mr: number
}
interface V2SRentBlock {
  k: 'rent'; id: string; lb: string
  r: number; rg: number; di: boolean; rp?: number
}
interface V2SRentalPropertyBlock {
  k: 'rnt'; id: string; lb: string
  pv: number; dp: number; ai: number; ty: number; apr: number
  pt: number; mr: number; ri: number; rg: number; vr: number
  em: string; lt: number; lth: number; ltt: number; ad?: number
}
type V2SBlock = V2SCashBlock | V2SMortgageBlock | V2SRentBlock | V2SRentalPropertyBlock

interface V2SSalary { a: number; g: number; t: number }
interface V2SScenario { id: string; n: string; bs: V2SBlock[]; s: V2SSalary }
interface V2SAppState {
  v: number; cur: string; co: string; hy: number; dm: 'nominal' | 'real'
  sc: V2SScenario[]; inf?: number
}

/** Decode a v2 short-key block back to its v2 domain shape (with all rate fields). */
function decodeBlockV2(sb: V2SBlock): Record<string, unknown> {
  switch (sb.k) {
    case 'cash': {
      const b = sb as V2SCashBlock
      return {
        kind: 'cash', id: b.id, label: b.lb,
        initialBalance: b.ib, monthlyContribution: b.mc,
        annualReturnRate: b.ar, capitalGainsTaxRate: b.cg,
      }
    }
    case 'mtg': {
      const b = sb as V2SMortgageBlock
      return {
        kind: 'mortgage', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        annualInterestRate: b.ai, termYears: b.ty,
        appreciationRate: b.apr, propertyTaxRate: b.pt,
        maintenanceRate: b.mr,
      }
    }
    case 'rent': {
      const b = sb as V2SRentBlock
      return {
        kind: 'rent', id: b.id, label: b.lb,
        monthlyRent: b.r, annualRentGrowth: b.rg,
        differentialInvesting: b.di,
        ...(b.rp !== undefined ? { referenceMonthlyPayment: b.rp } : {}),
      }
    }
    case 'rnt': {
      const b = sb as V2SRentalPropertyBlock
      return {
        kind: 'rental', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        annualInterestRate: b.ai, termYears: b.ty,
        appreciationRate: b.apr, propertyTaxRate: b.pt,
        maintenanceRate: b.mr, monthlyRentIncome: b.ri,
        annualRentGrowth: b.rg, vacancyRate: b.vr,
        expenseMethod: b.em,
        landlordTaxRate: b.lt, landlordTaxRateHigh: b.lth,
        landlordTaxThreshold: b.ltt,
        ...(b.ad !== undefined ? { annualDepreciation: b.ad } : {}),
      }
    }
  }
}

/**
 * Decode a v2 short-key payload into the OLD v2 domain shape
 * (per-block rates + per-scenario salary preserved).
 * The object-level migration[2] will then hoist those fields into assumptions.
 */
function decodeShortStateV2(s: V2SAppState): Record<string, unknown> {
  return {
    schemaVersion: s.v,
    currency: s.cur,
    country: s.co,
    horizonYears: s.hy,
    displayMode: s.dm,
    scenarios: s.sc.map((ss) => ({
      id: ss.id,
      name: ss.n,
      salary: { annualAmount: ss.s.a, growthRate: ss.s.g, incomeTaxRate: ss.s.t },
      blocks: ss.bs.map(decodeBlockV2),
    })),
    ...(s.inf !== undefined ? { inflationOverridePct: s.inf } : {}),
  }
}

/**
 * Decode a URL hash string into AppState.
 * Runs migrations + zod validation.
 * Returns null if hash is invalid or parsing fails.
 *
 * Backward compat: v2 hashes are decoded to their old domain shape and then
 * fed through migration[2] (schema.ts) which hoists per-block/per-scenario
 * fields into the global assumptions object.
 */
export function decodeHash(hash: string): AppState | null {
  try {
    if (!hash || hash === '#') return null
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const compressed = params.get('s')
    if (!compressed) return null

    const json = LZString.decompressFromEncodedURIComponent(compressed)
    if (!json) return null

    const parsed = JSON.parse(json) as Record<string, unknown>

    // Determine the schema version embedded in the payload (not just the URL param)
    const payloadVersion = typeof parsed.v === 'number' ? parsed.v : 0

    let domainObject: Record<string, unknown>

    if (payloadVersion >= 3) {
      // v3+ — the payload has the new short-key shape with 'asmp' for assumptions
      domainObject = decodeShortStateV3(parsed as unknown as SAppState) as unknown as Record<string, unknown>
    } else {
      // v1/v2 — the payload has the old per-block/per-scenario rate fields
      // Decode to v2 domain shape so the object-level migration can run
      domainObject = decodeShortStateV2(parsed as unknown as V2SAppState)
    }

    // Validate + migrate through the object-level migration system
    const validated = validateAndMigrate(domainObject)
    return validated
  } catch {
    return null
  }
}

/**
 * Write app state to URL hash using replaceState (preserves back button).
 */
export function writeToHash(state: AppState): void {
  const hash = encodeAppState(state)
  history.replaceState(null, '', hash)
}

/**
 * Read and decode the current URL hash.
 */
export function readFromHash(): AppState | null {
  return decodeHash(window.location.hash)
}

export { CURRENT_VERSION }
