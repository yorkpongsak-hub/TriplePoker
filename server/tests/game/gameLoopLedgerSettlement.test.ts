// gameLoopLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 1 (Initiate only)
// Covers settleEscrow()'s new ledger branch (settleEscrowViaLedger) in isolation from the
// pre-existing escrow-RPC-only tests in escrowAtomic.test.ts.

const mockSettleMatchResult = jest.fn()
const mockRpc = jest.fn()

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
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
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

import { settleEscrow } from '../../src/game/gameLoop'

describe('settleEscrow — Central Economy Ledger path (Initiate, Phase 7 Round 1)', () => {
  beforeEach(() => {
    mockSettleMatchResult.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
    mockRpc.mockReset()
    mockUsersSingle.mockReset().mockResolvedValue({ data: { token_balance: 5000 }, error: null })
    mockEscrowUpdateResolve.mockReset().mockReturnValue({ error: null })
    mockFrom.mockClear()
    mockEscrowUpdate.mockClear()
    mockUsersSelect.mockClear()
  })

  test('builds human entry from the FULL finalStack (not net — buy-in already deducted separately by escrow-start), drops zero-net NPC legs', async () => {
    const result = await settleEscrow('human-1', 'escrow-1', 600, {
      tier: 'initiate',
      burnAmount: 8,
      npcNets: [
        { npcId: 'AI_SAGE', amount: -50 },
        { npcId: 'AI_RECKLESS', amount: 0 }, // must be dropped — zero net
        { npcId: 'AI_GHOST', amount: -50 },
      ],
    })

    expect(mockSettleMatchResult).toHaveBeenCalledWith({
      idempotencyKey: 'MATCH_SETTLEMENT:escrow-1',
      currency: 'TOKEN',
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 600 },
        { account: { accountType: 'NPC_POOL', accountId: 'BOT_POOL' }, netAmount: -50 },
        { account: { accountType: 'NPC_POOL', accountId: 'BOT_POOL' }, netAmount: -50 },
      ],
      burnAmount: 8,
      reason: 'MATCH_SETTLEMENT',
      context: { matchId: 'escrow-1', playerId: 'human-1', tier: 'initiate' },
    })
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 600, settled_at: expect.any(String) })
    expect(mockRpc).not.toHaveBeenCalled() // old settle_match_escrow RPC must never fire on this path
    expect(result).toBe(5000)
  })

  test('skips settleMatchResult entirely when finalStack and every NPC net are zero, still marks escrow settled', async () => {
    const result = await settleEscrow('human-1', 'escrow-2', 0, {
      tier: 'initiate',
      burnAmount: 0,
      npcNets: [{ npcId: 'AI_SAGE', amount: 0 }, { npcId: 'AI_RECKLESS', amount: 0 }, { npcId: 'AI_GHOST', amount: 0 }],
    })
    expect(mockSettleMatchResult).not.toHaveBeenCalled()
    expect(mockEscrowUpdate).toHaveBeenCalledWith({ status: 'settled', final_stack: 0, settled_at: expect.any(String) })
    expect(result).toBe(5000)
  })

  test('returns null and never marks escrow settled if the ledger settlement throws', async () => {
    mockSettleMatchResult.mockRejectedValueOnce(new Error('boom'))
    const result = await settleEscrow('human-1', 'escrow-3', 500, {
      tier: 'initiate', burnAmount: 10, npcNets: [{ npcId: 'AI_SAGE', amount: -100 }],
    })
    expect(result).toBeNull()
    expect(mockEscrowUpdate).not.toHaveBeenCalled()
  })

  test('returns null if the match_escrow status update fails', async () => {
    mockEscrowUpdateResolve.mockReturnValue({ error: { message: 'boom' } })
    const result = await settleEscrow('human-1', 'escrow-4', 500, {
      tier: 'initiate', burnAmount: 10, npcNets: [{ npcId: 'AI_SAGE', amount: -100 }],
    })
    expect(result).toBeNull()
  })

  test('a non-initiate tier ignores the ledger param and falls back to the old settle_match_escrow RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: 999, error: null })
    const result = await settleEscrow('human-1', 'escrow-5', 500, {
      tier: 'mastermind', burnAmount: 10, npcNets: [{ npcId: 'AI_SAGE', amount: -100 }],
    })
    expect(mockSettleMatchResult).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('settle_match_escrow', {
      p_user_id: 'human-1', p_escrow_id: 'escrow-5', p_final_stack: 500,
    })
    expect(result).toBe(999)
  })
})
