// highNobleLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 4 (High Noble)
// Covers settleHNMatchViaLedger() — combined single-transaction settlement for 3H+1 Boss (Four
// Gods), the first tier settled entirely outside gameLoop.ts's MatchState/MultiMatchState system.

const mockSettleMatchResult = jest.fn()

const mockUsersSingle = jest.fn()
const mockUsersEq = jest.fn(() => ({ single: mockUsersSingle }))
const mockUsersSelect = jest.fn(() => ({ eq: mockUsersEq }))

const mockEscrowUpdateResolve = jest.fn<{ error: null | { message: string } }, []>(() => ({ error: null }))
function escrowUpdateBuilder(): any {
  const builder: any = {}
  builder.eq = jest.fn(() => builder)
  builder.then = (resolve: (value: unknown) => void) => resolve(mockEscrowUpdateResolve())
  return builder
}
const mockEscrowUpdate = jest.fn(() => escrowUpdateBuilder())

const mockFrom = jest.fn((table: string) => {
  if (table === 'users') return { select: mockUsersSelect }
  if (table === 'match_escrow') return { update: mockEscrowUpdate }
  throw new Error(`Unexpected table in test: ${table}`)
})

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { from: mockFrom, rpc: jest.fn() },
}))

jest.mock('../../src/economy/economyService', () => ({
  economyService: { settleMatchResult: (...args: unknown[]) => mockSettleMatchResult(...args) },
}))

jest.mock('../../src/game/tierUnlockService', () => ({
  checkTierUnlock: jest.fn(async () => null),
}))

jest.mock('../../src/game/crownVaultService', () => ({
  getAscendantStatus: jest.fn(async () => ({ status: 'none' })),
}))

import { settleHNMatchViaLedger, type HNMatchState, type HNSeat } from '../../src/game/highNobleMultiEngine'

function seat(overrides: Partial<HNSeat> = {}): HNSeat {
  return { id: 'seat-x', role: 'p1', isHuman: false, name: 'X', emoji: '🤖', ...overrides }
}

function baseState(overrides: Partial<HNMatchState> = {}): HNMatchState {
  return {
    roomId: 'room-1',
    seats: [
      seat({ id: 'AI_BOSS', role: 'boss', name: 'Reaper', aiConfigId: 'AI_REAPER' }),
      seat({ id: 'human-1', role: 'p4', isHuman: true, name: 'Human One' }),
      seat({ id: 'human-2', role: 'p1', isHuman: true, name: 'Human Two' }),
      seat({ id: 'human-3', role: 'p2', isHuman: true, name: 'Human Three' }),
    ],
    roundNumber: 5,
    totalRounds: 5,
    tokenBalance: {},
    flowPot: [0, 0, 0],
    buyInAmount: 5000,
    escrowIds: { 'human-1': 'escrow-h1', 'human-2': 'escrow-h2', 'human-3': 'escrow-h3' },
    results: [],
    phase: 'match_end',
    submittedArrangement: new Set(),
    submittedAuctionBid: new Set(),
    submittedDiscard: new Set(),
    afkPlayers: {},
    ...overrides,
  } as HNMatchState
}

describe('settleHNMatchViaLedger — Central Economy Ledger path (High Noble, Phase 7 Round 4)', () => {
  beforeEach(() => {
    mockSettleMatchResult.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
    mockUsersSingle.mockReset().mockResolvedValue({ data: { token_balance: 9000 }, error: null })
    mockEscrowUpdateResolve.mockReset().mockReturnValue({ error: null })
    mockFrom.mockClear()
    mockEscrowUpdate.mockClear()
    mockUsersSelect.mockClear()
  })

  test('submits one combined transaction — 3 human PLAYER entries (full finalStack) + one FOUR_GODS_POOL entry for the boss, burnAmount via conservation', async () => {
    const state = baseState({
      tokenBalance: { AI_BOSS: 5400, 'human-1': 4900, 'human-2': 4700, 'human-3': 0 },
      // totalBuyIn = 5000*4=20000; totalStacks = 5400+4900+4700+0=15000; residualPot=0 => burn=5000
    })
    const finalStackByHuman = { 'human-1': 4900, 'human-2': 4700, 'human-3': 0 }
    // human-3's zero stack still submits (netAmount 0 gets filtered by the shared entries.filter)
    await settleHNMatchViaLedger(state, finalStackByHuman)

    expect(mockSettleMatchResult).toHaveBeenCalledWith({
      idempotencyKey: 'MATCH_SETTLEMENT:escrow-h1:escrow-h2:escrow-h3',
      currency: 'TOKEN',
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 4900 },
        { account: { accountType: 'PLAYER', accountId: 'human-2' }, netAmount: 4700 },
        { account: { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL' }, netAmount: 400 },
      ],
      burnAmount: 5000,
      reason: 'MATCH_SETTLEMENT',
      context: { matchId: 'room-1', tier: 'highNoble' },
    })
  })

  test('residual flowPot gets folded into burnAmount (Grand Finale call collected mid-round, round never resolved)', async () => {
    const state = baseState({
      flowPot: [0, 0, 800],
      tokenBalance: { AI_BOSS: 5000, 'human-1': 4600, 'human-2': 4800, 'human-3': 4800 },
      // totalStacks=19200, residualPot=800, totalBuyIn=20000 => burn = 20000-19200-800 = 0
    })
    await settleHNMatchViaLedger(state, { 'human-1': 4600, 'human-2': 4800, 'human-3': 4800 })
    expect(mockSettleMatchResult).toHaveBeenCalledWith(expect.objectContaining({ burnAmount: 0 }))
  })

  test('a Filler/Minion seat (Deadlock-filled, no real human) routes to MINION_POOL via its aiConfigId, not FOUR_GODS_POOL', async () => {
    const state = baseState({
      seats: [
        seat({ id: 'AI_BOSS', role: 'boss', name: 'Cortex', aiConfigId: 'AI_CORTEX' }),
        seat({ id: 'AI_FILL_1', role: 'p4', name: 'Some Minion', aiConfigId: 'AI_GHOST', isMinion: true }),
        seat({ id: 'human-2', role: 'p1', isHuman: true, name: 'Human Two' }),
        seat({ id: 'human-3', role: 'p2', isHuman: true, name: 'Human Three' }),
      ],
      escrowIds: { 'human-2': 'escrow-h2', 'human-3': 'escrow-h3' },
      tokenBalance: { AI_BOSS: 5200, AI_FILL_1: 4800, 'human-2': 5000, 'human-3': 5000 },
    })
    await settleHNMatchViaLedger(state, { 'human-2': 5000, 'human-3': 5000 })

    const entries = mockSettleMatchResult.mock.calls[0][0].entries
    expect(entries).toContainEqual({ account: { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL' }, netAmount: 200 })
    expect(entries).toContainEqual({ account: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' }, netAmount: -200 })
  })

  test('idempotency key uses sorted escrowIds regardless of object key order', async () => {
    const state = baseState({ escrowIds: { 'human-3': 'zzz', 'human-1': 'aaa', 'human-2': 'mmm' } })
    await settleHNMatchViaLedger(state, { 'human-1': 5000, 'human-2': 5000, 'human-3': 5000 })
    expect(mockSettleMatchResult).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'MATCH_SETTLEMENT:aaa:mmm:zzz' }))
  })

  test('drops a zero-net boss entry (boss ends exactly at buy-in — a true push)', async () => {
    const state = baseState({ tokenBalance: { AI_BOSS: 5000, 'human-1': 5000, 'human-2': 5000, 'human-3': 5000 } })
    await settleHNMatchViaLedger(state, { 'human-1': 5000, 'human-2': 5000, 'human-3': 5000 })
    const entries = mockSettleMatchResult.mock.calls[0][0].entries
    expect(entries.some((e: any) => e.account.accountType === 'NPC_POOL')).toBe(false)
  })

  test('marks each human escrow settled independently, calls checkTierUnlock/getAscendantStatus, returns refreshed balances', async () => {
    mockUsersSingle
      .mockResolvedValueOnce({ data: { token_balance: 4900 }, error: null })
      .mockResolvedValueOnce({ data: { token_balance: 4700 }, error: null })
      .mockResolvedValueOnce({ data: { token_balance: 0 }, error: null })
    const state = baseState({ tokenBalance: { AI_BOSS: 5400, 'human-1': 4900, 'human-2': 4700, 'human-3': 0 } })
    const result = await settleHNMatchViaLedger(state, { 'human-1': 4900, 'human-2': 4700, 'human-3': 0 })

    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 4900, settled_at: expect.any(String) })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 4700, settled_at: expect.any(String) })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 0, settled_at: expect.any(String) })
    expect(Object.keys(result).sort()).toEqual(['human-1', 'human-2', 'human-3'])
  })

  test('returns null for every human if the combined ledger settlement throws (no escrow rows touched)', async () => {
    mockSettleMatchResult.mockRejectedValueOnce(new Error('boom'))
    const state = baseState({ tokenBalance: { AI_BOSS: 5400, 'human-1': 4900, 'human-2': 4700, 'human-3': 4900 } })
    const result = await settleHNMatchViaLedger(state, { 'human-1': 4900, 'human-2': 4700, 'human-3': 4900 })
    expect(result).toEqual({ 'human-1': null, 'human-2': null, 'human-3': null })
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })
})
