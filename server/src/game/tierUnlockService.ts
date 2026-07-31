// ============================================================
// tierUnlockService.ts — Tier Unlock Check (Ceiling Model)
// tier_unlocked_max = single source of truth ปลดแล้วปลดเลย token ลดไม่ล็อคกลับ
// เกณฑ์ปลดล็อค: token_balance - iap_token_total (ไม่นับ token จาก IAP กัน pay-to-unlock)
//   ผ่าน progressionGate.canUnlockTier() ก่อนด้วย (Token + Days นับจาก created_at + Skill —
//   Economy Progression Spec v2.0 §6) ไม่ใช่แค่ token threshold เฉยๆ อีกต่อไป
// เรียกจาก settleEscrow() เท่านั้น (จบแมตช์ปกติ) — ห้ามเรียกใน refundEscrow (rollback ไม่ใช่จบแมตช์)
// ห้ามใช้ getTierFromToken() — ถูกลบทิ้งแล้วจาก gameConfig.ts (เคยเป็น dead code) — คำนวณผ่าน
// progressionGate.ts (canUnlockTier + TIER_ORDER) แทน
// Nine Sentinels gate (highNoble) ย้ายเข้า progressionGate.ts's canUnlockTier() แล้ว (skill:
// 'nineSentinels') — ไฟล์นี้แค่ query conquered_sentinels แล้วส่งเข้า skillData เฉยๆ ไม่เช็คเองอีกต่อไป
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { TIER_ORDER, TierOrderKey, GateTier, canUnlockTier } from './progressionGate'

// ลำดับ Tier จากสูงไปต่ำ สำหรับเดินหา Tier แรกที่ผ่าน Progression Gate ครบ (Token+Days+Skill)
const DESCEND_ORDER: TierOrderKey[] = ['highNoble', 'mastermind', 'adept', 'initiate', 'D']

// คำนวณ Tier สูงสุดที่ eligible token ถึงเกณฑ์ token อย่างเดียวก่อน (เพดานบนสุดที่เป็นไปได้)
function tokenCeiling(eligibleToken: number): TierOrderKey {
  const { tierRanges } = gameConfig
  if (eligibleToken >= tierRanges.highNoble.min) return 'highNoble'
  if (eligibleToken >= tierRanges.mastermind.min) return 'mastermind'
  if (eligibleToken >= tierRanges.adept.min) return 'adept'
  if (eligibleToken >= tierRanges.initiate.min) return 'initiate'
  return 'D'
}

// เดินลงจาก tokenCeiling หา Tier แรกที่ผ่าน Progression Gate ครบ (Spec v2.0 §6 — "ผ่านครบทุกเงื่อนไข
// ไม่ใช่ผ่านเงื่อนไขใดเงื่อนไขหนึ่ง") — initiate/D ไม่มี gate เลย ผ่านเสมอ
// conqueredSentinels ส่งเข้า canUnlockTier ทุก candidate เฉยๆ (adept/mastermind skill='pass' เลยไม่ถูกใช้
// อยู่ดี มีแค่ highNoble ที่เอาไปเช็คจริง)
function computeTierFromEligibleToken(eligibleToken: number, accountCreatedAt: string, conqueredSentinels: number): TierOrderKey {
  const ceiling = tokenCeiling(eligibleToken)
  const startIdx = DESCEND_ORDER.indexOf(ceiling)
  for (let i = startIdx; i < DESCEND_ORDER.length; i++) {
    const candidate = DESCEND_ORDER[i]
    if (candidate === 'initiate' || candidate === 'D') return candidate
    if (canUnlockTier(candidate as GateTier, eligibleToken, accountCreatedAt, { conqueredSentinels }).passed) return candidate
  }
  return 'D'
}

// อ่าน tier_unlocked_max + iap_token_total ปัจจุบัน แล้วเช็คว่า newTokenBalance ปลด Tier สูงกว่าเดิมได้ไหม
// คืน tier ใหม่ที่ปลดได้ (string) หรือ null ถ้าไม่มีอะไรเปลี่ยน/เกิด error ระหว่างทาง
export async function checkTierUnlock(userId: string, newTokenBalance: number): Promise<string | null> {
  try {
    // ห้าม fallback ค่า default แล้วเขียนต่อ — ถ้าอ่านพลาด return null ทันที กัน ceiling ถูกเขียนทับให้ต่ำลง
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('tier_unlocked_max, iap_token_total, conquered_sentinels, created_at')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('[TIER_UNLOCK] Error reading tier_unlocked_max/iap_token_total:', error, '| userId:', userId)
      return null
    }

    const currentMaxRaw = data?.tier_unlocked_max as TierOrderKey | null | undefined
    const iapTokenTotal = data?.iap_token_total ?? 0

    // ไม่มี created_at ที่อ่านได้ → ห้าม fallback เป็น "now" (จะทำให้ minDays gate ผ่านปลอมๆ ทันที) —
    // return null เหมือน error อื่น ๆ ในไฟล์นี้ กัน ceiling ถูกปลดล็อกทั้งที่เช็ค Time Gate ไม่ได้จริง
    if (!data?.created_at) {
      console.error('[TIER_UNLOCK] Missing created_at, skip:', '| userId:', userId)
      return null
    }

    // นับ Nine Sentinels ที่พิชิตแล้ว (dedup กันข้อมูลซ้ำ) — ส่งเข้า canUnlockTier ผ่าน
    // computeTierFromEligibleToken ให้เช็คเอง (skill: 'nineSentinels' ของ highNoble ใน gameConfig.ts)
    const conquered = Array.isArray(data?.conquered_sentinels) ? data.conquered_sentinels : []
    const uniqueConquered = new Set(conquered).size

    const eligibleToken = Math.max(0, newTokenBalance - iapTokenTotal)
    const newTier = computeTierFromEligibleToken(eligibleToken, data.created_at, uniqueConquered)

    // ค่าที่ไม่รู้จัก (NULL/snake_case หลุดมา/ค่าเพี้ยน) → return null ไม่เขียนอะไรเลย
    // ห้าม fallback เป็น 'D' เพราะจะเขียนทับ ceiling ของผู้เล่นให้ต่ำลงถาวร (bug class เดียวกับ psEngine)
    const currentIdx = currentMaxRaw ? TIER_ORDER.indexOf(currentMaxRaw) : -1
    if (currentIdx === -1) {
      console.error('[TIER_UNLOCK] Unknown tier_unlocked_max, skip:', currentMaxRaw, '| userId:', userId)
      return null
    }
    const newIdx = TIER_ORDER.indexOf(newTier)

    if (newIdx <= currentIdx) return null // Ceiling Model — token ลดไม่ล็อคกลับ, tier เท่าเดิมไม่เขียนซ้ำ

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ tier_unlocked_max: newTier })
      .eq('user_id', userId)

    if (updateError) {
      console.error('[TIER_UNLOCK] Error updating tier_unlocked_max:', updateError, '| userId:', userId, '| newTier:', newTier)
      return null
    }

    console.log('[TIER_UNLOCK]', Date.now(), userId, 'unlocked', newTier, '| eligibleToken:', eligibleToken)
    return newTier
  } catch (err) {
    console.error('[TIER_UNLOCK] Unexpected error:', err, '| userId:', userId)
    return null
  }
}
