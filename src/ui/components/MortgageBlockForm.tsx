/**
 * ui/components/MortgageBlockForm.tsx
 *
 * Form for editing a MortgageBlock's configuration.
 * Surfaces M_ref tooltip explaining differential investing convention.
 *
 * Interest rate, appreciation rate, and maintenance rate are now global
 * assumptions — edit them in the AssumptionsPanel. Property tax was dropped
 * in the v3 engine refactor.
 */
import type { MortgageBlock } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import { monthlyPayment } from '../../engine/math/mortgage'
import { formatCurrency } from '../../lib/formatCurrency'
import { useCurrencySymbol } from '../hooks/useCurrencySymbol'

interface Props {
  block: MortgageBlock
  scenarioId: string
}

export function MortgageBlockForm({ block, scenarioId }: Props) {
  const updateBlock = useEvaluatorStore((s) => s.updateBlock)
  const currency = useEvaluatorStore((s) => s.appState.currency)
  // Interest rate is now a global assumption — read it for the P+I banner calculation.
  const mortgageInterestRate = useEvaluatorStore(
    (s) => s.appState.assumptions.property.mortgageInterestRate,
  )
  const sym = useCurrencySymbol()
  const update = (changes: Partial<MortgageBlock>) =>
    updateBlock(scenarioId, block.id, changes)

  const loanAmount = block.propertyValue - block.downPayment
  const termMonths = block.termYears * 12
  const M = monthlyPayment(loanAmount, mortgageInterestRate, termMonths)
  const downPct = block.propertyValue > 0
    ? ((block.downPayment / block.propertyValue) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-700 text-sm">{block.label}</h4>

      {/* Summary banner */}
      <div className="bg-blue-50 rounded p-2 text-xs text-blue-700">
        <span>Monthly P+I: <strong>{formatCurrency(M, currency)}</strong></span>
        <span className="ml-3">Loan: <strong>{formatCurrency(loanAmount, currency)}</strong></span>
        <span
          className="ml-3"
          title="M_ref = P+I only (excludes maintenance). Used as reference for differential investing in rent scenarios."
        >
          M_ref = P+I only
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">Property Value ({sym})</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.propertyValue}
            min={0}
            onChange={(e) => update({ propertyValue: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Down Payment ({sym}) ({downPct}%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.downPayment}
            min={0}
            onChange={(e) => update({ downPayment: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block col-span-2">
          <span className="text-xs text-gray-500">Term (years)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.termYears}
            min={1}
            max={50}
            onChange={(e) => update({ termYears: parseInt(e.target.value) || 30 })}
          />
        </label>
      </div>

      <p className="text-xs text-gray-400">
        Interest rate, appreciation, and maintenance are set in{' '}
        <span className="font-medium text-gray-500">Global Assumptions</span> above.
      </p>
    </div>
  )
}
