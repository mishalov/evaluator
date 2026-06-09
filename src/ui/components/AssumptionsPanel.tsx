/**
 * ui/components/AssumptionsPanel.tsx
 *
 * Full-width panel that edits the global `assumptions` object — the single
 * place users enter economic parameters that apply to all scenarios.
 *
 * Grouped into four visible sections and one collapsible "Advanced" section:
 *   1. Salary (gross — informational only, never routed into cash flow)
 *   2. Investment
 *   3. Property
 *   4. Rent growth
 *   5. Advanced: Czech §9 landlord tax constants
 *
 * Calls setAssumptions with a fully-merged nested update so the shallow-merge
 * in the store action doesn't clobber sibling keys in nested objects.
 */
import { useState } from 'react'
import { useEvaluatorStore } from '../../state/store'
import { useCurrencySymbol } from '../hooks/useCurrencySymbol'
import type { Assumptions } from '../../engine/types'

export function AssumptionsPanel() {
  const assumptions = useEvaluatorStore((s) => s.appState.assumptions)
  const setAssumptions = useEvaluatorStore((s) => s.setAssumptions)
  const sym = useCurrencySymbol()

  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Helpers that produce fully-merged patches for each nested group.
  // The store's setAssumptions does a shallow merge at the Assumptions level,
  // so we must spread the existing sub-object to avoid losing sibling keys.
  const updateSalary = (patch: Partial<Assumptions['salary']>) =>
    setAssumptions({ salary: { ...assumptions.salary, ...patch } })

  const updateInvestment = (patch: Partial<Assumptions['investment']>) =>
    setAssumptions({ investment: { ...assumptions.investment, ...patch } })

  const updateProperty = (patch: Partial<Assumptions['property']>) =>
    setAssumptions({ property: { ...assumptions.property, ...patch } })

  const updateLandlordTax = (patch: Partial<Assumptions['landlordTax']>) =>
    setAssumptions({ landlordTax: { ...assumptions.landlordTax, ...patch } })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800 mb-1">Global Assumptions</h2>
      <p className="text-xs text-gray-400 mb-4">
        These values are shared across all scenarios — enter them once here.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* ---- Salary ---- */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Salary (Gross)
          </h3>
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1">
            Informational — shown for context. Cash flow comes from block contributions.
          </p>
          <label className="block">
            <span className="text-xs text-gray-500">Annual Gross ({sym})</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={assumptions.salary.annualAmount}
              min={0}
              onChange={(e) => updateSalary({ annualAmount: parseFloat(e.target.value) || 0 })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Annual Growth (%)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.salary.growthRate * 100).toFixed(2)}
              min={0}
              max={50}
              step={0.1}
              onChange={(e) => updateSalary({ growthRate: (parseFloat(e.target.value) || 0) / 100 })}
            />
          </label>
          <label className="block">
            <span
              className="text-xs text-gray-500"
              title="Flat income tax rate. Enter gross salary — the app deducts tax to compute net monthly income for display."
            >
              Income Tax Rate (%) — hover for details
            </span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.salary.incomeTaxRate * 100).toFixed(2)}
              min={0}
              max={100}
              step={0.1}
              onChange={(e) =>
                updateSalary({ incomeTaxRate: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
        </div>

        {/* ---- Investment ---- */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Investment
          </h3>
          <label className="block">
            <span className="text-xs text-gray-500">Annual Return Rate (%)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.investment.annualReturnRate * 100).toFixed(2)}
              min={0}
              max={100}
              step={0.1}
              onChange={(e) =>
                updateInvestment({ annualReturnRate: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
          <label className="block">
            <span
              className="text-xs text-gray-500"
              title="Applied at horizon only, on gains = (final balance − total contributions). Not deducted from the balance during simulation."
            >
              Capital Gains Tax (%) — hover for details
            </span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.investment.capitalGainsTaxRate * 100).toFixed(2)}
              min={0}
              max={100}
              step={0.1}
              onChange={(e) =>
                updateInvestment({ capitalGainsTaxRate: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
        </div>

        {/* ---- Property ---- */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Property
          </h3>
          <label className="block">
            <span className="text-xs text-gray-500">Mortgage Interest Rate (%)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.property.mortgageInterestRate * 100).toFixed(3)}
              min={0}
              max={30}
              step={0.125}
              onChange={(e) =>
                updateProperty({
                  mortgageInterestRate: (parseFloat(e.target.value) || 0) / 100,
                })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Annual Appreciation (%)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.property.appreciationRate * 100).toFixed(2)}
              min={-50}
              max={100}
              step={0.1}
              onChange={(e) =>
                updateProperty({ appreciationRate: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Maintenance Rate (%/yr of value)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.property.maintenanceRate * 100).toFixed(2)}
              min={0}
              max={10}
              step={0.1}
              onChange={(e) =>
                updateProperty({ maintenanceRate: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
        </div>

        {/* ---- Rent growth ---- */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Rent Growth
          </h3>
          <label className="block">
            <span className="text-xs text-gray-500">Annual Rent Growth (%)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
              value={(assumptions.rentGrowth * 100).toFixed(2)}
              min={-50}
              max={100}
              step={0.1}
              onChange={(e) =>
                setAssumptions({ rentGrowth: (parseFloat(e.target.value) || 0) / 100 })
              }
            />
          </label>
          <p className="text-xs text-gray-400">
            Applies to both consumption rent and rental income. Grows annually
            (lease-style), not monthly.
          </p>
        </div>
      </div>

      {/* ---- Advanced: Czech §9 landlord tax ---- */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span
            className={`inline-block transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          Advanced: Czech §9 Landlord Tax Constants
        </button>

        {advancedOpen && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">Lower Rate (%) — up to threshold</span>
              <input
                type="number"
                className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
                value={(assumptions.landlordTax.rate * 100).toFixed(1)}
                min={0}
                max={100}
                step={0.5}
                onChange={(e) =>
                  updateLandlordTax({ rate: (parseFloat(e.target.value) || 0) / 100 })
                }
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Higher Rate (%) — above threshold</span>
              <input
                type="number"
                className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
                value={(assumptions.landlordTax.rateHigh * 100).toFixed(1)}
                min={0}
                max={100}
                step={0.5}
                onChange={(e) =>
                  updateLandlordTax({ rateHigh: (parseFloat(e.target.value) || 0) / 100 })
                }
              />
            </label>
            <label className="block">
              <span
                className="text-xs text-gray-500"
                title="CZK 1,762,812 = 36× average wage (2026). Taxable income up to this amount is taxed at the lower rate; income above it at the higher rate."
              >
                Threshold ({sym}/yr) — hover for details
              </span>
              <input
                type="number"
                className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border focus:ring-blue-500 focus:border-blue-500"
                value={assumptions.landlordTax.threshold}
                min={0}
                step={1000}
                onChange={(e) =>
                  updateLandlordTax({ threshold: parseFloat(e.target.value) || 0 })
                }
              />
            </label>
            <p className="col-span-full text-xs text-gray-400">
              Czech §9 landlord income tax (2026 brackets). Most users should leave these
              at the defaults (15%/23%, threshold CZK 1,762,812).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
