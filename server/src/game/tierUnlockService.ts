// ============================================================
// tierUnlockService.ts — Tier Unlock Check (Ceiling Model)
// tier_unlocked_max = single source of truth ปลดแล้วปลดเลย token ลดไม่ล็อคกลับ
// เกณฑ์ปลดล็อค: token_balance - iap_token_total (ไม่นับ token จาก IAP กัน pay-to-unlock)
// เรียกจาก settleEscrow() เท่านั้น (จบแมตช์ปกติ) — ห้ามเรียกใน refundEscrow (rollback ไม่ใช่จบแมตช์)
// ห้ามใช้ getTierFromToken() — เป็น dead code ตาม comment ใน gameConfig.ts — คำนวณจาก
// gameConfig.tierRanges ตรงๆ ในไฟล์นี้แทน
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'

// ลำดับ Tier จากต่ำไปสูง — 'D' คือค่าเริ่มต้นก่อนปลดล็อคอะไรเลย (DB default)
const TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble'] as const

// MasterPlan v1.1 §4.4 — ขึ้น Tier A+ ต้องพิชิต Nine Sentinels ครบ 9/9 ก่อน (นอกเหนือจากเกณฑ์ token)
const SENTINELS_REQUIRED = 9
type TierOrderKey = typeof TIER_ORDER[number]

// คำนวณ Tier สูงสุดที่ eligible token ถึงเกณฑ์ — อิง gameConfig.tierRanges.min ตรงๆ ทีละขั้นจากสูงไปต่ำ
function computeTierFromEligibleToken(eligibleToken: number): TierOrderKey {
  const { tierRanges } = gameConfig
  if (eligibleToken >= tierRanges.highNoble.min) return 'highNoble'
  if (eligibleToken >= tierRanges.mastermind.min) return 'mastermind'
  if (eligibleToken >= tierRanges.adept.min) return 'adept'
  if (eligibleToken >= tierRanges.initiate.min) return 'initiate'
  return 'D'
}

// อ่าน tier_unlocked_max + iap_token_total ปัจจุบัน แล้วเช็คว่า newTokenBalance ปลด Tier สูงกว่าเดิมได้ไหม
// คืน tier ใหม่ที่ปลดได้ (string) หรือ null ถ้าไม่มีอะไรเปลี่ยน/เกิด error ระหว่างทาง
export async function checkTierUnlock(userId: string, newTokenBalance: number): Promise<string | null> {
  try {
    // ห้าม fallback ค่า default แล้วเขียนต่อ — ถ้าอ่านพลาด return null ทันที กัน ceiling ถูกเขียนทับให้ต่ำลง
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('tier_unlocked_max, iap_token_total, conquered_sentinels')
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('[TIER_UNLOCK] Error reading tier_unlocked_max/iap_token_total:', error, '| userId:', userId)
      return null
    }

    const currentMaxRaw = data?.tier_unlocked_max as TierOrderKey | null | undefined
    const iapTokenTotal = data?.iap_token_total ?? 0

    const eligibleToken = Math.max(0, newTokenBalance - iapTokenTotal)
    let newTier = computeTierFromEligibleToken(eligibleToken)

    // Gate: token ถึงเกณฑ์ highNoble แต่ยังพิชิต Sentinels ไม่ครบ → เพดานค้างที่ mastermind
    const conquered = Array.isArray(data?.conquered_sentinels) ? data.conquered_sentinels : []
    const uniqueConquered = new Set(conquered).size
    if (newTier === 'highNoble' && uniqueConquered < SENTINELS_REQUIRED) {
      console.log('[TIER_UNLOCK] Sentinels gate:', uniqueConquered, '/', SENTINELS_REQUIRED, '| userId:', userId)
      newTier = 'mastermind'
    }

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
