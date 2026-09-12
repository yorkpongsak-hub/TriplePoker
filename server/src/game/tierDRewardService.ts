import { supabaseAdmin } from '../config/supabase'
import { tierDRewardQuantity, type TierDRewardItem, type TierDRewardMode } from './tierDRewards'

/** Server invokes this only after an ad-provider completion callback; never trust a client boolean. */
export async function fulfillTierDItemReward(input: { userId: string; eventId: string; item: TierDRewardItem; mode: TierDRewardMode; adCompleted: boolean; isNoAdsMember: boolean }) {
  const mode = input.isNoAdsMember ? 'no_ads' : input.mode
  const quantity = tierDRewardQuantity(mode, input.adCompleted)
  const { data, error } = await supabaseAdmin.rpc('fulfill_tier_d_item_reward', { p_user_id: input.userId, p_event_id: input.eventId, p_item_key: input.item, p_quantity: quantity })
  if (error) throw error
  return data
}

export async function grantTierDLeagueAwards(userId: string, leagueId: string) {
  const { data, error } = await supabaseAdmin.rpc('grant_tier_d_league_awards', { p_user_id: userId, p_league_id: leagueId })
  if (error) throw error
  return data
}

export async function getTierDLeagueAwards(userId: string) {
  const { data, error } = await supabaseAdmin.from('tier_d_league_awards').select('league_id, award_type, final_rank, final_points, league_name, awarded_at').eq('user_id', userId).order('awarded_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getTierDItemInventory(userId: string): Promise<Record<TierDRewardItem, number>> {
  const { data, error } = await supabaseAdmin.from('tier_d_item_inventory').select('item_key, quantity').eq('user_id', userId)
  if (error) throw error
  const inventory: Record<TierDRewardItem, number> = { single_card_swap: 0, full_redraw: 0, bomb_defuser: 0 }
  for (const row of data ?? []) inventory[row.item_key as TierDRewardItem] = row.quantity
  return inventory
}

export async function consumeTierDRuntimeItem(userId: string, item: TierDRewardItem, scopeKey: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('consume_tier_d_runtime_item', { p_user_id: userId, p_item_key: item, p_scope_key: scopeKey })
  if (error) throw error
  return data === true
}

export async function grantTierDLevelRandomItem(userId: string, level: number, quantity: 1 | 2) {
  const { data, error } = await supabaseAdmin.rpc('grant_tier_d_level_random_item', { p_user_id: userId, p_level: level, p_quantity: quantity })
  if (error) throw error
  return data as { itemKey: TierDRewardItem; quantity: number; canWatchAd: boolean; idempotent: boolean }
}

/** Invoke only after the production ad provider validates completion (or DEV adapter mock). */
export async function claimTierDLevelAdBonus(userId: string, level: number) {
  const { data, error } = await supabaseAdmin.rpc('claim_tier_d_level_ad_bonus', { p_user_id: userId, p_level: level })
  if (error) throw error
  return data as { itemKey: TierDRewardItem; quantity: number; idempotent: boolean }
}

export async function recordTierDPersonalBest(userId: string, elapsedMs: number) {
  const { data, error } = await supabaseAdmin.rpc('record_tier_d_personal_best', { p_user_id: userId, p_elapsed_ms: elapsedMs })
  if (error) throw error
  return data as number
}
