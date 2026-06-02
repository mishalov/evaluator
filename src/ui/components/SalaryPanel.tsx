/**
 * ui/components/SalaryPanel.tsx
 *
 * Form for editing a scenario's salary configuration.
 * Labels salary as "gross" to prevent double-deduction.
 */
import type { SalaryConfig } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'

interface Props {
  salary: SalaryConfig
  scenarioId: string
}

export function SalaryPanel({ salary, scenarioId }: Props) {
  const updateScenario = useEvaluatorStore((s) => s.updateScenario)

  const update = (changes: Partial<SalaryConfig>) =>
    updateScenario(scenarioId, { salary: { ...salary, ...changes } })

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <h4 className="font-medium text-gray-700 text-sm mb-3">
        Salary (Gross)
        <span className="ml-2 text-xs font-normal text-gray-400">
          Tax rate is flat %. Enter gross amount — the app handles tax deduction.
        </span>
      </h4>
      <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-3">
        Net monthly income (informational). Shown for context — cash contributions come from
        the cash block&apos;s monthly contribution plus any rent/mortgage differential.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-gray-500">Annual Gross ($)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={salary.annualAmount}
            min={0}
            onChange={(e) => update({ annualAmount: parseFloat(e.target.value) || 0 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Annual Growth (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(salary.growthRate * 100).toFixed(2)}
            min={0}
            max={50}
            step={0.1}
            onChange={(e) => update({ growthRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Income Tax Rate (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(salary.incomeTaxRate * 100).toFixed(2)}
            min={0}
            max={100}
            step={0.1}
            onChange={(e) => update({ incomeTaxRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
      </div>
    </div>
  )
}
