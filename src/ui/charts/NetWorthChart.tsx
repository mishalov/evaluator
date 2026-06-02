/**
 * ui/charts/NetWorthChart.tsx
 *
 * Recharts LineChart of net worth over time for all scenarios.
 * One line per scenario; reads from useNetWorthChartData selector.
 * No math here — all data comes from the simulation engine via the store.
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useNetWorthChartData, useScenarios, useDisplayMode, useCurrency } from '../../state/selectors'
import { formatCurrency } from '../../lib/formatCurrency'

const SCENARIO_COLORS = ['#2563eb', '#16a34a', '#dc2626']

export function NetWorthChart() {
  const chartData = useNetWorthChartData()
  const scenarios = useScenarios()
  const displayMode = useDisplayMode()
  const currency = useCurrency()

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Add a scenario to see the chart
      </div>
    )
  }

  return (
    <div className="w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Net Worth Over Time
        <span className="text-sm font-normal text-gray-500 ml-2">
          ({displayMode === 'real' ? 'inflation-adjusted' : 'nominal'})
        </span>
      </h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="year"
            label={{ value: 'Year', position: 'insideBottom', offset: -5 }}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v, currency)}
            tick={{ fontSize: 11 }}
            width={90}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatCurrency(value, currency),
              name,
            ]}
            labelFormatter={(label: number) => `Year ${label}`}
          />
          <Legend />
          {scenarios.map((scenario, i) => (
            <Line
              key={scenario.id}
              type="monotone"
              dataKey={scenario.id}
              name={scenario.name}
              stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
