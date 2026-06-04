/**
 * ui/charts/NetWorthSection.tsx
 *
 * Section wrapper that owns the chart-mode toggle (Lines vs Stacked).
 * Renders NetWorthChart when mode is 'lines', NetWorthBreakdownChart
 * when mode is 'stacked'. Chart-display state is kept local — not in
 * Zustand — because it is purely presentational.
 */
import { useState } from 'react'
import { NetWorthChart } from './NetWorthChart'
import { NetWorthBreakdownChart } from './NetWorthBreakdownChart'

type ChartMode = 'lines' | 'stacked'

export function NetWorthSection() {
  const [mode, setMode] = useState<ChartMode>('lines')

  return (
    <div className="w-full">
      {/* Mode toggle — segmented control */}
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1" role="group" aria-label="Chart mode">
          <button
            type="button"
            onClick={() => setMode('lines')}
            aria-pressed={mode === 'lines'}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${
              mode === 'lines'
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Lines
          </button>
          <button
            type="button"
            onClick={() => setMode('stacked')}
            aria-pressed={mode === 'stacked'}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${
              mode === 'stacked'
                ? 'bg-white text-gray-800 shadow-sm font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Stacked
          </button>
        </div>
      </div>

      {mode === 'lines' ? <NetWorthChart /> : <NetWorthBreakdownChart />}
    </div>
  )
}
