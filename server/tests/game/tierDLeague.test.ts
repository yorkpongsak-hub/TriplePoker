import { getCurrentLeague, getLeaguePhase, getLeaguePointsAward, getLeagueProgress, isLeagueFinalLevel, nextLeaguePoints } from '../../src/game/tierDLeague'

describe('Tier D League engine', () => {
  test.each([
    [1, 'tier-d-league-1', 1, 50, 'relax'], [20, 'tier-d-league-1', 1, 50, 'relax'],
    [21, 'tier-d-league-1', 1, 50, 'ranked'], [50, 'tier-d-league-1', 1, 50, 'ranked'],
    [51, 'tier-d-league-2', 51, 100, 'relax'], [500, 'tier-d-league-10', 451, 500, 'ranked'],
    [501, 'tier-d-league-11', 501, 550, 'relax'],
  ] as const)('level %i maps to its league and phase', (level, id, start, end, phase) => {
    const league = getCurrentLeague(level)
    expect(league).toMatchObject({ id, startLevel: start, endLevel: end, relaxEndLevel: start + 19, rankedStartLevel: start + 20 })
    expect(getLeaguePhase(level)).toBe(phase)
  })

  test('progress exposes the Relax/Ranked boundary and leaderboard eligibility', () => {
    expect(getLeagueProgress(20, 99)).toMatchObject({ levelInLeague: 20, phase: 'relax', leaguePoints: 99, rankedLeaderboardEligible: false, isFinalLevel: false })
    expect(getLeagueProgress(21, 0)).toMatchObject({ levelInLeague: 21, phase: 'ranked', rankedLeaderboardEligible: true })
  })

  test('only Ranked wins earn configurable points and no losses have penalties', () => {
    expect(getLeaguePointsAward(20, true)).toBe(0)
    expect(getLeaguePointsAward(21, true)).toBe(10)
    expect(getLeaguePointsAward(21, false)).toBe(0)
  })

  test('the final level finalizes a bracket and the next League resets points', () => {
    expect(isLeagueFinalLevel(49)).toBe(false)
    expect(isLeagueFinalLevel(50)).toBe(true)
    expect(nextLeaguePoints(49, true, 20)).toBe(30)
    expect(nextLeaguePoints(50, true, 30)).toBe(0)
    expect(nextLeaguePoints(50, false, 30)).toBe(30)
  })

  test('league definitions reserve finalization, rank, and award references', () => {
    expect(getCurrentLeague(1)).toMatchObject({ finalized: false, finalRank: null, awardRefs: { medalSvgKey: null, trophyKeys: { 1: null, 2: null, 3: null } } })
  })
})
