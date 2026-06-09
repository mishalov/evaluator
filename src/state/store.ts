/**
 * state/store.ts
 *
 * Zustand store — single source of truth for AppState.
 *
 * URL hash and localStorage are projections: they are written on change
 * via subscriptions, never read from inside the store itself (except on init).
 *
 * Load priority: URL hash > localStorage > bundled defaults.
 *
 * Simulation results are memoized by input hash (LRU cap 32 entries).
 * They are NOT persisted.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { AppState, Assumptions, Block, Scenario, SimulationResult, MarketData, RentalPropertyBlock } from '../engine/types'
import { simulate } from '../engine/simulate'
import { CURRENT_VERSION, DEFAULT_ASSUMPTIONS } from './schema'
import { readFromHash, writeToHash } from './url'
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from './persistence'
import * as saves from './saves'
import type { SaveResult, LoadResult } from './saves'

// Re-export so UI and tests can import from one place
export { DEFAULT_ASSUMPTIONS }

// ---------------------------------------------------------------------------
// Block factory helpers
// ---------------------------------------------------------------------------

/**
 * Prague-market defaults for a rental property block (Czech §9, 2026).
 * Money fields (propertyValue, downPayment, monthlyRentIncome) are provided
 * as meaningful Prague defaults here; the UI "zeroed preset" in DEFAULT_STATE
 * overrides them to 0 so users see blank fields on first load.
 *
 * Rate fields (annualInterestRate, appreciationRate, maintenanceRate,
 * annualRentGrowth, landlordTax*) now live in DEFAULT_ASSUMPTIONS.
 */
export const DEFAULT_RENTAL_BLOCK: RentalPropertyBlock = {
  kind: 'rental',
  id: 'rnt1',
  label: 'Rental Property',
  propertyValue: 7_500_000,
  downPayment: 1_500_000,
  termYears: 30,
  monthlyRentIncome: 28_000,
  vacancyRate: 0.05,
  expenseMethod: 'lumpSum30',
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

export const DEFAULT_STATE: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'CZK',
  country: 'CZ',
  horizonYears: 30,
  displayMode: 'nominal',
  assumptions: DEFAULT_ASSUMPTIONS,
  scenarios: [
    {
      id: 'scenario-1',
      name: 'Rent & Invest',
      blocks: [
        {
          kind: 'rent',
          id: 'r1',
          label: 'Monthly Rent',
          monthlyRent: 0,
          differentialInvesting: true,
          referenceMonthlyPayment: 0,
        },
        {
          kind: 'cash',
          id: 'c1',
          label: 'Investment Account',
          initialBalance: 0,
          monthlyContribution: 0,
        },
      ],
    },
    {
      id: 'scenario-2',
      name: 'Buy a Home',
      blocks: [
        {
          kind: 'mortgage',
          id: 'm1',
          label: 'Primary Mortgage',
          propertyValue: 0,
          downPayment: 0,
          termYears: 30,
        },
        {
          kind: 'cash',
          id: 'c2',
          label: 'Savings',
          initialBalance: 0,
          monthlyContribution: 0,
        },
      ],
    },
    {
      id: 'scenario-3',
      name: 'Landlord + Rent & Invest',
      blocks: [
        {
          // Rental property block — money fields zeroed per preset convention.
          // Rates and method fields are in global assumptions.
          kind: 'rental',
          id: 'rnt1',
          label: 'Rental Property',
          propertyValue: 0,
          downPayment: 0,
          termYears: DEFAULT_RENTAL_BLOCK.termYears,
          monthlyRentIncome: 0,
          vacancyRate: DEFAULT_RENTAL_BLOCK.vacancyRate,
          expenseMethod: DEFAULT_RENTAL_BLOCK.expenseMethod,
        },
        {
          // Consumption rent (the landlord also lives somewhere else).
          // differentialInvesting: false — landlord's net cash flow already
          // routes into the cash block; no separate differential needed.
          kind: 'rent',
          id: 'r3',
          label: 'Own Rent',
          monthlyRent: 0,
          differentialInvesting: false,
        },
        {
          kind: 'cash',
          id: 'c3',
          label: 'Investment Account',
          initialBalance: 0,
          monthlyContribution: 0,
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// LRU simulation cache (capped at 32 entries)
// ---------------------------------------------------------------------------

const SIM_CACHE_MAX = 32
const simulationCache = new Map<string, SimulationResult>()

/**
 * Deterministic JSON stringifier that sorts object keys recursively.
 * Standard JSON.stringify produces different strings when object properties
 * were inserted in different orders (e.g. after spread-merges). This replacer
 * normalises key order so cache hits are stable regardless of insertion order.
 */
function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (value as Record<string, unknown>)[k]
          return acc
        }, {})
    }
    return value
  })
}

function getCacheKey(
  scenario: Scenario,
  horizonYears: number,
  cpiAnnual: number,
  assumptions: Assumptions,
): string {
  return stableStringify({ scenario, horizonYears, cpiAnnual, assumptions })
}

function getCachedSimulation(
  scenario: Scenario,
  horizonYears: number,
  cpiAnnual: number,
  assumptions: Assumptions,
): SimulationResult {
  const key = getCacheKey(scenario, horizonYears, cpiAnnual, assumptions)
  if (simulationCache.has(key)) {
    // Move to end (most recently used)
    const result = simulationCache.get(key)!
    simulationCache.delete(key)
    simulationCache.set(key, result)
    return result
  }

  const result = simulate(scenario, horizonYears, cpiAnnual, assumptions)

  // Evict oldest if at cap
  if (simulationCache.size >= SIM_CACHE_MAX) {
    const firstKey = simulationCache.keys().next().value
    if (firstKey) simulationCache.delete(firstKey)
  }
  simulationCache.set(key, result)
  return result
}

// ---------------------------------------------------------------------------
// getAllSimulations reference-identity cache
// ---------------------------------------------------------------------------

let lastAllSimsAppState: AppState | null = null
let lastAllSimsMarketData: MarketData | null = null
let lastAllSims: SimulationResult[] = []

// ---------------------------------------------------------------------------
// Store type
// ---------------------------------------------------------------------------

export interface EvaluatorStore {
  // App state
  appState: AppState
  // Market data (set by UI hook after fetching)
  marketData: MarketData | null

  // Actions
  setAppState: (state: AppState) => void
  updateScenario: (scenarioId: string, update: Partial<Scenario>) => void
  updateBlock: (scenarioId: string, blockId: string, update: Partial<Block>) => void
  addScenario: () => void
  removeScenario: (scenarioId: string) => void
  addBlock: (scenarioId: string, block: Block) => void
  removeBlock: (scenarioId: string, blockId: string) => void
  setAssumptions: (update: Partial<Assumptions>) => void
  setCurrency: (currency: string) => void
  setCountry: (country: string) => void
  setHorizonYears: (years: number) => void
  setDisplayMode: (mode: AppState['displayMode']) => void
  setInflationOverride: (pct: number | undefined) => void
  setMarketData: (data: MarketData) => void
  resetToDefaults: () => void

  // Named saves actions
  saveCurrentAs: (name: string) => SaveResult
  overwriteSave: (id: string) => SaveResult
  loadSave: (id: string) => LoadResult
  renameSave: (id: string, name: string) => SaveResult
  deleteSave: (id: string) => boolean

  // Selectors (computed)
  getSimulation: (scenarioId: string) => SimulationResult | null
  getAllSimulations: () => SimulationResult[]
  getCpiAnnual: () => number
}

// ---------------------------------------------------------------------------
// Load initial state
// ---------------------------------------------------------------------------

function loadInitialState(): AppState {
  // Priority: hash > localStorage > defaults
  const fromHash = readFromHash()
  if (fromHash) return fromHash

  const fromStorage = loadFromLocalStorage()
  if (fromStorage) return fromStorage

  return DEFAULT_STATE
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEvaluatorStore = create<EvaluatorStore>()(
  subscribeWithSelector((set, get) => ({
    appState: loadInitialState(),
    marketData: null,

    setAppState: (state) => set({ appState: state }),

    updateScenario: (scenarioId, update) =>
      set((store) => ({
        appState: {
          ...store.appState,
          scenarios: store.appState.scenarios.map((s) =>
            s.id === scenarioId ? { ...s, ...update } : s,
          ),
        },
      })),

    updateBlock: (scenarioId, blockId, update) =>
      set((store) => ({
        appState: {
          ...store.appState,
          scenarios: store.appState.scenarios.map((s) =>
            s.id !== scenarioId
              ? s
              : {
                  ...s,
                  blocks: s.blocks.map((b) =>
                    b.id === blockId ? ({ ...b, ...update } as Block) : b,
                  ),
                },
          ),
        },
      })),

    addScenario: () =>
      set((store) => {
        const { scenarios } = store.appState
        if (scenarios.length >= 3) return store
        const id = `scenario-${Date.now()}`
        const newScenario: Scenario = {
          id,
          name: `Scenario ${scenarios.length + 1}`,
          blocks: [
            {
              kind: 'cash',
              id: `cash-${Date.now()}`,
              label: 'Investment Account',
              initialBalance: 0,
              monthlyContribution: 0,
            },
          ],
        }
        return {
          appState: {
            ...store.appState,
            scenarios: [...scenarios, newScenario],
          },
        }
      }),

    removeScenario: (scenarioId) =>
      set((store) => {
        const scenarios = store.appState.scenarios.filter((s) => s.id !== scenarioId)
        if (scenarios.length === 0) return store
        return { appState: { ...store.appState, scenarios } }
      }),

    addBlock: (scenarioId, block) =>
      set((store) => ({
        appState: {
          ...store.appState,
          scenarios: store.appState.scenarios.map((s) =>
            s.id !== scenarioId ? s : { ...s, blocks: [...s.blocks, block] },
          ),
        },
      })),

    removeBlock: (scenarioId, blockId) =>
      set((store) => ({
        appState: {
          ...store.appState,
          scenarios: store.appState.scenarios.map((s) =>
            s.id !== scenarioId
              ? s
              : { ...s, blocks: s.blocks.filter((b) => b.id !== blockId) },
          ),
        },
      })),

    setAssumptions: (update) =>
      set((store) => ({
        appState: {
          ...store.appState,
          assumptions: { ...store.appState.assumptions, ...update },
        },
      })),

    setCurrency: (currency) =>
      set((store) => ({ appState: { ...store.appState, currency } })),

    setCountry: (country) =>
      set((store) => ({ appState: { ...store.appState, country } })),

    setHorizonYears: (horizonYears) =>
      set((store) => ({ appState: { ...store.appState, horizonYears } })),

    setDisplayMode: (displayMode) =>
      set((store) => ({ appState: { ...store.appState, displayMode } })),

    setInflationOverride: (inflationOverridePct) =>
      set((store) => ({ appState: { ...store.appState, inflationOverridePct } })),

    setMarketData: (marketData) => set({ marketData }),

    resetToDefaults: () => {
      clearLocalStorage()
      // NOTE: intentionally does NOT touch the 'evaluator:saves' namespace.
      // Named saves survive a reset — that is the documented contract.
      set({ appState: DEFAULT_STATE })
    },

    // ----- Named saves -----

    saveCurrentAs: (name) => saves.createSave(name, get().appState),

    overwriteSave: (id) => saves.updateSave(id, get().appState),

    loadSave: (id) => {
      const save = saves.getSave(id)
      if (!save) return { ok: false, error: 'not-found' }

      const state = saves.decodeSave(save.encoded)
      if (!state) return { ok: false, error: 'corrupt' }

      // Route through setAppState so the subscription writes hash + localStorage for free.
      get().setAppState(state)
      return { ok: true, state }
    },

    renameSave: (id, name) => saves.renameSave(id, name),

    deleteSave: (id) => saves.deleteSave(id),

    // ----- Selectors -----

    getSimulation: (scenarioId) => {
      const { appState, marketData } = get()
      const scenario = appState.scenarios.find((s) => s.id === scenarioId)
      if (!scenario) return null
      const cpiAnnual =
        appState.inflationOverridePct ??
        marketData?.cpiAnnual ??
        0.025
      return getCachedSimulation(scenario, appState.horizonYears, cpiAnnual, appState.assumptions)
    },

    getAllSimulations: () => {
      const { appState, marketData } = get()
      if (appState === lastAllSimsAppState && marketData === lastAllSimsMarketData) {
        return lastAllSims
      }
      const cpiAnnual =
        appState.inflationOverridePct ??
        marketData?.cpiAnnual ??
        0.025
      const result = appState.scenarios.map((scenario) =>
        getCachedSimulation(scenario, appState.horizonYears, cpiAnnual, appState.assumptions),
      )
      lastAllSimsAppState = appState
      lastAllSimsMarketData = marketData
      lastAllSims = result
      return result
    },

    getCpiAnnual: () => {
      const { appState, marketData } = get()
      return appState.inflationOverridePct ?? marketData?.cpiAnnual ?? 0.025
    },
  })),
)

// ---------------------------------------------------------------------------
// Side-effect subscriptions: persist on state change
// ---------------------------------------------------------------------------

useEvaluatorStore.subscribe(
  (state) => state.appState,
  (appState) => {
    saveToLocalStorage(appState)
    writeToHash(appState)
  },
)
