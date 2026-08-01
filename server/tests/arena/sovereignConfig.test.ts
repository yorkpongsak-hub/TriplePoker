import { sovereignConfig, sovereignEconomyConfig } from '../../src/arena/config/sovereignConfig'

describe('Arena Gate 10 Sovereign locked configuration', () => {
  test('feature stays disabled and monthly qualification is nine seats across three paths', () => {
    expect(sovereignConfig.featureEnabled).toBe(false)
    expect(sovereignConfig.initialThroneName).toBe('CAELUM')
    expect(sovereignConfig.qualifierCount).toBe(9)
    expect(sovereignConfig.qualifiersPerPath).toBe(3)
    expect(sovereignConfig.minimumCompletedMatches).toBe(10)
    expect(sovereignConfig.bestMatchCount).toBe(10)
    expect(sovereignConfig.monthlyScoreByHumanRank).toEqual({ 1: 10, 2: 6, 3: 3 })
  })

  test('uses the locked Bangkok schedule and rare spectator capacity', () => {
    expect(sovereignConfig.timezone).toBe('Asia/Bangkok')
    expect(sovereignConfig.scoringOpenLocal).toBe('00:00:01')
    expect(sovereignConfig.spectatorDelayMs).toBe(30_000)
    expect(sovereignConfig.maxSpectatorsPerMatch).toBe(100)
    expect(sovereignConfig.immediateStandbyPromotion).toBe(true)
  })

  test('Ascendant is a one-time 30-day shortcut without Monarch Slayer', () => {
    expect(sovereignConfig.ascendantMinimumToken).toBe(600_000)
    expect(sovereignConfig.ascendantPassDurationMs).toBe(30 * 24 * 60 * 60 * 1_000)
    expect(sovereignConfig.ascendantRequiresHighNoble).toBe(true)
    expect(sovereignConfig.ascendantRequiresMonarchSlayer).toBe(false)
    expect(sovereignConfig.ascendantOncePerAccount).toBe(true)
  })

  test('S+ reserves 30 Crown, charges 3 Crown fee, and has no rake', () => {
    expect(sovereignEconomyConfig.requiredReservationCrest).toBe(30 * 12)
    expect(sovereignEconomyConfig.entryFeeCrest).toBe(3 * 12)
    expect(sovereignEconomyConfig.maximumVariableMatchCostCrest).toBe(27 * 12)
    expect(sovereignEconomyConfig.spendOrder).toEqual(['EARNED', 'PURCHASED'])
    expect(sovereignEconomyConfig.rakeRate).toBe(0)
  })
})
