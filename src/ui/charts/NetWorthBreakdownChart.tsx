/**
 * ui/charts/NetWorthBreakdownChart.tsx
 *
 * Recharts AreaChart showing the two components of net worth for a single
 * scenario: cash balance (lower stack) and property equity (upper stack).
 *
 * Single-scenario only — stacking across multiple scenarios is not
 * meaningful. When more than one scenario exists, a <select> lets the
 * user choose which to inspect.
 *
 * Cash can be negative when the down payment exceeds the initial cash
 * balance. The chart shows this correctly without clamping.
 */
import { useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  useNetWorthBreakdownData,
  useScenarios,
  useDisplayMode,
  useCurrency,
} from '../../state/selectors'
import { formatCurrency } from '../../lib/formatCurrency'
import { NetWorthExplainer } from './NetWorthExplainer'

const CASH_COLOR = '#2563eb'
const EQUITY_COLOR = '#16a34a'

export function NetWorthBreakdownChart() {
  const scenarios = useScenarios()
  const displayMode = useDisplayMode()
  const currency = useCurrency()

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    () => scenarios[0]?.id ?? '',
  )

  // Keep selectedScenarioId valid if scenarios change
  const validId =
    scenarios.find((s) => s.id === selectedScenarioId)?.id ?? scenarios[0]?.id ?? ''

  const chartData = useNetWorthBreakdownData(validId)

  if (scenarios.length === 0 || chartData.length === 0) {
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
          Net Worth Composition
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({displayMode === 'real' ? 'inflation-adjusted' : 'nominal'})
          </span>
        </h2>

        {scenarios.length > 1 && (
          <select
            value={validId}
            onChange={(e) => setSelectedScenarioId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <NetWorthExplainer />

      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          <Area
            type="monotone"
            dataKey="cashBalance"
            name="Cash balance"
            stackId="1"
            stroke={CASH_COLOR}
            fill={`${CASH_COLOR}33`}
          />
          <Area
            type="monotone"
            dataKey="propertyEquity"
            name="Property equity"
            stackId="1"
            stroke={EQUITY_COLOR}
            fill={`${EQUITY_COLOR}33`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
