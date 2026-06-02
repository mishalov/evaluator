/**
 * ui/hooks/useExternalData.ts
 *
 * React hook that loads market data on mount and updates the store.
 * Surfaces the data source tag for the offline badge.
 */
import { useEffect } from 'react'
import { useEvaluatorStore } from '../../state/store'
import { loadMarketData } from '../../data/index'

export function useExternalData() {
  const country = useEvaluatorStore((s) => s.appState.country)
  const setMarketData = useEvaluatorStore((s) => s.setMarketData)
  const marketData = useEvaluatorStore((s) => s.marketData)

  useEffect(() => {
    let cancelled = false
    loadMarketData(country).then((data) => {
      if (!cancelled) setMarketData(data)
    })
    return () => { cancelled = true }
  }, [country, setMarketData])

  return marketData
}
