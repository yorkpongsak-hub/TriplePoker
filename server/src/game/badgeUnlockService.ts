// ============================================================
// badgeUnlockService.ts — Badge Shop unlock evaluation + purchase (มติลุงเยาะ 2026-08-15)
// เช็คสัญญาณ unlock จาก users/match_wins ที่มีอยู่แล้ว (ไม่มี tracking ใหม่) ครั้งเดียวต่อ request
// แล้วเทียบกับ BADGE_CATALOG's unlock condition ต่อใบ — ดู badgeConfig.ts สำหรับตารางเกณฑ์+ราคา
//
// ซื้อ badge ใช้ Token เท่านั้น (ตาม CLAUDE.md Economy Rule: Earned Crown สงวนไว้ Match Stake,
// Token คือสกุลเงินที่ shop.ts เดิมใช้กับของตกแต่ง/ไอเทมทั้งหมด) หัก Token ผ่าน RPC เดิม
// deduct_user_tokens (shopAPI.ts's pattern เดียวกัน)
//
// Purchase order: INSERT user_badges ก่อน (UNIQUE(user_id,badge_key) เป็นตัวกัน double-buy แบบ
// atomic จริงกันเคส 2 request ยิงพร้อมกัน) แล้วค่อยหัก Token — ถ้าหักไม่สำเร็จ (เงินไม่พอ) ลบแถวที่
// เพิ่ง insert ทิ้งเพื่อ rollback ความเป็นเจ้าของ (ง่ายกว่า/ปลอดภัยกว่าการคืนเงินย้อนหลังที่ต้องมี
// RPC credit เพิ่ม — ยังไม่มี credit_user_tokens RPC ในโปรเจคตอนนี้)
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { TIER_ORDER, TierOrderKey } from './progressionGate'
import { BADGE_CATALOG, BadgeKey, BadgeUnlockCondition } from './badgeConfig'

interface BadgeSignals {
  tierUnlockedMax: TierOrderKey
  ascendantEntered: boolean
  monarchVictories: number
  streak7DaysBadge: boolean
  crownBalance: number
  hasAnyWin: boolean
  hasTripleSweep: boolean
  hasRoyalFlush: boolean
  hasGrandmasterWin: boolean
  hasTop10: boolean
  lifetimeTokensWon: number
}

interface MatchWinRow {
  tier: string
  is_triple_sweep: boolean
  best_hand: { rank?: string } | null
  rank_after: number | null
  tokens_won: number | null
}

async function fetchBadgeSignals(userId: string): Promise<BadgeSignals | null> {
  const [userRes, winsRes] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('tier_unlocked_max, ascendant_status, monarch_victories, streak_7days_badge, crown_balance')
      .eq('user_id', userId)
      .single(),
    supabaseAdmin
      .from('match_wins')
      .select('tier, is_triple_sweep, best_hand, rank_after, tokens_won')
      .eq('user_id', userId),
  ])

  if (userRes.error || !userRes.data) return null

  const wins = (winsRes.data ?? []) as MatchWinRow[]
  const ascendantStatus = (userRes.data.ascendant_status as { status?: string } | null)?.status ?? 'none'

  return {
    tierUnlockedMax: (userRes.data.tier_unlocked_max as TierOrderKey) ?? 'D',
    ascendantEntered: ascendantStatus !== 'none',
    monarchVictories: userRes.data.monarch_victories ?? 0,
    streak7DaysBadge: userRes.data.streak_7days_badge ?? false,
    crownBalance: userRes.data.crown_balance ?? 0,
    hasAnyWin: wins.length > 0,
    hasTripleSweep: wins.some(w => w.is_triple_sweep),
    hasRoyalFlush: wins.some(w => w.best_hand?.rank === 'ROYAL_FLUSH'),
    hasGrandmasterWin: wins.some(w => w.tier === 'grandmaster'),
    hasTop10: wins.some(w => w.rank_after != null && w.rank_after <= 10),
    lifetimeTokensWon: wins.reduce((sum, w) => sum + (w.tokens_won ?? 0), 0),
  }
}

function isUnlocked(condition: BadgeUnlockCondition, signals: BadgeSignals): boolean {
  switch (condition.type) {
    case 'tier': return TIER_ORDER.indexOf(signals.tierUnlockedMax) >= TIER_ORDER.indexOf(condition.tier)
    case 'ascendant': return signals.ascendantEntered
    case 'matchWinsAny': return signals.hasAnyWin
    case 'streak7Days': return signals.streak7DaysBadge
    case 'matchWinsTop10': return signals.hasTop10
    case 'crownBalance': return signals.crownBalance >= condition.min
    case 'matchWinsTripleSweep': return signals.hasTripleSweep
    case 'lifetimeTokensWon': return signals.lifetimeTokensWon >= condition.min
    case 'monarchVictories': return signals.monarchVictories >= condition.min
    case 'matchWinsGrandmaster': return signals.hasGrandmasterWin
    case 'matchWinsRoyalFlush': return signals.hasRoyalFlush
  }
}

export interface BadgeStatusEntry {
  key: BadgeKey
  name: string
  category: 'tier' | 'achievement'
  price: number
  hint: string
  unlocked: boolean
  owned: boolean
}

// ดึงสถานะ badge ทุกใบของ user คนเดียว (locked/unlocked/owned) — ใช้กับ GET /badges/status
export async function getBadgeStatusList(userId: string): Promise<BadgeStatusEntry[] | null> {
  const [signals, ownedRes] = await Promise.all([
    fetchBadgeSignals(userId),
    supabaseAdmin.from('user_badges').select('badge_key').eq('user_id', userId),
  ])
  if (!signals) return null

  const owned = new Set((ownedRes.data ?? []).map(r => r.badge_key as string))

  return BADGE_CATALOG.map(b => ({
    key: b.key,
    name: b.name,
    category: b.category,
    price: b.price,
    hint: b.hint,
    unlocked: isUnlocked(b.unlock, signals),
    owned: owned.has(b.key),
  }))
}

export interface BuyBadgeResult {
  success: boolean
  error?: 'BADGE_NOT_FOUND' | 'USER_NOT_FOUND' | 'NOT_UNLOCKED' | 'ALREADY_OWNED' | 'INSUFFICIENT_TOKENS'
  newBalance?: number
}

export async function buyBadge(userId: string, badgeKey: string): Promise<BuyBadgeResult> {
  const def = BADGE_CATALOG.find(b => b.key === badgeKey)
  if (!def) return { success: false, error: 'BADGE_NOT_FOUND' }

  const signals = await fetchBadgeSignals(userId)
  if (!signals) return { success: false, error: 'USER_NOT_FOUND' }
  if (!isUnlocked(def.unlock, signals)) return { success: false, error: 'NOT_UNLOCKED' }

  const { error: insertError } = await supabaseAdmin
    .from('user_badges')
    .insert({ user_id: userId, badge_key: badgeKey, price_paid: def.price })

  if (insertError) {
    return insertError.code === '23505' // unique_violation — already owns this badge
      ? { success: false, error: 'ALREADY_OWNED' }
      : { success: false, error: 'BADGE_NOT_FOUND' }
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('deduct_user_tokens', {
      p_user_id: userId,
      p_amount: def.price,
    })
    if (error) throw error
    return { success: true, newBalance: data as number }
  } catch (err) {
    // หักเงินไม่สำเร็จ (เงินไม่พอ) — ลบแถว ownership ที่เพิ่ง insert ทิ้ง กันได้ badge ฟรี
    await supabaseAdmin.from('user_badges').delete().eq('user_id', userId).eq('badge_key', badgeKey)
    return { success: false, error: 'INSUFFICIENT_TOKENS' }
  }
}

export interface EquipBadgeResult {
  success: boolean
  error?: 'BADGE_NOT_FOUND' | 'NOT_OWNED'
  equippedBadgeKey: string | null
}

// equip ได้ทีละ 1 ใบ — ส่ง badgeKey: null เพื่อถอด (MVP: โชว์เฉพาะหน้าโปรไฟล์ตัวเอง ยังไม่ propagate
// ไปหน้า Player Profile Viewer ของคนอื่น/ในเกม — มติลุงเยาะ 2026-08-15)
export async function setEquippedBadge(userId: string, badgeKey: string | null): Promise<EquipBadgeResult> {
  if (badgeKey !== null) {
    const def = BADGE_CATALOG.find(b => b.key === badgeKey)
    if (!def) return { success: false, error: 'BADGE_NOT_FOUND', equippedBadgeKey: null }

    const { data: ownedRow } = await supabaseAdmin
      .from('user_badges')
      .select('id')
      .eq('user_id', userId)
      .eq('badge_key', badgeKey)
      .maybeSingle()
    if (!ownedRow) return { success: false, error: 'NOT_OWNED', equippedBadgeKey: null }
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ equipped_badge_key: badgeKey })
    .eq('user_id', userId)
  if (error) return { success: false, error: 'BADGE_NOT_FOUND', equippedBadgeKey: null }

  return { success: true, equippedBadgeKey: badgeKey }
}
