/**
 * ui/charts/NetWorthExplainer.tsx
 *
 * Shared subtitle and collapsible FAQ used by both NetWorthChart and
 * NetWorthBreakdownChart. Extracted to avoid duplicating the same JSX.
 */
export function NetWorthExplainer() {
  return (
    <div className="mb-4">
      <p className="text-sm text-gray-500">
        Net worth = cash + property equity. Property equity = property value &minus; mortgage debt.
      </p>
      <details className="mt-1 text-sm text-gray-500">
        <summary className="cursor-pointer hover:text-gray-700 select-none">
          Why doesn&apos;t this jump to the full house price?
        </summary>
        <div className="mt-1 leading-relaxed max-w-prose space-y-2">
          <p>
            When you buy a house with a mortgage, you only own the down payment portion at
            purchase — the bank provides the rest and holds a claim on that share of the
            property until the loan is repaid. Equity grows over time as you pay down the
            mortgage principal and as the property value appreciates. Net worth only ever
            includes the part you own; the bank&apos;s share is not your asset.
          </p>
          <p>
            If you toggle on <span className="font-medium">+ Components</span>, you will see
            the full property value and the outstanding mortgage debt as separate dashed
            lines. These two do <em>not</em> sum to net worth — the difference between them
            (property equity) is what counts.
          </p>
          <p>
            In a buy-only scenario it is normal for the cash band to start <em>below zero</em>
            in the stacked view: the down payment is debited from initial cash, and if your
            cash savings are smaller than the down payment, the engine surfaces the gap
            instead of hiding it.
          </p>
        </div>
      </details>
    </div>
  )
}
