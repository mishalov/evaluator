/**
 * ui/components/ScenarioColumn.tsx
 *
 * A single scenario column containing block editors and block add/remove controls.
 *
 * Salary is no longer per-scenario — it lives in global assumptions (AssumptionsPanel).
 */
import type { Scenario } from '../../engine/types'
import { BlockEditor } from './BlockEditor'
import { AddBlockButton } from './AddBlockButton'
import { CashFlowChart } from '../charts/CashFlowChart'
import { useEvaluatorStore } from '../../state/store'

interface Props {
  scenario: Scenario
  canRemove: boolean
}

export function ScenarioColumn({ scenario, canRemove }: Props) {
  const updateScenario = useEvaluatorStore((s) => s.updateScenario)
  const removeScenario = useEvaluatorStore((s) => s.removeScenario)

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={scenario.name}
          onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
          className="font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-base"
        />
        {canRemove && (
          <button
            onClick={() => removeScenario(scenario.id)}
            className="text-xs text-red-400 hover:text-red-600 ml-2"
            title="Remove scenario"
          >
            Remove
          </button>
        )}
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        {scenario.blocks.map((block) => (
          <BlockEditor key={block.id} block={block} scenarioId={scenario.id} />
        ))}
      </div>

      <AddBlockButton scenarioId={scenario.id} />

      {/* Cash flow chart for this scenario */}
      <CashFlowChart scenarioId={scenario.id} scenarioName={scenario.name} />
    </div>
  )
}
