/**
 * ui/components/OfflineBadge.tsx
 *
 * Shows the data source: 'live', 'cached', or 'fallback'.
 */
import { useMarketData } from '../../state/selectors'

export function OfflineBadge() {
  const marketData = useMarketData()

  if (!marketData) {
    return (
      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
        Loading data...
      </span>
    )
  }

  const labels: Record<string, { label: string; classes: string }> = {
    live: { label: 'Live data', classes: 'bg-green-100 text-green-700' },
    cached: { label: 'Cached data', classes: 'bg-yellow-100 text-yellow-700' },
    fallback: { label: 'Offline (defaults)', classes: 'bg-red-100 text-red-600' },
  }

  const { label, classes } = labels[marketData.source] ?? labels.fallback

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${classes}`}
      title={`CPI: ${(marketData.cpiAnnual * 100).toFixed(2)}% | Fetched: ${new Date(marketData.fetchedAt).toLocaleDateString()}`}
    >
      {label}
    </span>
  )
}
