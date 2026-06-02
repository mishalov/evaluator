/**
 * ui/components/ResetButton.tsx
 *
 * Clears localStorage and the URL hash, then reloads with bundled defaults.
 * Confirms first because this is destructive.
 */
import { useEvaluatorStore } from '../../state/store'

export function ResetButton() {
  const resetToDefaults = useEvaluatorStore((s) => s.resetToDefaults)

  const handleReset = () => {
    if (!window.confirm('Reset all scenarios and settings to defaults? This will discard your current inputs.')) {
      return
    }
    resetToDefaults()
    // Drop any state encoded in the URL hash so it doesn't immediately
    // overwrite the freshly-reset store on next read.
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <button
      onClick={handleReset}
      className="text-sm border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors text-gray-700"
      title="Clear saved state and restore defaults"
    >
      Reset
    </button>
  )
}
