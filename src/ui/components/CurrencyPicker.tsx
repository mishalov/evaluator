/**
 * ui/components/CurrencyPicker.tsx
 *
 * Dropdown for selecting the display currency.
 */
import { useEvaluatorStore } from '../../state/store'
import { SUPPORTED_CURRENCIES } from '../../data/defaults'
import { useCurrency } from '../../state/selectors'

export function CurrencyPicker() {
  const currency = useCurrency()
  const setCurrency = useEvaluatorStore((s) => s.setCurrency)

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600">Currency:</label>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}
