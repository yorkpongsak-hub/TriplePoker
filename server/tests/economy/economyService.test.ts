// Mock setup must precede any import of economyService.ts (which imports config/supabase) —
// jest hoists jest.mock() above imports, but not these const declarations, so they have to be
// textually first too. Same layout as arenaSettlementPersistence.test.ts.
const mockRpc = jest.fn()
const mockSingle = jest.fn()
const mockEq = jest.fn(() => ({ single: mockSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { rpc: mockRpc, from: mockFrom },
}))

import type { ApplyTransactionInput, ApplyTransactionResult, LedgerEntryInput, PoolKey, ReconciliationRow } from '../../src/economy/economyTypes'
import { EconomyService, SupabaseEconomyGateway, type EconomyGateway } from '../../src/economy/economyService'

// ─────────────────────────────────────────────
// Part 1 — EconomyService business logic, driven by an injected fake gateway
// (same pattern as ArenaCrestLedger's ArenaLedgerGateway injection).
// ─────────────────────────────────────────────

class FakeGateway implements EconomyGateway {
  applyCalls: ApplyTransactionInput[] = []
  entriesByTransactionId: Record<number, LedgerEntryInput[]> = {}

  async apply(input: ApplyTransactionInput): Promise<ApplyTransactionResult> {
    this.applyCalls.push(input)
    return { transactionId: this.applyCalls.length, replayed: false }
  }

  async reconciliation(): Promise<ReconciliationRow[]> {
    return []
  }

  async readPoolBalance(_poolKey: PoolKey) {
    return { tokenBalance: 0, crestBalance: 0 }
  }

  async readTransactionEntries(transactionId: number): Promise<LedgerEntryInput[]> {
    return this.entriesByTransactionId[transactionId] ?? []
  }
}

describe('EconomyService — request shaping and invariants', () => {
  let gateway: FakeGateway
  let service: EconomyService

  beforeEach(() => {
    gateway = new FakeGateway()
    service = new EconomyService(gateway)
  })

  test('apply() rejects a missing idempotency key', async () => {
    await expect(service.apply({
      idempotencyKey: '', type: 'BURN', reason: 'SHOP_PURCHASE',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -100 }],
    })).rejects.toThrow('IDEMPOTENCY_KEY_REQUIRED')
  })

  test('apply() rejects an empty entries array', async () => {
    await expect(service.apply({
      idempotencyKey: 'k1', type: 'BURN', reason: 'SHOP_PURCHASE', entries: [],
    })).rejects.toThrow('ENTRIES_MUST_NOT_BE_EMPTY')
  })

  test('apply() rejects a zero-amount entry', async () => {
    await expect(service.apply({
      idempotencyKey: 'k1', type: 'BURN', reason: 'SHOP_PURCHASE',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: 0 }],
    })).rejects.toThrow('ENTRY_AMOUNT_MUST_BE_NONZERO_SAFE_INTEGER')
  })

  test('apply() rejects TRANSFER entries that do not sum to zero per currency', async () => {
    await expect(service.apply({
      idempotencyKey: 'k1', type: 'TRANSFER', reason: 'MATCH_SETTLEMENT',
      entries: [
        { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -500 },
        { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'TOKEN', amount: 400 },
      ],
    })).rejects.toThrow('TRANSFER_ENTRIES_MUST_SUM_TO_ZERO')
  })

  test('apply() rejects REVERSAL without reversalOfTransactionId in context', async () => {
    await expect(service.apply({
      idempotencyKey: 'k1', type: 'REVERSAL', reason: 'ADMIN_CORRECTION',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: 100 }],
    })).rejects.toThrow('REVERSAL_REQUIRES_REVERSAL_OF_TRANSACTION_ID')
  })

  test('transfer() builds a balanced two-entry TRANSFER, human loses / NPC pool gains', async () => {
    await service.transfer({
      idempotencyKey: 'match:m1:settle:p1',
      from: { accountType: 'PLAYER', accountId: 'p1' },
      to: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' },
      currency: 'TOKEN',
      amount: 500,
      reason: 'MATCH_SETTLEMENT',
    })
    expect(gateway.applyCalls).toHaveLength(1)
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('TRANSFER')
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', wallet: undefined, amount: -500 },
      { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'TOKEN', wallet: undefined, amount: 500 },
    ])
  })

  test('transfer() rejects a non-positive amount', async () => {
    await expect(service.transfer({
      idempotencyKey: 'k1',
      from: { accountType: 'PLAYER', accountId: 'p1' },
      to: { accountType: 'NPC_POOL', accountId: 'MINION_POOL' },
      currency: 'TOKEN', amount: 0, reason: 'MATCH_SETTLEMENT',
    })).rejects.toThrow('TRANSFER_AMOUNT_MUST_BE_POSITIVE')
  })

  test('burn() builds a single debit entry with type BURN', async () => {
    await service.burn({
      idempotencyKey: 'shop:order1:purchase',
      from: { accountType: 'PLAYER', accountId: 'p1' },
      currency: 'CREST', amount: 120, wallet: 'EARNED', reason: 'SHOP_PURCHASE',
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('BURN')
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'p1', currency: 'CREST', wallet: 'EARNED', amount: -120 },
    ])
  })

  test('mint() requires an actor and builds a single credit entry with type MINT', async () => {
    await expect(service.mint({
      idempotencyKey: 'k1', to: { accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE' },
      currency: 'TOKEN', amount: 1000, reason: 'ADMIN_CORRECTION', actor: '',
    })).rejects.toThrow('MINT_REQUIRES_ACTOR')

    await service.mint({
      idempotencyKey: 'k2', to: { accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE' },
      currency: 'TOKEN', amount: 1000, reason: 'ADMIN_CORRECTION', actor: 'admin:york',
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('MINT')
    expect(call.createdBy).toBe('admin:york')
    expect(call.entries).toEqual([
      { accountType: 'SYSTEM_RESERVE', accountId: 'SYSTEM_RESERVE', currency: 'TOKEN', wallet: undefined, amount: 1000 },
    ])
  })

  test('reverse() fetches the original entries and inverts every sign', async () => {
    gateway.entriesByTransactionId[42] = [
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -500 },
      { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'TOKEN', amount: 500 },
    ]
    await service.reverse({
      idempotencyKey: 'reversal:tx42', originalTransactionId: 42,
      reason: 'ADMIN_CORRECTION', actor: 'admin:york',
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('REVERSAL')
    expect(call.context).toEqual({ reversalOfTransactionId: 42 })
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: 500 },
      { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'TOKEN', amount: -500 },
    ])
  })

  test('reverse() rejects an original transaction with no entries', async () => {
    await expect(service.reverse({
      idempotencyKey: 'k1', originalTransactionId: 999, reason: 'ADMIN_CORRECTION', actor: 'admin:york',
    })).rejects.toThrow('ORIGINAL_TRANSACTION_HAS_NO_ENTRIES')
  })

  test('settleNpcMatchResult() — NPC won: human pays in, resolved via npcPoolResolver', async () => {
    await service.settleNpcMatchResult({
      idempotencyKey: 'match:m1:settle', humanUserId: 'p1', npcId: 'AI_REAPER',
      currency: 'TOKEN', amountToNpc: 500, reason: 'MATCH_SETTLEMENT',
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('TRANSFER')
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', wallet: undefined, amount: -500 },
      { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL', currency: 'TOKEN', wallet: undefined, amount: 500 },
    ])
    expect(call.context).toEqual({ npcGroup: 'FOUR_GODS_POOL' })
  })

  test('settleNpcMatchResult() — NPC lost: pool pays the human back', async () => {
    await service.settleNpcMatchResult({
      idempotencyKey: 'match:m2:settle', humanUserId: 'p1', npcId: 'MONARCH_BOSS',
      currency: 'TOKEN', amountToNpc: -800, reason: 'MATCH_SETTLEMENT',
    })
    const call = gateway.applyCalls[0]
    expect(call.entries).toEqual([
      { accountType: 'NPC_POOL', accountId: 'MONARCH_POOL', currency: 'TOKEN', wallet: undefined, amount: -800 },
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', wallet: undefined, amount: 800 },
    ])
  })

  test('settleNpcMatchResult() rejects a zero amount', async () => {
    await expect(service.settleNpcMatchResult({
      idempotencyKey: 'k1', humanUserId: 'p1', npcId: 'AI_REAPER',
      currency: 'TOKEN', amountToNpc: 0, reason: 'MATCH_SETTLEMENT',
    })).rejects.toThrow('SETTLE_NPC_MATCH_RESULT_AMOUNT_MUST_NOT_BE_ZERO')
  })

  test('settleNpcMatchResult() propagates UnknownNpcIdError for an unmapped npcId', async () => {
    await expect(service.settleNpcMatchResult({
      idempotencyKey: 'k1', humanUserId: 'p1', npcId: 'NOT_A_REAL_NPC',
      currency: 'TOKEN', amountToNpc: 100, reason: 'MATCH_SETTLEMENT',
    })).rejects.toThrow('UNKNOWN_NPC_ID: NOT_A_REAL_NPC')
  })

  test('settleNpcMatchResult() routes a Minion-displayed base AI id to MINION_POOL, not BOT_POOL', async () => {
    await service.settleNpcMatchResult({
      idempotencyKey: 'k1', humanUserId: 'p1', npcId: 'AI_SAGE', npcContext: { isMinionDisplay: true },
      currency: 'TOKEN', amountToNpc: 300, reason: 'MATCH_SETTLEMENT',
    })
    expect(gateway.applyCalls[0].entries[1]).toEqual(
      { accountType: 'NPC_POOL', accountId: 'MINION_POOL', currency: 'TOKEN', wallet: undefined, amount: 300 },
    )
  })

  test('settleMatchResult() submits type BURN (not TRANSFER) with one entry per participant, explicit burnAmount', async () => {
    await service.settleMatchResult({
      idempotencyKey: 'MATCH_SETTLEMENT:escrow-1',
      currency: 'TOKEN',
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 1264 },
        { account: { accountType: 'NPC_POOL', accountId: 'BOT_POOL' }, netAmount: -60 },
        { account: { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL' }, netAmount: -30 },
      ],
      burnAmount: 108,
      reason: 'MATCH_SETTLEMENT',
      context: { matchId: 'escrow-1', playerId: 'human-1', tier: 'initiate' },
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('BURN')
    expect(call.burnOverride).toEqual({ token: 108 })
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'human-1', currency: 'TOKEN', wallet: undefined, amount: 1264 },
      { accountType: 'NPC_POOL', accountId: 'BOT_POOL', currency: 'TOKEN', wallet: undefined, amount: -60 },
      { accountType: 'NPC_POOL', accountId: 'FOUR_GODS_POOL', currency: 'TOKEN', wallet: undefined, amount: -30 },
    ])
  })

  test('settleMatchResult() with CREST currency puts burnAmount on the crest side of burnOverride', async () => {
    await service.settleMatchResult({
      idempotencyKey: 'k1', currency: 'CREST', reason: 'MATCH_SETTLEMENT', burnAmount: 12,
      entries: [{ account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 50 }],
    })
    expect(gateway.applyCalls[0].burnOverride).toEqual({ crest: 12 })
  })

  test('settleMatchResult() rejects a negative burnAmount', async () => {
    await expect(service.settleMatchResult({
      idempotencyKey: 'k1', currency: 'TOKEN', reason: 'MATCH_SETTLEMENT', burnAmount: -1,
      entries: [{ account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 50 }],
    })).rejects.toThrow('BURN_AMOUNT_MUST_NOT_BE_NEGATIVE')
  })

  test('settleMatchResult() drops zero-net entries before submitting', async () => {
    await service.settleMatchResult({
      idempotencyKey: 'k1', currency: 'TOKEN', reason: 'MATCH_SETTLEMENT', burnAmount: 0,
      entries: [
        { account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 50 },
        { account: { accountType: 'NPC_POOL', accountId: 'BOT_POOL' }, netAmount: 0 },
      ],
    })
    expect(gateway.applyCalls[0].entries).toEqual([
      { accountType: 'PLAYER', accountId: 'human-1', currency: 'TOKEN', wallet: undefined, amount: 50 },
    ])
  })

  test('settleMatchResult() with every entry net-zero rejects via the empty-entries guard', async () => {
    await expect(service.settleMatchResult({
      idempotencyKey: 'k1', currency: 'TOKEN', reason: 'MATCH_SETTLEMENT', burnAmount: 0,
      entries: [{ account: { accountType: 'PLAYER', accountId: 'human-1' }, netAmount: 0 }],
    })).rejects.toThrow('ENTRIES_MUST_NOT_BE_EMPTY')
  })

  test('apply() rejects mintOverride on a non-BURN type', async () => {
    await expect(service.apply({
      idempotencyKey: 'k1', type: 'TRANSFER', reason: 'MATCH_SETTLEMENT',
      entries: [
        { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -100 },
        { accountType: 'NPC_POOL', accountId: 'BOT_POOL', currency: 'TOKEN', amount: 100 },
      ],
      mintOverride: { token: 100 },
    })).rejects.toThrow('MINT_OVERRIDE_ONLY_VALID_FOR_BURN_TYPE')
  })

  test('convert() — Token->Crown: one BURN transaction, entries on the same account in both currencies, both overrides set', async () => {
    await service.convert({
      idempotencyKey: 'TOKEN_TO_CROWN:p1:nonce1',
      account: { accountType: 'PLAYER', accountId: 'p1' },
      from: { currency: 'TOKEN', amount: 50_000 },
      to: { currency: 'CREST', amount: 120, wallet: 'EARNED' },
      reason: 'TOKEN_TO_CROWN',
      actor: 'token_to_crown_exchange',
    })
    const call = gateway.applyCalls[0]
    expect(call.type).toBe('BURN')
    expect(call.createdBy).toBe('token_to_crown_exchange')
    expect(call.entries).toEqual([
      { accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', wallet: undefined, amount: -50_000 },
      { accountType: 'PLAYER', accountId: 'p1', currency: 'CREST', wallet: 'EARNED', amount: 120 },
    ])
    expect(call.burnOverride).toEqual({ token: 50_000 })
    expect(call.mintOverride).toEqual({ crest: 120 })
  })

  test('convert() rejects non-positive amounts', async () => {
    await expect(service.convert({
      idempotencyKey: 'k1', account: { accountType: 'PLAYER', accountId: 'p1' },
      from: { currency: 'TOKEN', amount: 0 }, to: { currency: 'CREST', amount: 120 },
      reason: 'TOKEN_TO_CROWN', actor: 'system',
    })).rejects.toThrow('CONVERT_AMOUNTS_MUST_BE_POSITIVE')

    await expect(service.convert({
      idempotencyKey: 'k1', account: { accountType: 'PLAYER', accountId: 'p1' },
      from: { currency: 'TOKEN', amount: 50_000 }, to: { currency: 'CREST', amount: -1 },
      reason: 'TOKEN_TO_CROWN', actor: 'system',
    })).rejects.toThrow('CONVERT_AMOUNTS_MUST_BE_POSITIVE')
  })

  test('convert() rejects converting a currency into itself', async () => {
    await expect(service.convert({
      idempotencyKey: 'k1', account: { accountType: 'PLAYER', accountId: 'p1' },
      from: { currency: 'TOKEN', amount: 100 }, to: { currency: 'TOKEN', amount: 100 },
      reason: 'TOKEN_TO_CROWN', actor: 'system',
    })).rejects.toThrow('CONVERT_CURRENCIES_MUST_DIFFER')
  })
})

// ─────────────────────────────────────────────
// Part 2 — SupabaseEconomyGateway call-shape, mocking supabaseAdmin directly
// (same pattern as arenaSettlementPersistence.test.ts).
// ─────────────────────────────────────────────

describe('SupabaseEconomyGateway — RPC/query call shape', () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockSingle.mockReset()
    mockEq.mockClear()
    mockSelect.mockClear()
    mockFrom.mockClear()
  })

  test('apply() calls economy_apply_transaction with snake_case params and defaults', async () => {
    mockRpc.mockResolvedValue({ data: [{ transaction_id: 7, replayed: false }], error: null })
    const gateway = new SupabaseEconomyGateway()
    const result = await gateway.apply({
      idempotencyKey: 'k1', type: 'BURN', reason: 'SHOP_PURCHASE',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -100 }],
    })
    expect(mockRpc).toHaveBeenCalledWith('economy_apply_transaction', {
      p_idempotency_key: 'k1',
      p_type: 'BURN',
      p_reason: 'SHOP_PURCHASE',
      p_entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: -100 }],
      p_metadata: {},
      p_context: {},
      p_created_by: null,
      p_burn_override: null,
      p_mint_override: null,
    })
    expect(result).toEqual({ transactionId: 7, replayed: false })
  })

  test('apply() passes burnOverride through as p_burn_override, defaulting missing sides to 0', async () => {
    mockRpc.mockResolvedValue({ data: [{ transaction_id: 8, replayed: false }], error: null })
    const gateway = new SupabaseEconomyGateway()
    await gateway.apply({
      idempotencyKey: 'k2', type: 'BURN', reason: 'MATCH_SETTLEMENT',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'TOKEN', amount: 1264 }],
      burnOverride: { token: 108 },
    })
    expect(mockRpc).toHaveBeenCalledWith('economy_apply_transaction', expect.objectContaining({
      p_burn_override: { token: 108, crest: 0 },
      p_mint_override: null,
    }))
  })

  test('apply() passes mintOverride through as p_mint_override, defaulting missing sides to 0', async () => {
    mockRpc.mockResolvedValue({ data: [{ transaction_id: 9, replayed: false }], error: null })
    const gateway = new SupabaseEconomyGateway()
    await gateway.apply({
      idempotencyKey: 'k3', type: 'BURN', reason: 'TOKEN_TO_CROWN',
      entries: [{ accountType: 'PLAYER', accountId: 'p1', currency: 'CREST', amount: 120 }],
      mintOverride: { crest: 120 },
    })
    expect(mockRpc).toHaveBeenCalledWith('economy_apply_transaction', expect.objectContaining({
      p_burn_override: null,
      p_mint_override: { token: 0, crest: 120 },
    }))
  })

  test('reconciliation() maps snake_case rows to camelCase', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        currency: 'TOKEN', genesis: 100000000, cumulative_mint: 0, cumulative_burn: 500,
        expected_supply: 99999500, player_pool: 40000, npc_pool: 500, system_reserve: 99959000,
        actual_supply: 99999500, difference: 0,
      }],
      error: null,
    })
    const gateway = new SupabaseEconomyGateway()
    const rows = await gateway.reconciliation()
    expect(mockRpc).toHaveBeenCalledWith('economy_reconciliation')
    expect(rows).toEqual([{
      currency: 'TOKEN', genesis: 100000000, cumulativeMint: 0, cumulativeBurn: 500,
      expectedSupply: 99999500, playerPool: 40000, npcPool: 500, systemReserve: 99959000,
      actualSupply: 99999500, difference: 0,
    }])
  })

  test('readPoolBalance() queries economy_pool_accounts by pool_key', async () => {
    mockSingle.mockResolvedValue({ data: { token_balance: 1000, crest_balance: 50 }, error: null })
    const gateway = new SupabaseEconomyGateway()
    const result = await gateway.readPoolBalance('MONARCH_POOL')
    expect(mockFrom).toHaveBeenCalledWith('economy_pool_accounts')
    expect(mockSelect).toHaveBeenCalledWith('token_balance, crest_balance')
    expect(mockEq).toHaveBeenCalledWith('pool_key', 'MONARCH_POOL')
    expect(result).toEqual({ tokenBalance: 1000, crestBalance: 50 })
  })
})
