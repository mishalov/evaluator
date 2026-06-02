/**
 * engine/blocks/cash.ts
 *
 * Cash/investment block step function.
 *
 * The cash block is an `asset` phase block — it steps AFTER all cost blocks
 * (mortgage, rent) so it receives the full routed inflows in the same month.
 *
 * Capital gains tax is applied at horizon only (not per-period).
 */
import { CashBlock } from '../types'
import { compoundStep } from '../math/compound'

export interface CashBlockState {
  balance: number
  totalContributions: number
}

/**
 * Initialize cash block state from block config.
 * The initial balance counts as a contribution for CG tax purposes.
 */
export function initCashBlockState(block: CashBlock): CashBlockState {
  return {
    balance: block.initialBalance,
    totalContributions: block.initialBalance,
  }
}

/**
 * Advance the cash block by one month.
 *
 * @param state         Current cash block state
 * @param block         Static block configuration
 * @param contribution  Total contribution this month (base + differential + salary routing)
 * @returns Updated cash block state
 */
export function stepCashBlock(
  state: CashBlockState,
  block: CashBlock,
  contribution: number,
): CashBlockState {
  const newBalance = compoundStep(state.balance, block.annualReturnRate, contribution)
  return {
    balance: newBalance,
    totalContributions: state.totalContributions + contribution,
  }
}
