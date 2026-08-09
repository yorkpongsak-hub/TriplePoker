import {
  canAccessGrandmaster,
  hasPermanentGrandmasterUnlock,
  qualifiesForGrandmasterUnlock,
} from '../../src/game/tierAuthority'
import { checkTierSEligibility } from '../../src/arena/eligibility/tierSEligibility'
import { ArenaMatchmakingQueue } from '../../src/arena/matchmaking/arenaMatchmaking'

describe('Gate 10.7 unified permanent Grandmaster authority', () => {
  test('uses an exclusive 1,000,000 Token crossing', () => {
    expect(qualifiesForGrandmasterUnlock(1_000_000)).toBe(false)
    expect(qualifiesForGrandmasterUnlock(1_000_001)).toBe(true)
  })

  test('keeps access after Token is spent once the permanent ceiling is recorded', () => {
    expect(hasPermanentGrandmasterUnlock('grandmaster')).toBe(true)
    expect(canAccessGrandmaster(5, 'grandmaster')).toBe(true)
    expect(checkTierSEligibility(5, 'grandmaster')).toEqual({ eligible: true, reason: 'ELIGIBLE' })
  })

  test('does not treat legacy arena entitlement as Grandmaster access', () => {
    expect(canAccessGrandmaster(999_999, 'highNoble')).toBe(false)
    expect(canAccessGrandmaster(999_999, null)).toBe(false)
  })

  test('matchmaking accepts a permanently unlocked player with a reduced Token balance', () => {
    const queue = new ArenaMatchmakingQueue('permanent-s', 0)
    expect(queue.join({ playerId: 'p1', tokenBalance: 100, tierUnlockedMax: 'grandmaster', joinedAt: 0 }))
      .toEqual({ ok: true, status: 'WAITING', humanCount: 1 })
  })
})
