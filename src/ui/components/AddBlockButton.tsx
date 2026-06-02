/**
 * ui/components/AddBlockButton.tsx
 *
 * Dropdown button for adding a new block to a scenario.
 */
import { useState } from 'react'
import type { BlockKind } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import type { Block } from '../../engine/types'

interface Props {
  scenarioId: string
}

function makeDefaultBlock(kind: BlockKind, id: string): Block {
  switch (kind) {
    case 'cash':
      return {
        kind: 'cash', id, label: 'Investment Account',
        initialBalance: 0, monthlyContribution: 500,
        annualReturnRate: 0.07, capitalGainsTaxRate: 0.15,
      }
    case 'mortgage':
      return {
        kind: 'mortgage', id, label: 'Primary Home',
        propertyValue: 300_000, downPayment: 60_000,
        annualInterestRate: 0.06, termYears: 30,
        appreciationRate: 0.04, propertyTaxRate: 0.01,
        maintenanceRate: 0.01,
      }
    case 'rent':
      return {
        kind: 'rent', id, label: 'Monthly Rent',
        monthlyRent: 2_000, annualRentGrowth: 0.03,
        differentialInvesting: false,
      }
  }
}

export function AddBlockButton({ scenarioId }: Props) {
  const [open, setOpen] = useState(false)
  const addBlock = useEvaluatorStore((s) => s.addBlock)

  const add = (kind: BlockKind) => {
    const id = `${kind}-${Date.now()}`
    addBlock(scenarioId, makeDefaultBlock(kind, id))
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-3 py-1 transition-colors"
      >
        + Add Block
      </button>
      {open && (
        <div className="absolute top-8 left-0 z-10 bg-white border border-gray-200 rounded shadow-lg text-sm min-w-40">
          <button onClick={() => add('cash')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">
            Investment (Cash)
          </button>
          <button onClick={() => add('mortgage')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">
            Mortgage
          </button>
          <button onClick={() => add('rent')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">
            Rent
          </button>
        </div>
      )}
    </div>
  )
}
