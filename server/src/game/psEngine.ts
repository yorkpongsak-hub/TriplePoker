// ============================================================
// psEngine.ts — Performance Score Engine (Monarch_Spec_v1_3 §4)
// Active ตั้งแต่ Tier A+ ขึ้นไป (Ascendant ในอนาคต) — Dual-Track:
//   Career PS (`performance_score`) สะสมตลอดชีพ ห้ามรีเซ็ต
//   Season PS (`ps_season`) เกณฑ์แข่งขันทั้งหมด (Ascendant Star/leaderboard) รีเซ็ตตาม tournament
// ทุกครั้งที่ award ต้องบวกค่าเดียวกันเข้าทั้งสอง field พร้อมกัน (Spec v1.3 §4.2)
// ห้ามเรียกจาก Tier ต่ำกว่า A+ (type ของ tier param จำกัดไว้แล้ว)
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabase } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'

export interface AwardPerformanceScoreInput {
  tier: 'highNoble' | 'ascendant'
  finalWinnerId: string | null            // userId ของผู้เล่นอันดับ 1 ในโต๊ะ ถ้าเป็น human — null ถ้า Boss ชนะ
  isMonarchMatch: boolean
  humanNetDeltas: Record<string, number>  // userId (human ทุกคนในโต๊ะ) -> net token delta ของทั้งแมตช์ (ก่อนคูณ Monarch)
}

// อัปเดต Career PS (performance_score) + Season PS (ps_season) ของผู้เล่น human ทุกคนในโต๊ะ — batch upsert ครั้งเดียว
export async function awardPerformanceScore(input: AwardPerformanceScoreInput): Promise<void> {
  const userIds = Object.keys(input.humanNetDeltas)
  if (userIds.length === 0) return

  const cfg = gameConfig.psConfig
  const winPoints = input.isMonarchMatch
    ? (input.tier === 'highNoble' ? cfg.highNobleMonarchWin : cfg.ascendantMonarchWin)
    : (input.tier === 'highNoble' ? cfg.highNobleWin : cfg.ascendantWin)

  const currentCareer: Record<string, number> = {}
  const currentSeason: Record<string, number> = {}
  try {
    const { data } = await supabase
      .from('users')
      .select('user_id, performance_score, ps_season')
      .in('user_id', userIds)
    for (const row of data ?? []) {
      currentCareer[row.user_id] = row.performance_score ?? 0
      currentSeason[row.user_id] = row.ps_season ?? 0
    }
  } catch (err) {
    // Patch: ถ้า migration 006_monarch_spawn_reward.sql ยังไม่ได้รันบน Supabase คอลัมน์เหล่านี้จะยังไม่มี — fallback 0 ทุกคน (ไม่ throw)
    console.error('[PS] Error reading performance_score/ps_season:', err)
  }

  const rows = userIds.map(userId => {
    const netDelta = input.humanNetDeltas[userId]
    const gained = userId === input.finalWinnerId
      ? winPoints
      : (netDelta >= 0 ? cfg.notWinNonNegative : cfg.negative)
    return {
      user_id: userId,
      performance_score: (currentCareer[userId] ?? 0) + gained,
      ps_season: (currentSeason[userId] ?? 0) + gained,
    }
  })

  try {
    await supabase.from('users').upsert(rows, { onConflict: 'user_id' })
  } catch (err) {
    console.error('[PS] Error updating performance_score/ps_season batch:', err)
  }
}
