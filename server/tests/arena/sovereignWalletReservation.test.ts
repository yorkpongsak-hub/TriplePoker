import {
  allocateCrownReservation,
  settleCrownReservation,
} from '../../src/arena/sovereign/sovereignWalletReservation'

describe('Gate 10.3 mixed-source Crown reservation', () => {
  test('allocates Earned Crown before Purchased Crown', () => {
    expect(allocateCrownReservation({ earnedCrest: 216, purchasedCrest: 240, purchaseDebtCrest: 0 }, 360))
      .toEqual({ totalCrest: 360, earnedCrest: 216, purchasedCrest: 144, status: 'ACTIVE' })
  })

  test('settles actual spend Earned-first and refunds each source', () => {
    const reservation = allocateCrownReservation(
      { earnedCrest: 216, purchasedCrest: 240, purchaseDebtCrest: 0 },
      360,
    )
    expect(settleCrownReservation(reservation, 180)).toEqual({
      spentEarnedCrest: 180,
      spentPurchasedCrest: 0,
      refundEarnedCrest: 36,
      refundPurchasedCrest: 144,
    })
  })

  test('blocks purchase debt and insufficient combined balance', () => {
    expect(() => allocateCrownReservation({ earnedCrest: 360, purchasedCrest: 0, purchaseDebtCrest: 1 }, 360))
      .toThrow('PURCHASE_DEBT_ACTIVE')
    expect(() => allocateCrownReservation({ earnedCrest: 100, purchasedCrest: 100, purchaseDebtCrest: 0 }, 360))
      .toThrow('INSUFFICIENT_CROWN')
  })
})
