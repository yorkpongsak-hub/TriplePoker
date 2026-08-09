// ============================================================
// psEngine.ts — Performance Score Engine (Monarch_Spec_v1_3 §4)
// Active ตั้งแต่ Tier A+ ขึ้นไป (Ascendant ในอนาคต) — Dual-Track:
//   Career PS (`performance_score`) สะสมตลอดชีพ ห้ามรีเซ็ต
//   Season PS (`ps_season`) เกณฑ์แข่งขันทั้งหมด (Ascendant Star/leaderboard) รีเซ็ตตาม tournament
// ทุกครั้งที่ award ต้องบวกค่าเดียวกันเข้าทั้งสอง field พร้อมกัน (Spec v1.3 §4.2)
// ห้ามเรียกจาก Tier ต่ำกว่า A+ (type ของ tier param จำกัดไว้แล้ว)
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'

export interface AwardPerformanceScoreInput {
  tier: 'highNoble' | 'ascendant' | 'grandmaster' | 'sovereign'
  finalWinnerId: string | null            // userId ของผู้เล่นอันดับ 1 ในโต๊ะ ถ้าเป็น human — null ถ้า Boss ชนะ
  legendaryBossDefeated?: boolean        // Monarch, Soren หรือ Last Boss เท่านั้น
  /** @deprecated compatibility for older callers/tests; use legendaryBossDefeated */
  isMonarchMatch?: boolean
  humanNetDeltas: Record<string, number>  // userId (human ทุกคนในโต๊ะ) -> net token delta ของทั้งแมตช์ (ก่อนคูณ Monarch)
}

// อัปเดต Career PS (performance_score) + Season PS (ps_season) ของผู้เล่น human ทุกคนในโต๊ะ — batch upsert ครั้งเดียว
export async function awardPerformanceScore(input: AwardPerformanceScoreInput): Promise<void> {
  const userIds = Object.keys(input.humanNetDeltas)
  if (userIds.length === 0) return

  const cfg = gameConfig.psConfig
  const tierPoints = cfg[input.tier]
  const legendaryBossDefeated = input.legendaryBossDefeated ?? input.isMonarchMatch ?? false
  const winPoints = tierPoints.bossWin + (legendaryBossDefeated ? cfg.legendaryBossBonus : 0)

  const awards = userIds.map(userId => {
    const netDelta = input.humanNetDeltas[userId]
    const gained = userId === input.finalWinnerId
      ? winPoints
      : (netDelta >= 0 ? tierPoints.nonNegative : tierPoints.negative)
    return { userId, gained }
  })

  try {
    for (const { userId, gained } of awards) {
      const { error } = await supabaseAdmin.rpc('increment_performance_score', {
        p_user_id: userId,
        p_delta: gained,
      })
      if (error) {
        console.error('[PS] Atomic increment failed:', error, '| user_id:', userId, '| delta:', gained)
      } else {
        console.log('[PS] OK', userId, 'delta=', gained)
      }
    }
  } catch (err) {
    console.error('[PS] Error incrementing performance_score/ps_season:', err)
  }
}
