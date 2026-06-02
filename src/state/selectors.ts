/**
 * state/selectors.ts
 *
 * Memoized selectors for reading from the Zustand store.
 * Import these in UI components instead of accessing store state directly.
 */
import { useMemo } from 'react'
import { useEvaluatorStore } from './store'
import type { AppState, SimulationResult } from '../engine/types'
import { buildNetWorthChartData } from '../engine/aggregate'

export const useAppState = (): AppState =>
  useEvaluatorStore((s) => s.appState)

export const useCurrency = (): string =>
  useEvaluatorStore((s) => s.appState.currency)

export const useDisplayMode = (): AppState['displayMode'] =>
  useEvaluatorStore((s) => s.appState.displayMode)

export const useHorizonYears = (): number =>
  useEvaluatorStore((s) => s.appState.horizonYears)

export const useScenarios = () =>
  useEvaluatorStore((s) => s.appState.scenarios)

export const useMarketData = () =>
  useEvaluatorStore((s) => s.marketData)

export const useSimulation = (scenarioId: string): SimulationResult | null =>
  useEvaluatorStore((s) => s.getSimulation(scenarioId))

export const useAllSimulations = (): SimulationResult[] =>
  useEvaluatorStore((s) => s.getAllSimulations())

export const useNetWorthChartData = () => {
  const results = useAllSimulations()
  const displayMode = useDisplayMode()
  return useMemo(() => buildNetWorthChartData(results, displayMode), [results, displayMode])
}
