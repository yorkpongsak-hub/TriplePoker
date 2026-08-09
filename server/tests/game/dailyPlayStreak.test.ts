import { computeDailyPlayStreak } from '../../src/game/matchStatsService'

describe('7-day daily play streak', () => {
  test.each([
    [1, 100, 5], [2, 150, 5], [3, 200, 10], [4, 250, 10],
    [5, 300, 15], [6, 400, 20], [7, 700, 35],
  ])('day %i grants %i Token and %i XP', (day, token, xp) => {
    const previousDate = day === 1 ? null : `2026-08-${String(day).padStart(2, '0')}`
    const today = `2026-08-${String(day + 1).padStart(2, '0')}`
    const result = computeDailyPlayStreak(day - 1, day - 1, previousDate, 0, false, today)
    expect(result).toMatchObject({ cycleDay: day, tokenReward: token, xpReward: xp, rewarded: true })
  })

  it('does not grant a second reward on the same Bangkok day', () => {
    expect(computeDailyPlayStreak(3, 3, '2026-08-02', 1, false, '2026-08-02')).toEqual({
      cycleDay: 3, bestStreak: 3, shields: 1, tokenReward: 0, xpReward: 0,
      shieldUsed: false, badgeUnlocked: false, rewarded: false,
    })
  })

  it('loops from day 7 back to day 1 on the following day', () => {
    expect(computeDailyPlayStreak(7, 7, '2026-08-01', 2, true, '2026-08-02'))
      .toMatchObject({ cycleDay: 1, bestStreak: 7, tokenReward: 100, xpReward: 5, shields: 2 })
  })

  it('does not waste a shield when a completed cycle starts over after a missed day', () => {
    expect(computeDailyPlayStreak(7, 7, '2026-07-31', 1, true, '2026-08-02'))
      .toMatchObject({ cycleDay: 1, shields: 1, shieldUsed: false })
  })

  it('uses one shield for exactly one missed day', () => {
    expect(computeDailyPlayStreak(3, 3, '2026-07-31', 1, false, '2026-08-02'))
      .toMatchObject({ cycleDay: 4, shields: 0, shieldUsed: true })
  })

  it('resets to day 1 when a missed day is not protected', () => {
    expect(computeDailyPlayStreak(5, 5, '2026-07-31', 0, false, '2026-08-02'))
      .toMatchObject({ cycleDay: 1, shields: 0, shieldUsed: false })
  })

  it('unlocks the permanent badge and grants one shield on day 7, capped at two', () => {
    expect(computeDailyPlayStreak(6, 6, '2026-08-01', 2, false, '2026-08-02'))
      .toMatchObject({ cycleDay: 7, shields: 2, badgeUnlocked: true, tokenReward: 700, xpReward: 35 })
  })
})
