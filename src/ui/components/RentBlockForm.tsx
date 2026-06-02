/**
 * ui/components/RentBlockForm.tsx
 *
 * Form for editing a RentBlock's configuration.
 * Includes tooltip explaining M_ref = P+I only for differential investing.
 */
import type { RentBlock } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'

interface Props {
  block: RentBlock
  scenarioId: string
}

export function RentBlockForm({ block, scenarioId }: Props) {
  const updateBlock = useEvaluatorStore((s) => s.updateBlock)
  const scenario = useEvaluatorStore((s) =>
    s.appState.scenarios.find((sc) => sc.id === scenarioId),
  )
  const update = (changes: Partial<RentBlock>) =>
    updateBlock(scenarioId, block.id, changes)

  // Determine whether the differential will be silently zero:
  // no explicit referenceMonthlyPayment AND no sibling MortgageBlock exists.
  const hasSiblingMortgage = scenario?.blocks.some((b) => b.kind === 'mortgage') ?? false
  const showDifferentialWarning =
    block.differentialInvesting &&
    (block.referenceMonthlyPayment === undefined || block.referenceMonthlyPayment === null) &&
    !hasSiblingMortgage

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-700 text-sm">{block.label}</h4>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">Monthly Rent ($)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.monthlyRent}
            min={0}
            onChange={(e) => update({ monthlyRent: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Annual Rent Growth (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.annualRentGrowth * 100).toFixed(2)}
            min={-50}
            max={100}
            step={0.1}
            onChange={(e) => update({ annualRentGrowth: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
      </div>

      {/* Differential investing toggle */}
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id={`diff-${block.id}`}
          className="mt-1"
          checked={block.differentialInvesting}
          onChange={(e) => update({ differentialInvesting: e.target.checked })}
        />
        <label htmlFor={`diff-${block.id}`} className="text-sm text-gray-700 cursor-pointer">
          <span className="font-medium">Invest the difference</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Each month, routes max(0, M_ref - rent) into the cash block.
            M_ref = P+I only (mortgage principal + interest, excluding tax and maintenance).
            This models the savings from cheaper rent vs. a mortgage.
          </span>
        </label>
      </div>

      {block.differentialInvesting && (
        <label className="block">
          <span className="text-xs text-gray-500">
            Reference Monthly P+I ($)
            <span className="ml-1 text-gray-400">
              (leave blank to use sibling mortgage block's payment)
            </span>
          </span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.referenceMonthlyPayment ?? ''}
            min={0}
            placeholder="Auto from mortgage block"
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              update({ referenceMonthlyPayment: isNaN(val) ? undefined : val })
            }}
          />
        </label>
      )}

      {/* M3: Warn when differential will always be 0 due to missing M_ref */}
      {showDifferentialWarning && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          No reference mortgage payment set and no Mortgage block exists in this scenario
          — differential will be 0. Add a Mortgage block or set a reference payment manually.
        </p>
      )}

      <p className="text-xs text-gray-400">
        Rent grows annually (lease-style): once per year at renewal, not monthly.
      </p>
    </div>
  )
}
