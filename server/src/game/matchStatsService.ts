// ============================================================
// matchStatsService.ts — End-of-Match Stats Recording (MVP)
// เรียกจากจุด match_end ของทุก Tier (initiate/adept/mastermind/highNoble)
// รวม token settle (debt recovery) + games_played/games_won + xp + daily streak +
// best_hands เข้าเป็น UPDATE เดียวต่อผู้เล่น (batch read + batch upsert, .in/.eq ด้วย
// user_id เสมอ — Known Bug #3) — ห่อ try/catch ทุกจุด ห้าม throw จน match ค้าง
//
// ไม่รวม performance_score — ยังคงเรียก awardPerformanceScore() (psEngine.ts) แยกต่างหาก
// เหมือนเดิมทุกกรณี (เทสผ่านแล้ว 27 เทส ห้าม duplicate/แก้ formula ในนี้)
//
// ไม่รวม badge — ยังไม่มี badgeService.ts ในระบบ (audit ยืนยันแล้ว) ตัดออกจาก scope งานนี้
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { HandResult, handRankLabel } from './handEvaluator'

export type StatsTier = 'initiate' | 'adept' | 'mastermind' | 'highNoble'

// Best hand ของผู้เล่นคนนี้ในแมตช์นี้ (pile ที่ตัวเองมี ไม่ใช่ pile ที่ชนะเสมอไป) — null ถ้าไม่มีข้อมูล
// (เช่น foul ทุกรอบ ไม่เคยถูกประเมิน hand เลย)
export interface BestHandCandidate {
  hand: HandResult
  cards: string[]     // card key ตัวใหญ่ เช่น ["KH","KS","KD","7C","7H"]
  pile: 1 | 2 | 3
  won: boolean         // ชนะ pile นั้นจริงไหม
}

export interface MatchStatsPlayerInput {
  userId: string
  tier: StatsTier
  won: boolean                          // ชนะ match นี้ไหม (finalWinner === userId)
  isTripleSweep: boolean                // triple sweep เกิดกับผู้เล่นนี้ในรอบใดก็ได้ของแมตช์นี้
  bestHandThisMatch: BestHandCandidate | null
}

// กัน settle ให้ userId ที่เป็น fallback placeholder (userStore ยังไม่ sync จริง — Known Bug #1)
const BLOCKED_USER_IDS = new Set(['Human1'])

// ─── Helper: วันที่ปัจจุบันโซนเวลา Asia/Bangkok เสมอ (ห้ามใช้ UTC ตรงๆ) ───
function getBangkokDateString(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const day = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${day}`
}

// ─── Helper: Debt Recovery — คืน token_balance สุดท้าย + debt_amount ที่ต้องตั้ง ───
function computeDebtRecovery(
  tier: StatsTier, isVip: boolean, tokenBalance: number,
): { tokenBalance: number; debtAmount: number } {
  if (tokenBalance >= 0) return { tokenBalance, debtAmount: 0 }

  const cfg = gameConfig.debtRecovery
  const debt = Math.abs(tokenBalance)

  // High Noble หรือ VIP → auto-forgive เสมอ
  if ((cfg.autoForgive.tiers as readonly string[]).includes(tier) || isVip) {
    return { tokenBalance: 0, debtAmount: 0 }
  }

  const thresholds = (cfg.thresholds as Record<string, { small: number; medium: number }>)[tier]
    ?? cfg.thresholds.initiate
  if (debt < thresholds.small) {
    // หนี้น้อยกว่า threshold ของ Tier นี้ → auto-forgive
    return { tokenBalance: 0, debtAmount: 0 }
  }
  // เกิน threshold → ตั้ง debt_amount ไว้ (Sprint 7 ค่อยทำ UI จ่ายหนี้/Shield) แต่ tokens เคลียร์เป็น 0 เสมอ
  return { tokenBalance: 0, debtAmount: debt }
}

// ─── Helper: คำนวณ XP ของ 1 ผู้เล่น (ไม่รวม D1 Hook — บวกแยกหลังรู้ games_played ใหม่) ───
function computeBaseXp(tier: StatsTier, won: boolean, isTripleSweep: boolean): number {
  const cfg = gameConfig.xpRewards[tier]
  let xp = won ? cfg.win : cfg.completion
  if (isTripleSweep) xp += cfg.tripleSweepBonus
  return xp
}

interface CurrentUserRow {
  token_balance: number
  vip_status: string
  games_played: number
  games_won: number
  xp: number
  best_hands: Record<string, any> | null
  debt_amount: number
  streak_count: number
  last_played_date: string | null
  streak_shields: number
}

// บันทึกผลจบเกมของผู้เล่น human ทุกคนในแมตช์นี้ — เรียกจากจุด match_end ปกติเท่านั้น (จบครบ totalRounds)
// เหมือน gameStats.ts/psEngine.ts เดิม — ไม่นับ disconnect/player_leave กลางเกม
export async function recordMatchStats(inputs: MatchStatsPlayerInput[]): Promise<void> {
  const valid = inputs.filter(p => {
    if (BLOCKED_USER_IDS.has(p.userId)) {
      console.warn('[MATCH_STATS] Blocked settle for placeholder userId:', p.userId)
      return false
    }
    return true
  })
  if (valid.length === 0) return

  const userIds = valid.map(p => p.userId)
  const current: Record<string, CurrentUserRow> = {}
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('user_id, token_balance, vip_status, games_played, games_won, xp, best_hands, debt_amount, streak_count, last_played_date, streak_shields')
      .in('user_id', userIds)
    for (const row of data ?? []) {
      current[row.user_id] = {
        token_balance:    row.token_balance ?? 0,
        vip_status:       row.vip_status ?? 'none',
        games_played:     row.games_played ?? 0,
        games_won:        row.games_won ?? 0,
        xp:               row.xp ?? 0,
        best_hands:       row.best_hands ?? {},
        debt_amount:      row.debt_amount ?? 0,
        streak_count:     row.streak_count ?? 0,
        last_played_date: row.last_played_date ?? null,
        streak_shields:   row.streak_shields ?? 0,
      }
    }
  } catch (err) {
    console.error('[MATCH_STATS] Error reading current user rows:', err, '| userIds:', userIds)
    return // อ่านค่าปัจจุบันไม่ได้ — เขียนทับมั่วไม่ได้ ข้ามรอบนี้ทั้งหมด (ปลอดภัยกว่า throw ให้ match ค้าง)
  }

  const now = new Date()
  const todayStr = getBangkokDateString(now)
  const yesterdayStr = getBangkokDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const nowISO = now.toISOString()

  const rows = valid.map(p => {
    const prev = current[p.userId] ?? {
      token_balance: 0, vip_status: 'none', games_played: 0, games_won: 0, xp: 0,
      best_hands: {}, debt_amount: 0, streak_count: 0, last_played_date: null, streak_shields: 0,
    }

    // 1-2) Escrow settle เขียน token_balance ไปแล้วก่อนหน้านี้ (settleEscrow) — ที่นี่แค่ตรวจ Debt Recovery
    const isVip = prev.vip_status !== 'none'
    const { tokenBalance: newTokenBalance, debtAmount: newDebtAmount } =
      computeDebtRecovery(p.tier, isVip, prev.token_balance)

    // 3) games_played / games_won
    const newGamesPlayed = prev.games_played + 1
    const newGamesWon = prev.games_won + (p.won ? 1 : 0)

    // 4) XP + D1 Hook
    let newXp = prev.xp + computeBaseXp(p.tier, p.won, p.isTripleSweep)
    let newStreakShields = prev.streak_shields
    if (newGamesPlayed === 1) {
      newXp += gameConfig.xpRewards.d1Hook.xpBonus
      newStreakShields += gameConfig.xpRewards.d1Hook.streakShieldBonus
    }

    // 5) Daily Streak (Asia/Bangkok เท่านั้น)
    let newStreakCount: number
    if (prev.last_played_date === todayStr) {
      newStreakCount = prev.streak_count // เล่นซ้ำวันเดียวกัน — ไม่เปลี่ยน streak
    } else if (prev.last_played_date === yesterdayStr) {
      newStreakCount = prev.streak_count + 1
    } else {
      newStreakCount = 1 // เก่ากว่าเมื่อวาน หรือไม่เคยเล่นมาก่อน (NULL)
    }

    // 6) best_hands (jsonb, key = tier) — replace เฉพาะ key ของ tier นี้ถ้า score สูงกว่าเดิม
    let newBestHands = prev.best_hands ?? {}
    const candidate = p.bestHandThisMatch
    if (candidate) {
      const existing = (newBestHands as Record<string, any>)[p.tier]
      if (!existing || candidate.hand.score > existing.score) {
        newBestHands = {
          ...newBestHands,
          [p.tier]: {
            rank: candidate.hand.rank.toUpperCase(),
            label: handRankLabel(candidate.hand),
            score: candidate.hand.score,
            cards: candidate.cards,
            pile: candidate.pile,
            won: candidate.won,
            at: nowISO,
          },
        }
      }
    }

    return {
      user_id: p.userId,
      token_balance: newTokenBalance,
      debt_amount: newDebtAmount,
      games_played: newGamesPlayed,
      games_won: newGamesWon,
      xp: newXp,
      best_hands: newBestHands,
      streak_count: newStreakCount,
      last_played_date: todayStr,
      streak_shields: newStreakShields,
    }
  })

  try {
    const { error } = await supabaseAdmin.from('users').upsert(rows, { onConflict: 'user_id' })
    if (error) {
      console.error('[MATCH_STATS] Upsert failed:', error, '| payload:', JSON.stringify(rows))
    }
  } catch (err) {
    console.error('[MATCH_STATS] Unexpected error during upsert:', err, '| payload:', JSON.stringify(rows))
  }
}
