/**
 * ui/components/AddBlockButton.tsx
 *
 * Dropdown button for adding a new block to a scenario.
 *
 * makeDefaultBlock mirrors the DEFAULT_STATE / DEFAULT_RENTAL_BLOCK presets
 * from store.ts. Rate fields (annualReturnRate, mortgageInterestRate, etc.)
 * are intentionally omitted — they live in global assumptions now.
 */
import { useState } from 'react'
import type { BlockKind } from '../../engine/types'
import { useEvaluatorStore } from '../../state/store'
import type { Block } from '../../engine/types'
import { DEFAULT_RENTAL_BLOCK } from '../../state/store'

interface Props {
  scenarioId: string
}

function makeDefaultBlock(kind: BlockKind, id: string): Block {
  switch (kind) {
    case 'cash':
      return {
        kind: 'cash',
        id,
        label: 'Investment Account',
        initialBalance: 0,
        monthlyContribution: 500,
      }
    case 'mortgage':
      return {
        kind: 'mortgage',
        id,
        label: 'Primary Home',
        propertyValue: 300_000,
        downPayment: 60_000,
        termYears: 30,
      }
    case 'rent':
      return {
        kind: 'rent',
        id,
        label: 'Monthly Rent',
        monthlyRent: 2_000,
        differentialInvesting: false,
      }
    case 'rental':
      return {
        ...DEFAULT_RENTAL_BLOCK,
        id,
        label: 'Rental Property',
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
          <button onClick={() => add('rental')} className="block w-full text-left px-4 py-2 hover:bg-gray-50">
            Rental Property
          </button>
        </div>
      )}
    </div>
  )
}
