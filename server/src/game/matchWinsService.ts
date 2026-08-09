// ============================================================
// matchWinsService.ts — บันทึกประวัติชนะอันดับ 1 (match_wins table)
// เรียกจากจุด match_end ของทุก Tier เฉพาะตอน winner เป็น human เท่านั้น (ไม่นับ AI/Bot ชนะ)
// ไม่มี cap/retention — เก็บตลอดกาลตามมติลุงเยาะ 2026-07-26 (Player Profile Viewer ฝั่ง
// client จำกัดโชว์แค่ 20 รายการล่าสุดตอน query แทน ดู routes/stats.ts)
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

// ห่อ try/catch เสมอ — ห้ามทำให้ match_end ค้าง/throw เพราะบันทึกประวัติไม่สำเร็จ (best-effort
// เหมือน psEngine.ts/matchStatsService.ts — การ์ดเงิน/สถิติหลักไม่ควรพังเพราะ history log ล้มเหลว)
export async function recordMatchWin(input: RecordMatchWinInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('match_wins').insert({
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
    if (error) {
      console.error('[MATCH_WINS] Insert failed:', error, '| userId:', input.userId, '| tier:', input.tier)
    }
  } catch (err) {
    console.error('[MATCH_WINS] Unexpected error:', err, '| userId:', input.userId, '| tier:', input.tier)
  }
}
