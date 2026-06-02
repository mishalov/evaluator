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
import type { AppState, Block, Scenario, SimulationResult, MarketData } from '../engine/types'
import { simulate } from '../engine/simulate'
import { CURRENT_VERSION } from './schema'
import { readFromHash, writeToHash } from './url'
import { saveToLocalStorage, loadFromLocalStorage, clearLocalStorage } from './persistence'

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

export const DEFAULT_STATE: AppState = {
  schemaVersion: CURRENT_VERSION,
  currency: 'USD',
  country: 'US',
  horizonYears: 30,
  displayMode: 'nominal',
  scenarios: [
    {
      id: 'scenario-1',
      name: 'Rent & Invest',
      salary: { annualAmount: 80_000, growthRate: 0.02, incomeTaxRate: 0.25 },
      blocks: [
        {
          kind: 'rent',
          id: 'r1',
          label: 'Monthly Rent',
          monthlyRent: 2_000,
          annualRentGrowth: 0.03,
          differentialInvesting: true,
          referenceMonthlyPayment: 1_438.92,
        },
        {
          kind: 'cash',
          id: 'c1',
          label: 'Investment Account',
          initialBalance: 60_000,
          monthlyContribution: 500,
          annualReturnRate: 0.07,
          capitalGainsTaxRate: 0.15,
        },
      ],
    },
    {
      id: 'scenario-2',
      name: 'Buy a Home',
      salary: { annualAmount: 80_000, growthRate: 0.02, incomeTaxRate: 0.25 },
      blocks: [
        {
          kind: 'mortgage',
          id: 'm1',
          label: 'Primary Mortgage',
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
          id: 'c2',
          label: 'Savings',
          initialBalance: 0,
          monthlyContribution: 200,
          annualReturnRate: 0.05,
          capitalGainsTaxRate: 0.15,
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

function getCacheKey(scenario: Scenario, horizonYears: number, cpiAnnual: number): string {
  return stableStringify({ scenario, horizonYears, cpiAnnual })
}

function getCachedSimulation(
  scenario: Scenario,
  horizonYears: number,
  cpiAnnual: number,
): SimulationResult {
  const key = getCacheKey(scenario, horizonYears, cpiAnnual)
  if (simulationCache.has(key)) {
    // Move to end (most recently used)
    const result = simulationCache.get(key)!
    simulationCache.delete(key)
    simulationCache.set(key, result)
    return result
  }

  const result = simulate(scenario, horizonYears, cpiAnnual)

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
  setCurrency: (currency: string) => void
  setCountry: (country: string) => void
  setHorizonYears: (years: number) => void
  setDisplayMode: (mode: AppState['displayMode']) => void
  setInflationOverride: (pct: number | undefined) => void
  setMarketData: (data: MarketData) => void
  resetToDefaults: () => void

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
          salary: scenarios[0]?.salary ?? DEFAULT_STATE.scenarios[0].salary,
          blocks: [
            {
              kind: 'cash',
              id: `cash-${Date.now()}`,
              label: 'Investment Account',
              initialBalance: 0,
              monthlyContribution: 500,
              annualReturnRate: 0.07,
              capitalGainsTaxRate: 0.15,
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
      set({ appState: DEFAULT_STATE })
    },

    // ----- Selectors -----

    getSimulation: (scenarioId) => {
      const { appState, marketData } = get()
      const scenario = appState.scenarios.find((s) => s.id === scenarioId)
      if (!scenario) return null
      const cpiAnnual =
        appState.inflationOverridePct ??
        marketData?.cpiAnnual ??
        0.025
      return getCachedSimulation(scenario, appState.horizonYears, cpiAnnual)
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
        getCachedSimulation(scenario, appState.horizonYears, cpiAnnual),
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
