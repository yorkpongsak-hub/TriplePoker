import { resolveNpcPoolKey, UnknownNpcIdError } from '../../src/economy/npcPoolResolver'
import { ALL_POOL_KEYS, NPC_POOL_KEYS, SYSTEM_RESERVE_POOL_KEY } from '../../src/economy/economyConstants'

describe('resolveNpcPoolKey — every real NPC/AI id in the codebase maps to its pool', () => {
  test('Four Gods Shared Pool (spec §42) — server-side and Arena-side ids both land on FOUR_GODS_POOL', () => {
    for (const id of ['AI_REAPER', 'AI_CRAG', 'AI_CORTEX', 'AI_CIPHER', 'REAPER', 'CRAG', 'CORTEX', 'CIPHER']) {
      expect(resolveNpcPoolKey(id)).toBe('FOUR_GODS_POOL')
    }
  })

  test('Nine Sentinels Shared Pool (spec §42) — server-side and Arena-side ids both land on NINE_SENTINELS_POOL', () => {
    const serverIds = ['AI_IRON_WALL', 'AI_CHIVALRY', 'AI_WAR_LORD', 'AI_PHANTOM', 'AI_DARK_SHARK', 'AI_ORACLE', 'AI_JESTER', 'AI_PHOENIX', 'AI_BLACK_MAGIC']
    const arenaIds = ['IRON_WALL', 'CHIVALRY', 'WAR_LORD', 'PHANTOM', 'DARK_SHARK', 'ORACLE', 'JESTER', 'PHOENIX', 'BLACK_MAGIC']
    for (const id of [...serverIds, ...arenaIds]) {
      expect(resolveNpcPoolKey(id)).toBe('NINE_SENTINELS_POOL')
    }
  })

  test('Minion Shared Pool (spec §42) — any Minion-displayed id lands on MINION_POOL', () => {
    expect(resolveNpcPoolKey('ARENA_MINION')).toBe('MINION_POOL')
    for (const baseId of ['AI_SAGE', 'AI_RECKLESS', 'AI_GHOST']) {
      expect(resolveNpcPoolKey(baseId, { isMinionDisplay: true })).toBe('MINION_POOL')
    }
  })

  test('base AI ids without a Minion overlay land on BOT_POOL instead', () => {
    for (const id of ['AI_SAGE', 'AI_RECKLESS', 'AI_GHOST']) {
      expect(resolveNpcPoolKey(id)).toBe('BOT_POOL')
      expect(resolveNpcPoolKey(id, { isMinionDisplay: false })).toBe('BOT_POOL')
    }
  })

  test('Three Boss Separation (spec §42) — Monarch/Soren Veyl/CAELUM never share a pool', () => {
    expect(resolveNpcPoolKey('MONARCH_BOSS')).toBe('MONARCH_POOL') // monarchEngine.ts — the only live Monarch encounter
    expect(resolveNpcPoolKey('MONARCH')).toBe('MONARCH_POOL')      // Arena boss id — same lore-boss, same pool
    expect(resolveNpcPoolKey('SOREN')).toBe('SOREN_VEYL_POOL')
    expect(resolveNpcPoolKey('CAELUM')).toBe('CAELUM_POOL')

    const pools = new Set([
      resolveNpcPoolKey('MONARCH_BOSS'),
      resolveNpcPoolKey('SOREN'),
      resolveNpcPoolKey('CAELUM'),
    ])
    expect(pools.size).toBe(3)
  })

  test('throws UnknownNpcIdError for an unmapped id instead of silently mis-routing money', () => {
    expect(() => resolveNpcPoolKey('SOME_NEW_AI_NOBODY_MAPPED_YET')).toThrow(UnknownNpcIdError)
  })

  test('deliberately-excluded non-economic seats are not part of any mapping (documented, not asserted as pools)', () => {
    for (const id of ['MONARCH_MINION_1', 'MONARCH_MINION_2', 'MONARCH_PROBE']) {
      expect(() => resolveNpcPoolKey(id)).toThrow(UnknownNpcIdError)
    }
  })
})

describe('NPC Total Invariant (spec §9/§42) — pool key set is closed and matches SUM(sub-pools)', () => {
  test('NPC_POOL_KEYS has exactly the 7 spec sub-pools, ALL_POOL_KEYS adds only SYSTEM_RESERVE', () => {
    expect(new Set(NPC_POOL_KEYS)).toEqual(new Set([
      'BOT_POOL', 'MINION_POOL', 'NINE_SENTINELS_POOL', 'FOUR_GODS_POOL',
      'MONARCH_POOL', 'SOREN_VEYL_POOL', 'CAELUM_POOL',
    ]))
    expect(new Set(ALL_POOL_KEYS)).toEqual(new Set([SYSTEM_RESERVE_POOL_KEY, ...NPC_POOL_KEYS]))
    // economy_pool_accounts.pool_key has a CHECK constraint restricted to exactly this set (030
    // migration), and economy_reconciliation()'s npc_pool = SUM(...) WHERE pool_key <>
    // 'SYSTEM_RESERVE' — so this set being closed is what makes NPC_TOTAL = SUM(sub-pools) hold
    // by construction. There is no NPC_POOL row of its own to drift out of sync with the sum.
    expect(ALL_POOL_KEYS.length).toBe(8)
  })

  test('every id resolveNpcPoolKey can return is one of NPC_POOL_KEYS (never SYSTEM_RESERVE)', () => {
    const sampleIds = [
      'AI_SAGE', 'AI_RECKLESS', 'AI_GHOST', 'ARENA_MINION',
      'AI_REAPER', 'REAPER', 'AI_IRON_WALL', 'IRON_WALL',
      'MONARCH_BOSS', 'MONARCH', 'SOREN', 'CAELUM',
    ]
    for (const id of sampleIds) {
      expect(NPC_POOL_KEYS).toContain(resolveNpcPoolKey(id, { isMinionDisplay: true }))
    }
  })
})
