/**
 * ui/hooks/useCurrencySymbol.ts
 *
 * Returns the localised currency symbol for the currently selected currency.
 * Re-derives only when the currency code changes (memoised via useMemo).
 */
import { useMemo } from 'react'
import { useEvaluatorStore } from '../../state/store'
import { getCurrencySymbol } from '../../lib/formatCurrency'

export function useCurrencySymbol(): string {
  const currency = useEvaluatorStore(s => s.appState.currency)
  return useMemo(() => getCurrencySymbol(currency), [currency])
}
