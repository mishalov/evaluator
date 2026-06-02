/**
 * App.tsx
 *
 * Root application component.
 * Layout: header toolbar + main area (net worth chart + scenario columns).
 */
import { useEvaluatorStore } from './state/store'
import { useScenarios } from './state/selectors'
import { useExternalData } from './ui/hooks/useExternalData'
import { NetWorthChart } from './ui/charts/NetWorthChart'
import { SummaryTable } from './ui/charts/SummaryTable'
import { ScenarioColumn } from './ui/components/ScenarioColumn'
import { RealNominalToggle } from './ui/components/RealNominalToggle'
import { CurrencyPicker } from './ui/components/CurrencyPicker'
import { HorizonPicker } from './ui/components/HorizonPicker'
import { ShareButton } from './ui/components/ShareButton'
import { OfflineBadge } from './ui/components/OfflineBadge'

export default function App() {
  // Load market data on mount
  useExternalData()

  const scenarios = useScenarios()
  const addScenario = useEvaluatorStore((s) => s.addScenario)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-bold text-gray-900 mr-auto">
            Investment Comparison Calculator
          </h1>
          <OfflineBadge />
          <HorizonPicker />
          <RealNominalToggle />
          <CurrencyPicker />
          <ShareButton />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6 space-y-8">
        {/* Net worth chart — spans full width */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <NetWorthChart />
        </section>

        {/* Summary table */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Summary</h2>
          <SummaryTable />
        </section>

        {/* Scenario columns */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Scenarios</h2>
            {scenarios.length < 3 && (
              <button
                onClick={addScenario}
                className="text-sm bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700 transition-colors"
              >
                + Add Scenario
              </button>
            )}
          </div>

          {scenarios.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg mb-2">No scenarios yet</p>
              <p className="text-sm">Click "Add Scenario" to get started</p>
            </div>
          ) : (
            <div
              className={`grid gap-6 ${
                scenarios.length === 1
                  ? 'grid-cols-1 max-w-lg'
                  : scenarios.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
                >
                  <ScenarioColumn
                    scenario={scenario}
                    canRemove={scenarios.length > 1}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mt-12 py-6 border-t border-gray-200 text-center text-xs text-gray-400">
        Investment comparison estimates are illustrative only. Not financial advice.
        All values are nominal unless "Real" mode is selected.
      </footer>
    </div>
  )
}
