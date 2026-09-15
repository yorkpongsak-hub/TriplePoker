import { supabaseAdmin } from '../config/supabase'
import { tierDLevelRewardPlan, tierDRewardQuantity, type TierDRewardItem, type TierDRewardMode } from './tierDRewards'

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
  const inventory: Record<TierDRewardItem, number> = { shuffle: 0, swap: 0, double_pile: 0, freeze: 0, auto_sort: 0, undo: 0 }
  for (const row of data ?? []) inventory[row.item_key as TierDRewardItem] = row.quantity
  return inventory
}

export async function consumeTierDRuntimeItem(userId: string, item: TierDRewardItem, scopeKey: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('consume_tier_d_runtime_item', { p_user_id: userId, p_item_key: item, p_scope_key: scopeKey })
  if (error) throw error
  return data === true
}

export type TierDLevelReward = { items: { itemKey: TierDRewardItem; quantity: number }[]; adBonusQuantity: number; canWatchAd: boolean; idempotent: boolean }

export async function getTierDLevelReward(userId:string,level:number,isVip:boolean):Promise<TierDLevelReward|undefined>{
  const {data,error}=await supabaseAdmin.from('tier_d_level_item_rewards').select('item_key,granted_quantity,is_ad_bonus').eq('user_id',userId).eq('level',level)
  if(error)throw error
  if(!data?.length)return undefined
  const totals=new Map<TierDRewardItem,number>()
  for(const row of data)totals.set(row.item_key as TierDRewardItem,(totals.get(row.item_key as TierDRewardItem)??0)+row.granted_quantity)
  return {items:[...totals].map(([itemKey,quantity])=>({itemKey,quantity})),adBonusQuantity:tierDLevelRewardPlan(level).adBonusQuantity,canWatchAd:!isVip&&!data.some(row=>row.is_ad_bonus),idempotent:true}
}

export async function getTierDRewardBaseline(userId:string){
  const {data,error}=await supabaseAdmin.from('users').select('tier_d_best_win_streak,tier_d_best_level_clear_time_ms').eq('user_id',userId).maybeSingle()
  if(error)throw error
  return {bestWinStreak:data?.tier_d_best_win_streak??0,bestLevelClearTimeMs:data?.tier_d_best_level_clear_time_ms??null}
}

export async function grantTierDLevelRandomItem(userId: string, level: number, isVip: boolean) {
  const { data, error } = await supabaseAdmin.rpc('grant_tier_d_level_random_item', { p_user_id: userId, p_level: level, p_quantity: 1, p_is_vip: isVip })
  if (error) throw error
  return data as TierDLevelReward
}

/** Invoke only after the production ad provider validates completion (or DEV adapter mock). */
export async function claimTierDLevelAdBonus(userId: string, level: number) {
  const { data, error } = await supabaseAdmin.rpc('claim_tier_d_level_ad_bonus', { p_user_id: userId, p_level: level })
  if (error) throw error
  return data as TierDLevelReward
}

/** Grants one selected item after a rewarded-ad provider callback. */
export async function claimTierDRuntimeItemAd(userId: string, item: TierDRewardItem, eventId: string) {
  const { data, error } = await supabaseAdmin.rpc('claim_tier_d_runtime_item_ad', { p_user_id: userId, p_item_key: item, p_event_id: eventId })
  if (error) throw error
  return data as { itemKey: TierDRewardItem; quantity: 1; idempotent: boolean }
}

export async function recordTierDPersonalBest(userId: string, elapsedMs: number) {
  const { data, error } = await supabaseAdmin.rpc('record_tier_d_personal_best', { p_user_id: userId, p_elapsed_ms: elapsedMs })
  if (error) throw error
  return data as number
}

/** Canonical Level record: elapsed wall time from Match 1 deal to Level clear. */
export async function recordTierDLevelClearPersonalBest(userId: string, level: number, elapsedMs: number) {
  const { data, error } = await supabaseAdmin.rpc('record_tier_d_level_clear_time', { p_user_id: userId, p_level: level, p_elapsed_ms: elapsedMs })
  if (error) throw error
  return data as number
}
