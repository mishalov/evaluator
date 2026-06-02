/**
 * ui/components/HorizonPicker.tsx
 *
 * Slider/input for selecting the simulation horizon in years.
 */
import { useEvaluatorStore } from '../../state/store'
import { useHorizonYears } from '../../state/selectors'

export function HorizonPicker() {
  const horizonYears = useHorizonYears()
  const setHorizonYears = useEvaluatorStore((s) => s.setHorizonYears)

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 whitespace-nowrap">Horizon:</label>
      <input
        type="range"
        min={1}
        max={50}
        value={horizonYears}
        onChange={(e) => setHorizonYears(parseInt(e.target.value))}
        className="w-32 accent-blue-600"
      />
      <span className="text-sm font-medium text-gray-800 w-16">{horizonYears} years</span>
    </div>
  )
}
