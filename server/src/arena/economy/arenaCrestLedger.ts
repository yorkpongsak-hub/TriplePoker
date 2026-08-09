import { supabaseAdmin } from '../../config/supabase'
import { assertCrest, toTotalCrest } from './crest'

export type ArenaLedgerReason =
  | 'MATCH_RESERVE'
  | 'ENTRY_FEE'
  | 'ANTE'
  | 'AUCTION'
  | 'CALL'
  | 'BOSS_FEE'
  | 'POT_PAYOUT'
  | 'BATTLE_REWARD'
  | 'REFUND'
  | 'CROWN_SINK'

export interface ArenaCrestBalance {
  crown: number
  crestRemainder: number
  totalCrest: number
}

export interface ApplyCrestDeltaInput {
  userId: string
  deltaCrest: number
  reason: ArenaLedgerReason
  idempotencyKey: string
  matchId?: string
}

export interface ArenaLedgerGateway {
  read(userId: string): Promise<{ crown_balance: number; crown_crest_remainder: number } | null>
  apply(input: ApplyCrestDeltaInput): Promise<ArenaCrestBalance>
}

export class SupabaseArenaLedgerGateway implements ArenaLedgerGateway {
  async read(userId: string): Promise<{ crown_balance: number; crown_crest_remainder: number } | null> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('crown_balance, crown_crest_remainder')
      .eq('user_id', userId)
      .single()
    if (error || !data) return null
    return data
  }

  async apply(input: ApplyCrestDeltaInput): Promise<ArenaCrestBalance> {
    const { data, error } = await supabaseAdmin.rpc('arena_apply_crest_delta', {
      p_user_id: input.userId,
      p_delta_crest: input.deltaCrest,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_match_id: input.matchId ?? null,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('ARENA_LEDGER_EMPTY_RESULT')
    return {
      crown: Number(row.new_crown_balance),
      crestRemainder: Number(row.new_crest_remainder),
      totalCrest: Number(row.new_total_crest),
    }
  }
}

export class ArenaCrestLedger {
  constructor(private readonly gateway: ArenaLedgerGateway = new SupabaseArenaLedgerGateway()) {}

  async getBalance(userId: string): Promise<ArenaCrestBalance> {
    if (!userId) throw new Error('USER_ID_REQUIRED')
    const row = await this.gateway.read(userId)
    if (!row) throw new Error('USER_NOT_FOUND')
    return {
      crown: row.crown_balance,
      crestRemainder: row.crown_crest_remainder,
      totalCrest: toTotalCrest(row.crown_balance, row.crown_crest_remainder),
    }
  }

  async applyDelta(input: ApplyCrestDeltaInput): Promise<ArenaCrestBalance> {
    if (!input.userId) throw new Error('USER_ID_REQUIRED')
    if (!input.idempotencyKey) throw new Error('IDEMPOTENCY_KEY_REQUIRED')
    assertCrest(input.deltaCrest, 'delta_crest')
    if (input.deltaCrest === 0) throw new Error('DELTA_CREST_MUST_NOT_BE_ZERO')
    return this.gateway.apply(input)
  }
}
