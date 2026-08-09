import { supabaseAdmin } from '../config/supabase'

export type BossId = 'monarch' | (string & {})

export interface RecordBossResultInput {
  userId: string
  bossId: BossId
  won: boolean
  bestHand?: Record<string, unknown> | null
}

/** Records one completed Boss encounter atomically, including legacy Monarch counters. */
export async function recordBossResult(input: RecordBossResultInput): Promise<void> {
  const { error } = await supabaseAdmin.rpc('record_boss_result', {
    p_user_id: input.userId,
    p_boss_id: input.bossId,
    p_won: input.won,
    p_best_hand: input.bestHand ?? null,
  })
  if (error) throw new Error(`record_boss_result failed: ${error.message}`)
}
