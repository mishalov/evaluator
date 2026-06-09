/**
 * ui/components/BlockEditor.tsx
 *
 * Renders the correct form for any block kind.
 * Uses assertNever for exhaustiveness.
 */
import type { Block } from '../../engine/types'
import { assertNever } from '../../lib/assertNever'
import { CashBlockForm } from './CashBlockForm'
import { MortgageBlockForm } from './MortgageBlockForm'
import { RentBlockForm } from './RentBlockForm'
import { RentalPropertyBlockForm } from './RentalPropertyBlockForm'
import { useEvaluatorStore } from '../../state/store'

interface Props {
  block: Block
  scenarioId: string
}

function BlockKindLabel({ kind }: { kind: Block['kind'] }) {
  switch (kind) {
    case 'cash': return <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">Investment</span>
    case 'mortgage': return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">Mortgage</span>
    case 'rent': return <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">Rent</span>
    case 'rental': return <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full">Rental</span>
    default: return assertNever(kind)
  }
}

function BlockForm({ block, scenarioId }: Props) {
  switch (block.kind) {
    case 'cash': return <CashBlockForm block={block} scenarioId={scenarioId} />
    case 'mortgage': return <MortgageBlockForm block={block} scenarioId={scenarioId} />
    case 'rent': return <RentBlockForm block={block} scenarioId={scenarioId} />
    case 'rental': return <RentalPropertyBlockForm block={block} scenarioId={scenarioId} />
    default: return assertNever(block)
  }
}

export function BlockEditor({ block, scenarioId }: Props) {
  const removeBlock = useEvaluatorStore((s) => s.removeBlock)

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-3">
        <BlockKindLabel kind={block.kind} />
        <button
          onClick={() => removeBlock(scenarioId, block.id)}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
          title="Remove block"
        >
          Remove
        </button>
      </div>
      <BlockForm block={block} scenarioId={scenarioId} />
    </div>
  )
}
