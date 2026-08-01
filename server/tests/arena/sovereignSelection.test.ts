import { SovereignMonthlyRankingRow } from '../../src/arena/sovereign/monthlySovereignScore'
import {
  selectMonthlySovereignSeats,
  SovereignSelectionCandidate,
} from '../../src/arena/sovereign/sovereignSelection'

function candidate(
  userId: string,
  options: {
    pool?: 'MAIN' | 'ASCENDANT'
    score?: number
    faced?: boolean
    consumed?: boolean
    eligible?: boolean
    eligibleAtCutoff?: boolean
    good?: boolean
  } = {},
): SovereignSelectionCandidate {
  const ranking: SovereignMonthlyRankingRow = {
    userId,
    pool: options.pool ?? 'MAIN',
    rank: 1,
    eligible: options.eligible ?? true,
    eligibleMatchCount: 10,
    bestTenScore: options.score ?? 50,
    allEligibleMatchScore: options.score ?? 50,
    firstPlaceFinishes: 2,
    bestTenAchievedAt: '2026-08-20T10:00:00.000Z',
    botTakeoverCount: 0,
    bestMatchIds: [],
  }
  return {
    ranking,
    accountInGoodStanding: options.good ?? true,
    eligibleAtCutoff: options.eligibleAtCutoff ?? true,
    hasStartedLastBossMatch: options.faced ?? false,
    ascendantRookieConsumed: options.consumed ?? false,
  }
}

describe('Gate 10.2 deterministic Sovereign selection', () => {
  test('selects 3 Veterans, 3 Rising Stars, and 3 Ascendant Rookies', () => {
    const result = selectMonthlySovereignSeats([
      candidate('v1', { faced: true, score: 90 }),
      candidate('v2', { faced: true, score: 80 }),
      candidate('v3', { faced: true, score: 70 }),
      candidate('r1', { score: 90 }),
      candidate('r2', { score: 80 }),
      candidate('r3', { score: 70 }),
      candidate('a1', { pool: 'ASCENDANT', score: 90 }),
      candidate('a2', { pool: 'ASCENDANT', score: 80 }),
      candidate('a3', { pool: 'ASCENDANT', score: 70 }),
    ])

    expect(result.seats).toHaveLength(9)
    expect(result.unfilledPaths).toEqual([])
    expect(result.seats.filter(seat => seat.plannedPath === 'VETERAN').map(seat => seat.userId))
      .toEqual(['v1', 'v2', 'v3'])
    expect(result.seats.filter(seat => seat.plannedPath === 'RISING_STAR').map(seat => seat.userId))
      .toEqual(['r1', 'r2', 'r3'])
    expect(result.seats.filter(seat => seat.plannedPath === 'ASCENDANT_ROOKIE').map(seat => seat.userId))
      .toEqual(['a1', 'a2', 'a3'])
  })

  test('distributes path ranks across Friday, Saturday, and Sunday', () => {
    const result = selectMonthlySovereignSeats([
      candidate('v1', { faced: true, score: 90 }),
      candidate('v2', { faced: true, score: 80 }),
      candidate('v3', { faced: true, score: 70 }),
    ])
    const veterans = result.seats.filter(seat => seat.plannedPath === 'VETERAN')
    expect(veterans.map(seat => [seat.pathRank, seat.eventDay])).toEqual([
      [1, 'FRIDAY'],
      [2, 'SATURDAY'],
      [3, 'SUNDAY'],
    ])
  })

  test('fills a missing path from the highest-ranked unselected candidates', () => {
    const result = selectMonthlySovereignSeats([
      candidate('v1', { faced: true, score: 95 }),
      candidate('v2', { faced: true, score: 85 }),
      candidate('v3', { faced: true, score: 75 }),
      candidate('r1', { score: 90 }),
      candidate('r2', { score: 80 }),
      candidate('r3', { score: 70 }),
      candidate('r4', { score: 60 }),
      candidate('r5', { score: 50 }),
      candidate('r6', { score: 40 }),
    ])

    const ascendantSeats = result.seats.filter(seat => seat.plannedPath === 'ASCENDANT_ROOKIE')
    // r1-r3 ถูกสงวนเป็น Rising Star primary ก่อน แล้ว fallback ใช้อันดับสูงสุดที่ยังไม่ถูกเลือก
    expect(ascendantSeats.map(seat => seat.userId)).toEqual(['r4', 'r5', 'r6'])
    expect(ascendantSeats.every(seat => seat.selectionSource === 'FALLBACK_RANKING')).toBe(true)
    expect(new Set(result.seats.map(seat => seat.userId)).size).toBe(9)
  })

  test('excludes consumed Ascendant, ineligible, and blocked accounts', () => {
    const result = selectMonthlySovereignSeats([
      candidate('consumed', { pool: 'ASCENDANT', consumed: true, score: 100 }),
      candidate('short', { pool: 'ASCENDANT', eligible: false, score: 100 }),
      candidate('blocked', { pool: 'ASCENDANT', good: false, score: 100 }),
      candidate('expired', { pool: 'ASCENDANT', eligibleAtCutoff: false, score: 100 }),
      candidate('valid', { pool: 'ASCENDANT', score: 10 }),
    ])
    expect(result.seats.map(seat => seat.userId)).toEqual(['valid'])
    expect(result.unfilledPaths).toContainEqual({ path: 'ASCENDANT_ROOKIE', count: 2 })
  })

  test('rejects duplicate users before selection', () => {
    expect(() => selectMonthlySovereignSeats([candidate('same'), candidate('same')]))
      .toThrow('DUPLICATE_SELECTION_CANDIDATE')
  })
})
