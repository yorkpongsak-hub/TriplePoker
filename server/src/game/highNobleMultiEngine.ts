// ============================================================
// highNobleMultiEngine.ts — High Noble Multiplayer (3 Human + 1 Boss AI)
// แยกไฟล์ใหม่ทั้งหมด ไม่แตะ gameLoop.ts เดิม (single-player + Adept-multi)
// ตามสถาปัตยกรรม "Tier ใหม่ = copy จาก Tier ที่เสร็จแล้วมาแก้เฉพาะจุด"
//
// โครงสร้างที่นั่ง (คงลำดับเดิมจาก single-player highNoble — ปัจจุบันยังตรงกับ roomRegistry seat index
// เสมอ เพราะ roomRegistry ยัง fix seat[0]=Boss ตายตัว, แต่ startHighNobleMultiMatch() ด้านล่างไม่ผูก
// role กับ raw index อีกแล้ว — หา boss จาก rs.isBoss flag ตรงๆ เตรียมรองรับ LobbyMatchmaking_Spec_v1_1
// Step 3 ที่จะเลิก fix seat[0]=Boss):
//   seat 0 = Boss (จตุรเทพ, AI เสมอ, ห้าม Human เข้า)  — เดิมคือ AI_SAGE / P3
//   seat 1 = P4  (Human หรือ AI filler)                — เดิมคือ AI_RECKLESS
//   seat 2 = P1  (Human หรือ AI filler)                — เดิมคือ "humanPlayerId" ตัวเดียว
//   seat 3 = P2  (Human หรือ AI filler)                — เดิมคือ AI_GHOST
// ลำดับนี้ตรงกับ turn order เดิมของ Grand Finale (ตามเข็ม P3→P4→P1→P2) — turn order derive จาก
// state.seats array order ตรงๆ (ไม่ใช่จาก role) ยังไม่ถูกแตะใน Step 2 นี้
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Server } from 'socket.io'
import { finishSpectatorBroadcast, publishSpectatorEvent } from '../spectator/spectatorRuntime'
import { dealCards } from './cardEngine'
import { evaluateHand, compareHands, handRankLabel, HandResult } from './handEvaluator'
import { checkFoul, PlayerArrangement, CommunityCards } from './foulChecker'
import { aiDecideArrangement, AIConfig, AIPersonality, FOUR_GODS, greedyArrangement, pickRandomMinions } from './aiEngine'
import { Card } from './deck'
import { gameConfig } from '../config/gameConfig'
import { supabaseAdmin } from '../config/supabase'
import { escrowBuyIn, settleEscrow, refundEscrow } from './gameLoop'
import { Seat as RoomSeat } from './roomRegistry'
import { lockMonarchPersonality } from './monarchAI'
import { recordMonarchVictory } from './monarchSpawn'
import { awardPerformanceScore } from './psEngine'
import { recordMatchStats, BestHandCandidate } from './matchStatsService'
import { recordMatchWin } from './matchWinsService'

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

// End-of-Match Stats: อัปเดต bestHandThisMatch ของ seat นี้ (ต่อ userId) ถ้า hand รอบนี้ดีกว่าเดิม
// High Noble ใช้ Sequential Showdown เหมือน Mastermind — state.results ไม่เก็บ arrangements/community
// ครบ ต้อง live-track ตอนประเมิน hand จริงเท่านั้น (ดู resolveHNDiscardComplete/finalizeHNGrandFinale)
function trackBestHandLive(
  state: HNMatchState, userId: string, hand: HandResult, cards: Card[], pile: 1 | 2 | 3, won: boolean,
): void {
  if (!state.bestHandThisMatch) state.bestHandThisMatch = {}
  const prev = state.bestHandThisMatch[userId]
  if (!prev || hand.score > prev.hand.score) {
    state.bestHandThisMatch[userId] = { hand, cards: cards.map(c => cardKey(c).toUpperCase()), pile, won }
  }
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
  avatarUrl?: string
  personality?: AIPersonality  // เฉพาะ AI seat — สำหรับ Monarch คือบุคลิกที่ล็อคไว้ (client ไม่เห็นค่านี้ เห็นแค่ name="Monarch")
  isMonarch?: boolean          // Monarch Spec v1.3: true เฉพาะที่นั่ง Boss ที่สุ่มโดน Monarch — บุคลิกล็อคครั้งเดียวตอนแจกไพ่ ไม่สลับกลางเกม
  isMinion?: boolean           // LobbyMatchmaking_Spec_v1_0 §6.1: true เฉพาะที่นั่งเติมด้วย Minion (Deadlock "Start Now") — ใช้ greedyArrangement เสมอ
  isVip?: boolean              // เฉพาะ Human (มติลุงเยาะ 2026-07-26) — Gold Radiance frame ทุกที่นั่ง ไม่ใช่แค่ P1
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

export interface HNMatchState {
  roomId: string
  seats: [HNSeat, HNSeat, HNSeat, HNSeat]
  roundNumber: number
  totalRounds: number
  tokenBalance: Record<string, number>
  flowPot: [number, number, number]
  buyInAmount: number                    // Escrow Buy-in Spec §2 — เท่ากันทุกคนในแมตช์เดียวกัน
  escrowIds: Record<string, string>      // เฉพาะ human seat — ใช้ settle ตอนจบแมตช์/หลุดกลางเกม
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
  // Number of played piles already moved from player hands into shared columns.
  resolvedPileCount?: 0 | 1 | 2 | 3
  // End-of-Match Stats Recording — live tracking ต่อ human seat (userId) ตลอดแมตช์
  bestHandThisMatch?: Record<string, BestHandCandidate>
  tripleSweepThisMatch?: Set<string>
  // Full Reconnect System Step 2B (MasterPlan §6.16) — grace period 60s ก่อน settle+replace ถาวร
  // ⚠️ INVARIANT: ตราบใดที่ userId อยู่ใน map นี้ seat.isHuman ต้องคง true เสมอ (ห้าม flip จนกว่า
  // finalizeHNAFKReplacement จะทำงานจริง) เพราะ aiSeats()/AI decision loop ทุกจุด filter จาก !isHuman
  // — flip ก่อนกำหนด = seat ถูก AI logic จับไปเล่นแทนทันที ไม่ passive ตามที่ออกแบบไว้
  afkPlayers: Record<string, { disconnectedAt: number; graceTimer: NodeJS.Timeout }>
}

const hnMatchStates = new Map<string, HNMatchState>()

export function getHNMatchState(roomId: string): HNMatchState | undefined {
  return hnMatchStates.get(roomId)
}

export interface HNCardZones {
  stockCount: number
  communityCount: number
  auctionCount: number
  discardCount: number
  handCounts: Record<string, number>
  resolvedPileCounts: { pile1: number; pile2: number; pile3: number }
  totalCards: 52
}

/** Public, face-agnostic ledger used by every High Noble UI flow. */
export function buildHNCardZones(state: HNMatchState): HNCardZones {
  if (!state.cardsMap || !state.community) {
    return {
      stockCount: 52, communityCount: 0, auctionCount: 0, discardCount: 0,
      handCounts: Object.fromEntries(state.seats.map(seat => [seat.id, 0])),
      resolvedPileCounts: { pile1: 0, pile2: 0, pile3: 0 }, totalCards: 52,
    }
  }
  const cardsMap = state.cardsMap
  const beforeAuction = state.phase === 'arrangement' || state.phase === 'showdown'
  const inAuction = state.phase === 'blind_auction' || state.phase === 'auction_done'
  const resolved = state.resolvedPileCount ?? 0
  const resolvedPileCounts = {
    pile1: resolved >= 1 ? state.seats.reduce((n, s) => n + (state.arrangements?.[s.id]?.pile1.length ?? 0), 0) : 0,
    pile2: resolved >= 2 ? state.seats.reduce((n, s) => n + (state.arrangements?.[s.id]?.pile2.length ?? 0), 0) : 0,
    pile3: resolved >= 3 ? state.seats.reduce((n, s) => n + (state.arrangements?.[s.id]?.pile3.length ?? 0), 0) : 0,
  }
  const handCounts = Object.fromEntries(state.seats.map(seat => {
    const arr = state.arrangements?.[seat.id]
    let count = beforeAuction || inAuction
      ? (cardsMap[seat.id]?.length ?? 0)
      : arr ? arr.pile1.length + arr.pile2.length + arr.pile3.length : (cardsMap[seat.id]?.length ?? 0)
    if (arr) {
      if (resolved >= 1) count -= arr.pile1.length
      if (resolved >= 2) count -= arr.pile2.length
      if (resolved >= 3) count -= arr.pile3.length
    }
    return [seat.id, Math.max(0, count)]
  }))
  const stockCount = beforeAuction ? 2 : 0
  const auctionCount = inAuction ? 2 : 0
  const communityCount = 6
  const visible = stockCount + auctionCount + communityCount
    + Object.values(handCounts).reduce((a, b) => a + b, 0)
    + Object.values(resolvedPileCounts).reduce((a, b) => a + b, 0)
  const discardCount = 52 - visible
  if (discardCount < 0) throw new Error(`[HN card zones] invalid ledger: ${visible} visible cards`)
  return { stockCount, communityCount, auctionCount, discardCount, handCounts, resolvedPileCounts, totalCards: 52 }
}

function emitHNCardZones(io: Server, state: HNMatchState): void {
  io.to(state.roomId).emit('hn_card_zones', buildHNCardZones(state))
}

function emitHNTokenFlow(io: Server, state: HNMatchState): void {
  const stackTotal = Object.values(state.tokenBalance).reduce((sum, value) => sum + value, 0)
  const potTotal = state.flowPot.reduce((sum, value) => sum + value, 0)
  const feeRake = state.buyInAmount * state.seats.length - stackTotal - potTotal
  io.to(state.roomId).emit('token_flow_update', {
    roomId: state.roomId, tokenBalance: state.tokenBalance, pot: state.flowPot,
    feeRake, buyIn: state.buyInAmount,
  })
}

// ============================================================
// buildHNSnapshotForPlayer — Full Reconnect System Step 2A (MasterPlan §6.16)
// ประกอบ state ปัจจุบันเป็น snapshot สำหรับ "userId" คนเดียว ครอบคลุมทุก phase
// (ต่างจาก resend เดิมที่ทำได้แค่ phase 'arrangement')
//
// หลักการ: WHITELIST ล้วน — ใส่เฉพาะ field ที่ยืนยันแล้วว่าปลอดภัยต่อ userId นี้
// (ดู Reconnect Visibility Matrix ที่ตรวจไว้ก่อนหน้า) field ไหนไม่อยู่ในนี้ = ไม่ส่ง
// ลืมใส่ field ใหม่ในอนาคต = ปลอดภัยโดยอัตโนมัติ (ตรงข้ามกับ blacklist ที่ลืม = leak)
//
// ⚠️ ANTI-CHEAT CRITICAL: ห้าม spread state ทั้งก้อนหรือส่ง field ที่มีไพ่ดิบของคนอื่น
// เด็ดขาด โดยเฉพาะ pendingPile12.allArrangements กับ bestHandThisMatch (มีไพ่จริงของ
// ทุกคนรวมผู้แพ้ที่ไม่เคยถูกเปิดเผยต่อสาธารณะ) — ใช้ได้แค่ "ภายใน" ฟังก์ชันนี้เพื่อ derive
// ค่าที่ปลอดภัยผ่าน revealWinnerOnly() เท่านั้น ห้ามส่งค่าดิบออกไปเป็นอันขาด
// ============================================================
export function buildHNSnapshotForPlayer(state: HNMatchState, userId: string): Record<string, any> {
  // ── Public เสมอทุก phase (ตรงกับ payload ที่ event เดิมเคย broadcast ให้ทุกคนอยู่แล้ว) ──
  const community = state.community
    ? { pile1: state.community.row1.map(cardKey), pile2: state.community.row2.map(cardKey), pile3: state.community.row3.map(cardKey) }
    : null
  const seatsPublic = state.seats.map(s => ({
    id: s.id, name: s.name, emoji: s.emoji, avatarUrl: s.avatarUrl, role: s.role, isHuman: s.isHuman, isVip: s.isVip,
    // personality / isMonarch / isMinion ห้ามส่งเด็ดขาด — ground truth (round_start เดิม) ไม่เคยส่งเช่นกัน
  }))
  const auctionWonCards = state.auctionWonCards
    ? Object.fromEntries(Object.entries(state.auctionWonCards).map(([pid, c]) => [pid, cardKey(c)]))
    : null
  const grandFinale = state.grandFinale
    ? {
        turnOrder: state.grandFinale.turnOrder,
        currentTurnIdx: state.grandFinale.currentTurnIdx,
        foldedPlayers: state.grandFinale.foldedPlayers,
        foulPlayers: state.grandFinale.foulPlayers,
        pile3Pot: state.grandFinale.pile3Pot,
        roundNumber: state.grandFinale.roundNumber,
        // revealedCards = ไพ่ที่ "ถูกหงายไปแล้วจริง" ผ่าน grand_finale_action เท่านั้น ปลอดภัยส่งได้ทุกคน
        // (decisionTimerId ไม่ใส่ — เป็น NodeJS timer handle serialize ไม่ได้ + ไม่มีประโยชน์ต่อ client)
        revealedCards: Object.fromEntries(
          Object.entries(state.grandFinale.revealedCards).map(([pid, cards]) => [pid, cards.map(cardKey)])
        ),
      }
    : null

  // ── SELF เท่านั้น (own-key ล้วน ห้ามหลุดไปถึงคนอื่น) ──
  // myCards = มือดิบของตัวเอง (คนละความหมายกับ myArrangement ด้านล่างที่คือการจัดกองแล้ว) —
  // ตั้งแต่ arrangement_2 เป็นต้นไป (หลังประมูลจบ) ถ้าชนะใบประมูลมา ต้อง concat เข้าไปด้วยให้ครบ 12 ใบ
  // ก่อนหน้านั้น (arrangement/blind_auction) ยังไม่ถึงจังหวะได้ไพ่ประมูล คงไว้ที่ 11 ใบเดิม
  // ⚠️ merge เฉพาะ auctionWonCards[userId] (own key) เท่านั้น + สร้าง array ใหม่ด้วย spread ไม่แตะ
  // state.cardsMap ต้นฉบับเด็ดขาด (กัน side-effect กระทบ flow จริงที่ยังใช้ cardsMap อยู่)
  const MERGE_AUCTION_PHASES = new Set<HNMatchState['phase']>([
    'arrangement_2', 'discard', 'discard_done', 'fog_of_war', 'grand_finale', 'match_end',
  ])
  let myCards: string[] | null = null
  if (state.cardsMap?.[userId]) {
    const rawHand = state.cardsMap[userId]
    const wonCard = state.auctionWonCards?.[userId]
    const fullHand = (MERGE_AUCTION_PHASES.has(state.phase) && wonCard) ? [...rawHand, wonCard] : rawHand
    myCards = fullHand.map(cardKey)
  }
  const myArrangement = state.arrangements?.[userId]
    ? {
        pile1: state.arrangements[userId].pile1.map(cardKey),
        pile2: state.arrangements[userId].pile2.map(cardKey),
        pile3: state.arrangements[userId].pile3.map(cardKey),
      }
    : null
  const myAuctionBid = state.auctionBids?.[userId] ?? null
  const myFinalPile3 = state.finalPile3?.[userId] ? state.finalPile3[userId].map(cardKey) : null
  const ownSubmitted = {
    arrangement: state.submittedArrangement.has(userId),
    auctionBid: state.submittedAuctionBid.has(userId),
    discard: state.submittedDiscard.has(userId),
  } // เฉพาะ boolean ของ userId เจ้าของเท่านั้น — ห้าม loop ส่ง status ของคนอื่น

  // ── Opponent pile1/pile2 — เปิดเผยเฉพาะ "ผู้ชนะกอง" เท่านั้น ตั้งแต่ discard_done เป็นต้นไป
  // reuse revealWinnerOnly() เดิม (98-111) ไม่เขียน masker ซ้ำ — pendingPile12 ถูก set ตอน
  // resolveHNDiscardComplete (บรรทัด 760) เท่านั้น ก่อนหน้านั้นเป็น undefined จึงได้ null โดยธรรมชาติ
  // ไม่ต้องเช็ค phase แยก
  let pileReveals: { pile1: Record<string, string[] | null>; pile2: Record<string, string[] | null> } | null = null
  if (state.pendingPile12) {
    const { pile1Winner, pile2Winner, allArrangements } = state.pendingPile12
    pileReveals = {
      pile1: revealWinnerOnly(allArrangements, 1, pile1Winner),
      pile2: revealWinnerOnly(allArrangements, 2, pile2Winner),
    }
  }

  // ── foulMap/foulReasons — ปิดบังจนกว่าจะถึง discard_done (จังหวะเดียวกับที่ pile_reveal เปิดเผย
  // จริงในโค้ดเดิม บรรทัด 735/751) ใช้ pendingPile12 เป็นตัวบ่งชี้ว่าถึงจังหวะเปิดเผยหรือยัง
  const foulRevealed = state.pendingPile12 !== undefined
  const foulMap = foulRevealed ? (state.foulMap ?? null) : null
  const foulReasons = foulRevealed ? (state.foulReasons ?? null) : null

  return {
    // public
    phase: state.phase,
    roomId: state.roomId,
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    tokenBalance: state.tokenBalance,
    buyInAmount: state.buyInAmount,
    results: state.results,
    community,
    blindAuctionCards: state.blindAuctionCards ? state.blindAuctionCards.map(cardKey) : null,
    auctionWonCards,
    seats: seatsPublic,
    grandFinale,
    pot: state.flowPot,
    cardZones: buildHNCardZones(state),
    feeRake: state.buyInAmount * state.seats.length
      - Object.values(state.tokenBalance).reduce((sum, value) => sum + value, 0)
      - state.flowPot.reduce((sum, value) => sum + value, 0),
    timeRemainingMs: null, // state ไม่เก็บ deadline timestamp ไว้เลย (มีแค่ setTimeout handle) — รอ Step 2B/2C

    // self-only
    myCards,
    myArrangement,
    myAuctionBid,
    myFinalPile3,
    ownSubmitted,

    // opponent-masked (null จนกว่าจะถึงจังหวะที่ข้อมูลนั้นถูกเปิดเผยต่อสาธารณะจริงแล้ว)
    pileReveals,
    foulMap,
    foulReasons,
  }
}

// Client เข้ามาถึง game screen แล้ว (socket ใหม่คนละอันจาก queueing socket) → join user room + ขอ state ปัจจุบัน
// Full Reconnect System Step 2A: ขยายจากเดิมที่ resend ได้แค่ phase 'arrangement' (ผ่าน 'round_start')
// เป็นครอบทุก phase ผ่าน buildHNSnapshotForPlayer (whitelist-only) แล้ว emit event ใหม่
// 'game_state_snapshot' แยกต่างหาก (Step 2C ฝั่ง client จะ handle event นี้) — ไม่แตะ manual filter
// จุดเดิมที่ยัง broadcast ปกติอยู่ (401-417, 587, 648, 718 ฯลฯ)
export function resendHNRoundStartToPlayer(io: Server, roomId: string, userId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) {
    // ห้าม silent-fail — client (Step 2C) ต้องรู้ว่าแมตช์นี้จบ/ไม่มีอยู่จริงแล้ว เพื่อเด้งกลับ lobby
    // แทนที่จะค้างจอรอ event ที่ไม่มีวันมาถึง (เช่น reconnect หลัง match_end ที่ลบ state ไปแล้ว)
    io.to(userId).emit('match_not_found', { roomId })
    return
  }
  const seat = seatById(state, userId)
  if (!seat || !seat.isHuman) return

  // Full Reconnect System Step 2B — reconnect ทันใน grace 60s: ยกเลิก timer ทันที คืนที่นั่งให้คุมต่อ
  // ได้เลย (seat ยัง isHuman:true อยู่แล้วตาม INVARIANT จึงผ่านเช็คด้านบนได้ปกติ ไม่ต้องทำอะไรเพิ่ม)
  const afk = state.afkPlayers[userId]
  if (afk) {
    clearTimeout(afk.graceTimer)
    delete state.afkPlayers[userId]
  }

  const snapshot = buildHNSnapshotForPlayer(state, userId)
  io.to(userId).emit('game_state_snapshot', snapshot)
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
): Promise<{ ok: true } | { ok: false; reason: 'INSUFFICIENT_TOKENS' | 'ACTIVE_MATCH_EXISTS' | 'SERVER_ERROR' }> {
  // v1.1 prerequisite: role ต้องผูกกับ rs.isBoss/rs.isMonarch flag ตรงๆ ไม่ใช่ raw array index i อีก
  // ต่อไป (เดิม roles[i] สมมติว่า seat 0 = boss เสมอ — จะพังทันทีถ้า Step 3 ย้าย seat order ของ
  // HighNoble ให้ Human เติมจากหัวแบบ Adept) — หา boss seat จริงจาก flag ก่อน แล้วไล่แจก p4/p1/p2 ให้
  // ที่นั่งที่เหลือตามลำดับ index ที่เจอ (ให้ผลลัพธ์เหมือนเดิมทุกกรณีตอนนี้ เพราะ roomRegistry การันตี
  // seat[0].isBoss=true เสมอในปัจจุบัน — zero behavior change จนกว่า Step 3 จะเปลี่ยน seat order จริง)
  const bossIdx = roomSeats.findIndex(rs => rs.isBoss)
  const nonBossRoles: HNSeat['role'][] = ['p4', 'p1', 'p2']
  let nonBossRoleIdx = 0
  let fillerIdx = 0

  // Query VIP status ของ human ทุกคนในห้องครั้งเดียว (มติลุงเยาะ 2026-07-26) — Gold Radiance frame
  // ต้องเช็ค VIP จริงทุกที่นั่ง ไม่ใช่แค่ P1 เหมือนเดิม
  const humanUserIds = roomSeats.filter(rs => rs.type === 'human' && rs.userId).map(rs => rs.userId!)
  const vipStatusByUserId: Record<string, string> = {}
  try {
    const { data: vipRows, error: vipErr } = await supabaseAdmin.from('users').select('user_id, vip_status').in('user_id', humanUserIds)
    if (vipErr) console.error('[HIGHNOBLE] Failed to read vip_status for seats:', vipErr)
    ;(vipRows ?? []).forEach(r => { vipStatusByUserId[r.user_id] = r.vip_status ?? 'none' })
  } catch (err) {
    console.error('[HIGHNOBLE] Unexpected error reading vip_status for seats:', err)
  }

  const seats = roomSeats.map((rs, i): HNSeat => {
    const role: HNSeat['role'] = i === bossIdx ? 'boss' : nonBossRoles[nonBossRoleIdx++]
    if (rs.type === 'human' && rs.userId) {
      const isVip = (vipStatusByUserId[rs.userId] ?? 'none') !== 'none'
      return { id: rs.userId, role, isHuman: true, name: rs.name, emoji: '👤', avatarUrl: rs.avatarUrl, isVip }
    }
    if (role === 'boss') {
      // Batch 1.5 Task 2 (Monarch v2.2 quarantine) — เส้นทางนี้ตายแล้วจริง: rollHighNobleBoss()
      // (monarchSpawn.ts, Batch 1) ไม่มีทางคืน isMonarch:true อีกต่อไป → rs.isMonarch ต้องเป็น
      // falsy เสมอ ณ จุดนี้ — เหลือ guard ไว้กันกรณีมี legacy state ค้าง/บั๊กในอนาคตทำให้ค่านี้หลุด
      // มาอีก (ดู audit Batch 1.5) ไม่ลบ branch นี้ทิ้งเพื่อไม่ต้องแตะ HNSeat.isMonarch type
      if (rs.isMonarch) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            '[QUARANTINE] Dead Monarch-in-HighNoble path hit (rs.isMonarch=true) — ' +
            'เส้นทางนี้ควรตายไปแล้วตั้งแต่ Batch 1 ถ้าเห็น error นี้แปลว่ามีจุดอื่นเซ็ต isMonarch:true ' +
            'กลับมาอีก ต้องตามหาต้นเหตุ ไม่ใช่ปิด error นี้ทิ้งเฉยๆ'
          )
        }
        // Production: ห้าม crash โต๊ะจริง — log เป็น alert แล้ว fallback เป็น Four Gods ปกติแทน
        console.error(
          '[QUARANTINE][ALERT] Dead Monarch-in-HighNoble path hit in PRODUCTION (rs.isMonarch=true) — ' +
          'fallback เป็น Four Gods ปกติ ต้องตามหาต้นเหตุด่วน seat:', JSON.stringify(rs),
        )
        const fallbackGod = FOUR_GODS.find(g => g.id === rs.aiConfigId) ?? FOUR_GODS[0]
        return { id: 'AI_BOSS', role, isHuman: false, name: fallbackGod.name, emoji: fallbackGod.emoji, personality: fallbackGod.personality }
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
  const buyInAmount = gameConfig.buyIn.highNoble
  const tokenBalance: Record<string, number> = {}
  const escrowIds: Record<string, string> = {}

  // Escrow Buy-in ทีละคน (sequential — ไม่ Promise.all) เพื่อ rollback ได้ถูกต้องถ้าคนใดคนหนึ่ง token ไม่พอ
  for (const s of seats.filter(s => s.isHuman)) {
    const escrow = await escrowBuyIn(s.id, roomId, 'highNoble')
    if (!escrow.ok) {
      await Promise.all(Object.entries(escrowIds).map(([doneUid, escrowId]) => refundEscrow(doneUid, escrowId, buyInAmount)))
      return { ok: false, reason: escrow.reason }
    }
    escrowIds[s.id] = escrow.escrowId
    tokenBalance[s.id] = escrow.buyInAmount
  }
  seats.filter(s => !s.isHuman).forEach(s => tokenBalance[s.id] = buyInAmount)

  const state: HNMatchState = {
    roomId, seats,
    roundNumber: 1, totalRounds,
    tokenBalance, buyInAmount, escrowIds, flowPot: [0, 0, 0],
    results: [],
    phase: 'waiting',
    submittedArrangement: new Set(),
    submittedAuctionBid: new Set(),
    submittedDiscard: new Set(),
    resolvedPileCount: 0,
    afkPlayers: {},
  }
  hnMatchStates.set(roomId, state)

  await startHNRound(io, roomId)
  return { ok: true }
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
// Full Reconnect System Step 2B — true ระหว่าง grace 60s (seat.isHuman ยังคง true อยู่เสมอตอนนี้)
function isHNPlayerAFK(state: HNMatchState, userId: string): boolean {
  return !!state.afkPlayers?.[userId]
}
// v1.1 fix: หา boss seat จาก role field ตรงๆ ไม่ใช่ state.seats[0] — เดิมสมมติว่า boss อยู่ index 0
// เสมอ ซึ่งไม่จริงอีกต่อไปสำหรับ public room หลัง LobbyMatchmaking_Spec_v1_1 (Human อาจอยู่ index 0
// ได้แล้ว) — ฟังก์ชันนี้เคยถูกประกาศไว้เฉยๆ ไม่มีใครเรียก (dead code) ส่วน 2 จุดที่ต้องใช้จริง (startHNRound
// ล็อค Monarch personality, finalizeHNGrandFinale ตัดสิน Pot×2) ก็อบปี้ logic state.seats[0] แบบเดียวกัน
// ไปใช้ตรงๆ แทน — แก้ตรงนี้ที่เดียวแล้วเปลี่ยนทั้ง 2 จุดให้เรียกฟังก์ชันนี้แทน (ดูด้านล่าง)
function bossSeat(state: HNMatchState): HNSeat {
  return state.seats.find(s => s.role === 'boss')!
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
  state.resolvedPileCount = 0

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
  // Batch 1.5 Task 2 (quarantine): เส้นทางนี้ตายแล้วจริงเช่นกัน (boss.isMonarch มาจาก seat ที่สร้าง
  // ใน startHighNobleMultiMatch ด้านบน ซึ่ง guard ไว้แล้วว่าไม่มีทางเป็น true อีก) — เหลือ guard ไว้
  // กันกรณี state ถูกแก้จากที่อื่น (defense in depth) คง logic เดิม (lockMonarchPersonality) ไว้ทุก
  // ประการหลัง guard ไม่ได้ลบทิ้ง เพราะไม่มีทางรันจริงใน production อยู่แล้ว
  const boss = bossSeat(state) // v1.1 fix: หาจาก role ไม่ใช่ index 0 ตรงๆ (ดู bossSeat() ด้านบน)
  if (boss.isMonarch && state.roundNumber === 1) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        '[QUARANTINE] Dead Monarch personality-lock path hit (boss.isMonarch=true) — ' +
        'เส้นทางนี้ควรตายไปแล้วตั้งแต่ Batch 1 ต้องตามหาต้นเหตุที่ isMonarch หลุดมาอีก',
      )
    }
    console.error('[QUARANTINE][ALERT] Dead Monarch personality-lock path hit in PRODUCTION (boss.isMonarch=true) — ต้องตามหาต้นเหตุด่วน boss:', JSON.stringify(boss))
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
  const aiNamesPublic = state.seats.map(s => ({ id: s.id, name: s.name, emoji: s.emoji, avatarUrl: s.avatarUrl, role: s.role, isHuman: s.isHuman, isVip: s.isVip }))

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
      cardZones: buildHNCardZones(state),
      ...(state.roundNumber === 1 ? { buyInAmount: state.buyInAmount } : {}),
    })
  })
  publishSpectatorEvent(roomId, { type: 'ROUND_STARTED', round: state.roundNumber, totalRounds: state.totalRounds })

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

// ============================================================
// Naive fallback helpers — ใช้ร่วมกันทั้ง timeout ปกติ (คนออนไลน์แต่ไม่กด) และ
// finalizeHNAFKReplacement safety-net (STEP 2B-FIX) เจตนา "naive" ล้วนๆ ไม่ใช่ greedy/AI:
// passive ghost mode ต้องไม่เล่นให้ดีแทนคนที่หลุด — ทำแค่ worst-case fallback เหมือนที่ระบบเคย
// ทำกับคนออนไลน์ที่แค่ตัดสินใจช้าเท่านั้น (เท่าเทียมกัน ไม่ได้เปรียบ/เสียเปรียบจากการ AFK)
// ⛔ ไม่มี submittedX.add()/flow-control ในนี้เด็ดขาด — เป็นหน้าที่ของแต่ละ caller (ต่างบริบทกัน
// เช่น resolveHNDiscardTimeout ไม่เคย add submittedDiscard เลย ถ้าใส่ในนี้จะเปลี่ยนพฤติกรรม timeout เดิม)
// ============================================================
function naiveArrangeR1(state: HNMatchState, seatId: string): void {
  const hand = state.cardsMap![seatId]
  state.arrangements![seatId] = { pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11) }
}

function naiveArrangeR2(state: HNMatchState, seatId: string): void {
  const arr = state.arrangements![seatId]
  const won = state.auctionWonCards![seatId]
  state.arrangements![seatId] = won ? { pile1: arr.pile1, pile2: arr.pile2, pile3: [...arr.pile3, won] } : arr
}

function naiveDiscard(state: HNMatchState, seatId: string): void {
  const arr = state.arrangements![seatId]
  const trim = (pile: Card[]) => pile.length > 3 ? pile.slice(0, 3) : pile
  const finalArr: PlayerArrangement = { pile1: trim(arr.pile1), pile2: trim(arr.pile2), pile3: trim(arr.pile3) }
  state.arrangements![seatId] = finalArr
  const foul = checkFoul(finalArr, state.community!)
  state.foulMap![seatId] = foul.isFoul
  if (foul.isFoul && foul.reason) state.foulReasons![seatId] = foul.reason
  state.finalPile3![seatId] = finalArr.pile3
}

async function resolveHNArrangementTimeout(io: Server, roomId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement') return
  // Human ที่ยังไม่ submit — auto-submit ไพ่ตามที่แจกมาเรียง 3/3/5 (fallback ง่ายสุด กันเกม stall)
  humanSeats(state).forEach(seat => {
    if (state.submittedArrangement.has(seat.id)) return
    naiveArrangeR1(state, seat.id)
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
  emitHNCardZones(io, state)

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
  emitHNCardZones(io, state)
  io.to(roomId).emit('blind_auction_result', { roomId, results, tokenBalance: state.tokenBalance })
  emitHNTokenFlow(io, state)

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
  emitHNCardZones(io, state)

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
    naiveArrangeR2(state, seat.id)
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
  emitHNCardZones(io, state)

  // Patch v1.2 (2026-07-24): ย้ายจาก literal 20000 hardcode มา gameConfig.discardTimer — ค่าเท่าเดิม (20s)
  const discardTimeoutMs = (gameConfig.discardTimer.highNoble ?? 20) * 1000

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
      decisionTimeMs: discardTimeoutMs,
    })
  })

  const timeoutId = setTimeout(() => resolveHNDiscardTimeout(io, roomId), discardTimeoutMs)
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
  emitHNCardZones(io, state)

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
    naiveDiscard(state, seat.id)
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
  state.resolvedPileCount = 1
  emitHNCardZones(io, state)
  io.to(roomId).emit('pile_reveal', {
    roomId, pileNumber: 1, winner: pile1Winner,
    winnerHandRank: hand1 ? handRankLabel(hand1) : '',
    arrangements: revealWinnerOnly(allArrangements, 1, pile1Winner),
    fouled: state.foulMap, foulReasons: state.foulReasons,
  })
  publishSpectatorEvent(roomId, { type: 'PILE_REVEALED', pile: 1, publicHands: pile1Winner ? [{ winnerSeat: state.seats.findIndex(s => s.id === pile1Winner), handRank: hand1 ? handRankLabel(hand1) : '' }] : [] })
  publishSpectatorEvent(roomId, { type: 'PILE_RESULT', pile: 1, winnerSeats: pile1Winner ? [state.seats.findIndex(s => s.id === pile1Winner)] : [] })
  // End-of-Match Stats: เก็บ hand ของ human seat แต่ละคนเอง (ไม่ใช่แค่ผู้ชนะ) ไว้เทียบ best_hands ตอน settle
  humanSeats(state).forEach(seat => {
    if (state.foulMap![seat.id]) return
    const cards1 = [...allArrangements[seat.id].pile1, ...state.community!.row1]
    trackBestHandLive(state, seat.id, evaluateHand(cards1), cards1, 1, pile1Winner === seat.id)
  })
  await delay(revealTime)

  const pile2Winner = resolvePile(2, allArrangements, state.community!, state.foulMap!)
  const hand2 = pile2Winner ? evaluateHand([...allArrangements[pile2Winner].pile2, ...state.community!.row2]) : null
  state.resolvedPileCount = 2
  emitHNCardZones(io, state)
  io.to(roomId).emit('pile_reveal', {
    roomId, pileNumber: 2, winner: pile2Winner,
    winnerHandRank: hand2 ? handRankLabel(hand2) : '',
    arrangements: revealWinnerOnly(allArrangements, 2, pile2Winner),
    fouled: state.foulMap, foulReasons: state.foulReasons,
  })
  publishSpectatorEvent(roomId, { type: 'PILE_REVEALED', pile: 2, publicHands: pile2Winner ? [{ winnerSeat: state.seats.findIndex(s => s.id === pile2Winner), handRank: hand2 ? handRankLabel(hand2) : '' }] : [] })
  publishSpectatorEvent(roomId, { type: 'PILE_RESULT', pile: 2, winnerSeats: pile2Winner ? [state.seats.findIndex(s => s.id === pile2Winner)] : [] })
  humanSeats(state).forEach(seat => {
    if (state.foulMap![seat.id]) return
    const cards2 = [...allArrangements[seat.id].pile2, ...state.community!.row2]
    trackBestHandLive(state, seat.id, evaluateHand(cards2), cards2, 2, pile2Winner === seat.id)
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
  const timeLimitMs = (gameConfig.grandFinale.betTimer.highNoble ?? 30) * 1000

  io.to(roomId).emit('grand_finale_turn', { roomId, playerId: currentPid, roundNumber: gf.roundNumber, callAmount, timeLimitMs })

  // Full Reconnect System Step 2B — passive ghost mode: ถ้าคนที่ถึง turn กำลัง grace-AFK อยู่ fold ทันที
  // ไม่รอ timeLimitMs (ต่างจาก auto-call ปกติของคนที่ยัง online แค่ตัดสินใจช้า) กันไม่ให้เสียเงินซ้ำๆ ทุก
  // turn ระหว่างที่ยังไม่รู้ว่าจะ reconnect ทันไหม — ต้องเช็คก่อน if(seat.isHuman) เสมอ เพราะ AFK seat ยัง
  // isHuman:true อยู่ (ดู INVARIANT ต้นไฟล์) ไม่งั้นจะตกไปเข้า auto-call branch เดิมแทน
  if (isHNPlayerAFK(state, currentPid)) {
    applyHNGrandFinaleAction(io, roomId, currentPid, 'fold')
    return
  }

  if (seat.isHuman) {
    if (gf.decisionTimerId) clearTimeout(gf.decisionTimerId)
    // หมดเวลา = Auto-Call ใบ default (ตรงกับ single-player High Noble UX — Fold ต้อง swipe เอง)
    gf.decisionTimerId = setTimeout(() => {
      // Full Reconnect System Step 2B-FIX2 — re-check AFK ตอน timer "ยิงจริง" (ไม่ใช่ตอนตั้ง) กัน
      // stale timer: ถ้าคนหลุดเน็ตระหว่างเป็น turn ตัวเองพอดี (timer นี้ตั้งไว้ตั้งแต่ตอนยังออนไลน์)
      // ต้อง fold แทน auto-call เดิม ไม่งั้นเสียเงินไปเรื่อยๆ ขัด passive design — คน online ปกติที่
      // แค่ตัดสินใจช้า (ไม่ AFK) ยังได้ auto-call เหมือนเดิมทุกประการ ไม่กระทบ (guard clearTimeout
      // ที่ applyHNGrandFinaleAction บรรทัดแรกกันการยิงซ้อนหลัง human กดเองไปแล้วอยู่ครบแล้ว ไม่ต้องเพิ่ม)
      const hnAutoAction = isHNPlayerAFK(state, currentPid) ? 'fold' : 'call'
      applyHNGrandFinaleAction(io, roomId, currentPid, hnAutoAction)
    }, timeLimitMs)
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
    state.flowPot[2] += callAmount
    emitHNTokenFlow(io, state)
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

  // End-of-Match Stats: เก็บ hand pile3 ของ human seat แต่ละคนเอง (ถ้ามีไพ่จริง ไม่ fold/foul) + triple sweep flag
  const community3ForStats = state.community!.row3
  humanSeats(state).forEach(seat => {
    const pile3Cards = (state.finalPile3 ?? {})[seat.id]
    if (pile3Cards && pile3Cards.length === 3) {
      const hand3Cards = [...pile3Cards, ...community3ForStats]
      trackBestHandLive(state, seat.id, evaluateHand(hand3Cards), hand3Cards, 3, winnerId === seat.id)
    }
  })
  if (jackpotWinner) {
    if (!state.tripleSweepThisMatch) state.tripleSweepThisMatch = new Set()
    state.tripleSweepThisMatch.add(jackpotWinner)
  }

  // Triple Sweep Jackpot: bonus = pile3 ante × (n-1) จากผู้แพ้ทุกคน, rake 5% จากยอดรวม
  // Patch (2026-07-17): ยกเลิก rakeJackpot 10% เดิม — ใช้ rake ตัวเดียวกับ pot ปกติ (5%) แล้ว
  let jackpotBonus = 0, jackpotRake = 0
  if (jackpotWinner) {
    jackpotBonus = stakes.pile3 * (allPlayerIds.length - 1)
    const jackpotSubtotal = pile1Pot + pile2Pot + Math.floor(pile3Pot * (1 - rake)) + jackpotBonus
    jackpotRake = Math.floor(jackpotSubtotal * rake)
    deltas[jackpotWinner] += (jackpotBonus - jackpotRake)
    allPlayerIds.forEach(id => { if (id !== jackpotWinner) deltas[id] += -stakes.pile3 })
  }

  allPlayerIds.forEach(id => {
    state.tokenBalance[id] = (state.tokenBalance[id] ?? 0) + (deltas[id] ?? 0)
  })
  state.flowPot = [0, 0, 0]
  emitHNTokenFlow(io, state)

  state.resolvedPileCount = 3
  emitHNCardZones(io, state)
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
  const winnerSeatIndex = winnerId ? state.seats.findIndex(s => s.id === winnerId) : -1
  publishSpectatorEvent(roomId, { type: 'PILE_RESULT', pile: 3, winnerSeats: winnerSeatIndex >= 0 ? [winnerSeatIndex] : [] })
  publishSpectatorEvent(roomId, { type: 'SHOWDOWN_RESULTS', results: [{ pile: 1, winnerId: pendingP12?.pile1Winner ?? null }, { pile: 2, winnerId: pendingP12?.pile2Winner ?? null }, { pile: 3, winnerId: winnerId ?? null }] })

  const result = { roundNumber: state.roundNumber, pile1Winner: pendingP12?.pile1Winner ?? '', pile2Winner: pendingP12?.pile2Winner ?? '', pile3Winner: winnerId ?? '', tokenDeltas: deltas }
  state.results.push(result)

  setTimeout(async () => {
    if (state.roundNumber >= state.totalRounds) {
      state.phase = 'match_end'
      const finalWinner = allPlayerIds.reduce((a, b) => (state.tokenBalance[a] ?? 0) > (state.tokenBalance[b] ?? 0) ? a : b)

      // ── Settle Escrow ครั้งเดียวต่อคน (Buy-in Spec §4) — netDelta เทียบกับ buy-in แทน baseline 5000 เดิม ──
      // Monarch Spec v1.3 §3: ผู้ชนะ human ที่เจอ Monarch (กำไรสุทธิ > 0) ได้ Pot ×2.0 ระดับ "ทั้งแมตช์" —
      // ส่วนต่างที่เพิ่ม (อีก 1x) เป็น House mint ไม่หักจากผู้เล่นอื่น (ยืนยันขอบเขตกับลุงเยาะแล้ว — ระดับ match ไม่ใช่ต่อ pile/round)
      // computeHNHumanPayout เดิมไม่แตะ — effectiveFinalStack = buyInAmount + payout ทำให้ settleEscrow ให้ผลรวมเท่าเดิมทุกกรณี
      const bossSeatFinal = bossSeat(state) // v1.1 fix: หาจาก role ไม่ใช่ index 0 ตรงๆ (ดู bossSeat() ด้านบน) — ผลตัดสิน Pot×2 ผูกกับ Monarch จริง ไม่ใช่ที่นั่ง index 0
      const winnerSeat = seatById(state, finalWinner)
      let isMonarchMatch = bossSeatFinal.isMonarch === true
      // Batch 1.5 Task 2 (quarantine): เส้นทางนี้ตายแล้วจริง (bossSeatFinal.isMonarch มาจาก seat ที่
      // guard ไว้แล้วที่ startHighNobleMultiMatch — ไม่มีทางเป็น true อีก) เหลือ guard ไว้ defense in depth
      if (isMonarchMatch) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            '[QUARANTINE] Dead Monarch-settlement path hit (bossSeatFinal.isMonarch=true) — ' +
            'เส้นทางนี้ควรตายไปแล้วตั้งแต่ Batch 1 ต้องตามหาต้นเหตุที่ isMonarch หลุดมาอีก',
          )
        }
        console.error('[QUARANTINE][ALERT] Dead Monarch-settlement path hit in PRODUCTION — settle เป็น High Noble ปกติแทน (ไม่ apply Pot×2/badge ทางนี้) boss:', JSON.stringify(bossSeatFinal))
        isMonarchMatch = false // production fallback: ห้าม apply Pot×2/badge จากเส้นทางที่ไม่น่าเชื่อถือนี้
      }
      const isHumanWinner = !!winnerSeat?.isHuman

      const humanNetDeltas: Record<string, number> = {}
      // Buy-in Spec §6: client ResultPanel ต้องโชว์ยอด "Returned" จริงที่เข้า DB — ถ้าใช้ state.tokenBalance ตรงๆ
      // จะผิดเฉพาะเคส Monarch ×2 (payout ถูกคูณแล้วก่อน settle แต่ state.tokenBalance ไม่เคยถูกเขียนทับ)
      const finalStackByHuman: Record<string, number> = {}
      const newTokenBalances: Record<string, number | null> = {}
      await Promise.all(humanSeats(state).map(async s => {
        const netDelta = (state.tokenBalance[s.id] ?? state.buyInAmount) - state.buyInAmount
        humanNetDeltas[s.id] = netDelta
        const payout = computeHNHumanPayout(netDelta, isMonarchMatch && isHumanWinner && s.id === finalWinner, gameConfig.monarchConfig.potMultiplier)
        const escrowId = state.escrowIds[s.id]
        const finalStack = state.buyInAmount + payout
        finalStackByHuman[s.id] = finalStack
        if (escrowId) newTokenBalances[s.id] = await settleEscrow(s.id, escrowId, finalStack)
      }))
      // End-of-Match Stats Recording — แทนที่ recordGameResults() เดิม (games_played/won รวมเข้า xp/streak/
      // best_hands/debt recovery เป็น UPDATE เดียวต่อคน) — ไม่แตะ awardPerformanceScore() ด้านล่าง ยังคงแยก
      // ต่างหากเหมือนเดิมทุกกรณี (เทสผ่านแล้ว ห้าม duplicate formula)
      await recordMatchStats(humanSeats(state).map(s => ({
        userId: s.id,
        tier: 'highNoble' as const,
        won: finalWinner === s.id,
        isTripleSweep: state.tripleSweepThisMatch?.has(s.id) ?? false,
        bestHandThisMatch: state.bestHandThisMatch?.[s.id] ?? null,
      })))

      // Match Win History (มติลุงเยาะ 2026-07-26) — เฉพาะตอน human ชนะอันดับ 1 เท่านั้น (isMonarchMatch เป็นเรื่องแยก)
      if (isHumanWinner) {
        await recordMatchWin({
          userId: finalWinner,
          tier: 'highNoble',
          mode: 'multiplayer',
          tokensWon: humanNetDeltas[finalWinner] ?? 0,
          isTripleSweep: state.tripleSweepThisMatch?.has(finalWinner) ?? false,
          bestHand: state.bestHandThisMatch?.[finalWinner] ?? null,
          opponents: state.seats
            .filter(s => s.id !== finalWinner)
            .map(s => ({ name: s.name, isHuman: s.isHuman })),
        })
      }

      // Badge "Monarch Slayer" + เงื่อนไข Ascendant Gate (Spec v1.3 §5)
      if (isMonarchMatch && isHumanWinner) {
        await recordMonarchVictory(finalWinner)
      }

      // Performance Score — active ตั้งแต่ Tier A+ (Spec v1.3 §4)
      await awardPerformanceScore({
        tier: 'highNoble',
        finalWinnerId: isHumanWinner ? finalWinner : null,
        legendaryBossDefeated: isMonarchMatch && isHumanWinner,
        humanNetDeltas,
      })

      io.to(roomId).emit('match_end', { roomId, finalWinner, tokenBalance: state.tokenBalance, results: state.results, totalRounds: state.totalRounds, buyInAmount: state.buyInAmount, finalStackByHuman, newTokenBalances })
      publishSpectatorEvent(roomId, { type: 'MATCH_FINISHED', winnerSeat: state.seats.findIndex(s => s.id === finalWinner) })
      finishSpectatorBroadcast(roomId)
      // Server Activity feed: winnerSeat.name ครอบคลุมทั้ง Human/AI/Monarch อยู่แล้ว (HNSeat.name)
      io.emit('server_activity', {
        kind: 'win', tier: 'highNoble',
        winnerName: winnerSeat?.name ?? finalWinner,
        isHuman: isHumanWinner,
        timestamp: Date.now(),
      })
      // Full Reconnect System Step 2B — เคลียร์ graceTimer ที่อาจค้างอยู่ (คนหลุดรอบสุดท้ายแต่ยังไม่ครบ
      // 60s ตอนแมตช์จบพอดี) กัน finalizeHNAFKReplacement ยิงซ้ำใส่ state ที่ลบไปแล้ว
      clearHNAFKTimers(state)
      hnMatchStates.delete(roomId)
    } else {
      state.roundNumber++
      await delay(2000)
      await startHNRound(io, roomId)
    }
  }, 5000) // หน่วงให้ client เห็น Grand Finale result popup ก่อนต่อ Round (ตรงกับ single-player gfResultStage 2 timing)
}

// ============================================================
// Full Reconnect System Step 2B (MasterPlan §6.16) — Grace Period 60s + Passive Ghost Mode
// disconnect → markHNPlayerAFK (grace 60s, seat ยังคุมได้ถ้า reconnect ทัน ไม่ settle ทันที)
// reconnect ไม่ทันใน 60s → finalizeHNAFKReplacement (settle จริง + replace เป็น Minion ถาวร)
// ============================================================

// แยก "เปลี่ยน identity เป็น Minion" ออกมาเป็น pure helper (ไม่มี io/settle) — ห้ามเรียกตอนยัง grace
// อยู่เด็ดขาด (ขัด INVARIANT ที่ต้นไฟล์ทันที) เรียกได้จาก finalizeHNAFKReplacement เท่านั้น
function replaceSeatWithMinion(state: HNMatchState, userId: string): HNSeat | undefined {
  const seat = seatById(state, userId)
  if (!seat) return undefined
  // LobbyMatchmaking_Spec_v1_0 §6.1: filler ใน High Noble = Minion ทั้งระบบแล้ว — personality สุ่มอิสระ 1 ใน 3
  const p = FILLER_PERSONALITIES[Math.floor(Math.random() * FILLER_PERSONALITIES.length)]
  const [minionName] = pickRandomMinions(1)
  seat.isHuman = false
  seat.name = minionName
  seat.emoji = '🤖'
  seat.personality = p
  seat.isMinion = true
  return seat
}

// เคลียร์ graceTimer ทุกตัวที่ค้างอยู่ในแมตช์ — เรียกก่อน hnMatchStates.delete เสมอ กัน
// finalizeHNAFKReplacement ยิงซ้ำใส่ state ที่ลบไปแล้ว (แม้ปลอดภัยอยู่แล้วเพราะเช็ค !state ก่อนก็ตาม)
function clearHNAFKTimers(state: HNMatchState): void {
  Object.values(state.afkPlayers).forEach(afk => clearTimeout(afk.graceTimer))
}

// Disconnect — เริ่ม grace 60s เฉยๆ ⛔ ไม่ settle ⛔ ไม่แตะ seat.isHuman (INVARIANT) ระหว่าง grace ถ้าถึง
// turn/deadline ของ phase ปัจจุบัน ปล่อยให้ naive fallback เดิมจัดการ (seat ยังนับเป็น human จึงยังเข้า
// naive-fallback loop ปกติทุกจุด) ยกเว้น grand_finale ที่ override เป็น fold ทันที (ดู startHNNextTurn)
// ส่วน blind_auction passive โดยธรรมชาติอยู่แล้ว (aiSeats() ไม่จับเพราะยัง isHuman:true — ไม่ต้องเขียนเพิ่ม)
export function markHNPlayerAFK(io: Server, roomId: string, userId: string): void {
  const state = hnMatchStates.get(roomId)
  if (!state) return
  const seat = seatById(state, userId)
  if (!seat || !seat.isHuman) return
  if (isHNPlayerAFK(state, userId)) return // กันซ้ำ (เช่น disconnect event ยิงซ้ำ)

  state.afkPlayers[userId] = {
    disconnectedAt: Date.now(),
    graceTimer: setTimeout(() => {
      finalizeHNAFKReplacement(io, roomId, userId).catch(err => {
        console.error('[HN-AFK] finalizeHNAFKReplacement failed for', userId, 'in', roomId, err)
      })
    }, 60_000),
  }

  io.to(roomId).emit('player_disconnected_replaced', { roomId, userId, temporary: true, graceSeconds: 60 })
  publishSpectatorEvent(roomId, { type: 'PLAYER_RECONNECTING', seat: state.seats.findIndex(s => s.id === userId) })
}

// Grace 60s หมด ไม่มี reconnect — settle escrow จริงตอนนี้เท่านั้น (ย้ายมาจาก disconnect handler เดิม)
// แล้วเปลี่ยน seat เป็น Minion ถาวร
export async function finalizeHNAFKReplacement(io: Server, roomId: string, userId: string): Promise<void> {
  const state = hnMatchStates.get(roomId)
  if (!state) return // เกมจบไปแล้ว (clearHNAFKTimers ควรกัน timer นี้ไว้แล้ว แต่กันซ้ำอีกชั้น)
  if (!isHNPlayerAFK(state, userId)) return // reconnect ไปแล้วก่อนหน้านี้ (resendHNRoundStartToPlayer clear ให้แล้ว) ไม่ต้องทำอะไร

  delete state.afkPlayers[userId]

  const escrowId = state.escrowIds[userId]
  if (escrowId) {
    try { await settleEscrow(userId, escrowId, state.tokenBalance[userId] ?? state.buyInAmount) }
    catch (err) { console.error('[HN-AFK] settle error:', err) }
  }

  const seat = replaceSeatWithMinion(state, userId)
  if (!seat) return

  io.to(roomId).emit('player_disconnected_replaced', { roomId, userId, temporary: false, replacementName: seat.name })
  publishSpectatorEvent(roomId, { type: 'AI_TAKEOVER', seat: state.seats.indexOf(seat) })

  // ⚠️ Safety net เพิ่มจากที่ STEP 2B-AUDIT รายงานไว้ (ไม่ใช่ token/settle logic — เป็นความจำเป็นด้าน
  // data-integrity กันเกม crash เท่านั้น): arrangementTimer.highNoble (120s, ใช้ทั้ง arrangement R1 และ
  // arrangement_2) ยาวกว่า grace 60s — ถ้า finalize มาถึงก่อน phase timeout ของมันเอง seat จะกลายเป็น AI
  // (isHuman=false) กลางทาง หลุดจาก humanSeats() ที่ naive-fallback timeout เดิมใช้ตรวจ ทำให้
  // arrangements[userId] ไม่มีทางถูกเติมเลย → discard/showdown พังทันที (undefined access) จึงคง
  // พฤติกรรม "เติมให้ตำแหน่งที่ค้างอยู่" ไว้ตรงนี้ — discard ไม่ต้องพึ่งจุดนี้ (discard timer 20s < grace
  // 60s จบไปก่อนเสมอ) branch นี้จึงแทบไม่มีทาง trigger จริงในทางปฏิบัติ เก็บไว้เป็น fallback เฉยๆ
  //
  // STEP 2B-FIX: เปลี่ยนจาก greedyArrangement/bestThreeFromHand (smart-AI เดิม) → naiveArrangeR1/R2/
  // Discard (helper เดียวกับที่ timeout ปกติใช้) เพราะ passive ghost mode ต้อง "ไม่เล่นให้ดีแทนคนที่หลุด"
  // คนที่หลุดเน็ตควรได้ผลลัพธ์แย่พอๆ กับคนออนไลน์ที่เฉยๆ ไม่กด ไม่ใช่ได้ AI ช่วยเล่นให้ดีกว่า
  //
  // grand_finale: ลบ branch ทิ้ง (ไม่ใช่ naive fallback ที่ขาดไป) — พิสูจน์แล้วว่าไม่จำเป็น: ถ้าถึง turn ของ
  // AFK player พอดี startHNNextTurn จะ fold ให้ทันทีอยู่แล้ว (ไม่รอ grace) ทำให้หลุดจาก turnOrder ไปก่อน
  // finalize จะมาถึงเสมอในทางปฏิบัติ ส่วนกรณี finalize มาถึงตอนยังไม่ใช่ turn ของเขา ก็ไม่มีอะไรต้องทำ ณ จุดนั้น
  // — พอ seat.isHuman ถูก flip เป็น false ไปแล้ว รอบถัดไปที่ถึง turn เขาจะตกเข้า AI branch ปกติของ
  // startHNNextTurn เอง (เล่นเป็น Minion ถาวรตามปกติ ไม่ใช่ AFK อีกต่อไป)
  if (state.phase === 'arrangement' && !state.submittedArrangement.has(userId)) {
    naiveArrangeR1(state, userId)
    state.submittedArrangement.add(userId)
    if (allHumansSubmitted(state, state.submittedArrangement)) await resolveHNArrangementPhaseComplete(io, roomId)
  } else if (state.phase === 'arrangement_2' && !state.submittedArrangement.has(userId)) {
    naiveArrangeR2(state, userId)
    state.submittedArrangement.add(userId)
    if (allHumansSubmitted(state, state.submittedArrangement)) startHNDiscardPhase(io, roomId)
  } else if (state.phase === 'discard' && !state.submittedDiscard.has(userId)) {
    naiveDiscard(state, userId)
    state.submittedDiscard.add(userId)
    if (allHumansSubmitted(state, state.submittedDiscard)) await resolveHNDiscardComplete(io, roomId)
  }
}
