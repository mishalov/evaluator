/**
 * ui/charts/SummaryTable.tsx
 *
 * Table showing final net worth, total contributions, interest, and rent
 * for all scenarios side-by-side.
 */
import { useAllSimulations, useDisplayMode, useCurrency, useScenarios } from '../../state/selectors'
import { formatCurrency } from '../../lib/formatCurrency'

export function SummaryTable() {
  const results = useAllSimulations()
  const displayMode = useDisplayMode()
  const currency = useCurrency()
  const scenarios = useScenarios()

  if (results.length === 0) return null

  const fmt = (v: number) => formatCurrency(v, currency)

  // Build a lookup from scenarioId → scenario.name for column headers
  const nameById = new Map(scenarios.map((s) => [s.id, s.name]))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left py-2 px-3 text-gray-600 font-medium border-b">Metric</th>
            {results.map((r) => (
              <th key={r.scenarioId} className="text-right py-2 px-3 text-gray-700 font-semibold border-b">
                {nameById.get(r.scenarioId) ?? r.scenarioId}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 px-3 text-gray-600">
              Final Net Worth ({displayMode === 'real' ? 'Real' : 'Nominal'})
            </td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3 font-semibold text-blue-700">
                {fmt(
                  displayMode === 'real'
                    ? r.summary.finalNetWorthReal
                    : r.summary.finalNetWorthNominal,
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b bg-gray-50">
            <td className="py-2 px-3 text-gray-600">Total Contributions</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3">
                {fmt(r.summary.totalContributions)}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 text-gray-600">Total Interest Paid</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3 text-red-600">
                {fmt(r.summary.totalInterest)}
              </td>
            ))}
          </tr>
          <tr className="border-b bg-gray-50">
            <td className="py-2 px-3 text-gray-600">Total Rent Paid</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3 text-orange-600">
                {fmt(r.summary.totalRent)}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-2 px-3 text-gray-600">Property Costs (Tax + Maint.)</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3 text-purple-600">
                {fmt(r.summary.totalPropertyCosts)}
              </td>
            ))}
          </tr>
          <tr className="border-b bg-gray-50">
            <td className="py-2 px-3 text-gray-600">Down Payment</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3">
                {fmt(r.summary.downPayment)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 px-3 text-gray-600">Est. Capital Gains Tax</td>
            {results.map((r) => (
              <td key={r.scenarioId} className="text-right py-2 px-3 text-red-500">
                {fmt(r.summary.capitalGainsTaxAtHorizon)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
