import { supabaseAdmin } from '../config/supabase'
import { resolveNpcPoolKey, type ResolveNpcPoolContext } from './npcPoolResolver'
import type {
  AccountRef,
  ApplyTransactionInput,
  ApplyTransactionResult,
  BurnOverride,
  Currency,
  EconomyContext,
  EconomyReason,
  LedgerEntryInput,
  PoolKey,
  ReconciliationRow,
  Wallet,
} from './economyTypes'

export interface EconomyGateway {
  apply(input: ApplyTransactionInput): Promise<ApplyTransactionResult>
  reconciliation(): Promise<ReconciliationRow[]>
  readPoolBalance(poolKey: PoolKey): Promise<{ tokenBalance: number; crestBalance: number } | null>
  readTransactionEntries(transactionId: number): Promise<LedgerEntryInput[]>
}

export class SupabaseEconomyGateway implements EconomyGateway {
  async apply(input: ApplyTransactionInput): Promise<ApplyTransactionResult> {
    const { data, error } = await supabaseAdmin.rpc('economy_apply_transaction', {
      p_idempotency_key: input.idempotencyKey,
      p_type: input.type,
      p_reason: input.reason,
      p_entries: input.entries,
      p_metadata: input.metadata ?? {},
      p_context: input.context ?? {},
      p_created_by: input.createdBy ?? null,
      p_burn_override: input.burnOverride
        ? { token: input.burnOverride.token ?? 0, crest: input.burnOverride.crest ?? 0 }
        : null,
      p_mint_override: input.mintOverride
        ? { token: input.mintOverride.token ?? 0, crest: input.mintOverride.crest ?? 0 }
        : null,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('ECONOMY_APPLY_TRANSACTION_EMPTY_RESULT')
    return { transactionId: Number(row.transaction_id), replayed: Boolean(row.replayed) }
  }

  async reconciliation(): Promise<ReconciliationRow[]> {
    const { data, error } = await supabaseAdmin.rpc('economy_reconciliation')
    if (error) throw new Error(error.message)
    const rows: any[] = Array.isArray(data) ? data : []
    return rows.map(r => ({
      currency: r.currency,
      genesis: Number(r.genesis),
      cumulativeMint: Number(r.cumulative_mint),
      cumulativeBurn: Number(r.cumulative_burn),
      expectedSupply: Number(r.expected_supply),
      playerPool: Number(r.player_pool),
      npcPool: Number(r.npc_pool),
      systemReserve: Number(r.system_reserve),
      actualSupply: Number(r.actual_supply),
      difference: Number(r.difference),
    }))
  }

  async readPoolBalance(poolKey: PoolKey): Promise<{ tokenBalance: number; crestBalance: number } | null> {
    const { data, error } = await supabaseAdmin
      .from('economy_pool_accounts')
      .select('token_balance, crest_balance')
      .eq('pool_key', poolKey)
      .single()
    if (error || !data) return null
    return { tokenBalance: Number(data.token_balance), crestBalance: Number(data.crest_balance) }
  }

  async readTransactionEntries(transactionId: number): Promise<LedgerEntryInput[]> {
    const { data, error } = await supabaseAdmin
      .from('economy_ledger_entries')
      .select('account_type, account_id, currency, wallet, amount')
      .eq('transaction_id', transactionId)
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({
      accountType: r.account_type,
      accountId: r.account_id,
      currency: r.currency,
      wallet: r.wallet ?? undefined,
      amount: Number(r.amount),
    }))
  }
}

function assertNonEmptyEntries(entries: LedgerEntryInput[]): void {
  if (!entries.length) throw new Error('ENTRIES_MUST_NOT_BE_EMPTY')
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) {
      throw new Error('ENTRY_AMOUNT_MUST_BE_NONZERO_SAFE_INTEGER')
    }
  }
}

function assertTransferSumsToZero(entries: LedgerEntryInput[]): void {
  const sums: Record<Currency, number> = { TOKEN: 0, CREST: 0 }
  for (const entry of entries) sums[entry.currency] += entry.amount
  if (sums.TOKEN !== 0 || sums.CREST !== 0) {
    throw new Error('TRANSFER_ENTRIES_MUST_SUM_TO_ZERO')
  }
}

interface MovementParams {
  idempotencyKey: string
  currency: Currency
  amount: number
  wallet?: Wallet
  reason: EconomyReason
  context?: EconomyContext
  metadata?: Record<string, unknown>
  createdBy?: string
}

/**
 * Single choke point for every Token/Crown(Crest) balance mutation — client code and gameplay
 * services must never touch users.token_balance/crown_balance or economy_pool_accounts directly.
 * Mirrors the ArenaCrestLedger gateway pattern (server/src/arena/economy/arenaCrestLedger.ts).
 */
export class EconomyService {
  constructor(private readonly gateway: EconomyGateway = new SupabaseEconomyGateway()) {}

  async apply(input: ApplyTransactionInput): Promise<ApplyTransactionResult> {
    if (!input.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED')
    assertNonEmptyEntries(input.entries)
    if (input.type === 'TRANSFER') assertTransferSumsToZero(input.entries)
    if (input.type === 'REVERSAL' && !input.context?.reversalOfTransactionId) {
      throw new Error('REVERSAL_REQUIRES_REVERSAL_OF_TRANSACTION_ID')
    }
    if (input.burnOverride && input.type !== 'BURN') {
      throw new Error('BURN_OVERRIDE_ONLY_VALID_FOR_BURN_TYPE')
    }
    if (input.mintOverride && input.type !== 'BURN') {
      throw new Error('MINT_OVERRIDE_ONLY_VALID_FOR_BURN_TYPE')
    }
    return this.gateway.apply(input)
  }

  /** Moves currency between two accounts — the pair always sums to zero per currency. */
  async transfer(params: MovementParams & { from: AccountRef; to: AccountRef }): Promise<ApplyTransactionResult> {
    if (params.amount <= 0) throw new Error('TRANSFER_AMOUNT_MUST_BE_POSITIVE')
    const entries: LedgerEntryInput[] = [
      { ...params.from, currency: params.currency, wallet: params.wallet, amount: -params.amount },
      { ...params.to, currency: params.currency, wallet: params.wallet, amount: params.amount },
    ]
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'TRANSFER',
      reason: params.reason,
      entries,
      metadata: params.metadata,
      context: params.context,
      createdBy: params.createdBy,
    })
  }

  /**
   * Settles the net result of a match between a human player and an AI/NPC seat — resolves the
   * NPC id to its shared pool (npcPoolResolver.ts) and transfers the net amount accordingly.
   * `amountToNpc` is signed from the NPC's perspective: positive = the NPC won (human pays in),
   * negative = the NPC lost (NPC pays out). Mirrors how settleEscrow already only persists a
   * human's final net stack for a match, not every intermediate hand — the NPC pool only ever
   * receives/pays the net result at settlement, never a per-match buy-in draw-down (see the
   * design note in the Central Economy plan: NPC pools start at 0 and only grow from real wins).
   */
  async settleNpcMatchResult(params: {
    idempotencyKey: string
    humanUserId: string
    npcId: string
    npcContext?: ResolveNpcPoolContext
    currency: Currency
    amountToNpc: number
    wallet?: Wallet
    reason: EconomyReason
    context?: EconomyContext
    metadata?: Record<string, unknown>
    createdBy?: string
  }): Promise<ApplyTransactionResult> {
    if (params.amountToNpc === 0) throw new Error('SETTLE_NPC_MATCH_RESULT_AMOUNT_MUST_NOT_BE_ZERO')
    const poolKey = resolveNpcPoolKey(params.npcId, params.npcContext)
    const human: AccountRef = { accountType: 'PLAYER', accountId: params.humanUserId }
    const pool: AccountRef = { accountType: 'NPC_POOL', accountId: poolKey }
    const context: EconomyContext = { npcGroup: poolKey, ...params.context }
    return params.amountToNpc > 0
      ? this.transfer({ ...params, from: human, to: pool, amount: params.amountToNpc, context })
      : this.transfer({ ...params, from: pool, to: human, amount: -params.amountToNpc, context })
  }

  /**
   * Settles the net result of a completed match across every participant at once (a human plus
   * one or more AI/NPC seats) in a single transaction. Submitted as type 'BURN' rather than
   * 'TRANSFER' because a raked match's entries never sum to zero — but critically, each entry's
   * `netAmount` must be the amount that actually needs to move into that REAL account, not an
   * abstract "net game result": for a human this is their full `finalStack` (their buy-in was
   * already deducted separately by the untouched escrow-start RPC, so crediting only their net
   * game result would short them by exactly one buy-in — a real bug found via live testing
   * 2026-08-12), while for an NPC pool (which never had a separate buy-in step) it's their true
   * win/loss net.
   *
   * Because the entries can therefore include an untracked-money-returning component (the human's
   * buy-in reappearing), BURN's usual implicit `SUM(-amount)` burn calculation would be wrong —
   * `burnAmount` must be passed explicitly (the caller already knows the true rake from
   * tokenFlow.ts's own bookkeeping, e.g. `state.feeRake`), decoupling "how much moves into each
   * account" from "how much was actually burned."
   */
  async settleMatchResult(params: {
    idempotencyKey: string
    currency: Currency
    entries: Array<{ account: AccountRef; netAmount: number; wallet?: Wallet }>
    burnAmount: number
    reason: EconomyReason
    context?: EconomyContext
    metadata?: Record<string, unknown>
    createdBy?: string
  }): Promise<ApplyTransactionResult> {
    if (params.burnAmount < 0) throw new Error('BURN_AMOUNT_MUST_NOT_BE_NEGATIVE')
    const entries: LedgerEntryInput[] = params.entries
      .filter(e => e.netAmount !== 0)
      .map(e => ({ ...e.account, currency: params.currency, wallet: e.wallet, amount: e.netAmount }))
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'BURN',
      reason: params.reason,
      entries,
      burnOverride: params.currency === 'TOKEN' ? { token: params.burnAmount } : { crest: params.burnAmount },
      metadata: params.metadata,
      context: params.context,
      createdBy: params.createdBy,
    })
  }

  /**
   * Converts one currency into another for the same player, atomically, in a single transaction —
   * the source currency is burned (destroyed) and the target currency is minted (created). TOKEN
   * and CREST are governed by fully independent Genesis/Mint/Burn pools, so this is not a
   * value-preserving transfer — it's a designed sink+faucet pair at whatever rate the caller
   * supplies (currently only Token->Crown, crownVaultService.ts). Submitted as type 'BURN' with
   * both burnOverride and mintOverride set, so the whole conversion stays inside one atomic RPC
   * call — two separate burn()+mint() calls would risk losing money if the second failed after the
   * first succeeded.
   */
  async convert(params: {
    idempotencyKey: string
    account: AccountRef
    from: { currency: Currency; amount: number }
    to: { currency: Currency; amount: number; wallet?: Wallet }
    reason: EconomyReason
    actor: string
    context?: EconomyContext
    metadata?: Record<string, unknown>
  }): Promise<ApplyTransactionResult> {
    if (params.from.amount <= 0 || params.to.amount <= 0) throw new Error('CONVERT_AMOUNTS_MUST_BE_POSITIVE')
    if (params.from.currency === params.to.currency) throw new Error('CONVERT_CURRENCIES_MUST_DIFFER')
    const entries: LedgerEntryInput[] = [
      { ...params.account, currency: params.from.currency, amount: -params.from.amount },
      { ...params.account, currency: params.to.currency, wallet: params.to.wallet, amount: params.to.amount },
    ]
    const overrideKey = (currency: Currency) => (currency === 'TOKEN' ? 'token' : 'crest') as keyof BurnOverride
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'BURN',
      reason: params.reason,
      entries,
      burnOverride: { [overrideKey(params.from.currency)]: params.from.amount },
      mintOverride: { [overrideKey(params.to.currency)]: params.to.amount },
      metadata: params.metadata,
      context: params.context,
      createdBy: params.actor,
    })
  }

  /** Removes currency from an account permanently — decrements active supply, no counterpart credit. */
  async burn(params: MovementParams & { from: AccountRef }): Promise<ApplyTransactionResult> {
    if (params.amount <= 0) throw new Error('BURN_AMOUNT_MUST_BE_POSITIVE')
    const entries: LedgerEntryInput[] = [
      { ...params.from, currency: params.currency, wallet: params.wallet, amount: -params.amount },
    ]
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'BURN',
      reason: params.reason,
      entries,
      metadata: params.metadata,
      context: params.context,
      createdBy: params.createdBy,
    })
  }

  /** Admin/system-authorized only — creates currency with no source. Never call from normal gameplay (spec §23). */
  async mint(params: MovementParams & { to: AccountRef; actor: string }): Promise<ApplyTransactionResult> {
    if (params.amount <= 0) throw new Error('MINT_AMOUNT_MUST_BE_POSITIVE')
    if (!params.actor) throw new Error('MINT_REQUIRES_ACTOR')
    const entries: LedgerEntryInput[] = [
      { ...params.to, currency: params.currency, wallet: params.wallet, amount: params.amount },
    ]
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'MINT',
      reason: params.reason,
      entries,
      metadata: params.metadata,
      context: params.context,
      createdBy: params.actor,
    })
  }

  /** Reverses a completed transaction by re-applying its entries with inverted signs (spec §22). */
  async reverse(params: {
    idempotencyKey: string
    originalTransactionId: number
    reason: EconomyReason
    actor: string
    originalEntries?: LedgerEntryInput[]
  }): Promise<ApplyTransactionResult> {
    const entries = params.originalEntries ?? (await this.gateway.readTransactionEntries(params.originalTransactionId))
    if (!entries.length) throw new Error('ORIGINAL_TRANSACTION_HAS_NO_ENTRIES')
    const inverted = entries.map(e => ({ ...e, amount: -e.amount }))
    return this.apply({
      idempotencyKey: params.idempotencyKey,
      type: 'REVERSAL',
      reason: params.reason,
      entries: inverted,
      context: { reversalOfTransactionId: params.originalTransactionId },
      createdBy: params.actor,
    })
  }

  async getReconciliation(): Promise<ReconciliationRow[]> {
    return this.gateway.reconciliation()
  }

  async getPoolBalance(poolKey: PoolKey) {
    return this.gateway.readPoolBalance(poolKey)
  }
}

export const economyService = new EconomyService()
