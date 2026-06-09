/**
 * ui/components/RentalPropertyBlockForm.tsx
 *
 * Form for editing a RentalPropertyBlock's configuration.
 * Modelled on MortgageBlockForm, extended with rental-income and Czech §9 tax fields.
 *
 * The "≈ net monthly cash flow" banner is a rough display estimate only —
 * the engine settles landlord tax annually (at month 11, 23, …), so the
 * exact figure will differ. The banner is clearly labelled with "≈".
 */
import type { RentalPropertyBlock, RentalExpenseMethod } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import { monthlyPayment } from '../../engine/math/mortgage'
import { formatCurrency } from '../../lib/formatCurrency'
import { useCurrencySymbol } from '../hooks/useCurrencySymbol'

interface Props {
  block: RentalPropertyBlock
  scenarioId: string
}

export function RentalPropertyBlockForm({ block, scenarioId }: Props) {
  const updateBlock = useEvaluatorStore((s) => s.updateBlock)
  const currency = useEvaluatorStore((s) => s.appState.currency)
  const sym = useCurrencySymbol()
  const update = (changes: Partial<RentalPropertyBlock>) =>
    updateBlock(scenarioId, block.id, changes)

  // --- P+I banner (identical logic to MortgageBlockForm) ---
  const loanAmount = block.propertyValue - block.downPayment
  const termMonths = block.termYears * 12
  const M = monthlyPayment(loanAmount, block.annualInterestRate, termMonths)
  const downPct = block.propertyValue > 0
    ? ((block.downPayment / block.propertyValue) * 100).toFixed(1)
    : '0'

  // --- ≈ net monthly cash flow estimate ---
  // Effective monthly rent after vacancy
  const effectiveRent = block.monthlyRentIncome * (1 - block.vacancyRate)
  // Monthly property costs (property tax + maintenance), using initial value
  const monthlyPropCosts = block.propertyValue * (block.propertyTaxRate + block.maintenanceRate) / 12
  // Approximate monthly landlord tax for display purposes only.
  // lumpSum30: taxable base = annualRent * 0.70; apply progressive rates as a flat approx.
  // actual:    taxable base ≈ annualRent − annualInterest − annualPropCosts − annualDepreciation.
  // We use landlordTaxRate for the approximate (most income falls below threshold).
  let approxMonthlyTax = 0
  if (block.expenseMethod === 'lumpSum30') {
    const annualRent = effectiveRent * 12
    // Lump-sum 30% deduction (capped at 600,000 CZK — engine cap, not applied here for simplicity)
    const taxableBase = annualRent * 0.70
    approxMonthlyTax = taxableBase * block.landlordTaxRate / 12
  } else {
    // actual method: deductible = annual interest + prop costs + optional depreciation
    const annualInterest = M > 0
      ? block.annualInterestRate * loanAmount   // rough full-year interest (year 1 approx)
      : 0
    const annualPropCosts = monthlyPropCosts * 12
    const annualDepreciation = block.annualDepreciation ?? 0
    const annualRent = effectiveRent * 12
    const taxableBase = Math.max(0, annualRent - annualInterest - annualPropCosts - annualDepreciation)
    approxMonthlyTax = taxableBase * block.landlordTaxRate / 12
  }
  const approxNetCashFlow = effectiveRent - M - monthlyPropCosts - approxMonthlyTax

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-700 text-sm">{block.label}</h4>

      {/* P+I summary banner */}
      <div className="bg-blue-50 rounded p-2 text-xs text-blue-700">
        <span>Monthly P+I: <strong>{formatCurrency(M, currency)}</strong></span>
        <span className="ml-3">Loan: <strong>{formatCurrency(loanAmount, currency)}</strong></span>
        <span className="ml-3" title="M_ref = P+I only (excludes tax and maintenance). Used as reference for differential investing in rent scenarios.">
          M_ref = P+I only
        </span>
      </div>

      {/* ≈ net monthly cash flow estimate banner */}
      <div
        className={`rounded p-2 text-xs ${approxNetCashFlow >= 0 ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}
        title="Rough estimate: effective rent minus P&I, property costs, and approximate landlord tax. The engine settles tax annually so the exact figure will differ."
      >
        <span>
          ≈ Net monthly cash flow: <strong>{formatCurrency(approxNetCashFlow, currency)}</strong>
        </span>
        <span className="ml-2 opacity-70">(estimate — tax settled annually by engine)</span>
      </div>

      {/* Financing / property inputs — matches MortgageBlockForm layout */}
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

      {/* Rental income inputs */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
        <label className="block">
          <span className="text-xs text-gray-500">Monthly Rent Income ({sym})</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.monthlyRentIncome}
            min={0}
            onChange={(e) => update({ monthlyRentIncome: parseFloat(e.target.value) || 0 })}
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
        <label className="block">
          <span className="text-xs text-gray-500">Vacancy Rate (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.vacancyRate * 100).toFixed(1)}
            min={0}
            max={100}
            step={0.5}
            onChange={(e) => update({ vacancyRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>

        {/* Expense method select — spans both columns for label clarity */}
        <label className="block col-span-2">
          <span
            className="text-xs text-gray-500"
            title={
              'Czech §9 landlord tax deduction method.\n' +
              '• 30% lump-sum (paušál): deducts a flat 30% of gross rent income ' +
              '(capped at CZK 600,000/year). Simple, but loan principal is NOT deductible.\n' +
              '• Actual expenses: deducts real costs — mortgage interest, property tax, ' +
              'maintenance, and optional depreciation. Principal repayments are still NOT deductible.'
            }
          >
            Expense Method (§9) — hover for details
          </span>
          <select
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border bg-white"
            value={block.expenseMethod}
            onChange={(e) => update({ expenseMethod: e.target.value as RentalExpenseMethod })}
          >
            <option value="lumpSum30">30% lump-sum (paušál)</option>
            <option value="actual">Actual expenses</option>
          </select>
          <p className="mt-1 text-xs text-gray-400">
            Paušál deducts 30% of gross rent (max CZK 600k/yr). Loan principal is never deductible.
          </p>
        </label>
      </div>

      {/* Tax bracket inputs */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
        <label className="block">
          <span className="text-xs text-gray-500">Landlord Tax Rate (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.landlordTaxRate * 100).toFixed(1)}
            min={0}
            max={100}
            step={0.5}
            onChange={(e) => update({ landlordTaxRate: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">High Bracket Tax Rate (%)</span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={(block.landlordTaxRateHigh * 100).toFixed(1)}
            min={0}
            max={100}
            step={0.5}
            onChange={(e) => update({ landlordTaxRateHigh: (parseFloat(e.target.value) || 0) / 100 })}
          />
        </label>
        <label className="block col-span-2">
          <span className="text-xs text-gray-500">
            High-Bracket Threshold ({sym}/yr)
            <span className="ml-1 text-gray-400">(taxable income above this → high rate)</span>
          </span>
          <input
            type="number"
            className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
            value={block.landlordTaxThreshold}
            min={0}
            step={1000}
            onChange={(e) => update({ landlordTaxThreshold: parseFloat(e.target.value) || 0 })}
          />
        </label>

        {/* Depreciation — only shown for 'actual' expense method */}
        {block.expenseMethod === 'actual' && (
          <label className="block col-span-2">
            <span className="text-xs text-gray-500">
              Annual Depreciation ({sym}/yr)
              <span className="ml-1 text-gray-400">(optional; deducted from taxable income)</span>
            </span>
            <input
              type="number"
              className="mt-1 block w-full rounded border-gray-300 shadow-sm text-sm px-2 py-1 border"
              value={block.annualDepreciation ?? ''}
              min={0}
              step={1000}
              placeholder="0"
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                update({ annualDepreciation: isNaN(val) ? undefined : val })
              }}
            />
          </label>
        )}
      </div>
    </div>
  )
}
