import { getClaimableStreakMilestone, STREAK_MILESTONES } from '../../src/game/matchStatsService'

describe('getClaimableStreakMilestone', () => {
  test('milestone days are exactly 3, 5, 7', () => {
    expect(STREAK_MILESTONES).toEqual([3, 5, 7])
  })

  test('day 1 or 2 — nothing claimable', () => {
    expect(getClaimableStreakMilestone(1, 0)).toBeNull()
    expect(getClaimableStreakMilestone(2, 0)).toBeNull()
  })

  test('day 3, never claimed — milestone 3 claimable', () => {
    expect(getClaimableStreakMilestone(3, 0)).toBe(3)
  })

  test('day 3, already claimed 3 — nothing claimable', () => {
    expect(getClaimableStreakMilestone(3, 3)).toBeNull()
  })

  test('day 4 (between milestones), already claimed 3 — nothing new claimable', () => {
    expect(getClaimableStreakMilestone(4, 3)).toBeNull()
  })

  test('day 6, claimed only 3 so far — milestone 5 claimable (not yet reached 7)', () => {
    expect(getClaimableStreakMilestone(6, 3)).toBe(5)
  })

  test('day 7, never claimed anything — highest eligible milestone (7) wins, not 3 or 5', () => {
    expect(getClaimableStreakMilestone(7, 0)).toBe(7)
  })

  test('day 7, already claimed everything up to 7 — nothing left', () => {
    expect(getClaimableStreakMilestone(7, 7)).toBeNull()
  })
})
