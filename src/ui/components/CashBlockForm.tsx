/**
 * ui/components/CashBlockForm.tsx
 *
 * Form for editing a CashBlock's configuration.
 *
 * Investment return rate and capital-gains tax rate are now global assumptions
 * (edit them in the AssumptionsPanel above the scenario columns).
 */
import type { CashBlock } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import { useCurrencySymbol } from '../hooks/useCurrencySymbol'

interface Props {
  block: CashBlock
  scenarioId: string
}

export function CashBlockForm({ block, scenarioId }: Props) {
  const updateBlock = useEvaluatorStore((s) => s.updateBlock)
  const sym = useCurrencySymbol()

  const update = (changes: Partial<CashBlock>) =>
    updateBlock(scenarioId, block.id, changes)

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-700 text-sm">{block.label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">Initial Balance ({sym})</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
            value={block.initialBalance}
            min={0}
            onChange={(e) => update({ initialBalance: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Monthly Contribution ({sym})</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
            value={block.monthlyContribution}
            min={0}
            onChange={(e) => update({ monthlyContribution: parseFloat(e.target.value) || 0 })}
          />
        </label>
      </div>
      <p className="text-xs text-gray-400">
        Return rate and capital gains tax are set in{' '}
        <span className="font-medium text-gray-500">Global Assumptions</span> above.
        Capital gains tax is applied at horizon only, on gains (balance − contributions).
      </p>
    </div>
  )
}
