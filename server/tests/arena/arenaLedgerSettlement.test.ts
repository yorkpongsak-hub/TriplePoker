// arenaLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 6 (Tier S / Arena)
// Covers ArenaSettlementPersistence.persistMatchSettlementViaLedger() — settles a whole Arena match
// once at match end (not per-action, per ลุงเยาะ's 2026-08-13 decision), the first tier in this
// series using CREST as the currency and reading netCrest deltas (no pre-deducted buy-in exists).
// Also the first tier using type:'TRANSFER' (not 'BURN') — the match-end fee (crownSinkCrest, Boss
// Fee removed per ลุงเยาะ 2026-08-13 as a duplicate charge) is credited to SYSTEM_RESERVE rather
// than destroyed, so the whole transaction is naturally zero-sum with no burnOverride needed.

const mockApply = jest.fn()

const mockUsersSingle = jest.fn()
const mockUsersEq = jest.fn(() => ({ single: mockUsersSingle }))
const mockUsersSelect = jest.fn(() => ({ eq: mockUsersEq }))

const mockFrom = jest.fn((table: string) => {
  if (table === 'users') return { select: mockUsersSelect }
  throw new Error(`Unexpected table in test: ${table}`)
})

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { from: mockFrom, rpc: jest.fn() },
}))

jest.mock('../../src/economy/economyService', () => ({
  economyService: { apply: (...args: unknown[]) => mockApply(...args) },
}))

import { ArenaSettlementPersistence } from '../../src/arena/settlement/arenaSettlementPersistence'
import type { PlayerResultBreakdown } from '../../src/arena/settlement/arenaSettlementEngine'

function row(overrides: Partial<PlayerResultBreakdown> = {}): PlayerResultBreakdown {
  return {
    playerId: 'p1', persisted: true, startingCrest: 240, entryFee: 0, ante: 0, jokerExtraAnte: 0,
    auction: 0, call: 0, battleRewards: 0, sweepJackpot: 0, winLoss: 0,
    netCrest: 0, endingCrest: 240,
    ...overrides,
  }
}

describe('ArenaSettlementPersistence.persistMatchSettlementViaLedger — Central Economy Ledger path (Arena, Phase 7 Round 6)', () => {
  const persistence = new ArenaSettlementPersistence()

  beforeEach(() => {
    mockApply.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
    mockUsersSingle.mockReset().mockResolvedValue({ data: { crown_balance: 25, crown_crest_remainder: 6 }, error: null })
    mockFrom.mockClear()
    mockUsersSelect.mockClear()
  })

  test('submits one TRANSFER — PLAYER entries use netCrest (delta, no pre-deducted buy-in exists in Arena), NPC_POOL entries routed via aiId, crownSinkCrest credited to SYSTEM_RESERVE (not burned)', async () => {
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: 60 }),
      row({ playerId: 'ai:REAPER:seat2', persisted: false, netCrest: -40 }),
      row({ playerId: 'ai:ARENA_MINION:seat3', persisted: false, netCrest: -32 }),
    ]
    await persistence.persistMatchSettlementViaLedger('match-1', breakdown, 12, {
      'ai:REAPER:seat2': 'REAPER',
      'ai:ARENA_MINION:seat3': 'ARENA_MINION',
    })

    expect(mockApply).toHaveBeenCalledWith({
      idempotencyKey: 'MATCH_SETTLEMENT:match-1',
      type: 'TRANSFER',
      reason: 'MATCH_SETTLEMENT',
      entries: [
        { accountType: 'PLAYER', accountId: 'human-1', currency: 'CREST', wallet: 'EARNED', amount: 60 },
        { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL', currency: 'CREST', amount: -40 },
        { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'CREST', amount: -32 },
        { accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE', currency: 'CREST', amount: 12 },
      ],
      context: { matchId: 'match-1', tier: 'grandmaster' },
    })
    // sanity: the whole transaction must sum to exactly zero — TRANSFER's own invariant
    const entries = mockApply.mock.calls[0][0].entries
    expect(entries.reduce((sum: number, e: any) => sum + e.amount, 0)).toBe(0)
  })

  test('routes a Dual-Boss match (Monarch + Soren simultaneously) to two distinct NPC pools in one transaction', async () => {
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: -10 }),
      row({ playerId: 'human-2', persisted: true, netCrest: -20 }),
      row({ playerId: 'ai:MONARCH:seat3', persisted: false, netCrest: 15 }),
      row({ playerId: 'ai:SOREN:seat4', persisted: false, netCrest: 15 }),
    ]
    await persistence.persistMatchSettlementViaLedger('match-2', breakdown, 0, {
      'ai:MONARCH:seat3': 'MONARCH',
      'ai:SOREN:seat4': 'SOREN',
    })
    const entries = mockApply.mock.calls[0][0].entries
    expect(entries).toContainEqual({ accountType: 'NPC_POOL', accountId: 'MONARCH_POOL', currency: 'CREST', amount: 15 })
    expect(entries).toContainEqual({ accountType: 'NPC_POOL', accountId: 'SOREN_VEYL_POOL', currency: 'CREST', amount: 15 })
  })

  test('omits the SYSTEM_RESERVE entry entirely when crownSinkCrest is zero (no fee this match)', async () => {
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: 20 }),
      row({ playerId: 'ai:REAPER:seat2', persisted: false, netCrest: -20 }),
    ]
    await persistence.persistMatchSettlementViaLedger('match-3', breakdown, 0, { 'ai:REAPER:seat2': 'REAPER' })
    const entries = mockApply.mock.calls[0][0].entries
    expect(entries.some((e: any) => e.accountType === 'SYSTEM_RESERVE')).toBe(false)
  })

  test('drops zero-net player/NPC entries (a true push)', async () => {
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: 0 }),
      row({ playerId: 'ai:REAPER:seat2', persisted: false, netCrest: -5 }),
    ]
    await persistence.persistMatchSettlementViaLedger('match-4', breakdown, 5, { 'ai:REAPER:seat2': 'REAPER' })
    const entries = mockApply.mock.calls[0][0].entries
    expect(entries).toEqual([
      { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL', currency: 'CREST', amount: -5 },
      { accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE', currency: 'CREST', amount: 5 },
    ])
  })

  test('re-reads real Crest (crown_balance*12 + crown_crest_remainder) for each human, AI rows are never included in the result', async () => {
    mockUsersSingle.mockResolvedValueOnce({ data: { crown_balance: 25, crown_crest_remainder: 6 }, error: null })
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: 60 }),
      row({ playerId: 'ai:REAPER:seat2', persisted: false, netCrest: -60 }),
    ]
    const result = await persistence.persistMatchSettlementViaLedger('match-5', breakdown, 0, { 'ai:REAPER:seat2': 'REAPER' })
    expect(result).toEqual({ 'human-1': 306 }) // 25*12+6
    expect(Object.keys(result)).not.toContain('ai:REAPER:seat2')
  })

  test('returns null for every human if the combined ledger settlement throws', async () => {
    mockApply.mockRejectedValueOnce(new Error('boom'))
    const breakdown = [
      row({ playerId: 'human-1', persisted: true, netCrest: 60 }),
      row({ playerId: 'human-2', persisted: true, netCrest: -60 }),
    ]
    const result = await persistence.persistMatchSettlementViaLedger('match-6', breakdown, 0, {})
    expect(result).toEqual({ 'human-1': null, 'human-2': null })
  })

  test('skips economyService.apply entirely when every entry nets to zero', async () => {
    const breakdown = [row({ playerId: 'human-1', persisted: true, netCrest: 0 })]
    await persistence.persistMatchSettlementViaLedger('match-7', breakdown, 0, {})
    expect(mockApply).not.toHaveBeenCalled()
  })
})
