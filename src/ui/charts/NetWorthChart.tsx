/**
 * ui/charts/NetWorthChart.tsx
 *
 * Recharts LineChart of net worth over time for all scenarios.
 * One line per scenario; reads from useNetWorthChartData selector.
 *
 * When showBreakdown is toggled on, two extra dashed lines per scenario
 * are rendered: property value and mortgage balance. This lets the user
 * see the components that drive net-worth movement.
 *
 * No math here — all data comes from the simulation engine via the store.
 */
import { useState } from 'react'
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
import { NetWorthExplainer } from './NetWorthExplainer'

const SCENARIO_COLORS = ['#2563eb', '#16a34a', '#dc2626']

/** Append 99 (60% opacity) to a 6-digit hex color for a lighter variant. */
function lighten(hexColor: string): string {
  return `${hexColor}99`
}

export function NetWorthChart() {
  const [showBreakdown, setShowBreakdown] = useState(false)

  const chartData = useNetWorthChartData(showBreakdown)
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
      <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800">
          Net Worth Over Time
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({displayMode === 'real' ? 'inflation-adjusted' : 'nominal'})
          </span>
        </h2>

        {/* Breakdown toggle button group */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1" role="group" aria-label="Net worth display">
          <button
            type="button"
            onClick={() => setShowBreakdown(false)}
            aria-pressed={!showBreakdown}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${
              !showBreakdown
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Net worth
          </button>
          <button
            type="button"
            onClick={() => setShowBreakdown(true)}
            aria-pressed={showBreakdown}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${
              showBreakdown
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            + Components
          </button>
        </div>
      </div>

      <NetWorthExplainer />

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
          {scenarios.flatMap((scenario, i) => {
            const color = SCENARIO_COLORS[i % SCENARIO_COLORS.length]
            const lightColor = lighten(color)
            const lines = [
              <Line
                key={scenario.id}
                type="monotone"
                dataKey={scenario.id}
                name={scenario.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />,
            ]
            if (showBreakdown) {
              lines.push(
                <Line
                  key={`${scenario.id}_propertyValue`}
                  type="monotone"
                  dataKey={`${scenario.id}_propertyValue`}
                  name={`${scenario.name} – Property value`}
                  stroke={lightColor}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 3 }}
                />,
                <Line
                  key={`${scenario.id}_mortgageBalance`}
                  type="monotone"
                  dataKey={`${scenario.id}_mortgageBalance`}
                  name={`${scenario.name} – Mortgage debt`}
                  stroke={lightColor}
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  dot={false}
                  activeDot={{ r: 3 }}
                />,
              )
            }
            return lines
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
