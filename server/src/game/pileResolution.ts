// pileResolution.ts
// Sprint 4 — Pile 1/2 Resolution + Token Settlement
// TriplePoker — The Sage Unicorn Studio Co., Ltd.

import { Server, Socket } from 'socket.io'
import { gameConfig }     from '../config/gameConfig'
import { evaluateHand }   from './handEvaluator'  // มาจาก Sprint 3
import { checkFoul }      from './foulChecker'    // Sprint 3

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Tier    = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
type Season  = 's1' | 's2' | 's3'
type PileNum = 1 | 2

// Card — ใช้ exported interface ด้านล่างไฟล์ (suit + value)

interface PlayerPile {
  userId    : string
  isAI      : boolean
  pileCards : Card[]       // ไพ่ในมือของ Pile นั้น (3 ใบ S1/S2, 2 ใบ S3)
  community : Card[]       // Community Cards ของ Pile นั้น (2 ใบเสมอ)
}

interface HandResult {
  userId   : string
  isAI     : boolean
  rank     : any            // HandRank จาก handEvaluator (string หรือ number)
  tieValue : number[]       // kicker values เรียงสูง→ต่ำ สำหรับ tie-break
  combined : Card[]         // ไพ่ 5 ใบรวม (สำหรับ display)
}

interface PileResult {
  pileNum    : PileNum
  winnerId   : string
  winnerIsAI : boolean
  pot        : number
  rake       : number
  payout     : number      // pot - rake (0 ถ้า AI ชนะ → Burn)
  handResults: HandResult[]
}

interface TokenDelta {
  userId : string
  delta  : number          // บวก = ได้รับ, ลบ = จ่ายออก
  reason : 'ante' | 'win_payout' | 'burn'
}

interface GameState {
  gameId   : string
  season   : Season
  tier     : Tier
  players  : PlayerPile[]  // 4 คน S1/S2, 6 คน S3
  handNum  : number
}

// ─────────────────────────────────────────────
// 1. หาผู้ชนะของแต่ละ Pile
// ─────────────────────────────────────────────

function resolvePileInternal(
  pileNum  : PileNum,
  players  : PlayerPile[],
): HandResult[] {
  // ประเมิน hand ทุกคนรวม Community Cards
  const results: HandResult[] = players.map(p => {
    const combined = [...p.pileCards, ...p.community]  // 5 ใบรวม
    const hand     = (evaluateHand(combined as any) as any)
    return {
      userId   : p.userId,
      isAI     : p.isAI,
      rank     : Number(hand.rank ?? 99),
      tieValue : (hand.tieValue as number[]) || [],
      combined,
    }
  })

  // เรียงจากแรงสุด (rank ต่ำ = แรงกว่า)
  results.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    // Tie-break: เปรียบ kicker ทีละใบ
    for (let i = 0; i < a.tieValue.length; i++) {
      if (a.tieValue[i] !== b.tieValue[i]) {
        return b.tieValue[i] - a.tieValue[i]  // สูงกว่า = ชนะ
      }
    }
    return 0  // เสมอทุกใบ (หายากมาก)
  })

  return results
}

// ─────────────────────────────────────────────
// 2. คำนวณ Token + Settlement
// ─────────────────────────────────────────────

function settlePile(
  pileNum     : PileNum,
  handResults : HandResult[],
  state       : GameState,
): { result: PileResult; deltas: TokenDelta[] } {
  const cfg     = gameConfig.tokenPot.tiers[state.tier]
  const rake    = gameConfig.tokenPot.rake
  const isClan  = state.season === 's3'

  // คำนวณ Pot จากจำนวนผู้เล่นจริง
  const antePerPlayer = pileNum === 1 ? cfg.pile1 : cfg.pile2
  const pot           = antePerPlayer * state.players.length  // S1/S2=4, S3=6

  const winner    = handResults[0]
  const rakeAmt   = Math.floor(pot * rake)
  const payout    = winner.isAI ? 0 : pot - rakeAmt  // AI ชนะ → Burn (payout=0)

  const pileResult: PileResult = {
    pileNum,
    winnerId   : winner.userId,
    winnerIsAI : winner.isAI,
    pot,
    rake       : winner.isAI ? 0 : rakeAmt,  // AI win ไม่มี rake เพราะ Burn ทั้งก้อน
    payout,
    handResults,
  }

  // สร้าง Token Deltas
  const deltas: TokenDelta[] = []

  // ทุกคนเสีย Ante ก่อน (หักตอนต้น Hand แล้ว แต่บันทึก delta ไว้ track)
  state.players.forEach(p => {
    if (!p.isAI) {
      deltas.push({ userId: p.userId, delta: -antePerPlayer, reason: 'ante' })
    }
  })

  if (winner.isAI) {
    // AI ชนะ → Burn ทั้งก้อน ไม่มีใครได้รับ
    deltas.push({ userId: 'system_burn', delta: -pot, reason: 'burn' })
  } else {
    // Human ชนะ → รับ payout
    deltas.push({ userId: winner.userId, delta: payout, reason: 'win_payout' })
  }

  return { result: pileResult, deltas }
}

// ─────────────────────────────────────────────
// 3. Fog of War — คว่ำไพ่หลัง Pile 1 & 2 จบ
// ─────────────────────────────────────────────

function applyFogOfWar(io: Server, gameId: string): void {
  // บอกทุก client ให้เริ่ม card flip animation พร้อมกัน
  io.to(gameId).emit('FOG_OF_WAR', {
    message   : 'All Pile 1 & 2 cards are now hidden',
    animation : 'card_flip',
  })
}

// ─────────────────────────────────────────────
// 4. Main Handler — รัน Pile 1 → Pile 2 → Fog
// ─────────────────────────────────────────────

export async function handlePile12Resolution(
  io    : Server,
  state : GameState,
  db    : any,   // Supabase client
  redis : any,   // Upstash client
): Promise<{ pile1: PileResult; pile2: PileResult }> {
  const tier  = state.tier
  const revealTime = {
    beginner : 8000,   // ms
    pro      : 6000,
    boss     : 5000,
    lastBoss : 5000,
  }[tier]

  // ── Pile 1 ──────────────────────────────────
  const pile1Players  = state.players.map(p => ({
    ...p,
    pileCards : p.pileCards.slice(0, 3),  // S1/S2: 3 ใบ Pile 1 | S3: 2 ใบ
  }))
  const pile1Results  = resolvePileInternal(1, pile1Players)
  const { result: pile1Result, deltas: pile1Deltas } = settlePile(1, pile1Results, state)

  // Broadcast Pile 1 result ให้ทุก client
  io.to(state.gameId).emit('PILE_RESOLVED', {
    pileNum    : 1,
    winnerId   : pile1Result.winnerId,
    winnerIsAI : pile1Result.winnerIsAI,
    pot        : pile1Result.pot,
    payout     : pile1Result.payout,
    handResults: pile1Result.handResults,
    isBurn     : pile1Result.winnerIsAI,
  })

  // รอ reveal animation จบก่อนไป Pile 2
  await delay(revealTime)

  // ── Pile 2 ──────────────────────────────────
  const pile2Players  = state.players.map(p => ({
    ...p,
    pileCards : p.pileCards.slice(3, 6),  // S1/S2: 3 ใบ Pile 2 | S3: 2 ใบ
  }))
  const pile2Results  = resolvePileInternal(2, pile2Players)
  const { result: pile2Result, deltas: pile2Deltas } = settlePile(2, pile2Results, state)

  // Broadcast Pile 2 result
  io.to(state.gameId).emit('PILE_RESOLVED', {
    pileNum    : 2,
    winnerId   : pile2Result.winnerId,
    winnerIsAI : pile2Result.winnerIsAI,
    pot        : pile2Result.pot,
    payout     : pile2Result.payout,
    handResults: pile2Result.handResults,
    isBurn     : pile2Result.winnerIsAI,
  })

  await delay(revealTime)

  // ── Token Settlement ─────────────────────────
  const allDeltas = [...pile1Deltas, ...pile2Deltas]
  await applyTokenDeltas(allDeltas, state.gameId, db, redis)

  // Broadcast token update รายบุคคล
  state.players
    .filter(p => !p.isAI)
    .forEach(p => {
      const userDeltas = allDeltas.filter(d => d.userId === p.userId)
      const net        = userDeltas.reduce((sum, d) => sum + d.delta, 0)
      io.to(p.userId).emit('TOKEN_UPDATE', {
        userId   : p.userId,
        netDelta : net,
        details  : userDeltas,
      })
    })

  // ── Pre-Auction Score Overlay ────────────────
  // แสดง 3-4 วิก่อน Auction เพื่อให้ผู้เล่นประเมินสถานะ
  const scoreSummary = buildScoreSummary(pile1Result, pile2Result, state)
  io.to(state.gameId).emit('PRE_AUCTION_SCORE', {
    summary     : scoreSummary,
    displayMs   : 3500,   // แสดง 3.5 วินาที
  })
  await delay(3500)

  // ── Fog of War ───────────────────────────────
  applyFogOfWar(io, state.gameId)

  // S3 Clan: ตรวจ Clan Domination (3-0) ก่อนไป Auction
  if (state.season === 's3') {
    const domination = checkClanDomination(pile1Result, pile2Result)
    if (domination) {
      io.to(state.gameId).emit('CLAN_DOMINATION', { winnerTeam: domination })
      // หยุดเกม — ไม่ต้องไป Blind Auction
      return { pile1: pile1Result, pile2: pile2Result }
    }
  }

  // บันทึกผลลง DB
  await saveRoundResults(pile1Result, pile2Result, state, db)

  return { pile1: pile1Result, pile2: pile2Result }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// อัพเดท Token ใน DB + Redis
async function applyTokenDeltas(
  deltas : TokenDelta[],
  gameId : string,
  db     : any,
  redis  : any,
): Promise<void> {
  const humanDeltas = deltas.filter(d => d.userId !== 'system_burn')
  await Promise.all(humanDeltas.map(async d => {
    // อัพเดท Supabase
    await db.rpc('add_user_tokens', { p_user_id: d.userId, p_amount: d.delta })
    // อัพเดท Redis cache (real-time balance)
    await redis.incrby(`token:${d.userId}`, d.delta)
  }))
}

// สร้าง Score Summary สำหรับ Pre-Auction Overlay
function buildScoreSummary(
  pile1  : PileResult,
  pile2  : PileResult,
  state  : GameState,
) {
  return state.players
    .filter(p => !p.isAI)
    .map(p => ({
      userId     : p.userId,
      pile1Won   : pile1.winnerId === p.userId,
      pile2Won   : pile2.winnerId === p.userId,
      pile1Payout: pile1.winnerId === p.userId ? pile1.payout : 0,
      pile2Payout: pile2.winnerId === p.userId ? pile2.payout : 0,
      totalWon   : (pile1.winnerId === p.userId ? pile1.payout : 0)
                 + (pile2.winnerId === p.userId ? pile2.payout : 0),
    }))
}

// S3: ตรวจ Clan Domination (ทีมใดทีมหนึ่งชนะ Pile 1, 2, 3 ใน Hand เดียว)
// ฟังก์ชันนี้เรียกหลัง Pile 3 จบด้วย — ตรวจครั้งสุดท้ายที่นั่น
function checkClanDomination(
  pile1 : PileResult,
  pile2 : PileResult,
): 'A' | 'B' | null {
  // ตรวจเฉพาะ Pile 1+2 ก่อน Auction
  // Domination จริงต้องรวม Pile 3 ด้วย — return null ก่อน
  // (ตรวจเต็มรูปแบบใน pile3Resolution.ts)
  return null
}

// บันทึกผลรอบลง DB
async function saveRoundResults(
  pile1  : PileResult,
  pile2  : PileResult,
  state  : GameState,
  db     : any,
): Promise<void> {
  await db.from('game_rounds').insert({
    game_id    : state.gameId,
    hand_num   : state.handNum,
    pile_num   : 'pile1_pile2',
    winner_p1  : pile1.winnerId,
    winner_p2  : pile2.winnerId,
    pot_p1     : pile1.pot,
    pot_p2     : pile2.pot,
    payout_p1  : pile1.payout,
    payout_p2  : pile2.payout,
    is_burn_p1 : pile1.winnerIsAI,
    is_burn_p2 : pile2.winnerIsAI,
    created_at : new Date().toISOString(),
  })
}

// Utility: delay แบบ async
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────
// Socket Events Reference
// ─────────────────────────────────────────────

/*
SERVER → CLIENT events:

'PILE_RESOLVED' {
  pileNum, winnerId, winnerIsAI,
  pot, payout, isBurn,
  handResults: [{ userId, rank, combined }]
}
→ Frontend: เปิดไพ่ผู้ชนะ + glow gold + token animation

'TOKEN_UPDATE' {
  userId, netDelta, details
}
→ Frontend: อัพเดตตัวเลข Token ของผู้เล่นแต่ละคน

'PRE_AUCTION_SCORE' {
  summary, displayMs
}
→ Frontend: แสดง Mini Scoreboard 3.5 วินาที

'FOG_OF_WAR' {
  message, animation
}
→ Frontend: คว่ำไพ่ทั้งหมดพร้อมกัน card flip animation

'CLAN_DOMINATION' {
  winnerTeam: 'A' | 'B'
}
→ Frontend: จบเกมทันที — แสดง Domination screen (S3 เท่านั้น)
*/

// ─────────────────────────────────────────────
// Exported Types — ใช้ใน tests + external modules
// ─────────────────────────────────────────────

export interface Card {
  suit  : 'spades' | 'hearts' | 'diamonds' | 'clubs'
  value : number   // 2–14 (14 = Ace)
}

export interface PlayerArrangement {
  playerId : string
  isAI     : boolean
  pile1    : Card[]
  pile2    : Card[]
  pile3    : Card[]
}

export interface CommunityCards {
  pile1 : Card[]
  pile2 : Card[]
  pile3 : Card[]
}

// ─────────────────────────────────────────────
// Exported Utility Functions
// ─────────────────────────────────────────────

/** getTierByToken — หา Tier จาก Token balance */
export function getTierByToken(token: number): Tier {
  if (token >= 400_000) return 'highNoble'
  if (token >= 150_000) return 'mastermind'
  if (token >= 50_000)  return 'adept'
  return 'initiate'
}

/** calcPot — คำนวณ Total Pot ของ Pile (ก่อนหัก Rake) */
export function calcPot(
  tier    : Tier,
  pileNum : 1 | 2 | 3,
  season  : 'S1' | 'S2' | 'S3'
): number {
  const cfg        = gameConfig.tokenPot.tiers[tier]
  const ante       = pileNum === 1 ? cfg.pile1
                   : pileNum === 2 ? cfg.pile2
                   : (cfg as any).pile3 ?? 0
  const numPlayers = season === 'S3' ? 6 : 4
  return ante * numPlayers
}

/** resolvePile — ตัดสินผู้ชนะ 1 Pile พร้อม rake + payout + rankings */
export function resolvePile(
  pileNum      : 1 | 2 | 3,
  arrangements : PlayerArrangement[],
  community    : CommunityCards,
  tier         : Tier,
  season       : 'S1' | 'S2' | 'S3'
): {
  pileNumber    : number
  pot           : number
  rake          : number
  payout        : number
  winnerId      : string
  burned        : boolean
  winnerIsAI    : boolean
  isTie         : boolean
  tieWinnerById : string | null
  rankings      : { playerId: string; hasFoul: boolean; handRank: number }[]
} {
  const pot     = calcPot(tier, pileNum, season)
  const rakeAmt = Math.floor(pot * gameConfig.tokenPot.rake)
  const comm    = pileNum === 1 ? community.pile1
                : pileNum === 2 ? community.pile2
                : community.pile3

  // ประเมิน hand + ตรวจ Foul ทุก arrangement
  const ranked = arrangements.map(arr => {
    const pileCards = pileNum === 1 ? arr.pile1
                    : pileNum === 2 ? arr.pile2
                    : arr.pile3

    // ตรวจ Foul — cast as any เพื่อหลีกเลี่ยง Card type mismatch กับ deck.ts
    const foulResult = checkFoul(
      { pile1: arr.pile1, pile2: arr.pile2, pile3: arr.pile3 } as any,
      { row1: community.pile1, row2: community.pile2, row3: community.pile3 } as any
    )

    // แปลง value → rank (Rank string) สำหรับ evaluateHand
    const combined = [...pileCards, ...comm].map(c => ({
      suit  : c.suit,
      rank  : String(c.value) as any,
      value : c.value,
    }))

    const hand     = foulResult.isFoul
      ? { rank: 99, tieValue: [] }
      : (evaluateHand(combined as any) as any)

    const handRank = foulResult.isFoul ? 99 : Number(hand.rank ?? 99)

    return {
      playerId : arr.playerId,
      isAI     : arr.isAI,
      hasFoul  : foulResult.isFoul,
      handRank,
      tieValue : (hand.tieValue as number[]) || [],
    }
  })

  // เรียงจากแรงสุด (rank ต่ำ = ดีกว่า, 99 = Foul)
  ranked.sort((a, b) => a.handRank - b.handRank)

  const allFoul    = ranked.every(r => r.hasFoul)
  const topRank    = ranked[0].handRank
  const topPlayers = ranked.filter(r => r.handRank === topRank && !r.hasFoul)
  const isTie      = topPlayers.length > 1

  const rankings = ranked.map(r => ({
    playerId : r.playerId,
    hasFoul  : r.hasFoul,
    handRank : r.handRank,
  }))

  // ทุกคน Foul → AI Burn
  if (allFoul) {
    return {
      pileNumber: pileNum, pot, rake: 0, payout: 0,
      winnerId: 'AI', burned: true, winnerIsAI: true,
      isTie: false, tieWinnerById: null, rankings,
    }
  }

  // เลือกผู้ชนะ (random tie-break ถ้าเสมอ)
  let winner        = ranked.find(r => !r.hasFoul) ?? ranked[0]
  let tieWinnerById : string | null = null

  if (isTie && topPlayers.length > 0) {
    const idx     = Math.floor(Math.random() * topPlayers.length)
    winner        = topPlayers[idx]
    tieWinnerById = winner.playerId
  }

  const burned = winner.isAI
  const payout = burned ? 0 : pot - rakeAmt

  return {
    pileNumber    : pileNum,
    pot,
    rake          : burned ? 0 : rakeAmt,
    payout,
    winnerId      : winner.playerId,
    burned,
    winnerIsAI    : winner.isAI,
    isTie,
    tieWinnerById,
    rankings,
  }
}

/** buildTokenUpdates — แปลง tokenDeltas map เป็น array */
export function buildTokenUpdates(
  deltas: Record<string, number>
): { playerId: string; delta: number }[] {
  return Object.entries(deltas).map(([playerId, delta]) => ({ playerId, delta }))
}
