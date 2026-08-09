import { supabaseAdmin } from '../../config/supabase'
import { SettlementTransaction } from './arenaSettlementEngine'
import { ArenaMatchEvent } from '../match/arenaMatchEngine'

export interface PersistedBatchResult { userId: string; totalCrest: number }

export class ArenaSettlementPersistence {
  async persistTransaction(matchId: string, transaction: SettlementTransaction): Promise<PersistedBatchResult[]> {
    const { data, error } = await supabaseAdmin.rpc('arena_apply_crest_batch', {
      p_transaction_key: transaction.commandId,
      p_match_id: matchId,
      p_reason: transaction.reason,
      p_entries: transaction.entries
        .filter(entry => entry.persisted)
        .map(entry => ({ userId: entry.userId, deltaCrest: entry.deltaCrest })),
      p_metadata: {
        potDeltaCrest: transaction.potDeltaCrest,
        battleRewardsDeltaCrest: transaction.battleRewardsDeltaCrest,
        crownSinkDeltaCrest: transaction.crownSinkDeltaCrest,
      },
    })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: any) => ({ userId: String(row.user_id), totalCrest: Number(row.total_crest) }))
  }

  async persistMatchLog(matchId: string, events: readonly ArenaMatchEvent[], summary: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseAdmin.from('arena_match_logs').upsert({
      match_id: matchId,
      event_log: events,
      result_summary: summary,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'match_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}
