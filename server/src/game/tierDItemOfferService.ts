import { supabaseAdmin } from '../config/supabase'
import type { TierDRewardItem } from './tierDRewards'

export type TierDOfferKind = 'FREE' | 'LUCKY'
const NORMAL: readonly TierDRewardItem[] = ['auto_sort', 'freeze', 'double_pile', 'shuffle']
const LUCKY: readonly TierDRewardItem[] = ['undo', 'swap', 'shuffle']

/** Offer selection is performed once here, before the client receives an offer. */
export async function getOrCreateTierDItemOffer(userId: string, placement: string, random = Math.random) {
  const { data: user, error: userError } = await supabaseAdmin.from('users').select('vip_status').eq('user_id', userId).maybeSingle()
  if (userError || !user || (user.vip_status ?? 'none') !== 'none') return null
  const { data: open, error: openError } = await supabaseAdmin.from('tier_d_item_offers').select('id,item_key,kind,placement,expires_at').eq('user_id', userId).is('dismissed_at', null).is('claimed_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (openError) throw openError
  if (open) return { id: open.id, itemKey: open.item_key as TierDRewardItem, kind: open.kind as TierDOfferKind, placement: open.placement, expiresAt: open.expires_at }
  const { count, error: countError } = await supabaseAdmin.from('tier_d_item_offers').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'FREE')
  if (countError) throw countError
  // Approximately one Lucky offer in six displayed offers, randomized rather than deterministic.
  const kind: TierDOfferKind = (count ?? 0) >= 5 && random() < .35 ? 'LUCKY' : random() < .14 ? 'LUCKY' : 'FREE'
  const pool = kind === 'LUCKY' ? LUCKY : NORMAL
  const itemKey = pool[Math.floor(random() * pool.length)]
  const { data: created, error: createError } = await supabaseAdmin.from('tier_d_item_offers').insert({ user_id: userId, item_key: itemKey, kind, placement }).select('id,item_key,kind,placement,expires_at').single()
  if (createError) throw createError
  return { id: created.id, itemKey: created.item_key as TierDRewardItem, kind: created.kind as TierDOfferKind, placement: created.placement, expiresAt: created.expires_at }
}

export async function dismissTierDItemOffer(userId: string, offerId: string) {
  const { error } = await supabaseAdmin.from('tier_d_item_offers').update({ dismissed_at: new Date().toISOString() }).eq('id', offerId).eq('user_id', userId).is('claimed_at', null)
  if (error) throw error
}

export async function claimTierDItemOffer(userId: string, offerId: string, eventId: string) {
  const { data, error } = await supabaseAdmin.rpc('claim_tier_d_item_offer', { p_user_id: userId, p_offer_id: offerId, p_event_id: eventId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { itemKey: row.item_key as TierDRewardItem, quantity: Number(row.quantity), idempotent: Boolean(row.idempotent) }
}
