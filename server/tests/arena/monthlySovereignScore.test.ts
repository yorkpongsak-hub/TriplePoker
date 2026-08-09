import {
  buildMonthlySovereignRanking,
  SovereignEligibleMatchResult,
} from '../../src/arena/sovereign/monthlySovereignScore'

const window = {
  scoringStartAt: '2026-07-31T17:00:01.000Z',
  scoringEndAt: '2026-08-23T11:00:00.000Z',
}

function matchesFor(
  userId: string,
  ranks: Array<1 | 2 | 3>,
  options: { pool?: 'MAIN' | 'ASCENDANT'; startDay?: number; botIndexes?: number[] } = {},
): SovereignEligibleMatchResult[] {
  return ranks.map((humanRank, index) => ({
    matchId: `${userId}-m${index + 1}`,
    userId,
    pool: options.pool ?? 'MAIN',
    humanRank,
    completedAt: `2026-08-${String((options.startDay ?? 1) + index).padStart(2, '0')}T10:00:00.000Z`,
    completedByBot: options.botIndexes?.includes(index) ?? false,
    qualificationAccessActive: true,
    valid: true,
  }))
}

describe('Gate 10.2 Monthly Sovereign Score', () => {
  test('uses only the best ten matches while retaining all-match score for tie-break', () => {
    const rows = buildMonthlySovereignRanking([
      ...matchesFor('u1', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3]),
    ], window)

    expect(rows[0]).toMatchObject({
      userId: 'u1',
      eligible: true,
      eligibleMatchCount: 11,
      bestTenScore: 100,
      allEligibleMatchScore: 103,
      firstPlaceFinishes: 10,
    })
    expect(rows[0].bestMatchIds).toHaveLength(10)
  })

  test('bot completion counts toward ten matches but awards zero score', () => {
    const rows = buildMonthlySovereignRanking(
      matchesFor('bot-finish', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { botIndexes: [9] }),
      window,
    )

    expect(rows[0]).toMatchObject({
      eligible: true,
      eligibleMatchCount: 10,
      bestTenScore: 90,
      firstPlaceFinishes: 9,
      botTakeoverCount: 1,
    })
  })

  test('ranks pools independently and applies the locked tie-break order', () => {
    const mainEarly = matchesFor('main-early', [1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    const mainLate = matchesFor('main-late', [1, 1, 2, 2, 2, 2, 3, 3, 3, 3], { startDay: 2 })
    const ascendant = matchesFor('asc-1', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { pool: 'ASCENDANT' })

    const rows = buildMonthlySovereignRanking([...mainLate, ...ascendant, ...mainEarly], window)
    expect(rows.filter(row => row.pool === 'MAIN').map(row => row.userId)).toEqual(['main-early', 'main-late'])
    expect(rows.find(row => row.userId === 'asc-1')).toMatchObject({ pool: 'ASCENDANT', rank: 1 })
  })

  test('excludes cancelled and cutoff-boundary matches', () => {
    const base = matchesFor('u1', [1, 1, 1, 1, 1, 1, 1, 1, 1])
    const rows = buildMonthlySovereignRanking([
      ...base,
      { ...base[0], matchId: 'cancelled', completedAt: '2026-08-10T00:00:00.000Z', valid: false },
      { ...base[0], matchId: 'at-cutoff', completedAt: window.scoringEndAt, valid: true },
    ], window)
    expect(rows[0]).toMatchObject({ eligible: false, eligibleMatchCount: 9 })
  })

  test('excludes a match completed after Ascendant access expired', () => {
    const base = matchesFor('asc-expired', [1], { pool: 'ASCENDANT' })
    const rows = buildMonthlySovereignRanking([{ ...base[0], qualificationAccessActive: false }], window)
    expect(rows).toEqual([])
  })

  test('rejects duplicate authoritative results for one user and match', () => {
    const [result] = matchesFor('u1', [1])
    expect(() => buildMonthlySovereignRanking([result, result], window))
      .toThrow('DUPLICATE_USER_MATCH_RESULT')
  })
})
