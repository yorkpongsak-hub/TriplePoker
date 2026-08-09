import {
  checkInSovereignSeat,
  confirmSovereignSeat,
  createReserveOfferWindow,
  markSovereignNoShow,
} from '../../src/arena/sovereign/sovereignAttendance'

describe('Gate 10.3 confirmation and attendance', () => {
  test('accepts confirmation at the exact deadline and rejects after it', () => {
    const deadline = '2026-08-26T16:59:59.000Z'
    expect(confirmSovereignSeat('PENDING', deadline, deadline).status).toBe('CONFIRMED')
    expect(() => confirmSovereignSeat('PENDING', '2026-08-26T16:59:59.001Z', deadline))
      .toThrow('CONFIRMATION_DEADLINE_PASSED')
  })

  test('caps a six-hour reserve offer at standby opening', () => {
    expect(createReserveOfferWindow('2026-08-28T08:00:00.000Z', '2026-08-28T12:45:00.000Z'))
      .toEqual({ offeredAt: '2026-08-28T08:00:00.000Z', expiresAt: '2026-08-28T12:45:00.000Z' })
  })

  test('accepts check-in at 20:04:59.999 and rejects 20:05 exactly', () => {
    const open = '2026-08-28T13:00:00.000Z'
    const close = '2026-08-28T13:05:00.000Z'
    expect(checkInSovereignSeat('PENDING', '2026-08-28T13:04:59.999Z', open, close)).toBe('CHECKED_IN')
    expect(() => checkInSovereignSeat('PENDING', close, open, close)).toThrow('CHECK_IN_CLOSED')
    expect(markSovereignNoShow('PENDING', close, close)).toBe('NO_SHOW')
  })
})
