// ============================================================
// highNobleMultiEngine.ts — High Noble Multiplayer (3 Human + 1 Boss AI)
// แยกไฟล์ใหม่ทั้งหมด ไม่แตะ gameLoop.ts เดิม (single-player + Adept-multi)
// ตามสถาปัตยกรรม "Tier ใหม่ = copy จาก Tier ที่เสร็จแล้วมาแก้เฉพาะจุด"
//
// โครงสร้างที่นั่ง (คงลำดับเดิมจาก single-player highNoble):
//   seat 0 = Boss (จตุรเทพ, AI เสมอ, ห้าม Human เข้า)  — เดิมคือ AI_SAGE / P3
//   seat 1 = P4  (Human หรือ AI filler)                — เดิมคือ AI_RECKLESS
//   seat 2 = P1  (Human หรือ AI filler)                — เดิมคือ "humanPlayerId" ตัวเดียว
//   seat 3 = P2  (Human หรือ AI filler)                — เดิมคือ AI_GHOST
// ลำดับนี้ตรงกับ turn order เดิมของ Grand Finale (ตามเข็ม P3→P4→P1→P2)
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Server } from 'socket.io'
import { dealCards } from './cardEngine'
import { evaluateHand, compareHands, handRankLabel, HandResult } from './handEvaluator'
import { checkFoul, PlayerArrangement, CommunityCards } from './foulChecker'
import { aiDecideArrangement, AIConfig, AIPersonality, FOUR_GODS, greedyArrangement, pickRandomMinions } from './aiEngine'
import { Card } from './deck'
import { gameConfig } from '../config/gameConfig'
import { supabase } from '../config/supabase'
import { lockPlayerTokens, returnPlayerLockedTokens, persistHNNetTokenResult } from './gameLoop'
import { Seat as RoomSeat } from './roomRegistry'
import { lockMonarchPersonality } from './monarchAI'
import { recordMonarchVictory } from './monarchSpawn'
import { awardPerformanceScore } from './psEngine'

// ── Local copies of small pure helpers (ตั้งใจ duplicate จาก gameLoop.ts แทนการ import
//    เพื่อไม่ให้ engine ใหม่นี้ผูกกับการแก้ไขไฟล์เดิมในอนาคต — ของเดิมพิสูจน์แล้วว่าถูกต้อง) ──
function cardKey(c: Card): string {
  const s = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }[c.suit]
  return c.rank.toLowerCase() + s
}

function resolvePile(
  pileNum: 1 | 2 | 3,
  arrangements: Record<string, PlayerArrangement>,
  community: CommunityCards,
  fouled: Record<string, boolean>
): string {
  const row = pileNum === 1 ? community.row1 : pileNum === 2 ? community.row2 : community.row3
  let bestScore = -Infinity
  let winnerId = ''
  for (const [pid, arr] of Object.entries(arrangements)) {
    if (fouled[pid]) continue
    const pileCards = pileNum === 1 ? arr.pile1 : pileNum === 2 ? arr.pile2 : arr.pile3.slice(0, 3)
    const hand = evaluateHand([...pileCards, ...row])
    if (hand.score > bestScore) { bestScore = hand.score; winnerId = pid }
  }
  return winnerId
}

function calcDeltas(
  p1Winner: string, p2Winner: string, p3Winner: string,
  playerIds: string[],
): Record<string, number> {
  const deltas: Record<string, number> = {}
  playerIds.forEach(id => deltas[id] = 0)
  const stakes = gameConfig.tokenPot.tiers.highNoble
  const rake = gameConfig.tokenPot.rake
  const pots = [
    { winner: p1Winner, stake: stakes.pile1 },
    { winner: p2Winner, stake: stakes.pile2 },
    { winner: p3Winner, stake: stakes.pile3 },
  ]
  for (const { winner, stake } of pots) {
    if (!winner) continue
    const totalPot = stake * playerIds.length
    const net = Math.floor(totalPot * (1 - rake))
    playerIds.forEach(id => {
      if (id === winner) deltas[id] = (deltas[id] ?? 0) + net - stake
      else deltas[id] = (deltas[id] ?? 0) - stake
    })
  }
  return deltas
}

function revealWinnerOnly(
  arrangements: Record<string, PlayerArrangement>,
  pileNum: 1 | 2 | 3,
  winnerId: string
): Record<string, string[] | null> {
  const result: Record<string, string[] | null> = {}
  for (const pid of Object.keys(arrangements)) {
    if (pid !== winnerId) { result[pid] = null; continue }
    const arr = arrangements[pid]
    const pile = pileNum === 1 ? arr.pile1 : pileNum === 2 ? arr.pile2 : arr.pile3
    result[pid] = pile.map(cardKey)
  }
  return result
}

function bestThreeFromHand(hand: Card[], community3: Card[]): { keep: Card[]; discard: Card[] } {
  const n = hand.length
  let bestScore = -Infinity
  let bestKeepIdx: number[] = [0, 1, 2]
  const combo = (start: number, chosen: number[]) => {
    if (chosen.length === 3) {
      const keepCards = chosen.map(i => hand[i])
      const hand5 = evaluateHand([...keepCards, ...community3])
      if (hand5.score > bestScore) { bestScore = hand5.score; bestKeepIdx = [...chosen] }
      return
    }
    for (let i = start; i < n; i++) combo(i + 1, [...chosen, i])
  }
  combo(0, [])
  const keep = bestKeepIdx.map(i => hand[i])
  const discard = hand.filter((_, i) => !bestKeepIdx.includes(i))
  return { keep, discard }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Monarch Spec v1.3 §3 — Pot ×2.0 ระดับ "ทั้งแมตช์": ถ้าเป็นผู้ชนะ human ที่เจอ Monarch และกำไรสุทธิของ
// แมตช์เป็นบวก ได้รับ mint ส่วนต่างเพิ่มอีกเท่าตัว (ไม่หักจากผู้เล่นอื่น) — แยกเป็น pure function เพื่อเทสได้ตรงๆ
export function computeHNHumanPayout(netDelta: number, isMonarchWinnerCandidate: boolean, potMultiplier: number): number {
  const isMonarchWinner = isMonarchWinnerCandidate && netDelta > 0
  return isMonarchWinner ? netDelta * potMultiplier : netDelta
}

// ── Types ────────────────────────────────────────────────────
export interface HNSeat {
  id: string            // human: real userId | AI: stable instance id เช่น 'AI_BOSS', 'AI_FILL_1'
  role: 'boss' | 'p4' | 'p1' | 'p2'
  isHuman: boolean
  name: string
  emoji: string
  personality?: AIPersonality  // เฉพาะ AI seat — สำหรับ Monarch คือบุคลิกที่ล็อคไว้ (client ไม่เห็นค่านี้ เห็นแค่ name="Monarch")
  isMonarch?: boolean          // Monarch Spec v1.3: true เฉพาะที่นั่ง Boss ที่สุ่มโดน Monarch — บุคลิกล็อคครั้งเดียวตอนแจกไพ่ ไม่สลับกลางเกม
  isMinion?: boolean           // LobbyMatchmaking_Spec_v1_0 §6.1: true เฉพาะที่นั่งเติมด้วย Minion (Deadlock "Start Now") — ใช้ greedyArrangement เสมอ
}

interface HNGrandFinaleState {
  roundNumber: 1 | 2
  foldedPlayers: string[]
  foulPlayers: string[]
  currentTurnIdx: number
  turnOrder: string[]
  pile3Pot: number
  revealedCards: Record<string, Card[]>
  decisionTimerId?: any
}

interface HNMatchState {
  roomId: string
  seats: [HNSeat, HNSeat, HNSeat, HNSeat]
  roundNumber: number
  totalRounds: number
  tokenBalance: Record<string, number>
  lockedTokens: Record<string, number>   // เฉพาะ human seat
  results: Array<{
    roundNumber: number; pile1Winner: string; pile2Winner: string; pile3Winner: string
    tokenDeltas: Record<string, number>
  }>
  phase: 'waiting' | 'arrangement' | 'showdown' | 'blind_auction' | 'auction_done'
    | 'arrangement_2' | 'discard' | 'discard_done' | 'fog_of_war' | 'grand_finale'
    | 'grand_finale_done' | 'round_end' | 'match_end'
  // scratch (เคลียร์/เขียนทับทุก Round)
  community?: CommunityCards
  cardsMap?: Record<string, Card[]>
  arrangements?: Record<string, PlayerArrangement>
  submittedArrangement: Set<string>       // userId (human) ที่ submit รอบนี้แล้ว
  blindAuctionCards?: Card[]
  auctionBids?: Record<string, { cardIndex: 0 | 1; level: number }>
  auctionWonCards?: Record<string, Card>
  submittedAuctionBid: Set<string>
  submittedDiscard: Set<string>
  foulMap?: Record<string, boolean>
  foulReasons?: Record<string, string>
  finalPile3?: Record<string, Card[]>
  pendingPile12?: { pile1Winner: string; pile2Winner: string; allArrangements: Record<string, PlayerArrangement>; community: CommunityCards; fouled: Record<string, boolean>; playerIds: string[] }
  grandFinale?: HNGrandFinaleState
}

const hnMatchStates = new Map<string, HNMatchState>()

export function getHNMatchState(roomId: string): HNMatchState | undefined {
  return hnMatchStates.get(roomId)
}

// Client เข้ามาถึง game screen แล้ว (socket ใหม่คนละอันจาก queueing socket) → join user room + ขอไพ่ปัจจุบัน
// mirror ของ resendRoundStartToPlayer เดิม (Adept) — ช่วยแก้ race ที่ round_start ถูก emit ไปแล้ว
// ก่อน client จะ join ห้อง userId ทัน (ครอบคลุมเฉพาะตอน phase ยังเป็น 'arrangement' เหมือนต้นแบบ)
export function resendHNRoundStartToPlayer(io: Server, roomId: string, userId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  const seat = seatById(state, userId)
  if (!seat || !seat.isHuman) return
  if (state.phase !== 'arrangement') return
  if (!state.community || !state.cardsMap) return

  const timer = gameConfig.arrangementTimer.highNoble
  io.to(userId).emit('round_start', {
    roomId,
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    cards: { [userId]: state.cardsMap[userId].map(cardKey) },
    communityCards: {
      pile1: state.community.row1.map(cardKey),
      pile2: state.community.row2.map(cardKey),
      pile3: state.community.row3.map(cardKey),
    },
    seats: state.seats.map(s => ({ id: s.id, name: s.name, emoji: s.emoji, role: s.role, isHuman: s.isHuman })),
    tokenBalance: state.tokenBalance,
    timer,
    ...(state.roundNumber === 1 ? { lockedTokens: state.lockedTokens[userId] } : {}),
  })
}

// ── AI seat naming (filler, ไม่ใช่ Boss) ──────────────────────
const FILLER_PERSONALITIES: AIPersonality[] = ['sage', 'reckless', 'ghost']
const FILLER_NAMES: Record<AIPersonality, { name: string; emoji: string }> = {
  sage:     { name: 'The Sage',     emoji: '🧙' },
  reckless: { name: 'The Reckless', emoji: '😈' },
  ghost:    { name: 'The Ghost',    emoji: '👻' },
} as any

// ============================================================
// startHighNobleMultiMatch — เรียกจาก gameSocket.ts ตอนห้อง highNoble เต็ม (room_ready)
// ============================================================
export async function startHighNobleMultiMatch(
  io: Server,
  roomId: string,
  roomSeats: [RoomSeat, RoomSeat, RoomSeat, RoomSeat],
): Promise<void> {
  const roles: HNSeat['role'][] = ['boss', 'p4', 'p1', 'p2']
  let fillerIdx = 0

  const seats = roomSeats.map((rs, i): HNSeat => {
    const role = roles[i]
    if (rs.type === 'human' && rs.userId) {
      return { id: rs.userId, role, isHuman: true, name: rs.name, emoji: '👤' }
    }
    if (role === 'boss') {
      if (rs.isMonarch) {
        // Monarch Spec v1.3: personality ยังไม่ล็อค ณ จุดนี้ — startHNRound (Round 1) จะล็อคตาม hand strength
        // ทันทีที่แจกไพ่เสร็จ (ดู monarchAI.ts) แล้วคงบุคลิกนั้นตลอดแมตช์ ไม่สลับอีก
        return { id: 'AI_BOSS', role, isHuman: false, name: gameConfig.monarchIdentity.name, emoji: gameConfig.monarchIdentity.emoji, personality: FOUR_GODS[0].personality, isMonarch: true }
      }
      const god = FOUR_GODS.find(g => g.id === rs.aiConfigId) ?? FOUR_GODS[0]
      return { id: 'AI_BOSS', role, isHuman: false, name: god.name, emoji: god.emoji, personality: god.personality }
    }
    // LobbyMatchmaking_Spec_v1_0 §6.1: Deadlock "Start Now" เติมที่นั่งด้วย Minion (roomRegistry.fillWithMinion
    // ตั้งชื่อจริงไว้แล้วใน rs.name) — personality สุ่มอิสระ 1 ใน 3 (แยกจากชื่อ แบบเดียวกับ Mastermind Phase 3)
    // ใช้ greedyArrangement เสมอตอนจัดไพ่ (ดู startHNRound ด้านล่าง) ไม่ผ่าน arrangeByPersonality
    if (rs.isMinion) {
      const p = FILLER_PERSONALITIES[Math.floor(Math.random() * FILLER_PERSONALITIES.length)]
      return { id: `AI_FILL_${i}`, role, isHuman: false, name: rs.name, emoji: '🤖', personality: p, isMinion: true }
    }
    // Fallback AI filler (เผื่อ path อื่นในอนาคตที่ยังไม่ผ่าน fillWithMinion) — ของเดิม Sage/Reckless/Ghost วน index
    const p = FILLER_PERSONALITIES[fillerIdx % FILLER_PERSONALITIES.length]
    fillerIdx++
    return { id: `AI_FILL_${i}`, role, isHuman: false, name: FILLER_NAMES[p].name, emoji: FILLER_NAMES[p].emoji, personality: p }
  }) as [HNSeat, HNSeat, HNSeat, HNSeat]

  const totalRounds = 5
  const tokenBalance: Record<string, number> = {}
  const lockedTokens: Record<string, number> = {}

  await Promise.all(seats.filter(s => s.isHuman).map(async s => {
    const amt = await lockPlayerTokens(s.id, 'highNoble', totalRounds)
    lockedTokens[s.id] = amt
    tokenBalance[s.id] = 5000
  }))
  seats.filter(s => !s.isHuman).forEach(s => tokenBalance[s.id] = 5000)

  const state: HNMatchState = {
    roomId, seats,
    roundNumber: 1, totalRounds,
    tokenBalance, lockedTokens,
    results: [],
    phase: 'waiting',
    submittedArrangement: new Set(),
    submittedAuctionBid: new Set(),
    submittedDiscard: new Set(),
  }
  hnMatchStates.set(roomId, state)

  await startHNRound(io, roomId)
}

function humanSeats(state: HNMatchState): HNSeat[] {
  return state.seats.filter(s => s.isHuman)
}
function aiSeats(state: HNMatchState): HNSeat[] {
  return state.seats.filter(s => !s.isHuman)
}
function seatById(state: HNMatchState, id: string): HNSeat | undefined {
  return state.seats.find(s => s.id === id)
}
function bossSeat(state: HNMatchState): HNSeat {
  return state.seats[0]
}

// ============================================================
// ROUND START — แจกไพ่ + AI/Boss ตัดสินใจจัดไพ่ทันที + ส่งไพ่ private ให้ Human แต่ละคน
// ============================================================
async function startHNRound(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state) return

  state.phase = 'arrangement'
  state.submittedArrangement = new Set()
  state.arrangements = {}
  state.foulMap = {}
  state.foulReasons = {}
  state.finalPile3 = {}
  state.pendingPile12 = undefined
  state.grandFinale = undefined

  const dealt = dealCards()
  const playerIds = state.seats.map(s => s.id)
  const cardsMap: Record<string, Card[]> = {}
  playerIds.forEach((id, i) => cardsMap[id] = dealt.players[i])

  const community: CommunityCards = { row1: dealt.community.row1, row2: dealt.community.row2, row3: dealt.community.row3 }
  state.community = community
  state.cardsMap = cardsMap
  state.blindAuctionCards = dealt.blindAuction

  // Monarch Spec v1.3: ล็อคบุคลิกตาม hand strength ทันทีที่แจกไพ่เสร็จ — เฉพาะ Round 1 เท่านั้น
  // (ล็อคครั้งเดียวทั้งแมตช์ ไม่สลับอีก, client ไม่เห็นค่า personality — เห็นแค่ name="Monarch")
  const boss = state.seats[0]
  if (boss.isMonarch && state.roundNumber === 1) {
    boss.personality = lockMonarchPersonality(cardsMap[boss.id], community)
  }

  // AI/Boss ตัดสินใจจัดไพ่ทันที — Minion (§6.1) ใช้ greedyArrangement เสมอ ไม่ผ่าน personality dispatch
  aiSeats(state).forEach(seat => {
    if (seat.isMinion) {
      state.arrangements![seat.id] = greedyArrangement(cardsMap[seat.id], community)
      return
    }
    const config: AIConfig = { id: seat.id, name: seat.name, emoji: seat.emoji, personality: seat.personality! }
    state.arrangements![seat.id] = aiDecideArrangement(config, cardsMap[seat.id], community, state.roundNumber, 'highNoble', 0)
  })

  const timer = gameConfig.arrangementTimer.highNoble
  const aiNamesPublic = state.seats.map(s => ({ id: s.id, name: s.name, emoji: s.emoji, role: s.role, isHuman: s.isHuman }))

  humanSeats(state).forEach(seat => {
    io.to(seat.id).emit('round_start', {
      roomId,
      roundNumber: state.roundNumber,
      totalRounds: state.totalRounds,
      cards: { [seat.id]: cardsMap[seat.id].map(cardKey) },
      communityCards: {
        pile1: community.row1.map(cardKey),
        pile2: community.row2.map(cardKey),
        pile3: community.row3.map(cardKey),
      },
      blindAuction: dealt.blindAuction.map(cardKey),
      seats: aiNamesPublic,
      tokenBalance: state.tokenBalance,
      timer,
      ...(state.roundNumber === 1 ? { lockedTokens: state.lockedTokens[seat.id] } : {}),
    })
  })

  const timeoutId = setTimeout(() => resolveHNArrangementTimeout(io, roomId), timer * 1000)
  ;(state as any)._arrangementTimeoutId = timeoutId
}

// ── ตรวจว่า human ทุกคนที่ยังอยู่ในห้อง submit ครบหรือยัง ──
function allHumansSubmitted(state: HNMatchState, submittedSet: Set<string>): boolean {
  return humanSeats(state).every(s => submittedSet.has(s.id))
}

// ============================================================
// submitHNArrangement — Human ส่ง arrangement (เรียกจาก gameSocket.ts)
// ============================================================
export async function submitHNArrangement(
  io: Server, roomId: string, userId: string, arrangement: PlayerArrangement
): Promise<{ ok: boolean; reason?: string }> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement') return { ok: false, reason: 'not_in_arrangement' }
  const seat = seatById(state, userId)
  if (!seat || !seat.isHuman) return { ok: false, reason: 'not_a_seat' }

  state.arrangements![userId] = arrangement
  state.submittedArrangement.add(userId)

  if (allHumansSubmitted(state, state.submittedArrangement)) {
    if ((state as any)._arrangementTimeoutId) clearTimeout((state as any)._arrangementTimeoutId)
    await resolveHNArrangementPhaseComplete(io, roomId)
  }
  return { ok: true }
}

async function resolveHNArrangementTimeout(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement') return
  // Human ที่ยังไม่ submit — auto-submit ไพ่ตามที่แจกมาเรียง 3/3/5 (fallback ง่ายสุด กันเกม stall)
  humanSeats(state).forEach(seat => {
    if (state.submittedArrangement.has(seat.id)) return
    const hand = state.cardsMap![seat.id]
    state.arrangements![seat.id] = { pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11) }
    state.submittedArrangement.add(seat.id)
  })
  await resolveHNArrangementPhaseComplete(io, roomId)
}

// Arrangement รอบ1 ครบทุกคนแล้ว — High Noble ข้าม Pile1/2 reveal ไปประมูลก่อนเสมอ (ตรงกับ single-player)
async function resolveHNArrangementPhaseComplete(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'blind_auction'
  startHNBlindAuction(io, roomId)
}

// ============================================================
// BLIND AUCTION
// ============================================================
function startHNBlindAuction(io: Server, roomId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'blind_auction'
  state.submittedAuctionBid = new Set()
  state.auctionBids = {}

  const bidLevels = gameConfig.blindAuction.bidLevels.highNoble
  const decisionMs = gameConfig.blindAuction.decisionTimeMs

  io.to(roomId).emit('blind_auction_start', { roomId, bidLevels, decisionTimeMs: decisionMs })

  // AI/Boss bid ทันที — สไตล์ตาม personality (คงตัวเลขเดิมจาก Four Gods single-player)
  aiSeats(state).forEach(seat => {
    const cardIndex: 0 | 1 = Math.random() < 0.5 ? 0 : 1
    let willBid: boolean; let level: number
    switch (seat.personality) {
      case 'reaper':
        willBid = Math.random() < 0.9; level = bidLevels.length - 1; break
      case 'crag':
        willBid = Math.random() < 0.75
        level = Math.min(bidLevels.length - 1, Math.floor(bidLevels.length * 0.6) + Math.floor(Math.random() * 2)); break
      case 'cortex':
        willBid = Math.random() < 0.6; level = Math.floor(Math.random() * Math.ceil(bidLevels.length / 2)); break
      case 'cipher':
        willBid = Math.random() < 0.7; level = Math.random() < 0.5 ? 0 : bidLevels.length - 1; break
      default: // filler Sage/Reckless/Ghost — เดิมสุ่มง่ายๆ
        willBid = Math.random() < 0.7; level = Math.floor(Math.random() * bidLevels.length); break
    }
    if (willBid) state.auctionBids![seat.id] = { cardIndex, level }
  })

  const timeoutId = setTimeout(() => resolveHNBlindAuctionTimeout(io, roomId), decisionMs)
  ;(state as any)._auctionTimeoutId = timeoutId
}

export function submitHNAuctionBid(
  roomId: string, userId: string, cardIndex: 0 | 1, level: number
): { ok: boolean; reason?: string } {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'blind_auction') return { ok: false, reason: 'not_in_auction' }
  if (state.auctionBids![userId]) return { ok: false, reason: 'already_bid' }
  state.auctionBids![userId] = { cardIndex, level }
  state.submittedAuctionBid.add(userId)
  // หมายเหตุ: ไม่ resolve ทันทีแม้ human bid ครบทุกคน — คงพฤติกรรมเดิมจาก single-player
  // ที่รอเต็มเวลา decisionMs เสมอ (กันเคส AI เปลี่ยนใจ/เพิ่ม logic ทีหลัง)
  return { ok: true }
}

async function resolveHNBlindAuctionTimeout(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'blind_auction') return
  if ((state as any)._auctionTimeoutId) clearTimeout((state as any)._auctionTimeoutId)

  const bidLevels = gameConfig.blindAuction.bidLevels.highNoble
  const bids = state.auctionBids!
  const blindCards = state.blindAuctionCards!
  const results: Array<{ cardIndex: 0 | 1; winnerId: string | null; level: number | null; amount: number; cardKey: string }> = []
  const auctionWonCards: Record<string, Card> = {}

  for (const cardIndex of [0, 1] as const) {
    const candidates = Object.entries(bids).filter(([, b]) => b.cardIndex === cardIndex)
    if (candidates.length === 0) {
      results.push({ cardIndex, winnerId: null, level: null, amount: 0, cardKey: cardKey(blindCards[cardIndex]) })
      continue
    }
    const maxLevel = Math.max(...candidates.map(([, b]) => b.level))
    const topBidders = candidates.filter(([, b]) => b.level === maxLevel).map(([pid]) => pid)
    // Human ชนะก่อน AI เสมอ — ถ้ามี human หลายคนเสมอกัน สุ่มในกลุ่ม human เท่านั้น
    const humanTop = topBidders.filter(pid => seatById(state, pid)?.isHuman)
    let winnerId: string
    if (humanTop.length > 0) winnerId = humanTop[Math.floor(Math.random() * humanTop.length)]
    else if (topBidders.length === 1) winnerId = topBidders[0]
    else winnerId = topBidders[Math.floor(Math.random() * topBidders.length)]

    const amount = bidLevels[maxLevel] ?? 0
    state.tokenBalance[winnerId] = (state.tokenBalance[winnerId] ?? 0) - amount
    auctionWonCards[winnerId] = blindCards[cardIndex]
    results.push({ cardIndex, winnerId, level: maxLevel, amount, cardKey: cardKey(blindCards[cardIndex]) })
  }

  state.auctionWonCards = auctionWonCards
  state.phase = 'auction_done'
  io.to(roomId).emit('blind_auction_result', { roomId, results, tokenBalance: state.tokenBalance })

  await delay(3000)
  startHNArrangementRound2(io, roomId)
}

// ============================================================
// ARRANGEMENT ROUND 2 — จัดไพ่ใหม่รวมไพ่ประมูล (สูงสุด 12 ใบ)
// ============================================================
function startHNArrangementRound2(io: Server, roomId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'arrangement_2'
  state.submittedArrangement = new Set()

  aiSeats(state).forEach(seat => {
    if (!state.auctionWonCards![seat.id]) return
    const fullHand = [...state.cardsMap![seat.id], state.auctionWonCards![seat.id]]
    if (seat.isMinion) {
      state.arrangements![seat.id] = greedyArrangement(fullHand, state.community!)
      return
    }
    const config: AIConfig = { id: seat.id, name: seat.name, emoji: seat.emoji, personality: seat.personality! }
    state.arrangements![seat.id] = aiDecideArrangement(config, fullHand, state.community!, state.roundNumber, 'highNoble', 0)
  })

  const r2Timer = gameConfig.arrangementTimer.highNoble
  humanSeats(state).forEach(seat => {
    const arr = state.arrangements![seat.id]
    const humanHand = [...arr.pile1, ...arr.pile2, ...arr.pile3]
    if (state.auctionWonCards![seat.id]) humanHand.push(state.auctionWonCards![seat.id])
    io.to(seat.id).emit('arrangement_2_start', { roomId, cards: humanHand.map(cardKey), timer: r2Timer })
  })

  const timeoutId = setTimeout(() => resolveHNArrangementRound2Timeout(io, roomId), r2Timer * 1000)
  ;(state as any)._arrangement2TimeoutId = timeoutId
}

export async function submitHNArrangementRound2(
  io: Server, roomId: string, userId: string, arrangement: PlayerArrangement
): Promise<{ ok: boolean; reason?: string }> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement_2') return { ok: false, reason: 'not_in_arrangement_2' }
  state.arrangements![userId] = arrangement
  state.submittedArrangement.add(userId)
  if (allHumansSubmitted(state, state.submittedArrangement)) {
    if ((state as any)._arrangement2TimeoutId) clearTimeout((state as any)._arrangement2TimeoutId)
    startHNDiscardPhase(io, roomId)
  }
  return { ok: true }
}

async function resolveHNArrangementRound2Timeout(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement_2') return
  humanSeats(state).forEach(seat => {
    if (state.submittedArrangement.has(seat.id)) return
    // ไม่ submit ทัน — ใช้ arrangement รอบ1 เดิม + ไพ่ประมูล (ถ้ามี) ต่อท้าย pile3
    const arr = state.arrangements![seat.id]
    const won = state.auctionWonCards![seat.id]
    state.arrangements![seat.id] = won ? { pile1: arr.pile1, pile2: arr.pile2, pile3: [...arr.pile3, won] } : arr
    state.submittedArrangement.add(seat.id)
  })
  startHNDiscardPhase(io, roomId)
}

// ============================================================
// DISCARD PHASE — ทุกคนเหลือกองละ 3 ใบเป๊ะ (12 ใบ → 9 ใบ)
// ============================================================
function startHNDiscardPhase(io: Server, roomId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'discard'
  state.submittedDiscard = new Set()
  const community3 = state.community!.row3

  aiSeats(state).forEach(seat => {
    const arr = state.arrangements![seat.id]
    const { keep } = bestThreeFromHand([...arr.pile3], community3)
    const finalArr: PlayerArrangement = { pile1: arr.pile1, pile2: arr.pile2, pile3: keep }
    state.finalPile3![seat.id] = keep
    const foul = checkFoul(finalArr, state.community!)
    state.foulMap![seat.id] = foul.isFoul
    if (foul.isFoul && foul.reason) state.foulReasons![seat.id] = foul.reason
    state.arrangements![seat.id] = finalArr
  })

  humanSeats(state).forEach(seat => {
    const arr = state.arrangements![seat.id]
    io.to(seat.id).emit('discard_phase_start_highnoble', {
      roomId,
      pile1: arr.pile1.map(cardKey), pile2: arr.pile2.map(cardKey), pile3: arr.pile3.map(cardKey),
      needDiscard: {
        pile1: Math.max(0, arr.pile1.length - 3),
        pile2: Math.max(0, arr.pile2.length - 3),
        pile3: Math.max(0, arr.pile3.length - 3),
      },
      decisionTimeMs: 20000,
    })
  })

  const timeoutId = setTimeout(() => resolveHNDiscardTimeout(io, roomId), 20000)
  ;(state as any)._discardTimeoutId = timeoutId
}

export function submitHNDiscard(io: Server, roomId: string, userId: string, keepKeys: string[]): { ok: boolean; reason?: string } {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'discard') return { ok: false, reason: 'not_in_discard' }
  if (keepKeys.length !== 9) return { ok: false, reason: 'must_keep_exactly_9' }

  const arr = state.arrangements![userId]
  const newPile1 = arr.pile1.filter(c => keepKeys.includes(cardKey(c)))
  const newPile2 = arr.pile2.filter(c => keepKeys.includes(cardKey(c)))
  const newPile3 = arr.pile3.filter(c => keepKeys.includes(cardKey(c)))
  if (newPile1.length !== 3 || newPile2.length !== 3 || newPile3.length !== 3) {
    return { ok: false, reason: 'invalid_pile_distribution' }
  }
  const finalArrangement: PlayerArrangement = { pile1: newPile1, pile2: newPile2, pile3: newPile3 }
  state.arrangements![userId] = finalArrangement

  const foul = checkFoul(finalArrangement, state.community!)
  state.foulMap![userId] = foul.isFoul
  if (foul.isFoul && foul.reason) state.foulReasons![userId] = foul.reason
  else delete state.foulReasons![userId]

  state.finalPile3![userId] = newPile3
  state.submittedDiscard.add(userId)

  if (allHumansSubmitted(state, state.submittedDiscard)) {
    if ((state as any)._discardTimeoutId) clearTimeout((state as any)._discardTimeoutId)
    resolveHNDiscardComplete(io, roomId).catch(err => console.error('[HN] resolveHNDiscardComplete error:', err))
  }
  return { ok: true }
}

async function resolveHNDiscardTimeout(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'discard') return
  humanSeats(state).forEach(seat => {
    if (state.submittedDiscard.has(seat.id)) return
    // หมดเวลา — ทิ้งใบสุดท้ายของแต่ละกองอัตโนมัติ (ตรงกับ single-player)
    const arr = state.arrangements![seat.id]
    const trim = (pile: Card[]) => pile.length > 3 ? pile.slice(0, 3) : pile
    const finalArr: PlayerArrangement = { pile1: trim(arr.pile1), pile2: trim(arr.pile2), pile3: trim(arr.pile3) }
    state.arrangements![seat.id] = finalArr
    const foul = checkFoul(finalArr, state.community!)
    state.foulMap![seat.id] = foul.isFoul
    if (foul.isFoul && foul.reason) state.foulReasons![seat.id] = foul.reason
    state.finalPile3![seat.id] = finalArr.pile3
  })
  await resolveHNDiscardComplete(io, roomId)
}

async function resolveHNDiscardComplete(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'discard_done'

  humanSeats(state).forEach(seat => {
    io.to(seat.id).emit('discard_phase_result', {
      roomId,
      myFinalHand: (state.finalPile3![seat.id] ?? []).map(cardKey),
    })
  })

  // ── Reveal Pile1 + Pile2 (เกิดหลัง Discard เสมอสำหรับ High Noble) ──
  const allArrangements = state.arrangements!
  const playerIds = state.seats.map(s => s.id)
  const revealTime = 4000

  const pile1Winner = resolvePile(1, allArrangements, state.community!, state.foulMap!)
  const hand1 = pile1Winner ? evaluateHand([...allArrangements[pile1Winner].pile1, ...state.community!.row1]) : null
  io.to(roomId).emit('pile_reveal', {
    roomId, pileNumber: 1, winner: pile1Winner,
    winnerHandRank: hand1 ? handRankLabel(hand1) : '',
    arrangements: revealWinnerOnly(allArrangements, 1, pile1Winner),
    fouled: state.foulMap, foulReasons: state.foulReasons,
  })
  await delay(revealTime)

  const pile2Winner = resolvePile(2, allArrangements, state.community!, state.foulMap!)
  const hand2 = pile2Winner ? evaluateHand([...allArrangements[pile2Winner].pile2, ...state.community!.row2]) : null
  io.to(roomId).emit('pile_reveal', {
    roomId, pileNumber: 2, winner: pile2Winner,
    winnerHandRank: hand2 ? handRankLabel(hand2) : '',
    arrangements: revealWinnerOnly(allArrangements, 2, pile2Winner),
    fouled: state.foulMap, foulReasons: state.foulReasons,
  })
  await delay(revealTime)

  state.pendingPile12 = { pile1Winner, pile2Winner, allArrangements, community: state.community!, fouled: state.foulMap!, playerIds }
  state.phase = 'fog_of_war'
  io.to(roomId).emit('fog_of_war', { roomId, message: 'Pile 1 & 2 ถูกซ่อนแล้ว — เหลือ Pile 3 ในมือคุณเท่านั้นที่เห็น' })
  await delay(8000)
  startHNGrandFinale(io, roomId)
}

// ============================================================
// GRAND FINALE — Pile 3 Betting (ตามเข็ม/ทวนเข็ม ตาม single-player เดิม)
// ============================================================
function startHNGrandFinale(io: Server, roomId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  state.phase = 'grand_finale'

  const allPlayerIds = state.seats.map(s => s.id)
  const foulMap = state.foulMap ?? {}
  const foulPlayers = allPlayerIds.filter(pid => foulMap[pid])
  const eligible = allPlayerIds.filter(pid => !foulMap[pid])

  const stakes = gameConfig.tokenPot.tiers.highNoble
  const pile3Pot = stakes.pile3 * allPlayerIds.length

  if (eligible.length === 0) {
    io.to(roomId).emit('grand_finale_all_foul', { roomId, pile3Pot, burned: true })
    finalizeHNGrandFinale(io, roomId, null, pile3Pot, foulPlayers, true)
    return
  }
  if (eligible.length === 1) {
    io.to(roomId).emit('grand_finale_walkover', { roomId, winnerId: eligible[0], pile3Pot })
    finalizeHNGrandFinale(io, roomId, eligible[0], pile3Pot, foulPlayers, false)
    return
  }

  // ตามเข็ม: Boss(seat0) -> P4(seat1) -> P1(seat2) -> P2(seat3)
  const clockwiseOrder = state.seats.map(s => s.id)
  const turnOrder = clockwiseOrder.filter(pid => eligible.includes(pid))

  state.grandFinale = {
    roundNumber: 1, foldedPlayers: [], foulPlayers, currentTurnIdx: 0, turnOrder, pile3Pot, revealedCards: {},
  }

  io.to(roomId).emit('grand_finale_start', { roomId, roundNumber: 1, turnOrder, foulPlayers, pile3Pot })
  startHNNextTurn(io, roomId)
}

function startHNNextTurn(io: Server, roomId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  const gf = state.grandFinale
  if (!gf) return

  if (gf.currentTurnIdx >= gf.turnOrder.length) {
    if (gf.roundNumber === 1) {
      const stillIn = gf.turnOrder.filter(pid => !gf.foldedPlayers.includes(pid))
      if (stillIn.length <= 1) {
        finalizeHNGrandFinale(io, roomId, stillIn[0] ?? null, gf.pile3Pot, gf.foulPlayers, stillIn.length === 0)
        return
      }
      // ทวนเข็ม: P2(seat3) -> P1(seat2) -> P4(seat1) -> Boss(seat0)
      const counterclockwise = [...state.seats].reverse().map(s => s.id)
      gf.roundNumber = 2
      gf.turnOrder = counterclockwise.filter(pid => stillIn.includes(pid))
      gf.currentTurnIdx = 0
      io.to(roomId).emit('grand_finale_round_start', { roomId, roundNumber: 2, turnOrder: gf.turnOrder, pile3Pot: gf.pile3Pot })
      startHNNextTurn(io, roomId)
      return
    } else {
      const stillIn = gf.turnOrder.filter(pid => !gf.foldedPlayers.includes(pid))
      if (stillIn.length === 0) { finalizeHNGrandFinale(io, roomId, null, gf.pile3Pot, gf.foulPlayers, true); return }
      if (stillIn.length === 1) { finalizeHNGrandFinale(io, roomId, stillIn[0], gf.pile3Pot, gf.foulPlayers, false); return }
      const winner = resolveHNGrandFinaleShowdown(io, roomId, stillIn)
      finalizeHNGrandFinale(io, roomId, winner, gf.pile3Pot, gf.foulPlayers, false)
      return
    }
  }

  const currentPid = gf.turnOrder[gf.currentTurnIdx]
  const seat = seatById(state, currentPid)!
  const callAmount = gameConfig.grandFinale.callAmount.highNoble ?? 0
  const timeLimitMs = (gameConfig.grandFinale.betTimer.highNoble ?? 8) * 1000

  io.to(roomId).emit('grand_finale_turn', { roomId, playerId: currentPid, roundNumber: gf.roundNumber, callAmount, timeLimitMs })

  if (seat.isHuman) {
    if (gf.decisionTimerId) clearTimeout(gf.decisionTimerId)
    // หมดเวลา = Auto-Call ใบ default (ตรงกับ single-player High Noble UX — Fold ต้อง swipe เอง)
    gf.decisionTimerId = setTimeout(() => applyHNGrandFinaleAction(io, roomId, currentPid, 'call'), timeLimitMs)
  } else {
    const aiThinkMs = 7000 + Math.floor(Math.random() * 3000)
    setTimeout(() => {
      const action = decideHNAIGrandFinaleAction(state, currentPid)
      applyHNGrandFinaleAction(io, roomId, currentPid, action)
    }, aiThinkMs)
  }
}

// ── Card-Counting Winrate Estimate (สำหรับ Boss เท่านั้น, ports estimateBossWinrate เดิม) ──
function estimateHNWinrate(state: HNMatchState, bossId: string): number {
  const community = state.community!
  const finalPile3 = state.finalPile3 ?? {}
  const gf = state.grandFinale
  if (!gf) return 0.5

  const myHand = finalPile3[bossId] ?? []
  if (myHand.length !== 3) return 0
  const myResult = evaluateHand([...myHand, ...community.row3])

  const cardId = (c: Card) => `${c.rank}_${c.suit}`
  const seen = new Set<string>()
  community.row1.forEach(c => seen.add(cardId(c)))
  community.row2.forEach(c => seen.add(cardId(c)))
  community.row3.forEach(c => seen.add(cardId(c)))
  myHand.forEach(c => seen.add(cardId(c)))
  if (state.pendingPile12) {
    for (const arr of Object.values(state.pendingPile12.allArrangements)) {
      arr.pile1.forEach(c => seen.add(cardId(c)))
      arr.pile2.forEach(c => seen.add(cardId(c)))
    }
  }
  for (const cards of Object.values(gf.revealedCards)) cards.forEach(c => seen.add(cardId(c)))

  const SUITS: Array<Card['suit']> = ['spades', 'hearts', 'diamonds', 'clubs']
  const RANKS: Array<Card['rank']> = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
  const VALUE: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 }
  const unseen: Card[] = []
  for (const r of RANKS) for (const s of SUITS) {
    const id = `${r}_${s}`
    if (!seen.has(id)) unseen.push({ rank: r, suit: s, value: VALUE[r] })
  }

  const opponents = gf.turnOrder.filter(pid => pid !== bossId && !gf.foldedPlayers.includes(pid))
  if (opponents.length === 0) return 1.0

  let opponentsBeatMe = 0
  for (const oppId of opponents) {
    const revealed = gf.revealedCards[oppId] ?? []
    const need = 3 - revealed.length
    const dangerCards = [...unseen].sort((a, b) => b.value - a.value).slice(0, need)
    const bestOppHand = [...revealed, ...dangerCards]
    if (bestOppHand.length !== 3) continue
    const oppResult = evaluateHand([...bestOppHand, ...community.row3])
    if (compareHands(oppResult, myResult) > 0) opponentsBeatMe++
  }
  const safeOpponents = opponents.length - opponentsBeatMe
  return safeOpponents / opponents.length
}

function decideHNAIGrandFinaleAction(state: HNMatchState, aiId: string): 'call' | 'fold' {
  const community3 = state.community!.row3
  const hand3 = (state.finalPile3 ?? {})[aiId] ?? []
  if (hand3.length !== 3) return 'fold'
  const result = evaluateHand([...hand3, ...community3])
  let callProb: number
  if (result.rankIndex >= 3) callProb = 0.99
  else if (result.rankIndex === 2) callProb = 0.90
  else if (result.rankIndex === 1) callProb = 0.80
  else callProb = 0.40

  const seat = seatById(state, aiId)
  if (seat?.role === 'boss') {
    const winrate = estimateHNWinrate(state, aiId)
    switch (seat.personality) {
      case 'reaper': callProb = Math.min(0.99, winrate + 0.20); break
      case 'crag': callProb = Math.max(0.05, winrate - 0.15); break
      case 'cortex': return winrate >= 0.5 ? 'call' : 'fold'
      case 'cipher':
        if (Math.random() < 0.3) return Math.random() < 0.5 ? 'call' : 'fold'
        callProb = winrate
        break
    }
  }
  return Math.random() < callProb ? 'call' : 'fold'
}

// ── เลือกใบที่จะหงายของ AI/Boss (ports pickRevealCard เดิม) ──
function pickHNRevealCard(state: HNMatchState, playerId: string, hand: Card[], alreadyRevealed: Card[]): Card | undefined {
  if (hand.length === 0) return undefined
  const remaining = hand.filter(c => !alreadyRevealed.some(r => r.rank === c.rank && r.suit === c.suit))
  if (remaining.length === 0) return undefined

  const seat = seatById(state, playerId)
  if (seat?.role === 'boss' && seat.personality !== 'cipher') {
    const community = state.community!
    const fullHand = [...hand, ...community.row3]
    const rankCount: Record<string, number> = {}
    fullHand.forEach(c => { rankCount[c.rank] = (rankCount[c.rank] ?? 0) + 1 })
    const kickers = remaining.filter(c => rankCount[c.rank] === 1)
    if (kickers.length > 0) return kickers.reduce((min, c) => c.value < min.value ? c : min, kickers[0])
  }
  return remaining.reduce((min, c) => c.value < min.value ? c : min, remaining[0])
}

function applyHNGrandFinaleAction(
  io: Server, roomId: string, playerId: string, action: 'call' | 'fold', chosenCardKey?: string,
): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  const gf = state.grandFinale
  if (!gf) return
  if (gf.decisionTimerId) { clearTimeout(gf.decisionTimerId); gf.decisionTimerId = undefined }

  let revealedCardKey: string | undefined
  if (action === 'fold') {
    gf.foldedPlayers.push(playerId)
  } else {
    const callAmount = gameConfig.grandFinale.callAmount.highNoble ?? 0
    state.tokenBalance[playerId] = (state.tokenBalance[playerId] ?? 0) - callAmount
    gf.pile3Pot += callAmount
    const hand = (state.finalPile3 ?? {})[playerId] ?? []
    const already = gf.revealedCards[playerId] ?? []
    // Human เลือกใบเองได้ (ตรงกับ single-player) — ใช้ถ้าถูกต้อง ไม่งั้น fallback ไป pickHNRevealCard
    let card = chosenCardKey
      ? hand.find(c => cardKey(c) === chosenCardKey && !already.some(r => r.rank === c.rank && r.suit === c.suit))
      : undefined
    if (!card) card = pickHNRevealCard(state, playerId, hand, already)
    if (card) {
      gf.revealedCards[playerId] = [...already, card]
      revealedCardKey = cardKey(card)
    }
  }

  io.to(roomId).emit('grand_finale_action', {
    roomId, playerId, action, revealedCard: revealedCardKey,
    roundNumber: gf.roundNumber,
    pile3Pot: gf.pile3Pot, tokenBalance: state.tokenBalance,
  })

  gf.currentTurnIdx++
  startHNNextTurn(io, roomId)
}

export function submitHNGrandFinaleAction(
  io: Server, roomId: string, playerId: string, action: 'call' | 'fold', revealedCardKey?: string,
): { ok: boolean; reason?: string } {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'grand_finale') return { ok: false, reason: 'not_in_grand_finale' }
  const gf = state.grandFinale
  if (!gf || gf.turnOrder[gf.currentTurnIdx] !== playerId) return { ok: false, reason: 'not_your_turn' }
  applyHNGrandFinaleAction(io, roomId, playerId, action, revealedCardKey)
  return { ok: true }
}

function resolveHNGrandFinaleShowdown(io: Server, roomId: string, stillIn: string[]): string | null {
  const state = hnMatchStates.get(roomId)
  if (!state) return null
  const gf = state.grandFinale!
  const community3 = state.community!.row3
  const reveals: Record<string, string[]> = {}
  let bestId: string | null = null
  let bestHand: HandResult | null = null

  stillIn.forEach(pid => {
    const hand = (state.finalPile3 ?? {})[pid] ?? []
    reveals[pid] = hand.map(cardKey)
    const result = evaluateHand([...hand, ...community3])
    if (!bestHand || compareHands(result, bestHand) > 0) { bestHand = result; bestId = pid }
  })

  io.to(roomId).emit('grand_finale_reveal_all', { roomId, reveals })
  return bestId
}

function finalizeHNGrandFinale(
  io: Server, roomId: string, winnerId: string | null, pile3Pot: number, foulPlayers: string[], burned: boolean,
): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return

  const allPlayerIds = state.seats.map(s => s.id)
  const stakes = gameConfig.tokenPot.tiers.highNoble
  const rake = gameConfig.tokenPot.rake
  const deltas: Record<string, number> = {}
  allPlayerIds.forEach(id => deltas[id] = 0)

  // ทุกคนจ่าย ante Pile3 ไปแล้วตั้งแต่ต้น Round — Burn ถ้าทุกคน Foul, ไม่งั้น Winner ได้ Pot คืน (หัก rake)
  allPlayerIds.forEach(id => deltas[id] += -stakes.pile3)
  if (winnerId && !burned) {
    const net = Math.floor(pile3Pot * (1 - rake))
    deltas[winnerId] += net
  }

  const pendingP12 = state.pendingPile12
  let jackpotWinner: string | null = null
  let pile1Pot = 0, pile2Pot = 0
  if (pendingP12) {
    const p1w = pendingP12.pile1Winner, p2w = pendingP12.pile2Winner
    const p12Deltas = calcDeltas(p1w, p2w, '', allPlayerIds)
    allPlayerIds.forEach(id => { deltas[id] = (deltas[id] ?? 0) + (p12Deltas[id] ?? 0) })
    pile1Pot = Math.floor(stakes.pile1 * allPlayerIds.length * (1 - rake))
    pile2Pot = Math.floor(stakes.pile2 * allPlayerIds.length * (1 - rake))
    if (winnerId && !burned && p1w === winnerId && p2w === winnerId) jackpotWinner = winnerId // Triple Sweep (Pile1+2+3 คนเดียว)
  }

  // Triple Sweep Jackpot: bonus = pile3 ante × (n-1) จากผู้แพ้ทุกคน, rake 10% จากยอดรวม
  let jackpotBonus = 0, jackpotRake = 0
  if (jackpotWinner) {
    const rakeJackpot = gameConfig.tokenPot.rakeJackpot ?? 0.10
    jackpotBonus = stakes.pile3 * (allPlayerIds.length - 1)
    const jackpotSubtotal = pile1Pot + pile2Pot + Math.floor(pile3Pot * (1 - rake)) + jackpotBonus
    jackpotRake = Math.floor(jackpotSubtotal * rakeJackpot)
    deltas[jackpotWinner] += (jackpotBonus - jackpotRake)
    allPlayerIds.forEach(id => { if (id !== jackpotWinner) deltas[id] += -stakes.pile3 })
  }

  allPlayerIds.forEach(id => {
    state.tokenBalance[id] = (state.tokenBalance[id] ?? 0) + (deltas[id] ?? 0)
  })

  io.to(roomId).emit('grand_finale_result', {
    roomId, winnerId, burned, pile3Pot,
    winnerRank: null,
    pile1Winner: pendingP12?.pile1Winner ?? null,
    pile2Winner: pendingP12?.pile2Winner ?? null,
    pile1Pot, pile2Pot,
    jackpotWinner, jackpotBonus, jackpotRake,
    tokenBalance: state.tokenBalance,
    tokenDeltas: deltas,
  })

  const result = { roundNumber: state.roundNumber, pile1Winner: pendingP12?.pile1Winner ?? '', pile2Winner: pendingP12?.pile2Winner ?? '', pile3Winner: winnerId ?? '', tokenDeltas: deltas }
  state.results.push(result)

  setTimeout(async () => {
    if (state.roundNumber >= state.totalRounds) {
      state.phase = 'match_end'
      const finalWinner = allPlayerIds.reduce((a, b) => (state.tokenBalance[a] ?? 0) > (state.tokenBalance[b] ?? 0) ? a : b)

      // ── Settlement จริง: คืน lock-up ante + persist ผลแพ้/ชนะสุทธิของแมตช์ลง token_balance ──
      // (ของเดิมคืนแค่ locked ante เฉยๆ ไม่เคย persist ผลเล่นจริง — แก้เป็น prerequisite ก่อน Monarch payout)
      // Monarch Spec v1.3 §3: ผู้ชนะ human ที่เจอ Monarch (กำไรสุทธิ > 0) ได้ Pot ×2.0 ระดับ "ทั้งแมตช์" —
      // ส่วนต่างที่เพิ่ม (อีก 1x) เป็น House mint ไม่หักจากผู้เล่นอื่น (ยืนยันขอบเขตกับลุงเยาะแล้ว — ระดับ match ไม่ใช่ต่อ pile/round)
      const HN_BASELINE = 5000
      const bossSeatFinal = state.seats[0]
      const winnerSeat = seatById(state, finalWinner)
      const isMonarchMatch = bossSeatFinal.isMonarch === true
      const isHumanWinner = !!winnerSeat?.isHuman

      const humanNetDeltas: Record<string, number> = {}
      await Promise.all(humanSeats(state).map(async s => {
        await returnPlayerLockedTokens(s.id, state.lockedTokens[s.id] ?? 0)
        const netDelta = (state.tokenBalance[s.id] ?? HN_BASELINE) - HN_BASELINE
        humanNetDeltas[s.id] = netDelta
        const payout = computeHNHumanPayout(netDelta, isMonarchMatch && isHumanWinner && s.id === finalWinner, gameConfig.monarchConfig.potMultiplier)
        if (payout !== 0) await persistHNNetTokenResult(s.id, payout)
      }))

      // Badge "Monarch Slayer" + เงื่อนไข Ascendant Gate (Spec v1.3 §5)
      if (isMonarchMatch && isHumanWinner) {
        await recordMonarchVictory(finalWinner)
      }

      // Performance Score — active ตั้งแต่ Tier A+ (Spec v1.3 §4)
      await awardPerformanceScore({
        tier: 'highNoble',
        finalWinnerId: isHumanWinner ? finalWinner : null,
        isMonarchMatch,
        humanNetDeltas,
      })

      io.to(roomId).emit('match_end', { roomId, finalWinner, tokenBalance: state.tokenBalance, results: state.results, totalRounds: state.totalRounds })
      hnMatchStates.delete(roomId)
    } else {
      state.roundNumber++
      await delay(2000)
      await startHNRound(io, roomId)
    }
  }, 5000) // หน่วงให้ client เห็น Grand Finale result popup ก่อนต่อ Round (ตรงกับ single-player gfResultStage 2 timing)
}

// ============================================================
// DISCONNECT — แทน Human ด้วย AI ทันที (burn lock-up, ไม่มี grace period)
// mirror ของ replaceMultiPlayerWithAI เดิม แต่ครอบคลุมทุก phase ของ High Noble
// ============================================================
export async function replaceHNPlayerWithAI(io: Server, roomId: string, userId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  const seat = seatById(state, userId)
  if (!seat || !seat.isHuman) return

  // Burn ทั้งหมด ไม่คืน
  const { burnLockedTokens } = await import('./gameLoop')
  try { await burnLockedTokens(userId, roomId) } catch (err) { console.error('[HN-DISCONNECT] burn error:', err) }

  // LobbyMatchmaking_Spec_v1_0 §6.1: filler ใน High Noble = Minion ทั้งระบบแล้ว (ไม่ใช่แค่ตอน Deadlock "Start Now")
  // — ตอน Human หลุดกลางเกมก็แทนที่ด้วย Minion สุ่มเช่นกัน เพื่อความสอดคล้อง (personality สุ่มอิสระ 1 ใน 3 เหมือนเดิม)
  const p = FILLER_PERSONALITIES[Math.floor(Math.random() * FILLER_PERSONALITIES.length)]
  const [minionName] = pickRandomMinions(1)
  seat.isHuman = false
  seat.name = minionName
  seat.emoji = '🤖'
  seat.personality = p
  seat.isMinion = true

  io.to(roomId).emit('player_disconnected_replaced', { roomId, userId, replacementName: seat.name })

  // Auto-ตัดสินใจแทนตำแหน่งที่ค้างอยู่ ณ phase ปัจจุบัน กันเกม stall — Minion ใช้ greedyArrangement เสมอ
  if (state.phase === 'arrangement' && !state.submittedArrangement.has(userId)) {
    state.arrangements![userId] = greedyArrangement(state.cardsMap![userId], state.community!)
    state.submittedArrangement.add(userId)
    if (allHumansSubmitted(state, state.submittedArrangement)) await resolveHNArrangementPhaseComplete(io, roomId)
  } else if (state.phase === 'arrangement_2' && !state.submittedArrangement.has(userId)) {
    const fullHand = state.auctionWonCards?.[userId]
      ? [...state.cardsMap![userId], state.auctionWonCards[userId]]
      : state.cardsMap![userId]
    state.arrangements![userId] = greedyArrangement(fullHand, state.community!)
    state.submittedArrangement.add(userId)
    if (allHumansSubmitted(state, state.submittedArrangement)) startHNDiscardPhase(io, roomId)
  } else if (state.phase === 'discard' && !state.submittedDiscard.has(userId)) {
    const arr = state.arrangements![userId]
    const { keep } = bestThreeFromHand([...arr.pile3], state.community!.row3)
    const finalArr: PlayerArrangement = { pile1: arr.pile1.slice(0, 3), pile2: arr.pile2.slice(0, 3), pile3: keep }
    state.arrangements![userId] = finalArr
    const foul = checkFoul(finalArr, state.community!)
    state.foulMap![userId] = foul.isFoul
    state.finalPile3![userId] = keep
    state.submittedDiscard.add(userId)
    if (allHumansSubmitted(state, state.submittedDiscard)) await resolveHNDiscardComplete(io, roomId)
  } else if (state.phase === 'grand_finale' && state.grandFinale?.turnOrder[state.grandFinale.currentTurnIdx] === userId) {
    const action = decideHNAIGrandFinaleAction(state, userId)
    applyHNGrandFinaleAction(io, roomId, userId, action)
  }
}
