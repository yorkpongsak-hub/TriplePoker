// gameLoopAdeptLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 2 (Adept)
// Covers settleAdeptMatchViaLedger() — combined single-transaction settlement for 2H+2AI,
// isolated from Round 1's escrow-per-human tests.

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

import { settleAdeptMatchViaLedger, type MultiMatchState } from '../../src/game/gameLoop'

function baseState(overrides: Partial<MultiMatchState> = {}): MultiMatchState {
  return {
    roomId: 'room-1',
    tier: 'adept',
    humanPlayerIds: ['human-1', 'human-2'],
    aiPlayerIds: ['AI_SAGE', 'AI_RECKLESS'],
    roundNumber: 5,
    totalRounds: 5,
    tokenBalance: {
      'human-1': 2100, 'human-2': 1800,
      AI_SAGE: 1950, AI_RECKLESS: 2150,
    },
    buyInAmount: 2000,
    escrowIds: { 'human-1': 'escrow-h1', 'human-2': 'escrow-h2' },
    pot: [0, 0, 0],
    feeRake: 70,
    autoSortUsed: {},
    results: [],
    phase: 'match_end',
    submittedArrangements: {},
    seatOrder: [],
    afkPlayers: {},
    ...overrides,
  }
}

describe('settleAdeptMatchViaLedger — Central Economy Ledger path (Adept, Phase 7 Round 2)', () => {
  beforeEach(() => {
    mockSettleMatchResult.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
    mockUsersSingle.mockReset().mockResolvedValue({ data: { token_balance: 5000 }, error: null })
    mockEscrowUpdateResolve.mockReset().mockReturnValue({ error: null })
    mockFrom.mockClear()
    mockEscrowUpdate.mockClear()
    mockUsersSelect.mockClear()
  })

  test('submits one combined BURN-style settlement — human entries use FULL stack (not net; buy-in already deducted separately by escrow-start), AI entries use true net, explicit burnAmount', async () => {
    await settleAdeptMatchViaLedger(baseState())

    expect(mockSettleMatchResult).toHaveBeenCalledTimes(1)
    expect(mockSettleMatchResult).toHaveBeenCalledWith({
      idempotencyKey: 'MATCH_SETTLEMENT:escrow-h1:escrow-h2',
      currency: 'TOKEN',
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 2100 },
        { account: { accountType: 'PLAYER', accountId: 'human-2' }, netAmount: 1800 },
        { account: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' }, netAmount: -50 },
        { account: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' }, netAmount: 150 },
      ],
      burnAmount: 70,
      reason: 'MATCH_SETTLEMENT',
      context: { matchId: 'room-1', tier: 'adept' },
    })
  })

  test('idempotency key uses sorted escrowIds regardless of object key order', async () => {
    await settleAdeptMatchViaLedger(baseState({ escrowIds: { 'human-2': 'zzz-escrow', 'human-1': 'aaa-escrow' } }))
    expect(mockSettleMatchResult).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'MATCH_SETTLEMENT:aaa-escrow:zzz-escrow' }),
    )
  })

  test('drops a human only when their FULL stack is zero, drops an AI when its net is zero (a true push)', async () => {
    await settleAdeptMatchViaLedger(baseState({
      tokenBalance: { 'human-1': 0, 'human-2': 1900, AI_SAGE: 2000, AI_RECKLESS: 2100 },
    }))
    const entries = mockSettleMatchResult.mock.calls[0][0].entries
    expect(entries).toEqual([
      { account: { accountType: 'PLAYER', accountId: 'human-2' }, netAmount: 1900 },
      { account: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' }, netAmount: 100 },
    ])
  })

  test('marks each human escrow settled independently and returns their refreshed balances', async () => {
    mockUsersSingle
      .mockResolvedValueOnce({ data: { token_balance: 2100 }, error: null })
      .mockResolvedValueOnce({ data: { token_balance: 1800 }, error: null })

    const result = await settleAdeptMatchViaLedger(baseState())

    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 2100, settled_at: expect.any(String) })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 1800, settled_at: expect.any(String) })
    expect(Object.keys(result).sort()).toEqual(['human-1', 'human-2'])
  })

  test('skips settleMatchResult when both humans end at zero stack and every AI nets to zero, still marks both escrows settled', async () => {
    await settleAdeptMatchViaLedger(baseState({
      tokenBalance: { 'human-1': 0, 'human-2': 0, AI_SAGE: 2000, AI_RECKLESS: 2000 },
    }))
    expect(mockSettleMatchResult).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).toHaveBeenCalledTimes(2)
  })

  test('returns null for every human if the combined ledger settlement throws (no escrow rows touched)', async () => {
    mockSettleMatchResult.mockRejectedValueOnce(new Error('boom'))
    const result = await settleAdeptMatchViaLedger(baseState())
    expect(result).toEqual({ 'human-1': null, 'human-2': null })
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  test('one human failing to mark settled does not block the other from succeeding', async () => {
    mockEscrowUpdateResolve
      .mockReturnValueOnce({ error: { message: 'boom' } })
      .mockReturnValueOnce({ error: null })
    const result = await settleAdeptMatchViaLedger(baseState())
    const values = Object.values(result)
    expect(values).toContain(null)
    expect(values.some(v => v === 5000)).toBe(true)
  })
})
