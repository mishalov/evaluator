/**
 * ui/components/RealNominalToggle.tsx
 *
 * Toggle between real (inflation-adjusted) and nominal display modes.
 * Toggling never re-runs the simulation — it's a pure display transform.
 */
import { useEvaluatorStore } from '../../state/store'
import { useDisplayMode } from '../../state/selectors'

export function RealNominalToggle() {
  const displayMode = useDisplayMode()
  const setDisplayMode = useEvaluatorStore((s) => s.setDisplayMode)

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
      <button
        onClick={() => setDisplayMode('nominal')}
        className={`text-sm px-3 py-1 rounded-full transition-colors ${
          displayMode === 'nominal'
            ? 'bg-white text-gray-800 shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Nominal
      </button>
      <button
        onClick={() => setDisplayMode('real')}
        className={`text-sm px-3 py-1 rounded-full transition-colors ${
          displayMode === 'real'
            ? 'bg-white text-gray-800 shadow-sm font-medium'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Real
      </button>
    </div>
  )
}
