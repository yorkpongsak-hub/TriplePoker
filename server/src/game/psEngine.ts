// ============================================================
// psEngine.ts — Performance Score Engine (Monarch_Spec_v1_2 §4)
// Active ตั้งแต่ Tier A+ ขึ้นไป (Ascendant ในอนาคต) — ใช้คัดเลือก "Ascendant Star"
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

// อัปเดต performance_score ของผู้เล่น human ทุกคนในโต๊ะหลังจบแมตช์ — batch upsert ครั้งเดียว
export async function awardPerformanceScore(input: AwardPerformanceScoreInput): Promise<void> {
  const userIds = Object.keys(input.humanNetDeltas)
  if (userIds.length === 0) return

  const cfg = gameConfig.psConfig
  const winPoints = input.isMonarchMatch
    ? (input.tier === 'highNoble' ? cfg.highNobleMonarchWin : cfg.ascendantMonarchWin)
    : (input.tier === 'highNoble' ? cfg.highNobleWin : cfg.ascendantWin)

  const current: Record<string, number> = {}
  try {
    const { data } = await supabase
      .from('users')
      .select('user_id, performance_score')
      .in('user_id', userIds)
    for (const row of data ?? []) current[row.user_id] = row.performance_score ?? 0
  } catch (err) {
    // Patch: ถ้า migration 006_monarch_spawn_reward.sql ยังไม่ได้รันบน Supabase คอลัมน์นี้จะยังไม่มี — fallback 0 ทุกคน (ไม่ throw)
    console.error('[PS] Error reading performance_score:', err)
  }

  const rows = userIds.map(userId => {
    const netDelta = input.humanNetDeltas[userId]
    const gained = userId === input.finalWinnerId
      ? winPoints
      : (netDelta >= 0 ? cfg.notWinNonNegative : cfg.negative)
    return { user_id: userId, performance_score: (current[userId] ?? 0) + gained }
  })

  try {
    await supabase.from('users').upsert(rows, { onConflict: 'user_id' })
  } catch (err) {
    console.error('[PS] Error updating performance_score batch:', err)
  }
}
