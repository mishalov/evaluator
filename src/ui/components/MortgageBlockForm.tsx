/**
 * ui/components/MortgageBlockForm.tsx
 *
 * Form for editing a MortgageBlock's configuration.
 * Surfaces M_ref tooltip explaining differential investing convention.
 */
import type { MortgageBlock } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import { monthlyPayment } from '../../engine/math/mortgage'

interface Props {
  block: MortgageBlock
  scenarioId: string
}

export function MortgageBlockForm({ block, scenarioId }: Props) {
  const updateBlock = useEvaluatorStore((s) => s.updateBlock)
  const update = (changes: Partial<MortgageBlock>) =>
    updateBlock(scenarioId, block.id, changes)

  const loanAmount = block.propertyValue - block.downPayment
  const termMonths = block.termYears * 12
  const M = monthlyPayment(loanAmount, block.annualInterestRate, termMonths)
  const downPct = block.propertyValue > 0
    ? ((block.downPayment / block.propertyValue) * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-700 text-sm">{block.label}</h4>

      {/* Summary banner */}
      <div className="bg-blue-50 rounded p-2 text-xs text-blue-700">
        <span>Monthly P+I: <strong>${M.toFixed(2)}</strong></span>
        <span className="ml-3">Loan: <strong>${loanAmount.toLocaleString()}</strong></span>
        <span className="ml-3" title="M_ref = P+I only (excludes tax and maintenance). Used as reference for differential investing in rent scenarios.">
          M_ref = P+I only
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">Property Value ($)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.propertyValue}
            min={0}
            onChange={(e) => update({ propertyValue: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Down Payment ($) ({downPct}%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.downPayment}
            min={0}
            onChange={(e) => update({ downPayment: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Annual Interest Rate (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.annualInterestRate * 100).toFixed(3)}
            min={0}
            max={30}
            step={0.125}
            onChange={(e) => update({ annualInterestRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block">
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
        <label className="block">
          <span className="text-xs text-gray-500">Annual Appreciation (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.appreciationRate * 100).toFixed(2)}
            min={-50}
            max={100}
            step={0.1}
            onChange={(e) => update({ appreciationRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Property Tax (%/yr)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.propertyTaxRate * 100).toFixed(2)}
            min={0}
            max={10}
            step={0.1}
            onChange={(e) => update({ propertyTaxRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block col-span-2">
          <span className="text-xs text-gray-500">Maintenance Rate (%/yr of value)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.maintenanceRate * 100).toFixed(2)}
            min={0}
            max={10}
            step={0.1}
            onChange={(e) => update({ maintenanceRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
      </div>
    </div>
  )
}
