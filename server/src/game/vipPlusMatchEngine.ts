import { Server } from 'socket.io'
import { Card, createDeck, shuffleDeck } from './deck'
import { compareHands, evaluateHand, HandResult, handRankLabel } from './handEvaluator'
import { escrowBuyIn, refundEscrow } from './gameLoop'
import { recordMatchStats } from './matchStatsService'
import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { checkTierUnlock } from './tierUnlockService'
import { getAscendantStatus } from './crownVaultService'
import { economyService } from '../economy/economyService'
import type { AccountRef } from '../economy/economyTypes'
import {
  getVipPlusActionOrder,
  getVipPlusAuctionCardCount,
  getVipPlusCallMultiplier,
  getVipPlusCenterLayout,
  getVipPlusPlayerHandLayout,
  VIP_PLUS_BETTING_ROUNDS,
  VIP_PLUS_DEFAULT_CENTER_RULESET,
  VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED,
  VIP_PLUS_SEATS,
  VIP_PLUS_TIMING_SECONDS,
  VipPlusCenterRuleset,
  VipPlusSeat,
} from './vipPlusFoundation'
import { VipPlusWaitingTable, vipPlusTableRegistry } from './vipPlusTableRegistry'

export type VipPlusMatchPhase = 'INITIAL_ARRANGE' | 'BETTING' | 'BLIND_AUCTION' | 'REARRANGE' | 'MATCH_COMPLETE'

export interface VipPlusRankingRow {
  seat: VipPlusSeat
  playerId: string
  displayName: string
  netToken: number
  totalGroupWins: number
  g3Wins: number
  finalStack: number
  rank: number
  isWinner: boolean
  // มติลุงเยาะ (รอบ 11) — ค่าธรรมเนียมท้ายแมตช์ 10% ที่คนนี้โดนหักจริง (0 ถ้ากำไรสุทธิไม่เป็นบวก) ตั้งค่า
  // จริงใน finalizeVipPlusMatch เท่านั้น — rankVipPlusMatch() ปกติคืน 0 เสมอ (ยังไม่ถึงจุดหักค่าธรรมเนียม)
  profitFee: number
}

export interface VipPlusAuctionBid {
  playerId: string
  amount: number
  multiplier: 0.5 | 1 | 1.5 | 2
  serverReceivedAt: number
  receiptSequence: number
}

export interface VipPlusAuctionState {
  bids: Record<string, VipPlusAuctionBid>
  receiptSequence: number
  winnerId: string | null
  winningAmount: number
  rearrangedPlayers: Set<string>
  timer?: ReturnType<typeof setTimeout>
}

export interface VipPlusBettingState {
  roundIndex: number
  group: 1 | 2 | 3
  groupRound: 1 | 2
  turnOrder: string[]
  currentTurnIndex: number
  foldedByGroup: Record<1 | 2 | 3, Set<string>>
  winners: Partial<Record<1 | 2 | 3, string>>
  payouts: Partial<Record<1 | 2 | 3, number>>
  timer?: ReturnType<typeof setTimeout>
}

export interface VipPlusCenterCards {
  g1: Card[]
  g2: Card[]
  g3: Card[]
}

export interface VipPlusArrangement {
  g1: Card[]
  g2: Card[]
  g3: Card[]
}

export interface VipPlusMatchState {
  roomId: string
  gameNumber: 1 | 2 | 3
  phase: VipPlusMatchPhase
  deadlineAt: number
  wager: VipPlusWaitingTable['wager']
  playerBySeat: Record<VipPlusSeat, string>
  humanSeats: VipPlusSeat[]
  blankSeats: VipPlusSeat[]
  displayNameBySeat: Record<VipPlusSeat, string>
  // มติลุงเยาะ — Avatar หน้าชื่อผู้เล่นทุกที่นั่งในเกม (mirror displayNameBySeat) null = Blank seat หรือ
  // ผู้เล่นไม่เคยตั้ง avatar เลย ให้ client fallback เป็น emoji default
  avatarUrlBySeat: Record<VipPlusSeat, string | null>
  isVipBySeat: Record<VipPlusSeat, boolean>
  seatStatus: Record<VipPlusSeat, 'CONNECTED' | 'DISCONNECTED' | 'FORFEITED' | 'BLANK'>
  hands: Record<string, Card[]>
  center: VipPlusCenterCards
  auctionCard: Card | null
  arrangements: Record<string, VipPlusArrangement>
  escrowIds: Record<string, string>
  tokenBalance: Record<string, number>
  pot: [number, number, number]
  feeRake: number
  // มติลุงเยาะ 2026-08-04: ไพ่ที่หงายไปแล้วตอนกด CALL ระหว่าง Betting (บังคับหงาย 1 ใบทุกครั้ง
  // เหมือน Grand Finale) เป็น public info ค้างจนจบ "เกมนี้" (reset ใน startNextVipPlusGame ตอนเดา
  // ใหม่ทั้งมือของเกมถัดไป) key = playerId → group → card key ที่หงายแล้วเรียงตามลำดับ — ต้อง scope
  // ด้วย group เพราะ client ฝั่งคนอื่นต้องรู้ว่าไพ่ที่หงายแล้วเป็นของกองไหน (นับจำนวนหลังไพ่ที่เหลือให้ครบ
  // ต่อกองถูกต้อง ไม่ใช่นับรวมข้ามกองแบบ flat list)
  revealedCards: Record<string, Partial<Record<1 | 2 | 3, string[]>>>
  betting: VipPlusBettingState | null
  gameResults: Array<{ gameNumber: number; winners: [string, string, string]; tokenBalance: Record<string, number> }>
  auction: VipPlusAuctionState | null
  auctionBurn: number
  phaseTimer?: ReturnType<typeof setTimeout>
  matchComplete: boolean
  matchResult: { rankings: VipPlusRankingRow[]; winnerSeats: VipPlusSeat[]; walletBalances?: Record<string, number | null>; auctionBurn?: number; profitFeeTotal?: number } | null
  // ทดลองมติลุงเยาะ — snapshot มาจาก table ตอนเริ่มแมตช์ (ห้ามเปลี่ยนกลางคัน) ใช้เหมือนกันทั้ง 3 เกม
  centerRuleset: VipPlusCenterRuleset
  foulRuleEnabled: boolean
  // มติลุงเยาะ (รอบ 4, HOLDEM_G3) — จำนวนไพ่กองกลาง G3 ที่เปิดเผยต่อสาธารณะแล้ว (Flop 3 ตอนแจก, Turn 4
  // ก่อนรอบเดิมพัน G3 รอบแรก, River 5 ก่อนรอบเดิมพัน G3 รอบสอง) เฉพาะ HOLDEM_G3 เท่านั้นที่เริ่มจาก 3 —
  // ruleset อื่นตั้งเป็น 5 (เปิดครบ) ตั้งแต่แจกเสมอ ใช้เป็นตัวตัด state.center.g3 ก่อนส่งให้ client ดู
  // visibleVipPlusCenterKeys() คะแนนจริงตอน settle ยังใช้ state.center.g3 เต็มเสมอ ไม่เกี่ยวกับค่านี้เลย
  holdemBoardRevealed: number
}

export interface VipPlusDeal {
  handsBySeat: Record<VipPlusSeat, Card[]>
  center: VipPlusCenterCards
  auctionCard: Card | null
}

export type VipPlusArrangementResult =
  | { ok: true; ranks: { g1: HandResult; g2: HandResult; g3: HandResult } }
  | { ok: false; reason: 'MATCH_NOT_FOUND' | 'WRONG_PHASE' | 'PLAYER_NOT_SEATED' | 'ALREADY_SUBMITTED' | 'INVALID_CARD_OWNERSHIP' | 'INVALID_LAYOUT' | 'FOUL_HAND' }

const vipPlusMatches = new Map<string, VipPlusMatchState>()

export const vipPlusCardKey = (card: Card): string => `${card.rank.toLowerCase()}${card.suit[0]}`

// มติลุงเยาะ (รอบ 9 — "เข้มข้นยิ่งขึ้น") — เดิมพันจริงของแต่ละกอง/รอบ = callAmount ฐานของโต๊ะ × ตัวคูณตาม
// group/groupRound (ดู VIP_PLUS_CALL_MULTIPLIERS ใน vipPlusFoundation.ts) ใช้จุดเดียวทั้งตอนหัก token,
// เติม pot, และ emit ให้ client โชว์ปุ่ม CALL ถูกจำนวน ไม่กระจายสูตรคูณไปหลายที่
function vipPlusRoundCallAmount(state: VipPlusMatchState, group: 1 | 2 | 3, groupRound: 1 | 2): number {
  return state.wager.callAmount * getVipPlusCallMultiplier(group, groupRound)
}

// มติลุงเยาะ (รอบ 4, HOLDEM_G3) — ไพ่กองกลางที่ "เผยแพร่ต่อสาธารณะแล้ว" ตัดจาก state.center.g3 ตาม
// state.holdemBoardRevealed (Flop/Turn/River) ก่อนส่งให้ client ทุกจุด G1/G2 เต็มเสมอไม่เกี่ยว
function visibleVipPlusCenterKeys(state: VipPlusMatchState): { g1: string[]; g2: string[]; g3: string[] } {
  return {
    g1: state.center.g1.map(vipPlusCardKey),
    g2: state.center.g2.map(vipPlusCardKey),
    g3: state.center.g3.slice(0, state.holdemBoardRevealed).map(vipPlusCardKey),
  }
}

export function dealVipPlusGame(
  gameNumber: 1 | 2 | 3,
  centerRuleset: VipPlusCenterRuleset = VIP_PLUS_DEFAULT_CENTER_RULESET,
  shuffledDeck = shuffleDeck(createDeck()),
): VipPlusDeal {
  if (shuffledDeck.length !== 52 || new Set(shuffledDeck.map(vipPlusCardKey)).size !== 52) {
    throw new Error('VIP_PLUS_INVALID_DECK')
  }
  let cursor = 0
  const handsBySeat = {} as Record<VipPlusSeat, Card[]>
  // Feedback ลุงเยาะ (รอบ 3, HOLDEM_G3) — ขนาดมือผู้เล่นไม่ตายตัวที่ 9 ใบอีกต่อไป (HOLDEM_G3 = 3-3-2 = 8 ใบ)
  const handSize = getVipPlusPlayerHandLayout(centerRuleset).reduce<number>((sum, count) => sum + count, 0)
  for (const seat of VIP_PLUS_SEATS) {
    handsBySeat[seat] = shuffledDeck.slice(cursor, cursor + handSize)
    cursor += handSize
  }
  // Feedback ลุงเยาะ (รอบ 2) — layout + auction ผูกกับ ruleset ล้วนๆ แล้ว เหมือนกันทุกเกมในแมตช์
  // (ไม่มีเงื่อนไขพิเศษของ gameNumber===3 อีกต่อไป) gameNumber ยังรับไว้เป็น param เผื่ออนาคต แต่ไม่ใช้คำนวณ layout แล้ว
  const layout = getVipPlusCenterLayout(centerRuleset)
  const center: VipPlusCenterCards = {
    g1: shuffledDeck.slice(cursor, cursor + layout[0]),
    g2: shuffledDeck.slice(cursor + layout[0], cursor + layout[0] + layout[1]),
    g3: shuffledDeck.slice(cursor + layout[0] + layout[1], cursor + layout[0] + layout[1] + layout[2]),
  }
  cursor += layout[0] + layout[1] + layout[2]
  const auctionCard = getVipPlusAuctionCardCount(centerRuleset) > 0 ? shuffledDeck[cursor] : null
  return { handsBySeat, center, auctionCard }
}

// Feedback ลุงเยาะ — G3 เกม 1-2 (ไพ่กองกลางสมทบ 1 ใบพอดี) บังคับใช้ "4 ใบแรกของ pile รวมกับไพ่กองกลาง"
// เสมอ (ไม่ใช่เลือกเอา best-of-6 แบบเดิมที่ bestFive() เคยทำ) ใบที่ 5 (ลำดับสุดท้ายของ arrangement.g3) เป็น
// forced discard ไม่นับคะแนนเด็ดขาด ไม่ว่าจะเป็นใบอะไรก็ตาม — ขอบเขตเฉพาะ WITH_G3_CENTER เท่านั้น (มติลุงเยาะ)
// HOLDEM_G3 (รอบ 3) — G3 = มือ 2 + กองกลาง 5 = 7 ใบ ไม่มี discard เลย ต้องหา best-of-7 แทน (ดู evaluateVipPlusPile)
function vipPlusPileScoringCards(pile: readonly Card[], centerPile: readonly Card[], group: 1 | 2 | 3, ruleset: VipPlusCenterRuleset): Card[] {
  if (group === 3 && ruleset === 'WITH_G3_CENTER' && pile.length === 5) return [...pile.slice(0, 4), ...centerPile]
  return [...pile, ...centerPile]
}

// รวม 2 array เข้าด้วยกันแบบ C(n,k) — ใช้หา combination ขนาด 5 จากไพ่ N ใบ (N=6 สำหรับ WITH_G3_CENTER เดิม
// N=7 สำหรับ HOLDEM_G3) ทั่วไปกว่าของเดิม (bestFive ที่เคยลบทิ้งรองรับแค่ omit ทีละ 1 ใบ ไม่รองรับ N=7)
function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [first, ...rest] = items
  const withFirst = combinations(rest, size - 1).map(combo => [first, ...combo])
  const withoutFirst = combinations(rest, size)
  return [...withFirst, ...withoutFirst]
}

// มติลุงเยาะ (รอบ 10) — ต้องรู้ "ไพ่ 5 ใบที่ดีที่สุด" จริงๆ ไม่ใช่แค่ HandResult (rank) เฉยๆ เพื่อเอาไปทำ
// UI กระพริบเฉพาะ 5 ใบที่ใช้จริงตอนโชว์ผู้ชนะ G3 ของ HOLDEM_G3 (best of 7) — เลือกจากลำดับ combinations()
// เดตอร์มินิสติก ถ้าเสมอกันเป๊ะ (rank เท่ากันหลาย combo) ใช้ตัวที่เจอก่อนเสมอ (ไม่กระทบผลแพ้ชนะจริง แค่
// ตัวเลือกโชว์ผลซ้ำกันได้หลายแบบ) N=5 (ทุกกองปกติ/G1/G2 ทุก ruleset) ตัวเลือกมีทางเดียวอยู่แล้วไม่มีอะไรให้เลือก
function bestVipPlusCombo(cards: Card[]): { result: HandResult; cards: Card[] } {
  if (cards.length === 5) return { result: evaluateHand(cards), cards }
  const combos = combinations(cards, 5)
  let bestCombo = combos[0]
  let best = evaluateHand(bestCombo)
  for (const combo of combos.slice(1)) {
    const result = evaluateHand(combo)
    if (compareHands(result, best) > 0) { best = result; bestCombo = combo }
  }
  return { result: best, cards: bestCombo }
}

// เลือกไพ่ 5 ใบที่ดีที่สุดจาก N ใบ (N>5) — ใช้กับ HOLDEM_G3's G3 (best of 7) เป็นหลัก ทั่วไปพอรองรับ N อื่นด้วย
function evaluateVipPlusPile(cards: Card[]): HandResult {
  return bestVipPlusCombo(cards).result
}

export function validateVipPlusArrangement(
  ownedHand: readonly Card[],
  center: VipPlusCenterCards,
  arrangement: VipPlusArrangement,
  // ทดลองมติลุงเยาะ — host เลือกตอนเปิดโต๊ะได้แล้วว่าจะบังคับ G1<=G2<=G3 หรือไม่ (default: true ตามกติกาหลักเดิม)
  foulRuleEnabled: boolean = VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED,
  // ทดลองมติลุงเยาะ (รอบ 3) — ขนาด pile ต่อกอง (2-2-5 หรือ 3-3-2 ของ HOLDEM_G3) ต้องรู้ ruleset ถึงจะเช็คได้ถูก
  centerRuleset: VipPlusCenterRuleset = VIP_PLUS_DEFAULT_CENTER_RULESET,
): VipPlusArrangementResult {
  const [g1Size, g2Size, g3Size] = getVipPlusPlayerHandLayout(centerRuleset)
  if (arrangement.g1.length !== g1Size || arrangement.g2.length !== g2Size || arrangement.g3.length !== g3Size) {
    return { ok: false, reason: 'INVALID_LAYOUT' }
  }
  const submitted = [...arrangement.g1, ...arrangement.g2, ...arrangement.g3]
  const ownedKeys = new Set(ownedHand.map(vipPlusCardKey))
  const submittedKeys = submitted.map(vipPlusCardKey)
  if (new Set(submittedKeys).size !== g1Size + g2Size + g3Size || submittedKeys.some(key => !ownedKeys.has(key))) {
    return { ok: false, reason: 'INVALID_CARD_OWNERSHIP' }
  }

  const ranks = {
    g1: evaluateVipPlusPile(vipPlusPileScoringCards(arrangement.g1, center.g1, 1, centerRuleset)),
    g2: evaluateVipPlusPile(vipPlusPileScoringCards(arrangement.g2, center.g2, 2, centerRuleset)),
    g3: evaluateVipPlusPile(vipPlusPileScoringCards(arrangement.g3, center.g3, 3, centerRuleset)),
  }
  if (foulRuleEnabled && (compareHands(ranks.g1, ranks.g2) > 0 || compareHands(ranks.g2, ranks.g3) > 0)) {
    return { ok: false, reason: 'FOUL_HAND' }
  }
  return { ok: true, ranks }
}

type EscrowAcquire = typeof escrowBuyIn
type EscrowRefund = typeof refundEscrow

export async function startVipPlusMatch(
  io: Pick<Server, 'to'>,
  table: VipPlusWaitingTable,
  dependencies: { acquire?: EscrowAcquire; refund?: EscrowRefund; now?: () => number; deal?: () => VipPlusDeal } = {},
): Promise<{ ok: true; state: VipPlusMatchState } | { ok: false; reason: string }> {
  const occupiedCount = Object.keys(table.seats).length
  const fullTableReady = table.status === 'READY' && occupiedCount === 5
  const reducedTableReady = table.reducedStartApprovedAt !== null && occupiedCount >= 3 && occupiedCount < 5
  if (!fullTableReady && !reducedTableReady) return { ok: false, reason: 'TABLE_NOT_READY' }
  if (vipPlusMatches.has(table.tableId)) return { ok: false, reason: 'MATCH_ALREADY_STARTED' }
  const acquire = dependencies.acquire ?? escrowBuyIn
  const refund = dependencies.refund ?? refundEscrow
  const escrowIds: Record<string, string> = {}
  const tokenBalance: Record<string, number> = {}
  const orderedSeats = VIP_PLUS_SEATS.flatMap(seat => table.seats[seat] ? [table.seats[seat]!] : [])

  for (const seat of orderedSeats) {
    const result = await acquire(seat.playerId, table.tableId, table.wager.buyInTier)
    if (!result.ok) {
      await Promise.all(Object.entries(escrowIds).map(([playerId, escrowId]) => refund(playerId, escrowId, table.wager.buyIn)))
      return { ok: false, reason: result.reason }
    }
    escrowIds[seat.playerId] = result.escrowId
    tokenBalance[seat.playerId] = result.buyInAmount
  }

  const centerRuleset = table.centerRuleset ?? VIP_PLUS_DEFAULT_CENTER_RULESET
  const foulRuleEnabled = table.foulRuleEnabled ?? VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED
  const deal = dependencies.deal?.() ?? dealVipPlusGame(1, centerRuleset)
  const playerBySeat = {} as Record<VipPlusSeat, string>
  const displayNameBySeat = {} as Record<VipPlusSeat, string>
  const avatarUrlBySeat = {} as Record<VipPlusSeat, string | null>
  const isVipBySeat = {} as Record<VipPlusSeat, boolean>
  const hands: Record<string, Card[]> = {}
  const humanSeats: VipPlusSeat[] = []
  const blankSeats: VipPlusSeat[] = []
  for (const seat of VIP_PLUS_SEATS) {
    const occupant = table.seats[seat]
    const playerId = occupant?.playerId ?? `__VIP_PLUS_BLANK_${seat}__`
    playerBySeat[seat] = playerId
    displayNameBySeat[seat] = occupant?.displayName ?? 'Blank'
    avatarUrlBySeat[seat] = occupant?.avatarUrl ?? null
    isVipBySeat[seat] = occupant?.isVip ?? false
    if (occupant) humanSeats.push(seat)
    else blankSeats.push(seat)
    hands[playerId] = deal.handsBySeat[seat]
  }
  const now = dependencies.now?.() ?? Date.now()
  const state: VipPlusMatchState = {
    roomId: table.tableId,
    gameNumber: 1,
    phase: 'INITIAL_ARRANGE',
    deadlineAt: now + VIP_PLUS_TIMING_SECONDS.initialArrange * 1_000,
    wager: table.wager,
    playerBySeat,
    humanSeats,
    blankSeats,
    displayNameBySeat,
    avatarUrlBySeat,
    isVipBySeat,
    seatStatus: Object.fromEntries(VIP_PLUS_SEATS.map(seat => [seat, blankSeats.includes(seat) ? 'BLANK' : 'CONNECTED'])) as VipPlusMatchState['seatStatus'],
    hands,
    center: deal.center,
    auctionCard: null,
    arrangements: {},
    escrowIds,
    tokenBalance,
    pot: [
      stateAnte(table.wager.ante.pile1, humanSeats.length),
      stateAnte(table.wager.ante.pile2, humanSeats.length),
      stateAnte(table.wager.ante.pile3, humanSeats.length),
    ],
    feeRake: 0,
    revealedCards: {},
    betting: null,
    gameResults: [],
    auction: null,
    auctionBurn: 0,
    matchComplete: false,
    matchResult: null,
    centerRuleset,
    foulRuleEnabled,
    holdemBoardRevealed: centerRuleset === 'HOLDEM_G3' ? 3 : 5,
  }
  const anteTotal = table.wager.ante.pile1 + table.wager.ante.pile2 + table.wager.ante.pile3
  for (const playerId of humanPlayerIds(state)) state.tokenBalance[playerId] -= anteTotal
  vipPlusMatches.set(state.roomId, state)
  scheduleInitialArrangementTimeout(state)

  io.to(state.roomId).emit('vip_plus:game_started', {
    roomId: state.roomId,
    gameNumber: 1,
    phase: state.phase,
    deadlineAt: state.deadlineAt,
    center: visibleVipPlusCenterKeys(state),
    seats: VIP_PLUS_SEATS.map(seat => ({ seat, displayName: state.displayNameBySeat[seat], avatarUrl: state.avatarUrlBySeat[seat], isVip: state.isVipBySeat[seat], status: state.seatStatus[seat], isBlank: state.blankSeats.includes(seat) })),
    wager: state.wager,
    pot: state.pot,
    // Feedback ลุงเยาะ — บั๊กที่ลุงเจอจริง: เล่น HOLDEM_G3 เกมแรก มือดันมี G3 5 ใบ (ต้องมีแค่ 2) ต้นเหตุคือ
    // emit นี้ (เกม 1 เท่านั้น ต่างจาก emitVipPlusGameStarted ที่ใช้เกม 2-3 ซึ่งส่งอยู่แล้ว) ไม่เคยส่ง
    // centerRuleset/foulRuleEnabled เลย client เลยใช้ default 'WITH_G3_CENTER' ของตัวเอง (emptyGame())
    // ไปคำนวณ autoArrange()/layout ผิด ทั้งที่ table.centerRuleset ฝั่ง Waiting Chamber ถูกต้องอยู่แล้ว
    // (game state เป็นคนละ state กับ table state ไม่เคย sync กันตรงๆ) ต้องส่งค่าจริงมาด้วยเสมอเหมือนเกมอื่น
    centerRuleset: state.centerRuleset,
    foulRuleEnabled: state.foulRuleEnabled,
  })
  for (const playerId of humanPlayerIds(state)) {
    io.to(playerId).emit('vip_plus:private_hand', {
      roomId: state.roomId,
      gameNumber: 1,
      cards: state.hands[playerId].map(vipPlusCardKey),
    })
  }
  return { ok: true, state }
}

export function submitVipPlusArrangement(
  roomId: string,
  playerId: string,
  submitted: { g1: string[]; g2: string[]; g3: string[] },
): VipPlusArrangementResult {
  const state = vipPlusMatches.get(roomId)
  if (!state) return { ok: false, reason: 'MATCH_NOT_FOUND' }
  if (!isHumanPlayer(state, playerId)) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  const hand = state.hands[playerId]
  if (!hand) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  if (state.arrangements[playerId]) return { ok: false, reason: 'ALREADY_SUBMITTED' }
  if (state.phase !== 'INITIAL_ARRANGE') return { ok: false, reason: 'WRONG_PHASE' }
  const byKey = new Map(hand.map(card => [vipPlusCardKey(card), card]))
  const arrangement: VipPlusArrangement = {
    g1: submitted.g1.map(key => byKey.get(key)).filter((card): card is Card => !!card),
    g2: submitted.g2.map(key => byKey.get(key)).filter((card): card is Card => !!card),
    g3: submitted.g3.map(key => byKey.get(key)).filter((card): card is Card => !!card),
  }
  if (arrangement.g1.length !== submitted.g1.length || arrangement.g2.length !== submitted.g2.length || arrangement.g3.length !== submitted.g3.length) {
    return { ok: false, reason: 'INVALID_CARD_OWNERSHIP' }
  }
  const validation = validateVipPlusArrangement(hand, state.center, arrangement, state.foulRuleEnabled, state.centerRuleset)
  if (!validation.ok) return validation
  state.arrangements[playerId] = arrangement
  if (allHumansArranged(state)) {
    if (state.phaseTimer) clearTimeout(state.phaseTimer)
    // ทดลองมติลุงเยาะ (รอบ 2) — Auction ผูกกับ ruleset (NO_G3_CENTER = ทุกเกม) ไม่ใช่ gameNumber===3 อีกต่อไป
    if (state.centerRuleset === 'NO_G3_CENTER') beginVipPlusAuction(state.roomId)
    else beginVipPlusBetting(state.roomId)
  }
  return validation
}

export function getVipPlusMatchState(roomId: string): VipPlusMatchState | undefined {
  return vipPlusMatches.get(roomId)
}

export function clearVipPlusMatchState(): void {
  for (const state of vipPlusMatches.values()) if (state.betting?.timer) clearTimeout(state.betting.timer)
  for (const state of vipPlusMatches.values()) if (state.auction?.timer) clearTimeout(state.auction.timer)
  for (const state of vipPlusMatches.values()) if (state.phaseTimer) clearTimeout(state.phaseTimer)
  vipPlusMatches.clear()
}

// Feedback ลุงเยาะ (รอบ 3, HOLDEM_G3) — เดิม hardcode หา g1=2,g2=2,g3=5 ตรงๆ ด้วย nested loop ใช้ไม่ได้กับ
// ขนาด pile อื่น (HOLDEM_G3 = 3-3-2) เปลี่ยนมาใช้ combinations() ทั่วไปแทน (จำนวนไพ่น้อย 8-9 ใบ ไม่หนักเครื่อง)
function findDefaultValidArrangement(state: VipPlusMatchState, playerId: string): VipPlusArrangement {
  const hand = state.hands[playerId]
  const [g1Size, g2Size, g3Size] = getVipPlusPlayerHandLayout(state.centerRuleset)
  for (const g1 of combinations(hand, g1Size)) {
    const afterG1 = hand.filter(card => !g1.includes(card))
    for (const g2 of combinations(afterG1, g2Size)) {
      const g3 = afterG1.filter(card => !g2.includes(card)).slice(0, g3Size)
      const candidate = { g1, g2, g3 }
      if (validateVipPlusArrangement(hand, state.center, candidate, state.foulRuleEnabled, state.centerRuleset).ok) return candidate
    }
  }
  // กันพัง (ไม่ควรถึงจุดนี้ได้จริงถ้ามี foulRuleEnabled=false อย่างน้อย 1 ทางเลือกย่อมผ่านเสมอ)
  return { g1: hand.slice(0, g1Size), g2: hand.slice(g1Size, g1Size + g2Size), g3: hand.slice(g1Size + g2Size, g1Size + g2Size + g3Size) }
}

function scheduleInitialArrangementTimeout(state: VipPlusMatchState): void {
  if (state.phaseTimer) clearTimeout(state.phaseTimer)
  state.phaseTimer = setTimeout(() => {
    if (state.phase !== 'INITIAL_ARRANGE') return
    for (const playerId of humanPlayerIds(state)) {
      if (!state.arrangements[playerId]) state.arrangements[playerId] = findDefaultValidArrangement(state, playerId)
    }
    // ทดลองมติลุงเยาะ (รอบ 2) — Auction ผูกกับ ruleset (NO_G3_CENTER = ทุกเกม) ไม่ใช่ gameNumber===3 อีกต่อไป
    if (state.centerRuleset === 'NO_G3_CENTER') beginVipPlusAuction(state.roomId)
    else beginVipPlusBetting(state.roomId)
  }, VIP_PLUS_TIMING_SECONDS.initialArrange * 1_000)
}

export function markVipPlusDisconnected(roomId: string, playerId: string): boolean {
  const state = vipPlusMatches.get(roomId)
  if (state && !isHumanPlayer(state, playerId)) return false
  const seat = state ? seatForPlayer(state, playerId) : undefined
  if (!state || !seat || state.seatStatus[seat] === 'FORFEITED') return false
  state.seatStatus[seat] = 'DISCONNECTED'
  bettingIo?.to(roomId).emit('vip_plus:seat_status', { seat, status: 'DISCONNECTED' })
  return true
}

export function markVipPlusConnected(roomId: string, playerId: string): boolean {
  const state = vipPlusMatches.get(roomId)
  if (state && !isHumanPlayer(state, playerId)) return false
  const seat = state ? seatForPlayer(state, playerId) : undefined
  if (!state || !seat || state.seatStatus[seat] === 'FORFEITED') return false
  state.seatStatus[seat] = 'CONNECTED'
  bettingIo?.to(roomId).emit('vip_plus:seat_status', { seat, status: 'CONNECTED' })
  return true
}

export function forfeitVipPlusMatch(roomId: string, playerId: string): boolean {
  const state = vipPlusMatches.get(roomId)
  if (state && !isHumanPlayer(state, playerId)) return false
  const seat = state ? seatForPlayer(state, playerId) : undefined
  if (!state || !seat) return false
  state.seatStatus[seat] = 'FORFEITED'
  if (state.phase === 'INITIAL_ARRANGE' && !state.arrangements[playerId]) {
    state.arrangements[playerId] = findDefaultValidArrangement(state, playerId)
    if (allHumansArranged(state)) {
      if (state.phaseTimer) clearTimeout(state.phaseTimer)
      if (state.centerRuleset === 'NO_G3_CENTER') beginVipPlusAuction(roomId)
      else beginVipPlusBetting(roomId)
    }
  }
  if (state.betting) {
    for (const group of [1, 2, 3] as const) state.betting.foldedByGroup[group].add(playerId)
    if (state.phase === 'BETTING' && state.betting.turnOrder[state.betting.currentTurnIndex] === playerId) {
      submitVipPlusBettingAction(roomId, playerId, 'FOLD')
    }
  }
  bettingIo?.to(roomId).emit('vip_plus:seat_status', { seat, status: 'FORFEITED' })
  return true
}

export function buildVipPlusSnapshot(roomId: string, playerId: string) {
  const state = vipPlusMatches.get(roomId)
  if (state && !isHumanPlayer(state, playerId)) return null
  const selfSeat = state ? seatForPlayer(state, playerId) : undefined
  if (!state || !selfSeat) return null
  const ownArrangement = state.arrangements[playerId]
  return {
    roomId: state.roomId, selfSeat, gameNumber: state.gameNumber, phase: state.phase, deadlineAt: state.deadlineAt, wager: state.wager,
    // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — เผื่อ client reconnect กลางแมตช์โดยไม่เคยผ่าน Waiting Chamber
    // เลย (ไม่มี table state เดิมให้ใช้) ต้องมีค่าจริงจาก state ตรงๆ ไม่ต้องพึ่ง default
    centerRuleset: state.centerRuleset, foulRuleEnabled: state.foulRuleEnabled,
    seats: VIP_PLUS_SEATS.map(seat => ({ seat, displayName: state.displayNameBySeat[seat], avatarUrl: state.avatarUrlBySeat[seat], isVip: state.isVipBySeat[seat], status: state.seatStatus[seat], isBlank: state.blankSeats.includes(seat) })),
    center: visibleVipPlusCenterKeys(state),
    hand: state.hands[playerId].map(vipPlusCardKey),
    arrangement: ownArrangement ? Object.fromEntries(Object.entries(ownArrangement).map(([group, cards]) => [group, cards.map(vipPlusCardKey)])) : null,
    pot: state.pot, feeRake: state.feeRake, tokenBalance: publicBalancesBySeat(state),
    // ไพ่ที่หงายไปแล้วของทุกที่นั่ง (public info) — key ด้วย seat ให้ client ใช้ได้ตรงกับ SeatBubble/hand render เลย
    // โครงสร้าง seat -> group -> card key[] (scope ตาม group กันนับปนข้ามกองฝั่ง client)
    revealedCards: Object.fromEntries(
      Object.entries(state.revealedCards).map(([pid, byGroup]) => [seatForPlayer(state, pid), byGroup])
    ),
    betting: state.betting ? {
      bettingRound: state.betting.roundIndex + 1, group: state.betting.group, groupRound: state.betting.groupRound,
      actingSeat: seatForPlayer(state, state.betting.turnOrder[state.betting.currentTurnIndex]),
      foldedByGroup: Object.fromEntries(([1, 2, 3] as const).map(group => [group, [...state.betting!.foldedByGroup[group]].map(id => seatForPlayer(state, id))])),
      // มติลุงเยาะ (รอบ 9) — reconnect กลาง Betting ต้องรู้เดิมพันจริงของรอบปัจจุบัน (1x/2x/4x) ไม่ใช่แค่
      // callAmount ฐานจาก wager เฉยๆ ไม่งั้นปุ่ม CALL โชว์เลขผิดหลัง reconnect
      callAmount: vipPlusRoundCallAmount(state, state.betting.group, state.betting.groupRound),
    } : null,
    auction: state.auction ? {
      bidAmounts: state.wager.auctionBidAmounts, ownLockedBid: state.auction.bids[playerId]?.amount ?? null,
      winnerSeat: state.auction.winnerId ? seatForPlayer(state, state.auction.winnerId) : null,
      privateCard: state.auction.winnerId === playerId && state.auctionCard ? vipPlusCardKey(state.auctionCard) : null,
      winningAmount: state.phase === 'REARRANGE' ? state.auction.winningAmount : null,
    } : null,
    matchResult: state.matchResult,
  }
}

export function selectVipPlusAuctionWinner(bids: readonly VipPlusAuctionBid[]): VipPlusAuctionBid | null {
  if (bids.length === 0) return null
  return [...bids].sort((a, b) => b.amount - a.amount || a.receiptSequence - b.receiptSequence)[0]
}

export function beginVipPlusAuction(roomId: string): boolean {
  const state = vipPlusMatches.get(roomId)
  // ทดลองมติลุงเยาะ (รอบ 2) — เอา gameNumber!==3 ออก เพราะ Auction ผูกกับ centerRuleset ล้วนๆ แล้ว
  // (NO_G3_CENTER มี Auction ทุกเกม) เช็คแค่ auctionCard เองก็พอ (null แปลว่า ruleset นี้ไม่มี Auction)
  if (!state || !state.auctionCard || !allHumansArranged(state)) return false
  state.phase = 'BLIND_AUCTION'
  state.deadlineAt = Date.now() + VIP_PLUS_TIMING_SECONDS.auction * 1_000
  state.auction = { bids: {}, receiptSequence: 0, winnerId: null, winningAmount: 0, rearrangedPlayers: new Set() }
  bettingIo?.to(roomId).emit('vip_plus:auction_started', {
    roomId,
    deadlineAt: state.deadlineAt,
    bidAmounts: state.wager.auctionBidAmounts,
  })
  state.auction.timer = setTimeout(() => resolveVipPlusAuction(roomId), VIP_PLUS_TIMING_SECONDS.auction * 1_000)
  return true
}

export function submitVipPlusAuctionBid(
  roomId: string,
  playerId: string,
  amount: number,
  now = Date.now(),
): { ok: boolean; reason?: string } {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'BLIND_AUCTION' || !state.auction) return { ok: false, reason: 'WRONG_PHASE' }
  if (!isHumanPlayer(state, playerId)) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  if (!state.hands[playerId]) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  if (now > state.deadlineAt) return { ok: false, reason: 'DEADLINE_PASSED' }
  if (state.auction.bids[playerId]) return { ok: false, reason: 'ALREADY_BID' }
  const bidIndex = state.wager.auctionBidAmounts.indexOf(amount)
  if (bidIndex === -1) return { ok: false, reason: 'INVALID_BID_AMOUNT' }
  if ((state.tokenBalance[playerId] ?? 0) < amount) return { ok: false, reason: 'INSUFFICIENT_TOKENS' }
  const multipliers = [0.5, 1, 1.5, 2] as const
  state.auction.bids[playerId] = {
    playerId,
    amount,
    multiplier: multipliers[bidIndex],
    serverReceivedAt: now,
    receiptSequence: ++state.auction.receiptSequence,
  }
  // Ack เฉพาะ bidder; ห้าม broadcast sealed bid
  bettingIo?.to(playerId).emit('vip_plus:auction_bid_locked', { amount })
  if (Object.keys(state.auction.bids).length === state.humanSeats.length) resolveVipPlusAuction(roomId)
  return { ok: true }
}

export function resolveVipPlusAuction(roomId: string, now = Date.now()): boolean {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'BLIND_AUCTION' || !state.auction) return false
  if (state.auction.timer) clearTimeout(state.auction.timer)
  const winner = selectVipPlusAuctionWinner(Object.values(state.auction.bids))
  state.auction.winnerId = winner?.playerId ?? null
  state.auction.winningAmount = winner?.amount ?? 0
  if (winner) {
    state.tokenBalance[winner.playerId] -= winner.amount
    state.auctionBurn += winner.amount
    bettingIo?.to(winner.playerId).emit('vip_plus:auction_card_private', {
      roomId,
      card: vipPlusCardKey(state.auctionCard!),
    })
  } else {
    // No bid: ไพ่ถูก burn โดยไม่เปิดเผย identity
    state.auctionCard = null
  }
  state.phase = 'REARRANGE'
  state.deadlineAt = now + VIP_PLUS_TIMING_SECONDS.postAuctionRearrange * 1_000
  bettingIo?.to(roomId).emit('vip_plus:auction_resolved', {
    winnerSeat: winner ? seatForPlayer(state, winner.playerId) : null,
    winningAmount: winner?.amount ?? 0,
    tokenBalance: publicBalancesBySeat(state),
    deadlineAt: state.deadlineAt,
  })
  state.auction.timer = setTimeout(() => finishVipPlusRearrangement(roomId), VIP_PLUS_TIMING_SECONDS.postAuctionRearrange * 1_000)
  return true
}

export function submitVipPlusRearrangement(
  roomId: string,
  playerId: string,
  submitted: { g1: string[]; g2: string[]; g3: string[] },
): VipPlusArrangementResult {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'REARRANGE' || !state.auction) return { ok: false, reason: 'WRONG_PHASE' }
  if (!isHumanPlayer(state, playerId)) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  if (state.auction.rearrangedPlayers.has(playerId)) return { ok: false, reason: 'ALREADY_SUBMITTED' }
  const originalHand = state.hands[playerId]
  if (!originalHand) return { ok: false, reason: 'PLAYER_NOT_SEATED' }
  const available = state.auction.winnerId === playerId && state.auctionCard ? [...originalHand, state.auctionCard] : originalHand
  const byKey = new Map(available.map(card => [vipPlusCardKey(card), card]))
  const arrangement: VipPlusArrangement = {
    g1: submitted.g1.map(key => byKey.get(key)).filter((card): card is Card => !!card),
    g2: submitted.g2.map(key => byKey.get(key)).filter((card): card is Card => !!card),
    g3: submitted.g3.map(key => byKey.get(key)).filter((card): card is Card => !!card),
  }
  if (arrangement.g1.length !== submitted.g1.length || arrangement.g2.length !== submitted.g2.length || arrangement.g3.length !== submitted.g3.length) {
    return { ok: false, reason: 'INVALID_CARD_OWNERSHIP' }
  }
  const validation = validateVipPlusArrangement(available, state.center, arrangement, state.foulRuleEnabled, state.centerRuleset)
  if (!validation.ok) return validation
  state.arrangements[playerId] = arrangement
  // ล็อก authoritative hand ให้เหลือ 9 ใบตาม arrangement ใหม่; ไพ่ที่ไม่ถูกเลือกคือ discard ส่วนตัว
  state.hands[playerId] = [...arrangement.g1, ...arrangement.g2, ...arrangement.g3]
  state.auction.rearrangedPlayers.add(playerId)
  if (state.auction.rearrangedPlayers.size === state.humanSeats.length) finishVipPlusRearrangement(roomId)
  return validation
}

export function finishVipPlusRearrangement(roomId: string): boolean {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'REARRANGE' || !state.auction) return false
  if (state.auction.timer) clearTimeout(state.auction.timer)
  // ผู้ไม่ส่งคง last valid initial arrangement ตาม Canon
  beginVipPlusBetting(roomId)
  return true
}

function stateAnte(amount: number, playerCount: number): number {
  return amount * playerCount
}

function humanPlayerIds(state: VipPlusMatchState): string[] {
  return state.humanSeats.map(seat => state.playerBySeat[seat])
}

function isHumanPlayer(state: VipPlusMatchState, playerId: string): boolean {
  return humanPlayerIds(state).includes(playerId)
}

function allHumansArranged(state: VipPlusMatchState): boolean {
  return humanPlayerIds(state).every(playerId => !!state.arrangements[playerId])
}

function playerIdForSeat(state: VipPlusMatchState, seat: VipPlusSeat): string {
  return state.playerBySeat[seat]
}

function seatForPlayer(state: VipPlusMatchState, playerId: string): VipPlusSeat | undefined {
  return VIP_PLUS_SEATS.find(seat => state.playerBySeat[seat] === playerId)
}

let bettingIo: Pick<Server, 'to'> | null = null

export function attachVipPlusBettingIo(io: Pick<Server, 'to'>): void {
  bettingIo = io
}

export function beginVipPlusBetting(roomId: string): void {
  const state = vipPlusMatches.get(roomId)
  if (!state || !allHumansArranged(state)) return
  state.phase = 'BETTING'
  state.betting = {
    roundIndex: 0,
    group: 1,
    groupRound: 1,
    turnOrder: [],
    currentTurnIndex: 0,
    foldedByGroup: { 1: new Set(), 2: new Set(), 3: new Set() },
    winners: {},
    payouts: {},
  }
  startBettingRound(state)
}

// extraDelayMs (Feedback ลุงเยาะ, resultDisplayMs) — ใช้เฉพาะตอนรอบนี้เพิ่งเริ่มต่อจากกองที่เพิ่ง settle
// ไป (ดู finishBettingRound) หน่วง "ตาแรกของรอบใหม่" เท่านั้น ไม่กระทบ group/groupRound/turnOrder ที่ต้อง
// set แบบ synchronous เสมอ (โค้ด/เทสอื่นอ่านค่าพวกนี้ตรงๆ ทันทีหลัง action สุดท้ายของรอบ ไม่รอ timer)
function startBettingRound(state: VipPlusMatchState, extraDelayMs = 0): void {
  const definition = VIP_PLUS_BETTING_ROUNDS[state.betting!.roundIndex]
  state.betting!.group = definition.group
  state.betting!.groupRound = definition.groupRound
  // มติลุงเยาะ (รอบ 4, HOLDEM_G3) — เปิดกองกลาง G3 ทีละใบ: Flop 3 ใบตอนแจก (ดู holdemBoardRevealed ตอน
  // deal), Turn (ใบที่ 4) ก่อนรอบเดิมพัน G3 รอบแรก (groupRound 1), River (ใบที่ 5) ก่อนรอบเดิมพัน G3 รอบสอง
  // (groupRound 2) — ruleset อื่นค่าเริ่มต้นเป็น 5 อยู่แล้วไม่เข้าเงื่อนไขนี้เลย
  if (state.centerRuleset === 'HOLDEM_G3' && definition.group === 3) {
    state.holdemBoardRevealed = definition.groupRound === 1 ? 4 : 5
  }
  const orderedSeats = getVipPlusActionOrder(definition.startSeat, definition.direction)
  const folded = state.betting!.foldedByGroup[definition.group]
  state.betting!.turnOrder = orderedSeats.map(seat => playerIdForSeat(state, seat)).filter(playerId => {
    const seat = seatForPlayer(state, playerId)
    return !folded.has(playerId) && !!seat && state.seatStatus[seat] !== 'FORFEITED' && state.seatStatus[seat] !== 'BLANK'
  })
  state.betting!.currentTurnIndex = 0
  startBettingTurn(state, extraDelayMs)
}

function startBettingTurn(state: VipPlusMatchState, extraDelayMs = 0): void {
  const betting = state.betting!
  while (betting.currentTurnIndex < betting.turnOrder.length) {
    const candidate = betting.turnOrder[betting.currentTurnIndex]
    const seat = seatForPlayer(state, candidate)
    if (seat && state.seatStatus[seat] !== 'FORFEITED' && !betting.foldedByGroup[betting.group].has(candidate)) break
    betting.currentTurnIndex++
  }
  if (betting.currentTurnIndex >= betting.turnOrder.length) {
    finishBettingRound(state)
    return
  }
  const playerId = betting.turnOrder[betting.currentTurnIndex]
  const fireTurn = () => {
    state.deadlineAt = Date.now() + VIP_PLUS_TIMING_SECONDS.bettingAction * 1_000
    if (betting.timer) clearTimeout(betting.timer)
    bettingIo?.to(state.roomId).emit('vip_plus:betting_turn', {
      roomId: state.roomId,
      gameNumber: state.gameNumber,
      bettingRound: betting.roundIndex + 1,
      group: betting.group,
      groupRound: betting.groupRound,
      actingSeat: seatForPlayer(state, playerId),
      callAmount: vipPlusRoundCallAmount(state, betting.group, betting.groupRound),
      deadlineAt: state.deadlineAt,
      // มติลุงเยาะ (รอบ 4, HOLDEM_G3) — ส่ง center ทุกตา (payload เล็ก ไม่กี่ตัวอักษร) ให้ Turn/River เปิด
      // ใบใหม่ถึงทุกคนแน่นอน ไม่ใช่แค่ผู้เล่นที่กำลังจะ action เท่านั้น (event นี้ broadcast ทั้งห้องอยู่แล้ว)
      center: visibleVipPlusCenterKeys(state),
    })
    betting.timer = setTimeout(() => resolveVipPlusBettingTimeout(state.roomId), VIP_PLUS_TIMING_SECONDS.bettingAction * 1_000)
  }
  if (extraDelayMs > 0) {
    // Feedback ลุงเยาะ (เทสมือถือรอบ 1) — หน่วง betting_turn ตัวแรกของรอบใหม่ ให้ client ที่ obey ปกติ (รอ
    // event นี้ก่อนค่อย enable ปุ่ม CALL/FOLD) ไม่เข้าเทิร์นเร็วเกินจนพลาดไพ่ผู้ชนะที่เพิ่ง settle ไป —
    // deadlineAt set ล่วงหน้าให้รวม extraDelayMs ด้วยกันคนที่ reconnect ระหว่างช่วงนี้เห็นค่าที่สมเหตุสมผล
    state.deadlineAt = Date.now() + extraDelayMs + VIP_PLUS_TIMING_SECONDS.bettingAction * 1_000
    if (state.phaseTimer) clearTimeout(state.phaseTimer)
    state.phaseTimer = setTimeout(() => { state.phaseTimer = undefined; fireTurn() }, extraDelayMs)
  } else {
    fireTurn()
  }
}

// เลือกไพ่ที่จะหงายตอน CALL แบบที่ client ไม่ได้เลือกเอง (ครบ) — ใบอ่อนสุดที่ยังไม่หงายในกองนั้นก่อน
function pickVipPlusRevealCards(pile: Card[], excludeKeys: string[], count: number): Card[] {
  const remaining = [...pile.filter(c => !excludeKeys.includes(vipPlusCardKey(c)))].sort((a, b) => a.value - b.value)
  return remaining.slice(0, count)
}

// มติลุงเยาะ 2026-08-04: จำนวนใบที่ต้องหงายตอน CALL — ปกติ 1 ใบเสมอ ยกเว้น G3 รอบแรก (groupRound 1)
// ที่ต้องหงายให้ "รวมกับไพ่กองกลาง G3 เป็น 3 ใบเสมอ" (ผู้เล่นอื่นถึงจะอ่านไพ่ชุดที่ดีที่สุดได้) — อ่านจาก
// state.center.g3.length ตรงๆ (ไพ่ที่แจกจริงของเกมนี้ สะท้อน centerRuleset ที่ host เลือกอัตโนมัติ ไม่ต้อง
// พึ่งตาราง static อีกต่อไป) รอบ 2 ของ G3 (groupRound 2) กลับมาใช้กติกาปกติ 1 ใบเหมือน G1/G2
function requiredVipPlusRevealCount(state: VipPlusMatchState, betting: VipPlusBettingState): number {
  if (betting.group === 3 && betting.groupRound === 1) {
    return Math.max(0, 3 - state.center.g3.length)
  }
  return 1
}

export function submitVipPlusBettingAction(
  roomId: string,
  playerId: string,
  action: 'CALL' | 'FOLD',
  revealedCardKeys?: string[],
): { ok: boolean; reason?: string; appliedAction?: 'CALL' | 'FOLD'; autoFold?: boolean } {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'BETTING' || !state.betting) return { ok: false, reason: 'WRONG_PHASE' }
  const betting = state.betting
  if (betting.turnOrder[betting.currentTurnIndex] !== playerId) return { ok: false, reason: 'NOT_YOUR_TURN' }
  if (betting.timer) clearTimeout(betting.timer)

  let appliedAction = action
  let autoFold = false
  if (action === 'CALL') {
    // มติลุงเยาะ (รอบ 9) — เดิมพันจริงตาม group/groupRound ปัจจุบัน (1x/2x/4x) ไม่ใช่ callAmount ฐานตรงๆ อีกต่อไป
    const callAmount = vipPlusRoundCallAmount(state, betting.group, betting.groupRound)
    if ((state.tokenBalance[playerId] ?? 0) < callAmount) {
      appliedAction = 'FOLD'
      autoFold = true
    } else {
      state.tokenBalance[playerId] -= callAmount
      state.pot[betting.group - 1] += callAmount
    }
  }
  if (appliedAction === 'FOLD') betting.foldedByGroup[betting.group].add(playerId)

  // มติลุงเยาะ 2026-08-04: CALL จริง (ไม่ใช่ auto-fold เพราะเงินไม่พอ) ต้องหงายไพ่จากกองที่กำลังเดิมพัน
  // เสมอ (เหมือน Grand Finale) จำนวนตาม requiredVipPlusRevealCount() — ใช้ใบที่ client เลือกก่อน (ต้องอยู่
  // ในกองจริงและยังไม่เคยหงาย) ถ้าเลือกไม่ครบจำนวน server เลือกใบอ่อนสุดเติมให้ครบ
  let revealedCards: Card[] = []
  if (appliedAction === 'CALL') {
    const pileKey = `g${betting.group}` as keyof VipPlusArrangement
    const rawPile = state.arrangements[playerId]?.[pileKey] ?? []
    // Feedback ลุงเยาะ (บั๊กเทสมือถือรอบ 2, ปรับรอบ 3 ให้เช็ค ruleset ตรงๆ) — ใบทิ้งบังคับ (G3 ตำแหน่งสุดท้าย
    // เฉพาะ WITH_G3_CENTER) ห้ามถูกเลือก/สุ่มหงายเด็ดขาด เพราะเจ้าของไพ่เองไม่เห็นใบนี้ในมือแล้ว (ซ่อนไปตั้งแต่
    // ล็อก arrangement) — เดิมเช็คจาก rawPile.length===5 เฉยๆ ตอนนี้เช็ค ruleset ตรงๆ ชัดเจนกว่า (HOLDEM_G3's
    // G3 ก็มี center.g3.length>0 เหมือนกันแต่เป็นกองกลางสาธารณะ ไม่ใช่ discard concept เดียวกันเลย)
    const hasDiscard = betting.group === 3 && state.centerRuleset === 'WITH_G3_CENTER' && rawPile.length === 5
    const pile = hasDiscard ? rawPile.slice(0, 4) : rawPile
    const alreadyRevealed = state.revealedCards[playerId]?.[betting.group] ?? []
    const needed = requiredVipPlusRevealCount(state, betting)

    const chosenKeys = [...new Set(revealedCardKeys ?? [])].filter(key =>
      pile.some(c => vipPlusCardKey(c) === key) && !alreadyRevealed.includes(key)
    ).slice(0, needed)
    revealedCards = chosenKeys.map(key => pile.find(c => vipPlusCardKey(c) === key)!).filter(Boolean)

    const stillNeeded = needed - revealedCards.length
    if (stillNeeded > 0) {
      const excludeKeys = [...alreadyRevealed, ...revealedCards.map(vipPlusCardKey)]
      revealedCards.push(...pickVipPlusRevealCards(pile, excludeKeys, stillNeeded))
    }

    if (revealedCards.length > 0) {
      if (!state.revealedCards[playerId]) state.revealedCards[playerId] = {}
      if (!state.revealedCards[playerId][betting.group]) state.revealedCards[playerId][betting.group] = []
      state.revealedCards[playerId][betting.group]!.push(...revealedCards.map(vipPlusCardKey))
    }
  }

  bettingIo?.to(state.roomId).emit('vip_plus:betting_action', {
    actingSeat: seatForPlayer(state, playerId),
    action: appliedAction,
    autoFold,
    group: betting.group,
    pot: state.pot,
    revealedCards: revealedCards.map(vipPlusCardKey),
  })
  betting.currentTurnIndex++
  startBettingTurn(state)
  return { ok: true, appliedAction, autoFold }
}

export function resolveVipPlusBettingTimeout(roomId: string, now = Date.now()): boolean {
  const state = vipPlusMatches.get(roomId)
  if (!state || state.phase !== 'BETTING' || !state.betting || now < state.deadlineAt) return false
  const playerId = state.betting.turnOrder[state.betting.currentTurnIndex]
  if (!playerId) return false
  submitVipPlusBettingAction(roomId, playerId, 'FOLD')
  return true
}

function finishBettingRound(state: VipPlusMatchState): void {
  const betting = state.betting!
  // มติลุงเยาะ (รอบ 9) — ทุกกองเล่น 2 รอบเหมือนกันหมดแล้ว (เดิมเช็ค group!==3 เพราะมีแค่ G3 ที่ 2 รอบ)
  // "รอบสุดท้ายของกอง" ตอนนี้คือ groupRound===2 เสมอไม่ว่ากองไหน
  const isLastRoundForGroup = betting.groupRound === 2
  // Feedback ลุงเยาะ (เทสมือถือรอบ 1) — state (group/groupRound/turnOrder/gameNumber/phase/arrangements ฯลฯ)
  // ยังต้อง advance แบบ synchronous เหมือนเดิมทุกจุด (โค้ด/เทสอื่นอ่านค่าเหล่านี้ทันทีหลัง action สุดท้าย
  // ไม่รอ timer) มีแค่ "ตาแรกของรอบ/เกมถัดไป" (deadlineAt + emit betting_turn/game_started) เท่านั้นที่หน่วง
  let extraDelayMs = 0
  if (isLastRoundForGroup) {
    settleVipPlusGroup(state, betting.group)
    extraDelayMs = gameConfig.vipPlus5.resultDisplayMs
  }
  advanceAfterVipPlusGroupResult(state, extraDelayMs)
}

function advanceAfterVipPlusGroupResult(state: VipPlusMatchState, extraDelayMs = 0): void {
  const betting = state.betting!
  betting.roundIndex++
  if (betting.roundIndex < VIP_PLUS_BETTING_ROUNDS.length) {
    startBettingRound(state, extraDelayMs)
    return
  }
  finishVipPlusGame(state, extraDelayMs)
}

function settleVipPlusGroup(state: VipPlusMatchState, group: 1 | 2 | 3): void {
  const betting = state.betting!
  const eligible = state.humanSeats
    .map(seat => playerIdForSeat(state, seat))
    .filter(playerId => !betting.foldedByGroup[group].has(playerId))
  let winner = eligible[0] ?? ''
  if (eligible.length > 1) {
    for (const candidate of eligible.slice(1)) {
      const candidateRanks = validateVipPlusArrangement(state.hands[candidate], state.center, state.arrangements[candidate], state.foulRuleEnabled, state.centerRuleset)
      const winnerRanks = validateVipPlusArrangement(state.hands[winner], state.center, state.arrangements[winner], state.foulRuleEnabled, state.centerRuleset)
      if (candidateRanks.ok && winnerRanks.ok && compareHands(candidateRanks.ranks[`g${group}`], winnerRanks.ranks[`g${group}`]) > 0) winner = candidate
    }
  }
  betting.winners[group] = winner
  const potAmount = state.pot[group - 1]
  if (winner) {
    const payout = Math.floor(potAmount * (1 - state.wager.rake))
    state.tokenBalance[winner] += payout
    state.feeRake += potAmount - payout
    betting.payouts[group] = payout
  } else {
    state.feeRake += potAmount
    betting.payouts[group] = 0
  }
  state.pot[group - 1] = 0
  // Batch 4 (VIP-09) — hand name เอามาจาก handRankLabel() ตัวเดียวกับที่ gameLoop.ts/matchStatsService.ts
  // ใช้อยู่แล้ว (ไม่คิด rank เองใหม่) ต้องประเมิน arrangement ของ winner ซ้ำอีกครั้งเพราะใน loop เทียบ
  // ด้านบนคำนวณแบบ transient ไม่ได้เก็บผลลัพธ์สุดท้ายไว้
  const winnerFinalRanks = winner ? validateVipPlusArrangement(state.hands[winner], state.center, state.arrangements[winner], state.foulRuleEnabled, state.centerRuleset) : null
  const winnerHandName = winnerFinalRanks?.ok ? handRankLabel(winnerFinalRanks.ranks[`g${group}`]) : null
  // Feedback ลุงเยาะ — ไพ่ชุดชนะจริงที่ client โชว์ตอนนี้ตรงกับใบที่ scoring จริง (vipPlusPileScoringCards
  // ตัวเดียวกับที่ validateVipPlusArrangement ใช้) — G3 เกม 1-2 จะเป็น 4 ใบแรก + ไพ่กองกลาง (5 ใบ ไม่รวมใบ
  // ทิ้งลำดับที่ 5) ส่วนกองอื่น/เกม 3 ไม่มี discard เลยเหมือนเดิม (โชว์ทั้ง pile + กองกลาง)
  const winnerPile = winner ? state.arrangements[winner][`g${group}` as keyof VipPlusArrangement] : []
  const winnerCenterPile = state.center[`g${group}` as keyof VipPlusCenterCards]
  const winnerScoringCards = winner ? vipPlusPileScoringCards(winnerPile, winnerCenterPile, group, state.centerRuleset) : []
  const winningCards = winnerScoringCards.map(vipPlusCardKey)
  // มติลุงเยาะ (รอบ 10) — ไพ่ 5 ใบที่ "ใช้จริง" ในมือที่ชนะ (สำหรับกระพริบเน้นฝั่ง client) ต่างจาก winningCards
  // เฉพาะ HOLDEM_G3's G3 เท่านั้น (7 ใบ scoring แต่ใช้จริงแค่ 5) กองอื่น/ruleset อื่น winningCards มี 5 ใบ
  // อยู่แล้วเลยเท่ากับ highlightedCards เป๊ะ (ไม่มีใบ "เกิน" ให้ต้องแยก)
  const highlightedCards = winner ? bestVipPlusCombo(winnerScoringCards).cards.map(vipPlusCardKey) : []
  bettingIo?.to(state.roomId).emit('vip_plus:group_settled', {
    gameNumber: state.gameNumber,
    group,
    winnerSeat: winner ? seatForPlayer(state, winner) : null,
    winnerHandName,
    winningCards,
    highlightedCards,
    payout: winner ? (betting.payouts[group] ?? 0) : 0,
    tokenBalance: publicBalancesBySeat(state),
  })
}

export function rankVipPlusMatch(state: VipPlusMatchState): { rankings: VipPlusRankingRow[]; winnerSeats: VipPlusSeat[] } {
  const metrics = state.humanSeats.map(seat => {
    const playerId = state.playerBySeat[seat]
    const totalGroupWins = state.gameResults.reduce((sum, game) => sum + game.winners.filter(winner => winner === playerId).length, 0)
    const g3Wins = state.gameResults.reduce((sum, game) => sum + (game.winners[2] === playerId ? 1 : 0), 0)
    return {
      seat, playerId, displayName: state.displayNameBySeat[seat],
      netToken: state.tokenBalance[playerId] - state.wager.buyIn,
      totalGroupWins, g3Wins, finalStack: state.tokenBalance[playerId], rank: 0, isWinner: false, profitFee: 0,
    }
  })
  metrics.sort((a, b) => b.netToken - a.netToken || b.totalGroupWins - a.totalGroupWins || b.g3Wins - a.g3Wins || a.seat.localeCompare(b.seat))
  let previous: VipPlusRankingRow | undefined
  metrics.forEach((row, index) => {
    const tied = previous && row.netToken === previous.netToken && row.totalGroupWins === previous.totalGroupWins && row.g3Wins === previous.g3Wins
    row.rank = tied ? previous!.rank : index + 1
    previous = row
  })
  const winnerMetrics = metrics[0]
  for (const row of metrics) row.isWinner = row.netToken === winnerMetrics.netToken && row.totalGroupWins === winnerMetrics.totalGroupWins && row.g3Wins === winnerMetrics.g3Wins
  return { rankings: metrics, winnerSeats: metrics.filter(row => row.isWinner).map(row => row.seat) }
}

async function persistVipPlusResult(state: VipPlusMatchState, result: ReturnType<typeof rankVipPlusMatch>): Promise<void> {
  const rows = result.rankings.map(row => ({
    room_id: state.roomId, player_id: row.playerId, seat: row.seat, wager_option: state.wager.optionId,
    net_token: row.netToken, total_group_wins: row.totalGroupWins, g3_wins: row.g3Wins,
    final_stack: row.finalStack, final_rank: row.rank, is_joint_winner: result.winnerSeats.length > 1 && row.isWinner,
    auction_burn_total: state.auctionBurn,
  }))
  const { error } = await supabaseAdmin.from('vip_plus_match_results').upsert(rows, { onConflict: 'room_id,player_id' })
  if (error) console.error('[VIP_PLUS] result persistence failed:', error)
}

// Central Economy Ledger Phase 7 Round 5 — settle ทั้งแมตช์ในธุรกรรมเดียว (human ทุกคนที่เล่นจริง เท่านั้น
// — Blank seat ไม่มี escrow ไม่มี real playerId ไม่เข้ามาถึงจุดนี้อยู่แล้วเพราะ rankVipPlusMatch() วนแค่
// state.humanSeats) แบบเดียวกับ settleAdeptMatchViaLedger/settleHNMatchViaLedger — เหตุผลเดียวกัน: settle
// แยกต่อคนจะไม่มีทางแยก "รวมเงินที่ระบบเก็บไปจริง" ออกจากผลรวม net ของทุกคนได้ถูกต้อง
// ⚠️ ไม่มี NPC_POOL entry เลยรอบนี้ (VIP Plus เป็น Human-only ล้วน ไม่มี AI/Boss ร่วมเศรษฐกิจ) burnAmount
// ต้องรวม state.auctionBurn เข้ากับ state.feeRake ด้วยเสมอ — auctionBurn เป็นคนละ bucket แยกจาก feeRake
// ไม่เคยถูกรวมเข้าไปที่ไหนเลย ถ้าลืมจุดนี้เงินประมูลจะหายจาก actual_supply เงียบๆ (บั๊กคลาสเดียวกับ
// state.pot ของ Mastermind ที่เจอมาก่อนหน้านี้ในรอบเดียวกันของโปรเจค)
export async function settleVipPlusMatchViaLedger(
  state: VipPlusMatchState, rankings: VipPlusRankingRow[],
): Promise<Record<VipPlusSeat, number | null>> {
  const burnAmount = state.feeRake + state.auctionBurn
  const entries: Array<{ account: AccountRef; netAmount: number }> = rankings
    .map(row => ({ account: { accountType: 'PLAYER' as const, accountId: row.playerId }, netAmount: row.finalStack }))
    .filter(e => e.netAmount !== 0)

  if (entries.length > 0) {
    try {
      await economyService.settleMatchResult({
        idempotencyKey: `MATCH_SETTLEMENT:${Object.values(state.escrowIds).sort().join(':')}`,
        currency: 'TOKEN',
        entries,
        burnAmount,
        reason: 'MATCH_SETTLEMENT',
        context: { matchId: state.roomId, tier: 'vipPlus' },
        metadata: { bettingTier: state.wager.bettingTier },
      })
    } catch (err) {
      console.error('[VIP_PLUS]', Date.now(), 'Ledger settleMatchResult failed for', state.roomId, err)
      return Object.fromEntries(rankings.map(row => [row.seat, null])) as Record<VipPlusSeat, number | null>
    }
  }

  const results = {} as Record<VipPlusSeat, number | null>
  await Promise.all(rankings.map(async row => {
    const escrowId = state.escrowIds[row.playerId]
    if (!escrowId) { results[row.seat] = null; return }
    const { error: updateError } = await supabaseAdmin
      .from('match_escrow')
      .update({ status: 'settled', final_stack: row.finalStack, settled_at: new Date().toISOString() })
      .eq('escrow_id', escrowId)
      .eq('status', 'in_match')
    if (updateError) {
      console.error('[VIP_PLUS]', Date.now(), 'Ledger settle: match_escrow update failed for', escrowId, updateError)
      results[row.seat] = null
      return
    }
    const { data: userRow, error: readError } = await supabaseAdmin
      .from('users').select('token_balance').eq('user_id', row.playerId).single()
    if (readError || !userRow) {
      console.error('[VIP_PLUS]', Date.now(), 'Ledger settle: failed to re-read token_balance for', row.playerId, readError)
      results[row.seat] = null
      return
    }
    const newBalance = Number(userRow.token_balance)
    console.log('[VIP_PLUS]', Date.now(), 'Settled via ledger', row.playerId, '| finalStack', row.finalStack, '| New balance:', newBalance)
    try { await checkTierUnlock(row.playerId, newBalance) } catch (err) { console.error('[TIER_UNLOCK] Unexpected error calling checkTierUnlock:', err, '| userId:', row.playerId) }
    try { await getAscendantStatus(row.playerId) } catch (err) { console.error('[CROWN-VAULT] Unexpected error calling getAscendantStatus:', err, '| userId:', row.playerId) }
    results[row.seat] = newBalance
  }))
  return results
}

export async function finalizeVipPlusMatch(
  state: VipPlusMatchState,
  dependencies: {
    settleMatch?: typeof settleVipPlusMatchViaLedger
    persist?: (state: VipPlusMatchState, result: ReturnType<typeof rankVipPlusMatch>) => Promise<void>
    recordStats?: typeof recordMatchStats
  } = {},
): Promise<{ rankings: VipPlusRankingRow[]; winnerSeats: VipPlusSeat[] } | null> {
  if (state.matchComplete) return state.matchResult
  state.matchComplete = true
  state.phase = 'MATCH_COMPLETE'
  // Feedback ลุงเยาะ — แมตช์จบจริงแล้ว ปล่อยที่นั่ง Waiting Chamber registry ของทั้ง 5 คนทิ้ง กันบั๊ก
  // "Player already seated" ตอนพยายามเปิด/เข้าโต๊ะใหม่หลังกลับ Lobby (ดู vipPlusTableRegistry.releaseTable)
  vipPlusTableRegistry.releaseTable(state.roomId)
  if (state.betting?.timer) clearTimeout(state.betting.timer)
  if (state.auction?.timer) clearTimeout(state.auction.timer)
  if (state.phaseTimer) clearTimeout(state.phaseTimer)
  const result = rankVipPlusMatch(state)
  // มติลุงเยาะ (รอบ 11) — ค่าธรรมเนียมท้ายแมตช์ 10% เก็บจากทุกคนที่เล่น เฉพาะ "กำไรสุทธิที่เป็นบวก" เท่านั้น
  // (netToken > 0) คนที่เสมอทุน/ขาดทุนไม่โดนหักซ้ำ — แก้ finalStack/netToken ของแต่ละแถวตรงนี้ก่อนส่งไป
  // settle escrow/แสดงผล กันตัวเลข finalStack ที่โชว์กับ wallet ที่ settle จริงไม่ตรงกัน ไม่ต้องแก้
  // rankVipPlusMatch เอง เพราะหักเป็นสัดส่วนจากค่าบวกไม่เปลี่ยนลำดับอันดับ/ผู้ชนะที่คำนวณไปแล้ว
  for (const row of result.rankings) {
    if (row.netToken > 0) {
      const fee = Math.floor(row.netToken * gameConfig.vipPlus5.matchEndProfitFeeRate)
      row.finalStack -= fee
      row.netToken -= fee
      row.profitFee = fee
      state.feeRake += fee
    }
  }
  const profitFeeTotal = result.rankings.reduce((sum, row) => sum + row.profitFee, 0)
  state.matchResult = result
  const settleMatch = dependencies.settleMatch ?? settleVipPlusMatchViaLedger
  let walletBalances: Record<VipPlusSeat, number | null>
  try {
    walletBalances = await settleMatch(state, result.rankings)
  } catch (error) {
    console.error('[VIP_PLUS] ledger settlement threw:', error)
    walletBalances = Object.fromEntries(result.rankings.map(row => [row.seat, null])) as Record<VipPlusSeat, number | null>
  }
  try { await (dependencies.persist ?? persistVipPlusResult)(state, result) }
  catch (error) { console.error('[VIP_PLUS] result persistence threw:', error) }
  // มติลุงเยาะ — จบแมตช์ต้องอัพเดทสถิติผู้เล่น (games_played/games_won/xp/daily streak/best_hands) เหมือน
  // โต๊ะหลัก Initiate/Adept/Mastermind/HighNoble ใช้ recordMatchStats ตัวเดียวกันเป๊ะ (matchStatsService.ts)
  // — ต้องเรียกหลัง settle escrow เสร็จเสมอ (recordMatchStats อ่าน token_balance ที่ settle เขียนไปแล้วมาทำ
  // Debt Recovery ต่อ ไม่ได้เขียน token_balance เองจากศูนย์) — tier ใช้ state.wager.bettingTier ตรงๆ (VIP
  // Plus ยืมระบบ tier ของโต๊ะหลักอยู่แล้วผ่าน VIP_PLUS_WAGER_OPTIONS ไม่ต้องเพิ่ม tier ปลอมใหม่)
  // bestHandThisMatch ยังไม่ทำ (null เสมอ) — arrangements ของเกม 1-2 ถูกล้างทิ้งไปแล้วตอนขึ้นเกมใหม่ ต้อง
  // เพิ่ม state field เก็บ hand ที่ดีที่สุดสะสมทุกเกมก่อนถึงจะทำได้ถูกต้อง (แยกงานทีหลังถ้าต้องการ badge นี้)
  const recordStats = dependencies.recordStats ?? recordMatchStats
  try {
    await recordStats(result.rankings.map(row => ({
      userId: row.playerId,
      tier: state.wager.bettingTier,
      won: row.isWinner,
      isTripleSweep: state.gameResults.some(game => game.winners[0] === row.playerId && game.winners[1] === row.playerId && game.winners[2] === row.playerId),
      bestHandThisMatch: null,
    })))
  } catch (error) { console.error('[VIP_PLUS] recordMatchStats threw:', error) }
  state.matchResult = { ...result, walletBalances, auctionBurn: state.auctionBurn, profitFeeTotal }
  bettingIo?.to(state.roomId).emit('vip_plus:match_complete', state.matchResult)
  return state.matchResult
}

function finishVipPlusGame(state: VipPlusMatchState, extraDelayMs = 0): void {
  const winners = [state.betting!.winners[1] ?? '', state.betting!.winners[2] ?? '', state.betting!.winners[3] ?? ''] as [string, string, string]
  if (winners[0] && winners[0] === winners[1] && winners[1] === winners[2]) {
    const jackpotWinner = winners[0]
    const losers = humanPlayerIds(state).filter(playerId => playerId !== jackpotWinner)
    const bonus = state.wager.ante.pile3 * losers.length
    const winnerNet = (state.betting!.payouts[1] ?? 0) + (state.betting!.payouts[2] ?? 0) + (state.betting!.payouts[3] ?? 0)
    const rake = Math.floor((winnerNet + bonus) * state.wager.rake)
    for (const loser of losers) state.tokenBalance[loser] -= state.wager.ante.pile3
    state.tokenBalance[jackpotWinner] += bonus - rake
    state.feeRake += rake
  }
  state.gameResults.push({ gameNumber: state.gameNumber, winners, tokenBalance: { ...state.tokenBalance } })
  bettingIo?.to(state.roomId).emit('vip_plus:game_result', {
    gameNumber: state.gameNumber,
    winnerSeats: winners.map(winner => winner ? seatForPlayer(state, winner) : null),
    tokenBalance: publicBalancesBySeat(state),
  })
  // Feedback ลุงเยาะ — จบเกม (ไม่ใช่จบแมตช์) ก็หน่วงก่อนเกมถัดไปเหมือนกัน ส่วนจบแมตช์จริง (finalizeVipPlusMatch)
  // ไม่หน่วงเพิ่ม เพราะมีหน้าสรุปผล/ranking ของตัวเองอยู่แล้วซึ่งไม่ได้ถูกเร่งเวลาเหมือนตอนกลางแมตช์
  if (state.gameNumber < 3) startNextVipPlusGame(state, extraDelayMs)
  else void finalizeVipPlusMatch(state)
}

// extraDelayMs (Feedback ลุงเยาะ, resultDisplayMs) — หน่วงเฉพาะ deadlineAt/scheduleInitialArrangementTimeout/
// emit(game_started + private_hand) ส่วน state mutation อื่นทั้งหมดด้านบน (gameNumber/deal/phase/arrangements/
// pot ฯลฯ) ยัง synchronous เหมือนเดิมทุกจุด (เทสอ่านค่าพวกนี้ทันทีหลัง action สุดท้ายของเกม ไม่รอ timer)
function startNextVipPlusGame(state: VipPlusMatchState, extraDelayMs = 0): void {
  state.gameNumber = (state.gameNumber + 1) as 2 | 3
  const deal = dealVipPlusGame(state.gameNumber, state.centerRuleset)
  for (const seat of VIP_PLUS_SEATS) state.hands[state.playerBySeat[seat]] = deal.handsBySeat[seat]
  state.center = deal.center
  state.auctionCard = deal.auctionCard
  state.holdemBoardRevealed = state.centerRuleset === 'HOLDEM_G3' ? 3 : 5
  state.auction = null
  state.arrangements = {}
  state.revealedCards = {}
  state.betting = null
  state.phase = 'INITIAL_ARRANGE'
  const anteTotal = state.wager.ante.pile1 + state.wager.ante.pile2 + state.wager.ante.pile3
  for (const playerId of humanPlayerIds(state)) state.tokenBalance[playerId] -= anteTotal
  state.pot = [stateAnte(state.wager.ante.pile1, state.humanSeats.length), stateAnte(state.wager.ante.pile2, state.humanSeats.length), stateAnte(state.wager.ante.pile3, state.humanSeats.length)]
  const fireGameStart = () => {
    state.deadlineAt = Date.now() + VIP_PLUS_TIMING_SECONDS.initialArrange * 1_000
    scheduleInitialArrangementTimeout(state)
    emitVipPlusGameStarted(state)
  }
  if (extraDelayMs > 0) {
    state.deadlineAt = Date.now() + extraDelayMs + VIP_PLUS_TIMING_SECONDS.initialArrange * 1_000
    if (state.phaseTimer) clearTimeout(state.phaseTimer)
    state.phaseTimer = setTimeout(() => { state.phaseTimer = undefined; fireGameStart() }, extraDelayMs)
  } else {
    fireGameStart()
  }
}

function emitVipPlusGameStarted(state: VipPlusMatchState): void {
  bettingIo?.to(state.roomId).emit('vip_plus:game_started', {
    roomId: state.roomId,
    gameNumber: state.gameNumber,
    phase: state.phase,
    deadlineAt: state.deadlineAt,
    center: visibleVipPlusCenterKeys(state),
    seats: VIP_PLUS_SEATS.map(seat => ({ seat, displayName: state.displayNameBySeat[seat], avatarUrl: state.avatarUrlBySeat[seat], isVip: state.isVipBySeat[seat], status: state.seatStatus[seat], isBlank: state.blankSeats.includes(seat) })),
    wager: state.wager,
    pot: state.pot,
    // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — ส่งซ้ำทุกเกม (ไม่ใช่แค่ตอนเริ่มแมตช์) เผื่อ client รีเฟรช/reconnect
    // กลางเกมจะได้ไม่ต้องพึ่ง table state ตอน Waiting Chamber ที่อาจไม่มีแล้ว (ดู buildVipPlusSnapshot ด้วย)
    centerRuleset: state.centerRuleset,
    foulRuleEnabled: state.foulRuleEnabled,
  })
  for (const playerId of humanPlayerIds(state)) {
    bettingIo?.to(playerId).emit('vip_plus:private_hand', { roomId: state.roomId, gameNumber: state.gameNumber, cards: state.hands[playerId].map(vipPlusCardKey) })
  }
}

function publicBalancesBySeat(state: VipPlusMatchState): Record<VipPlusSeat, number> {
  return Object.fromEntries(VIP_PLUS_SEATS.map(seat => [seat, state.blankSeats.includes(seat) ? 0 : state.tokenBalance[state.playerBySeat[seat]]])) as Record<VipPlusSeat, number>
}
