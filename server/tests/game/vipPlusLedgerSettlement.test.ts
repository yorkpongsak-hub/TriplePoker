// vipPlusLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 5 (VIP Plus)
// Covers settleVipPlusMatchViaLedger() — combined single-transaction settlement for 3-5 humans,
// the first tier in this series with zero NPC/AI economy (no NPC_POOL entries at all).

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

import { settleVipPlusMatchViaLedger, type VipPlusMatchState, type VipPlusRankingRow } from '../../src/game/vipPlusMatchEngine'

function baseState(overrides: Partial<VipPlusMatchState> = {}): VipPlusMatchState {
  return {
    roomId: 'room-1',
    feeRake: 0,
    auctionBurn: 0,
    escrowIds: {},
    wager: { bettingTier: 'mastermind' } as any,
    ...overrides,
  } as VipPlusMatchState
}

function row(overrides: Partial<VipPlusRankingRow> = {}): VipPlusRankingRow {
  return {
    seat: 'H1', playerId: 'p1', displayName: 'P1', netToken: 0, totalGroupWins: 0,
    g3Wins: 0, finalStack: 0, rank: 1, isWinner: false, profitFee: 0,
    ...overrides,
  } as VipPlusRankingRow
}

describe('settleVipPlusMatchViaLedger — Central Economy Ledger path (VIP Plus, Phase 7 Round 5)', () => {
  beforeEach(() => {
    mockSettleMatchResult.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
    mockUsersSingle.mockReset().mockResolvedValue({ data: { token_balance: 5000 }, error: null })
    mockEscrowUpdateResolve.mockReset().mockReturnValue({ error: null })
    mockFrom.mockClear()
    mockEscrowUpdate.mockClear()
    mockUsersSelect.mockClear()
  })

  test('submits one combined transaction — one PLAYER entry per human (full finalStack), no NPC_POOL entries ever', async () => {
    const state = baseState({
      feeRake: 300, auctionBurn: 150,
      escrowIds: { p1: 'escrow-p1', p2: 'escrow-p2', p3: 'escrow-p3' },
    })
    const rankings = [
      row({ seat: 'H1', playerId: 'p1', finalStack: 8100 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 20300 }),
      row({ seat: 'H3', playerId: 'p3', finalStack: 1450 }),
    ]
    await settleVipPlusMatchViaLedger(state, rankings)

    expect(mockSettleMatchResult).toHaveBeenCalledWith({
      idempotencyKey: 'MATCH_SETTLEMENT:escrow-p1:escrow-p2:escrow-p3',
      currency: 'TOKEN',
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'p1' }, netAmount: 8100 },
        { account: { accountType: 'PLAYER', accountId: 'p2' }, netAmount: 20300 },
        { account: { accountType: 'PLAYER', accountId: 'p3' }, netAmount: 1450 },
      ],
      burnAmount: 450, // feeRake 300 + auctionBurn 150 — both must fold into burnAmount
      reason: 'MATCH_SETTLEMENT',
      context: { matchId: 'room-1', tier: 'vipPlus' },
      metadata: { bettingTier: 'mastermind' },
    })
  })

  test('auctionBurn alone (no feeRake) still contributes to burnAmount — the exact bug class this round is designed to avoid', async () => {
    const state = baseState({ feeRake: 0, auctionBurn: 900, escrowIds: { p1: 'e1' } })
    await settleVipPlusMatchViaLedger(state, [row({ playerId: 'p1', finalStack: 1000 })])
    expect(mockSettleMatchResult).toHaveBeenCalledWith(expect.objectContaining({ burnAmount: 900 }))
  })

  test('idempotency key uses sorted escrowIds regardless of object key order', async () => {
    const state = baseState({ escrowIds: { p3: 'zzz', p1: 'aaa', p2: 'mmm' } })
    await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 1000 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 1000 }),
      row({ seat: 'H3', playerId: 'p3', finalStack: 1000 }),
    ])
    expect(mockSettleMatchResult).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'MATCH_SETTLEMENT:aaa:mmm:zzz' }))
  })

  test('drops a zero-net player entry (final stack of exactly zero — a true wipeout, not a push, still gets marked settled)', async () => {
    const state = baseState({ escrowIds: { p1: 'e1', p2: 'e2' } })
    await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 0 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 500 }),
    ])
    const entries = mockSettleMatchResult.mock.calls[0][0].entries
    expect(entries).toEqual([{ account: { accountType: 'PLAYER', accountId: 'p2' }, netAmount: 500 }])
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 0, settled_at: expect.any(String) })
  })

  test('reduced table (3 humans, not 5) works the same way — no assumption of exactly 5 seats', async () => {
    const state = baseState({ escrowIds: { p1: 'e1', p2: 'e2', p3: 'e3' } })
    const result = await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 1000 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 2000 }),
      row({ seat: 'H3', playerId: 'p3', finalStack: 3000 }),
    ])
    expect(Object.keys(result).sort()).toEqual(['H1', 'H2', 'H3'])
  })

  test('marks each seat escrow settled independently, calls checkTierUnlock/getAscendantStatus, returns refreshed balances keyed by seat', async () => {
    mockUsersSingle
      .mockResolvedValueOnce({ data: { token_balance: 8100 }, error: null })
      .mockResolvedValueOnce({ data: { token_balance: 20300 }, error: null })
    const state = baseState({ escrowIds: { p1: 'escrow-p1', p2: 'escrow-p2' } })
    const result = await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 8100 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 20300 }),
    ])
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 8100, settled_at: expect.any(String) })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 20300, settled_at: expect.any(String) })
    expect(result).toEqual({ H1: 8100, H2: 20300 })
  })

  test('returns null for every seat if the combined ledger settlement throws (no escrow rows touched)', async () => {
    mockSettleMatchResult.mockRejectedValueOnce(new Error('boom'))
    const state = baseState({ escrowIds: { p1: 'e1', p2: 'e2' } })
    const result = await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 1000 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 2000 }),
    ])
    expect(result).toEqual({ H1: null, H2: null })
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  test('skips settleMatchResult entirely when every entry nets to zero, still marks escrows settled', async () => {
    const state = baseState({ feeRake: 0, auctionBurn: 0, escrowIds: { p1: 'e1', p2: 'e2' } })
    const result = await settleVipPlusMatchViaLedger(state, [
      row({ seat: 'H1', playerId: 'p1', finalStack: 0 }),
      row({ seat: 'H2', playerId: 'p2', finalStack: 0 }),
    ])
    expect(mockSettleMatchResult).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ H1: 5000, H2: 5000 })
  })
})
