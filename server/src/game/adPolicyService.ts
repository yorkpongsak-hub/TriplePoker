import { supabaseAdmin } from '../config/supabase'
import { membershipFromVipStatus, REWARDED_AD_GRACE_MS, type NaturalBreak } from './adPolicy'
import { decideInterstitial, type AdSessionState } from './adManager'
import { adProvider } from './adProvider'

export async function considerForcedInterstitial(userId: string, naturalBreak: NaturalBreak) {
  const { data, error } = await supabaseAdmin.from('users').select('vip_status').eq('user_id', userId).maybeSingle()
  if (error || !data) throw new Error('USER_NOT_FOUND')
  const { data: state } = await supabaseAdmin.from('user_ad_policy_state').select('last_forced_interstitial_at,rewarded_grace_until,interstitials_shown_session,last_ad_kind').eq('user_id', userId).maybeSingle()
  const point = naturalBreak === 'TIER_D_LEVEL_COMPLETE' ? 'levelComplete' : naturalBreak === 'TIER_D_RETRY' ? 'restart' : naturalBreak === 'TIER_D_TOP20_CONTINUE' ? 'top20Continue' : 'returnLobby'
  const now = Date.now(); const session: AdSessionState = { interstitialsShown: state?.interstitials_shown_session ?? 0, lastInterstitialAt: state?.last_forced_interstitial_at ? Date.parse(state.last_forced_interstitial_at) : null, lastRewardedAt: state?.rewarded_grace_until ? Date.parse(state.rewarded_grace_until) - REWARDED_AD_GRACE_MS : null, lastWasInterstitial: state?.last_ad_kind === 'interstitial' }
  const decision = decideInterstitial({ point, membership: membershipFromVipStatus(data.vip_status), state: session, now, providerAvailable: await adProvider.forcedInterstitialAvailable() })
  console.info(JSON.stringify({ event: 'ad_decision', membership: membershipFromVipStatus(data.vip_status), ...decision }))
  return decision.show
}

export async function markForcedInterstitialCompleted(userId: string) {
  const { data: existing } = await supabaseAdmin.from('user_ad_policy_state').select('interstitials_shown_session').eq('user_id',userId).maybeSingle()
  const { error } = await supabaseAdmin.from('user_ad_policy_state').upsert({ user_id: userId, last_forced_interstitial_at: new Date().toISOString(), interstitials_shown_session: (existing?.interstitials_shown_session ?? 0) + 1, last_ad_kind: 'interstitial' }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function markRewardedAdCompleted(userId: string) {
  const { error } = await supabaseAdmin.from('user_ad_policy_state').upsert({ user_id: userId, rewarded_grace_until: new Date(Date.now() + REWARDED_AD_GRACE_MS).toISOString(), last_ad_kind: 'rewarded' }, { onConflict: 'user_id' })
  if (error) throw error
}
