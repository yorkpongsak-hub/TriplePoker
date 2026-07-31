// ============================================================
// ascendantGate.ts — Ascendant Tier Entry Gate (Ascendant_Spec_v1_1 §2 + มติลุงเยาะ 2026-07-30)
// เรียกจริงจาก crownVaultService.ts (buyAscendantPass) ก่อนอนุญาตให้ซื้อ Ascendant Pass
//
// เงื่อนไขเข้า Ascendant (ล็อกแล้ว 2026-07-30): token >= 600k (ไม่มีเพดานบนแล้ว — ตัดออกตาม
// Spec v1.1) + monarch_victories >= 1 + เคยปลด tier_unlocked_max ถึง highNoble + ยังไม่เคยซื้อ
// Ascendant Pass มาก่อน (ascendant_status.status === 'none', ครั้งเดียวต่อบัญชี)
// ไม่มี Account Age Gate ที่นี่ — 180 วันเป็นเงื่อนไขของ "เส้นทางสำรอง" (progressionGate.arena)
// คนละเส้นทางกับ Ascendant (ดู crownVaultService.ts's checkArenaPassEligibility)
//
// Refactor: reuse canUnlockTier('ascendant', ...) จาก progressionGate.ts สำหรับ TOKEN + Skill
// (Monarch Slayer) เหลือแค่ TIER_REQUIRED (highNoble ceiling) และ ALREADY_USED ที่เช็คเองในนี้
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabase } from '../config/supabase'
import { canUnlockTier, TIER_ORDER, TierOrderKey } from './progressionGate'

export type AscendantEligibilityReason =
  | 'OK'
  | 'TOKEN_BELOW_MIN'
  | 'MONARCH_REQUIRED'
  | 'TIER_REQUIRED'
  | 'ALREADY_USED'
  | 'USER_NOT_FOUND'

export interface AscendantEligibilityResult {
  eligible: boolean
  reason: AscendantEligibilityReason
}

export type AscendantStatusValue = 'none' | 'active' | 'passed' | 'failed'

export interface AscendantStatusRecord {
  status: AscendantStatusValue
  startedAt: string | null
  expiresAt: string | null
}

// เช็คเงื่อนไขเข้า Ascendant Tier: token >= 600k + monarch_victories >= 1 + เคยปลด highNoble +
// ยังไม่เคยซื้อ Pass มาก่อน (ครั้งเดียวต่อบัญชี)
export async function checkAscendantEligibility(userId: string): Promise<AscendantEligibilityResult> {
  try {
    const { data } = await supabase
      .from('users')
      .select('token_balance, created_at, monarch_victories, tier_unlocked_max, ascendant_status')
      .eq('user_id', userId)
      .single()

    if (!data?.created_at) return { eligible: false, reason: 'USER_NOT_FOUND' }

    const status = (data.ascendant_status as AscendantStatusRecord | null)?.status ?? 'none'
    if (status !== 'none') return { eligible: false, reason: 'ALREADY_USED' }

    const token = data.token_balance ?? 0
    const result = canUnlockTier('ascendant', token, data.created_at, { monarchVictories: data.monarch_victories ?? 0 })
    if (result.missing.includes('TOKEN')) return { eligible: false, reason: 'TOKEN_BELOW_MIN' }
    if (result.missing.includes('SKILL')) return { eligible: false, reason: 'MONARCH_REQUIRED' }

    // ต้องเคยปลด tier_unlocked_max ถึง highNoble มาก่อน (Ceiling Model — ดู tierUnlockService.ts)
    const currentMax = data.tier_unlocked_max as TierOrderKey | null
    const highNobleIdx = TIER_ORDER.indexOf('highNoble')
    const currentIdx = currentMax ? TIER_ORDER.indexOf(currentMax) : -1
    if (currentIdx < highNobleIdx) return { eligible: false, reason: 'TIER_REQUIRED' }

    return { eligible: true, reason: 'OK' }
  } catch (err) {
    console.error('[ASCENDANT-GATE] Error checking eligibility for', userId, err)
    return { eligible: false, reason: 'USER_NOT_FOUND' }
  }
}
