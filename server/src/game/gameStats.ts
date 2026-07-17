// ============================================================
// gameStats.ts — games_played / games_won counters (Player Stats Leaderboard)
//
// ⚠️ DEPRECATED — replaced by matchStatsService.ts (recordMatchStats) ⚠️
// ไม่มีจุดไหนใน gameLoop.ts/highNobleMultiEngine.ts เรียก recordGameResults() แล้ว
// (games_played/games_won ถูกรวมเข้า UPDATE เดียวกับ xp/streak/best_hands/debt recovery
// ใน matchStatsService.ts แทน) — คงไฟล์นี้ไว้เป็น fallback กัน production crash เท่านั้น
// ห้ามลบไฟล์นี้ ตามหลักมีไฟล์สำรองกัน production crash
//
// เรียกจากจุด match_end ปกติเท่านั้น (จบครบ totalRounds) — ไม่นับ disconnect/player_leave
// กลางเกม เพราะ "เล่นจบ 1 เกม" ควรหมายถึงแมตช์ที่ตัดสินผลจริง ไม่ใช่ออกกลางคัน
// pattern เดียวกับ psEngine.ts (awardPerformanceScore) — batch read + batch upsert, .eq/.in ด้วย
// user_id เสมอ (Known Bug #3), ห่อ try/catch เผื่อ migration เพิ่ม column ยังไม่ได้รัน
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'

// อัปเดต games_played (+1 ทุกคนที่ระบุ) และ games_won (+1 เฉพาะ winnerId) ของผู้เล่น human ทุกคนในโต๊ะ
// winnerId เป็น null ได้ (เช่น Boss/AI ชนะ ไม่มี human คนไหนได้ games_won เพิ่ม)
export async function recordGameResults(playerIds: string[], winnerId: string | null): Promise<void> {
  if (playerIds.length === 0) return

  const current: Record<string, { games_played: number; games_won: number }> = {}
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('user_id, games_played, games_won')
      .in('user_id', playerIds)
    for (const row of data ?? []) {
      current[row.user_id] = { games_played: row.games_played ?? 0, games_won: row.games_won ?? 0 }
    }
  } catch (err) {
    // Patch: ถ้า SQL เพิ่ม games_played/games_won ยังไม่ได้รันบน Supabase คอลัมน์นี้จะยังไม่มี — fallback 0 ทุกคน (ไม่ throw)
    console.error('[STATS] Error reading games_played/games_won:', err)
  }

  const rows = playerIds.map(userId => {
    const prev = current[userId] ?? { games_played: 0, games_won: 0 }
    return {
      user_id: userId,
      games_played: prev.games_played + 1,
      games_won: prev.games_won + (userId === winnerId ? 1 : 0),
    }
  })

  try {
    await supabaseAdmin.from('users').upsert(rows, { onConflict: 'user_id' })
  } catch (err) {
    console.error('[STATS] Error updating games_played/games_won batch:', err)
  }
}
