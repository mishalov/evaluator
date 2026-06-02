/**
 * engine/blocks/rent.ts
 *
 * Rent block step function.
 *
 * Phase: 'cost' — steps before the cash (asset) block each month.
 *
 * Rent uses annual-step (lease-style) growth:
 *   rent(m) = monthlyRent * (1 + annualRentGrowth)^floor(m/12)
 * NOT monthly compounding.
 *
 * Differential investing: when enabled, the surplus
 *   diff(m) = max(0, M_ref - rent(m))
 * is routed into the scenario's cash block. M_ref = P+I only.
 */
import { RentBlock } from '../types'
import { monthlyRent as computeMonthlyRent } from '../math/growth'

export interface RentBlockState {
  totalRentPaid: number
  totalDifferentialInvested: number
}

export function initRentBlockState(): RentBlockState {
  return {
    totalRentPaid: 0,
    totalDifferentialInvested: 0,
  }
}

export interface RentStepResult {
  state: RentBlockState
  /** Rent payment this month */
  rent: number
  /**
   * Differential surplus to route to cash block.
   * = max(0, referenceMonthlyPI - rent). Zero if differentialInvesting is false.
   */
  differentialAmount: number
}

/**
 * Advance the rent block by one month.
 *
 * @param state               Current rent block state
 * @param block               Static rent block configuration
 * @param month               Global month index (0-based)
 * @param referenceMonthlyPI  P+I payment of reference mortgage (for differential).
 *                            Caller should pass the sibling MortgageBlock's monthlyPI,
 *                            or block.referenceMonthlyPayment if explicitly set.
 * @returns Rent step result
 */
export function stepRentBlock(
  state: RentBlockState,
  block: RentBlock,
  month: number,
  referenceMonthlyPI: number,
): RentStepResult {
  const rent = computeMonthlyRent(block.monthlyRent, block.annualRentGrowth, month)

  let differentialAmount = 0
  if (block.differentialInvesting) {
    differentialAmount = Math.max(0, referenceMonthlyPI - rent)
  }

  const newState: RentBlockState = {
    totalRentPaid: state.totalRentPaid + rent,
    totalDifferentialInvested: state.totalDifferentialInvested + differentialAmount,
  }

  return {
    state: newState,
    rent,
    differentialAmount,
  }
}
