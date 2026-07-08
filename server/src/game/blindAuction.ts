// blindAuction.ts
// Sprint 4 — Blind Auction Engine
// วางที่: server/src/game/blindAuction.ts
// TriplePoker — The Sage Unicorn Studio Co., Ltd.

import { Server }      from 'socket.io'
import { gameConfig }  from '../config/gameConfig'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tier   = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
type Season = 's1' | 's2' | 's3'

interface Card {
  suit : 'spades' | 'hearts' | 'diamonds' | 'clubs'
  rank : number   // 2–14 (14 = Ace)
}

interface AuctionPlayer {
  userId   : string
  isAI     : boolean
  teamId?  : 'A' | 'B'      // S3 เท่านั้น
  isLeader?: boolean         // S3 เท่านั้น
  pile3Hand: Card[]          // ไพ่ Pile 3 ของผู้เล่นนี้ (AI ใช้ตัดสิน bid)
}

interface Bid {
  userId : string
  amount : number
  sentAt : number            // timestamp ms — ใช้ tie-break fastest ถ้าจำเป็น
}

interface AuctionResult {
  card1Winner: string        // userId ที่ได้ไพ่ใบแรก
  card2Winner: string | null // userId ที่ได้ไพ่ใบสอง (null ถ้าไม่มีผู้ประมูล)
  card1       : Card
  card2       : Card
  bids        : Bid[]
  totalBurned : number       // Token รวมที่ Burn ออกจากระบบ
  tieOccurred : boolean
}

interface AuctionGameState {
  gameId    : string
  season    : Season
  tier      : Tier
  players   : AuctionPlayer[]
  auctionCards: Card[]       // 2 ใบที่ประมูล (คว่ำ)
  handNum   : number
}

// ─────────────────────────────────────────────
// 1. Bid Levels ตาม Tier (6 ระดับ)
// ─────────────────────────────────────────────

const BID_LEVELS: Record<Tier, number[]> = {
  beginner : [10,  20,  30,  60,   120,  240],
  pro      : [50,  100, 150, 300,  450,  600],
  boss     : [100, 200, 300, 600,  1200, 2400],
  lastBoss : [100, 200, 300, 600,  1200, 2400],
}

// ─────────────────────────────────────────────
// 2. AI Bidding Logic
// ─────────────────────────────────────────────

function getAIBid(
  tier      : Tier,
  pile3Hand : Card[],  // Last Boss ใช้ตัดสินว่าต้องการไพ่แค่ไหน
): number {
  const levels = BID_LEVELS[tier]

  if (tier === 'initiate') {
    // สุ่มราคาต่ำ — level 0–2
    const idx = Math.floor(Math.random() * 3)
    return levels[idx]
  }

  if (tier === 'mastermind') {
    // สุ่มราคากลาง — level 1–3
    const idx = 1 + Math.floor(Math.random() * 3)
    return levels[idx]
  }

  if (tier === 'highNoble') {
    // สุ่มราคาสูง — level 3–5
    const idx = 3 + Math.floor(Math.random() * 3)
    return levels[idx]
  }

  if (tier === 'lastBoss') {
    // คำนวณความจำเป็น — ถ้าขาดไพ่ใบเดียวจะจบชุดใหญ่ → ทุ่มสูงสุดทันที
    const isOneCardAway = checkOneCardAway(pile3Hand)
    if (isOneCardAway) return levels[5]  // 2,400 ทันที

    // ถ้าไม่ใกล้จบชุด → สุ่มระดับกลาง-สูง
    const idx = 2 + Math.floor(Math.random() * 3)
    return levels[idx]
  }

  return levels[0]
}

// ตรวจว่าไพ่ใน pile3Hand ขาดอีกใบเดียวจะได้ Straight / Flush / Straight Flush
function checkOneCardAway(cards: Card[]): boolean {
  // ตรวจ Flush draw: มี 4 ใบดอกเดียวกัน
  const suitCount = cards.reduce((acc, c) => {
    acc[c.suit] = (acc[c.suit] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const hasFlushDraw = Object.values(suitCount).some(n => n >= 4)

  // ตรวจ Straight draw: มี 4 ใบเรียงกัน
  const ranks = [...new Set(cards.map(c => c.rank))].sort((a, b) => a - b)
  let hasStraightDraw = false
  for (let i = 0; i <= ranks.length - 4; i++) {
    const gap = ranks[i + 3] - ranks[i]
    if (gap <= 4) { hasStraightDraw = true; break }
  }

  return hasFlushDraw || hasStraightDraw
}

// ─────────────────────────────────────────────
// 3. Tie-Break — Random Roll
// ─────────────────────────────────────────────

function resolveTie(tied: Bid[]): Bid {
  // สุ่ม 50/50 (หรือ 1/N ถ้า tie มากกว่า 2 คน)
  const idx = Math.floor(Math.random() * tied.length)
  return tied[idx]
}

// ─────────────────────────────────────────────
// 4. Main Handler — รัน Blind Auction ทั้งหมด
// ─────────────────────────────────────────────

export async function handleBlindAuction(
  io    : Server,
  state : AuctionGameState,
  db    : any,
  redis : any,
): Promise<AuctionResult> {
  const { gameId, season, tier, players, auctionCards } = state
  const bidDuration = 15_000  // 15 วินาที ให้ทุกคน bid

  // ── Step 1: S3 Team Signal Window (5 วินาที) ─────────────
  if (season === 's3') {
    io.to(gameId).emit('TEAM_SIGNAL_START', {
      durationMs: 5000,
      message   : 'Signal your team — want or pass?',
    })
    await delay(5000)
  }

  // ── Step 2: เปิด Auction ─────────────────────────────────
  io.to(gameId).emit('AUCTION_START', {
    bidLevels : BID_LEVELS[tier],
    durationMs: bidDuration,
    cardCount : 2,
    message   : 'Place your blind bid now!',
  })

  // ── Step 3: รับ bid จากทุก Human + สร้าง AI bid ──────────
  const bids: Bid[] = []

  // รอรับ bid จาก Human ภายใน bidDuration
  await new Promise<void>(resolve => {
    const bidMap = new Map<string, Bid>()
    const humanPlayers = players.filter(p => !p.isAI)

    // รับ event 'PLAYER_BID' จาก client
    const onBid = (socket: any, data: { userId: string; amount: number }) => {
      // ตรวจว่า amount อยู่ใน bid levels ที่กำหนด
      if (!BID_LEVELS[tier].includes(data.amount)) return
      // รับเฉพาะ bid แรก (ส่งซ้ำไม่ได้)
      if (bidMap.has(data.userId)) return

      bidMap.set(data.userId, {
        userId : data.userId,
        amount : data.amount,
        sentAt : Date.now(),
      })

      // ถ้าทุก Human bid ครบแล้ว → ไม่ต้องรอหมดเวลา
      if (bidMap.size >= humanPlayers.length) resolve()
    }

    io.on('connection', socket => socket.on('PLAYER_BID', onBid))
    setTimeout(resolve, bidDuration)  // timeout fallback
  })

  // เพิ่ม AI bids
  players.filter(p => p.isAI).forEach(p => {
    bids.push({
      userId : p.userId,
      amount : getAIBid(tier, p.pile3Hand),
      sentAt : Date.now(),
    })
  })

  // ── Step 4: หา winner ไพ่ใบที่ 1 และ 2 ──────────────────
  // เรียง bid สูง → ต่ำ
  const sorted = [...bids].sort((a, b) => b.amount - a.amount)

  // ไพ่ใบ 1: highest bid
  let card1Bids = sorted.filter(b => b.amount === sorted[0].amount)
  let tieOccurred = false
  let card1Winner: Bid

  if (card1Bids.length > 1) {
    tieOccurred = true
    card1Winner  = resolveTie(card1Bids)
    // แจ้ง toast tie-break
    emitTieBreakToast(io, gameId, card1Winner.userId, season, players)
  } else {
    card1Winner = card1Bids[0]
  }

  // ไพ่ใบ 2: highest bid จากคนที่ไม่ได้ใบ 1 (ไม่เกิน 1 ใบ/คน)
  const remaining = sorted.filter(b => b.userId !== card1Winner.userId)
  let card2Winner: Bid | null = null

  if (remaining.length > 0) {
    const topRemaining = remaining.filter(b => b.amount === remaining[0].amount)
    if (topRemaining.length > 1) {
      tieOccurred = true
      card2Winner  = resolveTie(topRemaining)
      emitTieBreakToast(io, gameId, card2Winner.userId, season, players)
    } else {
      card2Winner = topRemaining[0]
    }
  }

  // ── Step 5: Burn Token (100%) ────────────────────────────
  const totalBurned = bids.reduce((sum, b) => sum + b.amount, 0)
  await burnAuctionTokens(bids, gameId, db, redis)

  // ── Step 6: Broadcast ผล ────────────────────────────────
  const result: AuctionResult = {
    card1Winner : card1Winner.userId,
    card2Winner : card2Winner?.userId ?? null,
    card1       : auctionCards[0],
    card2       : auctionCards[1],
    bids,
    totalBurned,
    tieOccurred,
  }

  io.to(gameId).emit('AUCTION_RESULT', {
    card1Winner : result.card1Winner,
    card2Winner : result.card2Winner,
    card1       : result.card1,
    card2       : result.card2,
    bids        : result.bids,
    totalBurned : result.totalBurned,
    // Frontend: หงายไพ่ 2 ใบ → winner highlight gold → token animation → slide เข้า Pile 3
  })

  // S3: ส่ง card เข้า Team Pool แทน individual hand
  if (season === 's3') {
    await assignToTeamPool(result, players, gameId, db)
  }

  // บันทึกผลลง DB
  await saveAuctionResult(result, state, db)

  return result
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Burn token ทุก bid 100% ออกจากระบบ
async function burnAuctionTokens(
  bids   : Bid[],
  gameId : string,
  db     : any,
  redis  : any,
): Promise<void> {
  const humanBids = bids.filter(b => !b.userId.startsWith('ai_'))
  await Promise.all(humanBids.map(async b => {
    await db.rpc('add_user_tokens', { p_user_id: b.userId, p_amount: -b.amount })
    await redis.incrby(`token:${b.userId}`, -b.amount)
  }))
  // AI bid ไม่หัก token จริง — เป็น Virtual แล้ว Burn ออกอัตโนมัติ
}

// S3: ส่ง auction card เข้า Team Pool
async function assignToTeamPool(
  result  : AuctionResult,
  players : AuctionPlayer[],
  gameId  : string,
  db      : any,
): Promise<void> {
  const winner1 = players.find(p => p.userId === result.card1Winner)
  if (winner1?.teamId) {
    await db.from('game_team_pool').insert({
      game_id : gameId,
      team_id : winner1.teamId,
      card    : result.card1,
      source  : 'blind_auction',
    })
  }
  if (result.card2Winner) {
    const winner2 = players.find(p => p.userId === result.card2Winner)
    if (winner2?.teamId) {
      await db.from('game_team_pool').insert({
        game_id : gameId,
        team_id : winner2.teamId,
        card    : result.card2,
        source  : 'blind_auction',
      })
    }
  }
}

// Toast tie-break winner
function emitTieBreakToast(
  io      : Server,
  gameId  : string,
  userId  : string,
  season  : Season,
  players : AuctionPlayer[],
): void {
  const cfg = gameConfig.blindAuction.tieBreakToast
  const msg = season === 's3' ? cfg.winner.s3clan : cfg.winner.s1s2

  // แจ้งผู้ชนะ
  io.to(userId).emit('TIE_BREAK_TOAST', { message: msg, type: 'winner' })

  // S3: แจ้งทีมฝ่ายตรงข้ามด้วย
  if (season === 's3') {
    const losers = players.filter(p => p.userId !== userId && !p.isAI)
    losers.forEach(p => {
      io.to(p.userId).emit('TIE_BREAK_TOAST', {
        message : cfg.loser.s3clan,
        type    : 'loser',
      })
    })
  }
}

// บันทึก Auction result ลง DB
async function saveAuctionResult(
  result : AuctionResult,
  state  : AuctionGameState,
  db     : any,
): Promise<void> {
  await db.from('game_rounds').insert({
    game_id      : state.gameId,
    hand_num     : state.handNum,
    round_type   : 'blind_auction',
    card1_winner : result.card1Winner,
    card2_winner : result.card2Winner,
    total_burned : result.totalBurned,
    tie_occurred : result.tieOccurred,
    bids         : JSON.stringify(result.bids),
    created_at   : new Date().toISOString(),
  })
}

// Utility
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────
// Socket Events Reference
// ─────────────────────────────────────────────

/*
SERVER → CLIENT:

'TEAM_SIGNAL_START' { durationMs, message }
→ S3 เท่านั้น: แสดง intent icon 5 วินาที (ต้องการ / ปล่อยให้เพื่อน)

'AUCTION_START' { bidLevels, durationMs, cardCount, message }
→ Overlay มืดลง + แสดง dropdown 6 ระดับ + countdown bar สีแดง
→ AI seats แสดง "Thinking..." animation

'AUCTION_RESULT' { card1Winner, card2Winner, card1, card2, bids, totalBurned }
→ หงายไพ่ 2 ใบพร้อมกัน
→ winner highlight gold
→ token animation ไหลออก (burn)
→ ไพ่ slide เข้า Pile 3 / Team Pool

'TIE_BREAK_TOAST' { message, type: 'winner' | 'loser' }
→ Toast แจ้งผลการสุ่ม

CLIENT → SERVER:

'PLAYER_BID' { userId, amount }
→ Human ส่ง bid (รับครั้งแรกเท่านั้น ส่งซ้ำไม่ได้)

'TEAM_SIGNAL' { userId, intent: 'want' | 'pass' }
→ S3: ส่ง intent icon ให้ teammate (5 วินาที)
*/

// ─────────────────────────────────────────────
// Exported Types (สำหรับ tests + external use)
// ─────────────────────────────────────────────

export type AuctionSeason = 'S1' | 'S2' | 'S3'
export type AuctionTier   = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'

export interface PlayerBid {
  playerId  : string
  bidAmount : number
  isAI      : boolean
}

export interface AuctionState {
  roomId      : string
  status      : 'bidding' | 'team_signal' | 'resolved'
  bids        : PlayerBid[]
  cards       : { suit: string; value: number }[]
  tier        : AuctionTier
  season      : AuctionSeason
  teamSignals : Map<string, string>
}

interface CardResult {
  winnerId        : string
  burned          : number
  isTieBreak?     : boolean
  tieBreakMessage?: string
}

interface AuctionResolveResult {
  cardResults : CardResult[]
  totalBurned : number
  tokenDeltas : Record<string, number>
}

// ─────────────────────────────────────────────
// In-Memory Room Store
// ─────────────────────────────────────────────

const auctionRooms = new Map<string, AuctionState>()

// ─────────────────────────────────────────────
// Exported Utility Functions
// ─────────────────────────────────────────────

/** isAuctionEnabled — ตรวจว่า Tier นี้เปิด Blind Auction ไหม */
export function isAuctionEnabled(tier: AuctionTier): boolean {
  return (gameConfig.progressiveMechanics[tier] as any).blindAuction === true
}

/** startBlindAuction — เริ่ม Auction room + emit socket event */
export function startBlindAuction(
  roomId : string,
  cards  : { suit: string; value: number }[],
  season : AuctionSeason,
  tier   : AuctionTier,
  io     : any,
): AuctionState {
  const isS3   = season === 'S3'
  const status = isS3 ? 'team_signal' : 'bidding'

  const state: AuctionState = {
    roomId,
    status,
    bids       : [],
    cards,
    tier,
    season,
    teamSignals: new Map(),
  }

  auctionRooms.set(roomId, state)

  if (isS3) {
    io.to(roomId).emit('auction_team_signal_start', {
      durationMs: 5_000,
      message   : 'Signal your team — want or pass?',
    })
  } else {
    io.to(roomId).emit('auction_bidding_start', {
      bidLevels : BID_LEVELS[tier],
      durationMs: 15_000,
      cardCount : cards.length,
    })
  }

  return state
}

/** submitBid — รับ bid จากผู้เล่น */
export function submitBid(
  roomId : string,
  bid    : PlayerBid,
): { success: boolean; reason?: string } {
  const state = auctionRooms.get(roomId)
  if (!state) return { success: false, reason: 'Room not found' }
  if (bid.bidAmount < 0) return { success: false, reason: 'Bid cannot be negative' }

  // เก็บ bid ล่าสุดต่อคน (ส่งซ้ำได้ แต่รับเฉพาะครั้งแรก)
  const existing = state.bids.findIndex(b => b.playerId === bid.playerId)
  if (existing >= 0) {
    state.bids[existing] = bid
  } else {
    state.bids.push(bid)
  }

  return { success: true }
}

/** resolveBlindAuction — ตัดสินผล Auction + emit + คืน result */
export function resolveBlindAuction(
  roomId : string,
  season : AuctionSeason,
  tier   : AuctionTier,
  io     : any,
): AuctionResolveResult | null {
  const state = auctionRooms.get(roomId)
  if (!state) return null

  const cardResults : CardResult[]              = []
  const tokenDeltas : Record<string, number>    = {}
  const winners     = new Set<string>()

  // เรียง bid สูง → ต่ำ เฉพาะ bid > 0
  const activeBids = [...state.bids]
    .filter(b => b.bidAmount > 0)
    .sort((a, b) => b.bidAmount - a.bidAmount)

  // หา winner ทีละใบ (max 1 ใบ/คน)
  for (let i = 0; i < state.cards.length; i++) {
    const eligible  = activeBids.filter(b => !winners.has(b.playerId))
    if (eligible.length === 0) break

    const topAmount  = eligible[0].bidAmount
    const tied       = eligible.filter(b => b.bidAmount === topAmount)
    const isTieBreak = tied.length > 1

    // random tie-break
    const winner = isTieBreak
      ? tied[Math.floor(Math.random() * tied.length)]
      : tied[0]

    winners.add(winner.playerId)

    // Tie-break message
    const tieMsg = isTieBreak
      ? (season === 'S3'
          ? (gameConfig.blindAuction as any).tieBreakToast.winner.s3clan
          : (gameConfig.blindAuction as any).tieBreakToast.winner.s1s2)
      : undefined

    cardResults.push({
      winnerId        : winner.playerId,
      burned          : winner.bidAmount,
      isTieBreak,
      tieBreakMessage : tieMsg,
    })

    // หัก token เฉพาะผู้ชนะที่ไม่ใช่ AI
    if (!winner.isAI) {
      tokenDeltas[winner.playerId] = -winner.bidAmount
    }
  }

  const totalBurned = cardResults.reduce((sum, r) => sum + r.burned, 0)
  const result      = { cardResults, totalBurned, tokenDeltas }

  // emit auction_resolved
  io.to(roomId).emit('auction_resolved', result)

  // cleanup room
  auctionRooms.delete(roomId)

  return result
}

/** submitTeamSignal — บันทึก team intent signal (S3 เท่านั้น) */
export function submitTeamSignal(
  roomId   : string,
  playerId : string,
  signal   : string,
): boolean {
  const state = auctionRooms.get(roomId)
  if (!state) return false
  if (state.status !== 'team_signal') return false

  state.teamSignals.set(playerId, signal)
  return true
}

/** getAuctionState — ดึง state ของ room */
export function getAuctionState(roomId: string): AuctionState | undefined {
  return auctionRooms.get(roomId)
}

/** cancelAuction — ลบ room ออกจาก store */
export function cancelAuction(roomId: string): void {
  auctionRooms.delete(roomId)
}
