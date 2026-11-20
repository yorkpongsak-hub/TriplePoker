// ============================================================
// matchWinsService.ts — บันทึกประวัติชนะอันดับ 1 (match_wins table)
// เรียกจากจุด match_end ของทุก Tier เฉพาะตอน winner เป็น human เท่านั้น (ไม่นับ AI/Bot ชนะ)
// ไม่มี cap/retention — เก็บตลอดกาลตามมติลุงเยาะ 2026-07-26 (Player Profile Viewer ฝั่ง
// client จำกัดโชว์แค่ 20 รายการล่าสุดตอน query แทน ดู routes/stats.ts)
//
// Top10 rank tracking (มติลุงเยาะ 2026-08-13): เฉพาะ 4 tier ที่หน้า Top10 โชว์
// (initiate/adept/mastermind/highNoble — ไม่รวม grandmaster) คำนวณ rank_before/rank_after
// "ครั้งเดียวตอน INSERT" ไม่ใช่ตอนโหลดหน้า — rank หมายถึงอันดับจาก personal-best tokens_won
// ของผู้เล่นเทียบกับผู้เล่นคนอื่นในเทียร์เดียวกัน (ไม่ใช่แมตช์ล่าสุด) ดู
// supabase/migrations/039_match_wins_rank_tracking.sql
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { handRankLabel } from './handEvaluator'
import { BestHandCandidate } from './matchStatsService'

export type MatchWinTier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'grandmaster'
export type MatchWinMode = 'solo' | 'multiplayer'

export interface MatchWinOpponent {
  name: string
  isHuman: boolean
}

export interface RecordMatchWinInput {
  userId: string
  tier: MatchWinTier
  mode: MatchWinMode
  tokensWon: number
  isTripleSweep: boolean
  bestHand: BestHandCandidate | null
  opponents: MatchWinOpponent[]
}

const TOP10_TRACKED_TIERS: MatchWinTier[] = ['initiate', 'adept', 'mastermind', 'highNoble']
const TOP10_MAX_RANK = 10

// อันดับ 1-indexed ของ userId ในเทียร์นี้ จัดจาก personal-best tokens_won (ไม่ใช่แมตช์ล่าสุด)
// เทียบกับผู้เล่นคนอื่นทุกคนที่เคยชนะในเทียร์นี้ — null ถ้ายังไม่เคยติดอันดับเลย (ไม่มีแถวใดๆ)
export async function computeRank(tier: MatchWinTier, userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin.from('match_wins').select('user_id, tokens_won').eq('tier', tier)
  if (error || !data) {
    console.error('[MATCH_WINS] computeRank query failed:', error, '| tier:', tier)
    return null
  }
  const bestByUser = new Map<string, number>()
  for (const row of data) {
    const prev = bestByUser.get(row.user_id)
    if (prev === undefined || row.tokens_won > prev) bestByUser.set(row.user_id, row.tokens_won)
  }
  const sorted = [...bestByUser.entries()].sort((a, b) => b[1] - a[1])
  const idx = sorted.findIndex(([uid]) => uid === userId)
  return idx === -1 ? null : idx + 1
}

// ห่อ try/catch เสมอ — ห้ามทำให้ match_end ค้าง/throw เพราะบันทึกประวัติไม่สำเร็จ (best-effort
// เหมือน psEngine.ts/matchStatsService.ts — การ์ดเงิน/สถิติหลักไม่ควรพังเพราะ history log ล้มเหลว)
export async function recordMatchWin(input: RecordMatchWinInput): Promise<void> {
  try {
    const trackRank = TOP10_TRACKED_TIERS.includes(input.tier)
    const rankBefore = trackRank ? await computeRank(input.tier, input.userId) : null

    const { data: inserted, error } = await supabaseAdmin
      .from('match_wins')
      .insert({
        user_id: input.userId,
        tier: input.tier,
        mode: input.mode,
        tokens_won: input.tokensWon,
        is_triple_sweep: input.isTripleSweep,
        best_hand: input.bestHand
          ? {
              rank: input.bestHand.hand.rank.toUpperCase(),
              label: handRankLabel(input.bestHand.hand),
              score: input.bestHand.hand.score,
              cards: input.bestHand.cards,
              pile: input.bestHand.pile,
              won: input.bestHand.won,
            }
          : null,
        opponents: input.opponents,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      console.error('[MATCH_WINS] Insert failed:', error, '| userId:', input.userId, '| tier:', input.tier)
      return
    }

    if (trackRank) {
      const rankAfter = await computeRank(input.tier, input.userId)
      if (rankAfter !== null && rankAfter <= TOP10_MAX_RANK && rankAfter !== rankBefore) {
        const { error: rankError } = await supabaseAdmin
          .from('match_wins')
          .update({ rank_before: rankBefore, rank_after: rankAfter })
          .eq('id', inserted.id)
        if (rankError) {
          console.error('[MATCH_WINS] Rank update failed:', rankError, '| userId:', input.userId, '| tier:', input.tier)
        }
      }
    }
  } catch (err) {
    console.error('[MATCH_WINS] Unexpected error:', err, '| userId:', input.userId, '| tier:', input.tier)
  }
}
