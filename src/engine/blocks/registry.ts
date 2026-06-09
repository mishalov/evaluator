/**
 * engine/blocks/registry.ts
 *
 * Block registry — phase classification for ordering the simulation loop.
 *
 * Phase rule (from architecture spec):
 *   'cost' blocks (mortgage, rent) step BEFORE 'asset' blocks (cash).
 *   This ensures the cash block receives all inflows (differential, salary
 *   routing) in the same month.
 *
 * Uses assertNever for exhaustive switch over BlockKind.
 */
import { BlockKind } from '../types'
import { assertNever } from '../../lib/assertNever'

export type BlockPhase = 'cost' | 'asset'

/**
 * Return the simulation phase for a given block kind.
 * Cost blocks run first; asset blocks run last.
 */
export function blockPhase(kind: BlockKind): BlockPhase {
  switch (kind) {
    case 'mortgage':
      return 'cost'
    case 'rent':
      return 'cost'
    case 'rental':
      return 'cost'
    case 'cash':
      return 'asset'
    default:
      return assertNever(kind)
  }
}

/**
 * Sort blocks into simulation order: cost blocks first, then asset blocks.
 * Within each phase, preserve original order.
 */
export function sortBlocksByPhase<T extends { kind: BlockKind }>(blocks: T[]): T[] {
  return [...blocks].sort((a, b) => {
    const phaseOrder: Record<BlockPhase, number> = { cost: 0, asset: 1 }
    return phaseOrder[blockPhase(a.kind)] - phaseOrder[blockPhase(b.kind)]
  })
}
