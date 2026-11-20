import { supabaseAdmin } from '../config/supabase'
import { economyService } from '../economy/economyService'
import { checkTierUnlock } from './tierUnlockService'

/** One-time graduation reward for clearing Tier D Solo Lv. 250: enough for Tier C entry. */
export const TIER_D_LEVEL_250_TOKEN_REWARD = 10_000

export async function grantTierCGraduationReward(userId: string): Promise<{ tokensGranted: number }> {
  // The ledger idempotency key is the source of truth.  The milestone row is a
  // player-facing audit record and is written afterwards so a retry can repair it.
  await economyService.mint({
    idempotencyKey: `TIER_D_LEVEL_250_TIER_C_UNLOCK:${userId}`,
    to: { accountType: 'PLAYER', accountId: userId },
    currency: 'TOKEN',
    amount: TIER_D_LEVEL_250_TOKEN_REWARD,
    reason: 'TIER_D_LEVEL_250_TIER_C_UNLOCK',
    actor: 'tier_d_solo',
  })

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('token_balance')
    .eq('user_id', userId)
    .single()
  if (error || !user) throw new Error('USER_NOT_FOUND')

  await supabaseAdmin.from('tier_d_milestone_history').upsert({
    user_id: userId,
    milestone_key: 'level_250_tier_c_graduation',
    token_reward: TIER_D_LEVEL_250_TOKEN_REWARD,
  }, { onConflict: 'user_id,milestone_key', ignoreDuplicates: true })

  // This re-evaluates the authoritative ceiling after the graduation token mint.
  // tierUnlockService also caps it at the just-cleared Solo milestone (Tier C).
  await checkTierUnlock(userId, Number(user.token_balance ?? 0))
  return { tokensGranted: TIER_D_LEVEL_250_TOKEN_REWARD }
}
