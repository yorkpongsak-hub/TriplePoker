// soloEndlessLevel.ts — Endless Level progression สำหรับ Solo mode (Initiate/Mastermind) เท่านั้น
// (2026-09-01) คนละระบบกับ users.xp เดิม (computeBaseXp ใน matchStatsService.ts) — เป็นตัวเลขสะสม
// ตลอดชีพผูกกับบัญชี ไม่มีผลกับเกมจริง แค่โชว์ความก้าวหน้าให้ผู้เล่นเห็น (ดู migration 047)
import { supabaseAdmin } from '../config/supabase'

export type SoloEndlessLevelResult = { previous: number; current: number }

// ชนะ +2, จบเกม (แม้แพ้) +1 เสมอ — ไม่ throw ถ้า RPC ล้มเหลว (ไม่บล็อก match-end settlement)
export async function awardSoloEndlessLevel(userId: string, won: boolean): Promise<SoloEndlessLevelResult | null> {
  const delta = won ? 2 : 1
  try {
    const { data, error } = await supabaseAdmin.rpc('increment_solo_endless_level', { p_user_id: userId, p_delta: delta })
    if (error || typeof data !== 'number') {
      console.error('[SOLO_LEVEL] increment failed:', error, '| userId:', userId)
      return null
    }
    return { previous: data - delta, current: data }
  } catch (err) {
    console.error('[SOLO_LEVEL] Unexpected error incrementing level:', err, '| userId:', userId)
    return null
  }
}
