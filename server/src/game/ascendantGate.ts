// ============================================================
// ascendantGate.ts — Ascendant Tier Entry Gate (Monarch_Spec_v1_2 §5)
// STUB: ยังไม่ถูกเรียกจาก promotion flow จริง (ยังไม่มี Ascendant tier promotion
// logic อยู่ในโค้ดเดิมเลยตอนสำรวจ — ไม่มีจุดใดใน repo คำนวณ/เช็คการเลื่อนขึ้น Ascendant)
// TODO: wire เข้ากับ tier promotion flow จริงตอน Ascendant Tier ถูก implement เต็มรูปแบบ
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabase } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'

export type AscendantEligibilityReason =
  | 'OK'
  | 'TOKEN_BELOW_MIN'
  | 'TOKEN_ABOVE_MAX'
  | 'MONARCH_REQUIRED'
  | 'USER_NOT_FOUND'

export interface AscendantEligibilityResult {
  eligible: boolean
  reason: AscendantEligibilityReason
}

// เช็คเงื่อนไขเข้า Ascendant Tier: token 600k-999,999 + monarch_victories >= 1 (Spec v1.2 §5 ทับ MasterPlan §5 เดิม)
// หมายเหตุ: ยังไม่เช็ค "ผ่าน Tier A+" ตรงๆ เพราะไม่มี field/flag นั้นในโค้ดปัจจุบัน (เดา token >= highNoble.min
// จาก gameConfig.tierRanges แทนไปก่อน) — TODO ทบทวนตอน wire จริง ถ้ามี field อื่นที่ authoritative กว่า
export async function checkAscendantEligibility(userId: string): Promise<AscendantEligibilityResult> {
  const cfg = gameConfig.ascendantConfig
  try {
    const { data } = await supabase
      .from('users')
      .select('token_balance, monarch_victories')
      .eq('user_id', userId)
      .single()

    if (!data) return { eligible: false, reason: 'USER_NOT_FOUND' }

    const token = data.token_balance ?? 0
    if (token < cfg.tokenMin) return { eligible: false, reason: 'TOKEN_BELOW_MIN' }
    if (token > cfg.tokenMax) return { eligible: false, reason: 'TOKEN_ABOVE_MAX' }

    if (cfg.requireMonarchVictory && (data.monarch_victories ?? 0) < 1) {
      return { eligible: false, reason: 'MONARCH_REQUIRED' }
    }

    return { eligible: true, reason: 'OK' }
  } catch (err) {
    console.error('[ASCENDANT-GATE] Error checking eligibility for', userId, err)
    return { eligible: false, reason: 'USER_NOT_FOUND' }
  }
}
