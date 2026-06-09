/**
 * engine/blocks/cash.ts
 *
 * Cash/investment block step function.
 *
 * The cash block is an `asset` phase block — it steps AFTER all cost blocks
 * (mortgage, rent) so it receives the full routed inflows in the same month.
 *
 * Capital gains tax is applied at horizon only (not per-period).
 *
 * Investment rate and capital-gains tax rate come from global Assumptions
 * (AppState.assumptions.investment), not from the block itself.
 */
import { CashBlock } from '../types'
import type { Assumptions } from '../types'
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
 * @param _block        Static block configuration (kept for API symmetry)
 * @param investment    Investment assumptions (annualReturnRate)
 * @param contribution  Total contribution this month (base + differential + rental routing)
 * @returns Updated cash block state
 */
export function stepCashBlock(
  state: CashBlockState,
  _block: CashBlock,
  investment: Assumptions['investment'],
  contribution: number,
): CashBlockState {
  const newBalance = compoundStep(state.balance, investment.annualReturnRate, contribution)
  return {
    balance: newBalance,
    totalContributions: state.totalContributions + contribution,
  }
}
