/**
 * ui/charts/CashFlowChart.tsx
 *
 * Stacked bar chart for annual cash flow breakdown of a selected scenario.
 * Shows mortgage P&I, property tax, maintenance, rent, and cash contributions.
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useSimulation } from '../hooks/useSimulation'
import { buildCashFlowChartData } from '../../engine/aggregate'
import { useCurrency } from '../../state/selectors'
import { formatCurrency } from '../../lib/formatCurrency'

interface Props {
  scenarioId: string
  scenarioName: string
}

export function CashFlowChart({ scenarioId, scenarioName }: Props) {
  const simulation = useSimulation(scenarioId)
  const currency = useCurrency()

  if (!simulation) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No data
      </div>
    )
  }

  const data = buildCashFlowChartData(simulation)

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        Annual Cash Flow — {scenarioName}
      </h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v, currency)}
            tick={{ fontSize: 10 }}
            width={80}
          />
          <Tooltip
            formatter={(v: number, name: string) => [formatCurrency(v, currency), name]}
            labelFormatter={(l: number) => `Year ${l}`}
          />
          <Legend iconSize={10} />
          <Bar dataKey="mortgagePI" name="Mortgage P&I" stackId="a" fill="#2563eb" />
          <Bar dataKey="propertyTax" name="Property Tax" stackId="a" fill="#7c3aed" />
          <Bar dataKey="maintenance" name="Maintenance" stackId="a" fill="#db2777" />
          <Bar dataKey="rent" name="Rent" stackId="a" fill="#ea580c" />
          <Bar dataKey="cashContribution" name="Contributions" stackId="a" fill="#16a34a" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
