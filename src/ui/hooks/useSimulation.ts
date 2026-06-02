/**
 * ui/hooks/useSimulation.ts
 *
 * React hook to get the simulation result for a single scenario.
 * Reads from the memoized store selector.
 */
import { useEvaluatorStore } from '../../state/store'
import type { SimulationResult } from '../../engine/types'

export function useSimulation(scenarioId: string): SimulationResult | null {
  return useEvaluatorStore((s) => s.getSimulation(scenarioId))
}
