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
 */
import LZString from 'lz-string'
import type { AppState, Block, CashBlock, MortgageBlock, RentBlock, RentalPropertyBlock, Scenario, SalaryConfig } from '../engine/types'
import { CURRENT_VERSION, validateAndMigrate } from './schema'

// ---------------------------------------------------------------------------
// Short-key codec types (serialized form)
// ---------------------------------------------------------------------------

interface SCashBlock {
  k: 'cash'; id: string; lb: string
  ib: number; mc: number; ar: number; cg: number
}
interface SMortgageBlock {
  k: 'mtg'; id: string; lb: string
  pv: number; dp: number; ai: number; ty: number; apr: number; pt: number; mr: number
}
interface SRentBlock {
  k: 'rent'; id: string; lb: string
  r: number; rg: number; di: boolean; rp?: number
}
/**
 * Serialised rental-property block.
 * Short key: 'rnt' — distinct from the consumption rent block's key 'rent'.
 */
interface SRentalPropertyBlock {
  k: 'rnt'; id: string; lb: string
  pv: number; dp: number; ai: number; ty: number; apr: number
  pt: number; mr: number; ri: number; rg: number; vr: number
  em: string; lt: number; lth: number; ltt: number; ad?: number
}
type SBlock = SCashBlock | SMortgageBlock | SRentBlock | SRentalPropertyBlock

interface SSalary {
  a: number; g: number; t: number
}
interface SScenario {
  id: string; n: string; bs: SBlock[]; s: SSalary
}
interface SAppState {
  v: number; cur: string; co: string; hy: number; dm: 'nominal' | 'real'
  sc: SScenario[]; inf?: number
}

// ---------------------------------------------------------------------------
// Encode AppState → short-key object → compressed hash
// ---------------------------------------------------------------------------

function encodeBlock(block: Block): SBlock {
  switch (block.kind) {
    case 'cash': return {
      k: 'cash', id: block.id, lb: block.label,
      ib: block.initialBalance, mc: block.monthlyContribution,
      ar: block.annualReturnRate, cg: block.capitalGainsTaxRate,
    }
    case 'mortgage': return {
      k: 'mtg', id: block.id, lb: block.label,
      pv: block.propertyValue, dp: block.downPayment,
      ai: block.annualInterestRate, ty: block.termYears,
      apr: block.appreciationRate, pt: block.propertyTaxRate,
      mr: block.maintenanceRate,
    }
    case 'rent': return {
      k: 'rent', id: block.id, lb: block.label,
      r: block.monthlyRent, rg: block.annualRentGrowth,
      di: block.differentialInvesting,
      ...(block.referenceMonthlyPayment !== undefined ? { rp: block.referenceMonthlyPayment } : {}),
    }
    case 'rental': return {
      k: 'rnt', id: block.id, lb: block.label,
      pv: block.propertyValue, dp: block.downPayment,
      ai: block.annualInterestRate, ty: block.termYears,
      apr: block.appreciationRate, pt: block.propertyTaxRate,
      mr: block.maintenanceRate, ri: block.monthlyRentIncome,
      rg: block.annualRentGrowth, vr: block.vacancyRate,
      em: block.expenseMethod, lt: block.landlordTaxRate,
      lth: block.landlordTaxRateHigh, ltt: block.landlordTaxThreshold,
      ...(block.annualDepreciation !== undefined ? { ad: block.annualDepreciation } : {}),
    } satisfies SRentalPropertyBlock
  }
}

function encodeSalary(s: SalaryConfig): SSalary {
  return { a: s.annualAmount, g: s.growthRate, t: s.incomeTaxRate }
}

function encodeScenario(sc: Scenario): SScenario {
  return { id: sc.id, n: sc.name, bs: sc.blocks.map(encodeBlock), s: encodeSalary(sc.salary) }
}

export function encodeAppState(state: AppState): string {
  const short: SAppState = {
    v: state.schemaVersion,
    cur: state.currency,
    co: state.country,
    hy: state.horizonYears,
    dm: state.displayMode,
    sc: state.scenarios.map(encodeScenario),
    ...(state.inflationOverridePct !== undefined ? { inf: state.inflationOverridePct } : {}),
  }
  const json = JSON.stringify(short)
  const compressed = LZString.compressToEncodedURIComponent(json)
  return `#v=${state.schemaVersion}&s=${compressed}`
}

// ---------------------------------------------------------------------------
// Decode hash → AppState
// ---------------------------------------------------------------------------

function decodeBlock(sb: SBlock): Block {
  switch (sb.k) {
    case 'cash': {
      const b = sb as SCashBlock
      return {
        kind: 'cash', id: b.id, label: b.lb,
        initialBalance: b.ib, monthlyContribution: b.mc,
        annualReturnRate: b.ar, capitalGainsTaxRate: b.cg,
      } satisfies CashBlock
    }
    case 'mtg': {
      const b = sb as SMortgageBlock
      return {
        kind: 'mortgage', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        annualInterestRate: b.ai, termYears: b.ty,
        appreciationRate: b.apr, propertyTaxRate: b.pt,
        maintenanceRate: b.mr,
      } satisfies MortgageBlock
    }
    case 'rent': {
      const b = sb as SRentBlock
      return {
        kind: 'rent', id: b.id, label: b.lb,
        monthlyRent: b.r, annualRentGrowth: b.rg,
        differentialInvesting: b.di,
        ...(b.rp !== undefined ? { referenceMonthlyPayment: b.rp } : {}),
      } satisfies RentBlock
    }
    case 'rnt': {
      const b = sb as SRentalPropertyBlock
      return {
        kind: 'rental', id: b.id, label: b.lb,
        propertyValue: b.pv, downPayment: b.dp,
        annualInterestRate: b.ai, termYears: b.ty,
        appreciationRate: b.apr, propertyTaxRate: b.pt,
        maintenanceRate: b.mr, monthlyRentIncome: b.ri,
        annualRentGrowth: b.rg, vacancyRate: b.vr,
        expenseMethod: b.em as RentalPropertyBlock['expenseMethod'],
        landlordTaxRate: b.lt, landlordTaxRateHigh: b.lth,
        landlordTaxThreshold: b.ltt,
        ...(b.ad !== undefined ? { annualDepreciation: b.ad } : {}),
      } satisfies RentalPropertyBlock
    }
  }
}

function decodeSalary(s: SSalary): SalaryConfig {
  return { annualAmount: s.a, growthRate: s.g, incomeTaxRate: s.t }
}

function decodeScenario(ss: SScenario): Scenario {
  return {
    id: ss.id,
    name: ss.n,
    blocks: ss.bs.map(decodeBlock),
    salary: decodeSalary(ss.s),
  }
}

function decodeShortState(s: SAppState): AppState {
  return {
    schemaVersion: s.v,
    currency: s.cur,
    country: s.co,
    horizonYears: s.hy,
    displayMode: s.dm,
    scenarios: s.sc.map(decodeScenario),
    ...(s.inf !== undefined ? { inflationOverridePct: s.inf } : {}),
  }
}

/**
 * Decode a URL hash string into AppState.
 * Runs migrations + zod validation.
 * Returns null if hash is invalid or parsing fails.
 */
export function decodeHash(hash: string): AppState | null {
  try {
    if (!hash || hash === '#') return null
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const compressed = params.get('s')
    if (!compressed) return null

    const json = LZString.decompressFromEncodedURIComponent(compressed)
    if (!json) return null

    const short: SAppState = JSON.parse(json)
    const decoded = decodeShortState(short)

    // Validate + migrate
    const validated = validateAndMigrate(decoded)
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
