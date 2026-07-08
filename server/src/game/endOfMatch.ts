// endOfMatch.ts
// Sprint 4 — End of Match (Rematch + Ad trigger + Debt Recovery)
// วางที่: server/src/game/endOfMatch.ts
// TriplePoker — The Sage Unicorn Studio Co., Ltd.

import { Server } from 'socket.io'
import { gameConfig } from '../config/gameConfig'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tier   = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
type Season = 's1' | 's2' | 's3'

interface MatchPlayer {
  userId    : string
  isAI      : boolean
  isVIP     : boolean
  tokenDelta: number   // รวมได้/เสียทั้ง Match (บวก = ได้ ลบ = เสีย)
  xpEarned  : number
  pile3Wins : number
}

interface MatchSummary {
  gameId     : string
  season     : Season
  tier       : Tier
  winnerId   : string
  players    : MatchPlayer[]
  handCount  : number
  duration   : number   // วินาที
}

interface RematchVote {
  userId : string
  vote   : 'rematch' | 'lobby'
}

// ─────────────────────────────────────────────
// 1. Main Handler
// ─────────────────────────────────────────────

export async function handleEndOfMatch(
  io      : Server,
  summary : MatchSummary,
  db      : any,
  redis   : any,
): Promise<void> {

  // ── Step 1: ตรวจ Debt Recovery ────────────────
  const humanPlayers = summary.players.filter(p => !p.isAI)
  await Promise.all(humanPlayers.map(p => checkDebtRecovery(io, p, db)))

  // ── Step 2: Ad Logic ──────────────────────────
  const hasVIP     = humanPlayers.some(p => p.isVIP)
  const showAd     = !hasVIP

  if (showAd) {
    io.to(summary.gameId).emit('SHOW_AD', {
      type    : 'interstitial',
      message : 'Short break...',
    })
    await delay(5000)  // รอ Ad เล่นจบ (~5 วิ)
  }

  // ── Step 3: บันทึกผล Match ────────────────────
  await saveMatchResult(summary, db)

  // ── Step 4: Broadcast สรุปผล ──────────────────
  io.to(summary.gameId).emit('MATCH_SUMMARY', {
    winnerId   : summary.winnerId,
    players    : humanPlayers.map(p => ({
      userId    : p.userId,
      tokenDelta: p.tokenDelta,
      xpEarned  : p.xpEarned,
      pile3Wins : p.pile3Wins,
    })),
    handCount  : summary.handCount,
    duration   : summary.duration,
  })

  // ── Step 5: รอ Rematch Vote ───────────────────
  const rematchResult = await collectRematchVotes(
    io, summary.gameId, humanPlayers.map(p => p.userId),
  )

  if (rematchResult === 'rematch') {
    // ทุกคนกด Rematch → เริ่มเกมใหม่ทันที
    io.to(summary.gameId).emit('REMATCH_START', {
      message: 'Rematch! Get ready...',
    })
  } else {
    // มีคนกด Lobby หรือหมดเวลา → ทุกคนกลับ Lobby
    io.to(summary.gameId).emit('RETURN_TO_LOBBY', {
      message: 'Returning to lobby...',
    })
  }
}

// ─────────────────────────────────────────────
// 2. Debt Recovery Check
// ─────────────────────────────────────────────

async function checkDebtRecovery(
  io     : Server,
  player : MatchPlayer,
  db     : any,
): Promise<void> {
  // ดึง token balance ปัจจุบัน
  const { data } = await db
    .from('users')
    .select('token_balance, subscription_status, tier')
    .eq('id', player.userId)
    .single()

  const balance : number = data?.token_balance ?? 0
  const isVIP   : boolean = data?.subscription_status === 'active'
  const tier    : Tier    = data?.tier ?? 'initiate'

  if (balance >= 0) return  // ไม่มีหนี้ → ไม่ต้องทำอะไร

  const debt = Math.abs(balance)
  const cfg  = gameConfig.debtRecovery

  // Auto-forgive: Boss/LastBoss หรือ VIP
  if (cfg.autoForgive.tiers.includes(tier) || isVIP) {
    await db.rpc('set_user_tokens', { p_user_id: player.userId, p_amount: 0 })
    io.to(player.userId).emit('DEBT_FORGIVEN', {
      message: 'Your debt has been cleared automatically.',
    })
    return
  }

  // ตรวจ threshold ตาม Tier
  const thresholds = cfg.thresholds[tier as 'initiate' | 'adept' | 'mastermind'] ?? cfg.thresholds.initiate

  if (debt < thresholds.small) {
    // หนี้น้อย → Auto-forgive
    await db.rpc('set_user_tokens', { p_user_id: player.userId, p_amount: 0 })
    io.to(player.userId).emit('DEBT_FORGIVEN', {
      message: 'Small debt cleared. Good luck next round!',
    })
  } else if (debt <= thresholds.medium) {
    // หนี้กลาง → Popup ให้เลือก
    io.to(player.userId).emit('DEBT_POPUP', {
      debt,
      options : ['watch_ad', 'pay_later'],
      message : `You have a debt of ${debt} tokens.`,
    })
  } else {
    // หนี้มาก → Popup พร้อมตัวเลือกซื้อ
    io.to(player.userId).emit('DEBT_POPUP', {
      debt,
      options : ['watch_ads', 'buy_token', 'pay_later'],
      message : `You have a large debt of ${debt} tokens.`,
    })
  }
}

// ─────────────────────────────────────────────
// 3. Rematch Vote Collector
// ─────────────────────────────────────────────

function collectRematchVotes(
  io      : Server,
  gameId  : string,
  userIds : string[],
): Promise<'rematch' | 'lobby'> {
  return new Promise(resolve => {
    const votes = new Map<string, 'rematch' | 'lobby'>()
    const VOTE_TIMEOUT = 15_000  // 15 วินาที รอ vote

    const onVote = (data: RematchVote) => {
      if (!userIds.includes(data.userId)) return
      if (votes.has(data.userId)) return
      votes.set(data.userId, data.vote)

      // มีคนกด Lobby → จบทันที ไม่ต้องรอ
      if (data.vote === 'lobby') {
        cleanup()
        resolve('lobby')
        return
      }

      // ทุกคน vote Rematch → เริ่มใหม่ทันที
      if (votes.size === userIds.length &&
          [...votes.values()].every(v => v === 'rematch')) {
        cleanup()
        resolve('rematch')
      }
    }

    // timeout → ถือว่ากด Lobby
    const timer = setTimeout(() => {
      cleanup()
      resolve('lobby')
    }, VOTE_TIMEOUT)

    const cleanup = () => {
      clearTimeout(timer)
      io.off('REMATCH_VOTE', onVote)
    }

    io.on('REMATCH_VOTE', onVote)
  })
}

// ─────────────────────────────────────────────
// 4. Save Match Result
// ─────────────────────────────────────────────

async function saveMatchResult(
  summary : MatchSummary,
  db      : any,
): Promise<void> {
  await db.from('games').update({
    winner_id  : summary.winnerId,
    hand_count : summary.handCount,
    duration   : summary.duration,
    status     : 'completed',
    ended_at   : new Date().toISOString(),
  }).eq('id', summary.gameId)

  // บันทึก activity log สำหรับ Social Feed
  await db.from('activity_log').insert({
    user_id   : summary.winnerId,
    event_type: 'MATCH_WIN',
    meta      : JSON.stringify({
      gameId  : summary.gameId,
      tier    : summary.tier,
      season  : summary.season,
    }),
    created_at: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────
// Socket Events Reference
// ─────────────────────────────────────────────

/*
SERVER → CLIENT:

'SHOW_AD' { type, message }
→ Free players เท่านั้น — แสดง interstitial ad

'MATCH_SUMMARY' { winnerId, players, handCount, duration }
→ Pop-up สรุปผล + token/XP ของแต่ละคน
→ ปุ่ม REMATCH / LOBBY

'DEBT_FORGIVEN' { message }
→ Toast แจ้ง debt cleared

'DEBT_POPUP' { debt, options, message }
→ Popup ให้เลือก watch_ad / buy_token / pay_later

'REMATCH_START' { message }
→ ทุกคนกด Rematch → countdown เริ่มเกมใหม่

'RETURN_TO_LOBBY' { message }
→ Navigate ทุกคนกลับ Lobby

CLIENT → SERVER:

'REMATCH_VOTE' { userId, vote: 'rematch' | 'lobby' }
→ Human กดเลือก (15 วินาที หมดเวลา = lobby)

'DEBT_ACTION' { userId, action: 'watch_ad' | 'buy_token' | 'pay_later' }
→ Human เลือกวิธีจัดการหนี้
*/
