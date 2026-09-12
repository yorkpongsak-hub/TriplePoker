import { supabaseAdmin } from '../config/supabase'
import { economyService } from '../economy/economyService'
export const TIER_D_LEVEL_500_TOKEN_REWARD = 10_000
export async function unlockTierDTablePlayAfterLevel500(userId: string): Promise<{ unlocked: boolean; tokensGranted: number }> {
  const { data: user, error } = await supabaseAdmin.from('users').select('tier_d_table_play_unlocked_at').eq('user_id', userId).single()
  if (error || !user) throw new Error('USER_NOT_FOUND')
  if (user.tier_d_table_play_unlocked_at) return { unlocked: true, tokensGranted: 0 }
  await economyService.mint({ idempotencyKey: `TIER_D_LEVEL_500_UNLOCK:${userId}`, to: { accountType: 'PLAYER', accountId: userId }, currency: 'TOKEN', amount: TIER_D_LEVEL_500_TOKEN_REWARD, reason: 'TIER_D_LEVEL_500_UNLOCK', actor: 'tier_d_solo' })
  const { data: updated, error: updateError } = await supabaseAdmin.from('users').update({ tier_d_table_play_unlocked_at: new Date().toISOString() }).eq('user_id', userId).is('tier_d_table_play_unlocked_at', null).select('tier_d_table_play_unlocked_at').maybeSingle()
  if (updateError) throw updateError
  if (updated) await supabaseAdmin.from('tier_d_milestone_history').upsert({ user_id: userId, milestone_key: 'level_500_table_play', token_reward: TIER_D_LEVEL_500_TOKEN_REWARD }, { onConflict: 'user_id,milestone_key', ignoreDuplicates: true })
  return { unlocked: true, tokensGranted: updated ? TIER_D_LEVEL_500_TOKEN_REWARD : 0 }
}
export async function canAccessTierDTablePlay(userId: string): Promise<boolean> { const { data } = await supabaseAdmin.from('users').select('tier_d_table_play_unlocked_at').eq('user_id', userId).maybeSingle(); return !!data?.tier_d_table_play_unlocked_at }
