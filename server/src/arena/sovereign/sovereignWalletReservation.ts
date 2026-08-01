import { CrownReservationComposition } from '../contracts/sovereignContracts'

export interface SpendableCrownBalance {
  earnedCrest: number
  purchasedCrest: number
  purchaseDebtCrest: number
}

export interface CrownReservationSettlement {
  spentEarnedCrest: number
  spentPurchasedCrest: number
  refundEarnedCrest: number
  refundPurchasedCrest: number
}

function assertCrest(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code)
}

export function allocateCrownReservation(
  balance: SpendableCrownBalance,
  requiredCrest: number,
): CrownReservationComposition {
  assertCrest(balance.earnedCrest, 'INVALID_EARNED_CREST')
  assertCrest(balance.purchasedCrest, 'INVALID_PURCHASED_CREST')
  assertCrest(balance.purchaseDebtCrest, 'INVALID_PURCHASE_DEBT_CREST')
  assertCrest(requiredCrest, 'INVALID_REQUIRED_CREST')
  if (requiredCrest === 0) throw new Error('REQUIRED_CREST_MUST_BE_POSITIVE')
  if (balance.purchaseDebtCrest > 0) throw new Error('PURCHASE_DEBT_ACTIVE')
  if (balance.earnedCrest + balance.purchasedCrest < requiredCrest) throw new Error('INSUFFICIENT_CROWN')

  const earnedCrest = Math.min(balance.earnedCrest, requiredCrest)
  return {
    totalCrest: requiredCrest,
    earnedCrest,
    purchasedCrest: requiredCrest - earnedCrest,
    status: 'ACTIVE',
  }
}

export function settleCrownReservation(
  reservation: CrownReservationComposition,
  actualSpentCrest: number,
): CrownReservationSettlement {
  if (reservation.status !== 'ACTIVE') throw new Error('RESERVATION_NOT_ACTIVE')
  assertCrest(actualSpentCrest, 'INVALID_ACTUAL_SPENT_CREST')
  if (actualSpentCrest > reservation.totalCrest) throw new Error('SPEND_EXCEEDS_RESERVATION')

  const spentEarnedCrest = Math.min(reservation.earnedCrest, actualSpentCrest)
  const spentPurchasedCrest = actualSpentCrest - spentEarnedCrest
  return {
    spentEarnedCrest,
    spentPurchasedCrest,
    refundEarnedCrest: reservation.earnedCrest - spentEarnedCrest,
    refundPurchasedCrest: reservation.purchasedCrest - spentPurchasedCrest,
  }
}
