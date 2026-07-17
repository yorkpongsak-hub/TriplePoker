// ============================================================
// gameLoop.ts — Game Loop Manager
// 3 Rounds per Match, Showdown, Token Delta
// Beginner Table: 1P vs 3 AI
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Server } from 'socket.io'
import { dealCards } from './cardEngine'
import { evaluateHand, compareHands, handRankLabel } from './handEvaluator'
import { checkFoul, PlayerArrangement, CommunityCards } from './foulChecker'
import { aiDecideArrangement, AI_CONFIGS, AIConfig, AIPersonality, FOUR_GODS, NINE_SENTINELS, greedyArrangement, pickRandomMinions } from './aiEngine'
import { Card } from './deck'
import { gameConfig } from '../config/gameConfig'
import { supabaseAdmin } from '../config/supabase'
import { recordMatchStats, BestHandCandidate, StatsTier } from './matchStatsService'

// ── Types ────────────────────────────────────────────────────
export interface RoundResult {
  roundNumber: number
  pile1Winner: string   // playerId
  pile2Winner: string
  pile3Winner: string
  tokenDeltas: Record<string, number>
  arrangements: Record<string, PlayerArrangement>
  community: CommunityCards
  hasFoul: Record<string, boolean>
}

export interface MatchState {
  roomId: string
  tier: string
  humanPlayerId: string
  roundNumber: number       // 1-3
  totalRounds: number       // 3
  humanWinStreak: number
  tokenBalance: Record<string, number>
  results: RoundResult[]
  phase: 'waiting' | 'arrangement' | 'arrangement_2' | 'showdown' | 'fog_of_war' | 'blind_auction' | 'auction_done' | 'discard' | 'discard_done' | 'grand_finale' | 'grand_finale_done' | 'round_end' | 'match_end'
  buyInAmount: number            // Escrow Buy-in Spec §2 — หักจาก DB ครั้งเดียวตอนเข้าโต๊ะ, AI ได้ virtual stack เท่ากัน
  escrowId?: string              // แถวใน match_escrow — ใช้ settle ตอนจบแมตช์/หลุดกลางเกม
  // Patch Mastermind: เก็บผล Pile1+2 ไว้รอ Auction/Discard/GrandFinale (patch ถัดไป)
  _pendingPile12?: {
    pile1Winner: string
    pile2Winner: string
    allArrangements: Record<string, PlayerArrangement>
    community: CommunityCards
    fouled: Record<string, boolean>
    playerIds: string[]
  }
  humanArrangement?: PlayerArrangement
  // End-of-Match Stats Recording — live tracking เฉพาะ Tier ที่ RoundResult ไม่เก็บ arrangements/community
  // ครบ (Mastermind/Last Boss ใช้ Sequential Showdown) เพราะ derive ย้อนหลังจาก state.results ไม่ได้
  bestHandThisMatch?: BestHandCandidate
  tripleSweepThisMatch?: boolean
}

// เก็บ MatchState ใน memory (production ใช้ Redis)
const matchStates = new Map<string, MatchState>()

// ── Helper: แปลง Card[] เป็น key string ──────────────────────
function cardKey(c: Card): string {
  const s = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }[c.suit]
  return c.rank.toLowerCase() + s
}

// ── Helper: ตัดสิน winner แต่ละ Pile ────────────────────────
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
    if (hand.score > bestScore) {
      bestScore = hand.score
      winnerId = pid
    }
  }
  return winnerId
}

// ── Helper: End-of-Match Stats -- อัปเดต bestHandThisMatch ของ human ถ้า hand รอบนี้ดีกว่าเดิม
// (เฉพาะ Mastermind/Last Boss ที่ RoundResult ไม่เก็บ arrangements/community ครบพอจะ derive ย้อนหลัง)
function trackBestHandLive(
  state: MatchState, hand: ReturnType<typeof evaluateHand>, cards: Card[], pile: 1 | 2 | 3, won: boolean,
): void {
  if (!state.bestHandThisMatch || hand.score > state.bestHandThisMatch.hand.score) {
    state.bestHandThisMatch = { hand, cards: cards.map(c => cardKey(c).toUpperCase()), pile, won }
  }
}

// ── Helper: End-of-Match Stats — derive best hand + triple sweep ของ userId จาก state.results ย้อนหลัง
// ใช้ได้เฉพาะ Tier ที่ RoundResult เก็บ arrangements/community ครบ (Initiate/Adept — Simultaneous Showdown)
function deriveBestHandFromResults(
  results: RoundResult[], userId: string,
): { bestHand: BestHandCandidate | null; tripleSweep: boolean } {
  let bestHand: BestHandCandidate | null = null
  let tripleSweep = false

  for (const r of results) {
    const arr = r.arrangements[userId]
    if (!arr) continue
    if (r.pile1Winner === userId && r.pile2Winner === userId && r.pile3Winner === userId) tripleSweep = true

    const piles: Array<{ cards: Card[]; row: Card[]; num: 1 | 2 | 3; won: boolean }> = [
      { cards: arr.pile1, row: r.community.row1, num: 1, won: r.pile1Winner === userId },
      { cards: arr.pile2, row: r.community.row2, num: 2, won: r.pile2Winner === userId },
      { cards: arr.pile3.slice(0, 3), row: r.community.row3, num: 3, won: r.pile3Winner === userId },
    ]
    for (const p of piles) {
      const hand = evaluateHand([...p.cards, ...p.row])
      if (!bestHand || hand.score > bestHand.hand.score) {
        bestHand = { hand, cards: [...p.cards, ...p.row].map(c => cardKey(c).toUpperCase()), pile: p.num, won: p.won }
      }
    }
  }
  return { bestHand, tripleSweep }
}

// ── Helper: คำนวณ token delta ────────────────────────────────
function calcDeltas(
  p1Winner: string, p2Winner: string, p3Winner: string,
  playerIds: string[], tier: string
): Record<string, number> {
  const deltas: Record<string, number> = {}
  playerIds.forEach(id => deltas[id] = 0)

  type TierKey = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
  const validTier = (['initiate','adept','mastermind','highNoble','lastBoss'].includes(tier) ? tier : 'initiate') as TierKey
  const stakes = gameConfig.tokenPot.tiers[validTier]
  const rake   = gameConfig.tokenPot.rake

  const pots = [
    { winner: p1Winner, stake: stakes.pile1 },
    { winner: p2Winner, stake: stakes.pile2 },
    { winner: p3Winner, stake: stakes.pile3 },
  ]

  for (const { winner, stake } of pots) {
    if (!winner) continue
    const totalPot = stake * playerIds.length
    const net      = Math.floor(totalPot * (1 - rake))
    playerIds.forEach(id => {
      if (id === winner) deltas[id] = (deltas[id] ?? 0) + net - stake
      else               deltas[id] = (deltas[id] ?? 0) - stake
    })
  }
  return deltas
}

// ============================================================
// ESCROW SYSTEM (TriplePoker_BuyIn_Spec_v1_0) — ใช้ร่วมกันทั้ง 3 engine
// (single-player, Adept multiplayer ในไฟล์นี้ + highNobleMultiEngine.ts)
// แทนที่ lockPlayerTokens/returnLockedTokens/returnPlayerLockedTokens/
// burnLockedTokens/persistHNNetTokenResult เดิมทั้งหมด
// ============================================================

type EscrowTier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
function toEscrowTier(tier: string): EscrowTier {
  return (['initiate', 'adept', 'mastermind', 'highNoble', 'lastBoss'].includes(tier) ? tier : 'initiate') as EscrowTier
}

const STALE_ESCROW_MS = 60 * 60 * 1000 // 60 นาที — เกินนี้ถือว่า client หลุด/crash กลางแมตช์ (Buy-in Spec §4 fail-safe)

// กู้คืน escrow ที่ค้างสถานะ 'in_match' เกิน 60 นาที (client force-close/crash กลางแมตช์ ไม่เคย settle)
// คืน token เต็มจำนวน + status='refunded' — เรียกซ้ำ/พร้อมกันได้ปลอดภัย (idempotent)
// เพราะ UPDATE มีเงื่อนไข status='in_match' ในสเตตเมนต์เดียว: ถ้า affected rows = 0 แปลว่ามีคน refund ไปแล้ว ข้ามเงียบๆ
export async function recoverStaleEscrow(userId: string): Promise<{ recovered: boolean; totalRefunded: number }> {
  const staleThresholdISO = new Date(Date.now() - STALE_ESCROW_MS).toISOString()
  try {
    const { data: staleRows, error } = await supabaseAdmin
      .from('match_escrow')
      .update({ status: 'refunded', settled_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'in_match')
      .lt('created_at', staleThresholdISO)
      .select('escrow_id, buyin_amount')

    if (error) {
      console.error('[ESCROW] recoverStaleEscrow update error for', userId, error)
      return { recovered: false, totalRefunded: 0 }
    }
    if (!staleRows || staleRows.length === 0) return { recovered: false, totalRefunded: 0 }

    const totalRefunded = staleRows.reduce((sum, r: any) => sum + r.buyin_amount, 0)
    const { data: userData } = await supabaseAdmin.from('users').select('token_balance').eq('user_id', userId).single()
    const newBalance = (userData?.token_balance ?? 0) + totalRefunded
    await supabaseAdmin.from('users').update({ token_balance: newBalance }).eq('user_id', userId)

    console.log('[ESCROW] Recovered stale escrow(s) for', userId, '| escrow_ids:', staleRows.map((r: any) => r.escrow_id), '| refunded:', totalRefunded, '| New balance:', newBalance)
    return { recovered: true, totalRefunded }
  } catch (err) {
    console.error('[ESCROW] Error in recoverStaleEscrow for', userId, err)
    return { recovered: false, totalRefunded: 0 }
  }
}

type EscrowFailureReason = 'INSUFFICIENT_TOKENS' | 'ACTIVE_MATCH_EXISTS' | 'SERVER_ERROR'
type EscrowResult =
  | { ok: true; escrowId: string; buyInAmount: number }
  | { ok: false; reason: EscrowFailureReason }

// หัก Buy-in จาก users.token_balance + สร้างแถว match_escrow (status='in_match')
// (Phase 2 client เช็คก่อนเข้าโต๊ะแล้ว — เช็คนี้เป็น safety net ฝั่ง server เท่านั้น)
//
// ลำดับต้อง insert escrow ก่อนเสมอ แล้วค่อยหัก token_balance ทีหลัง (ตรงข้ามกับของเดิมที่หักก่อน)
// เหตุผล: ถ้า insert escrow ล้ม (ตารางหาย/constraint ผิด/connection พัง) แล้วยังไม่มีอะไรถูกหักไปเลย
// ไม่ต้อง rollback อะไร — ตัด class of bug ที่ rollback เองก็ล้มตาม (connection เดียวกันที่พังไปแล้ว)
// ทำให้ token หายลอยโดยไม่มี escrow record อ้างอิงเลย
export async function escrowBuyIn(
  userId: string, roomId: string, tier: string,
): Promise<EscrowResult> {
  const validTier = toEscrowTier(tier)
  const buyInAmount = gameConfig.buyIn[validTier]
  try {
    // กู้คืน escrow เก่าที่ค้างเกิน 60 นาทีก่อนเสมอ — กันเคส escrow ค้างจาก session ก่อนหน้าบัง single-active-escrow ด้านล่างอยู่ทั้งที่จริงๆ จบไปนานแล้ว
    await recoverStaleEscrow(userId)

    // Single active escrow — กันหักซ้ำระหว่างมีแมตช์ค้างอยู่จริง (escrow ที่ยังไม่ stale = กำลังเล่นอยู่จริงหรืออีกเครื่อง)
    const { data: activeEscrow, error: activeCheckError } = await supabaseAdmin
      .from('match_escrow')
      .select('escrow_id')
      .eq('user_id', userId)
      .eq('status', 'in_match')
      .limit(1)
      .maybeSingle()
    if (activeCheckError) {
      console.error('[ESCROW] Failed to check active escrow for', userId, activeCheckError)
      return { ok: false, reason: 'SERVER_ERROR' }
    }
    if (activeEscrow) {
      console.warn('[ESCROW] Active match already exists for', userId, '| escrow', activeEscrow.escrow_id)
      return { ok: false, reason: 'ACTIVE_MATCH_EXISTS' }
    }

    const { data: userData, error: userFetchError } = await supabaseAdmin.from('users').select('token_balance').eq('user_id', userId).single()
    if (userFetchError) {
      console.error('[ESCROW] Failed to read token_balance for', userId, userFetchError)
      return { ok: false, reason: 'SERVER_ERROR' }
    }
    const currentBalance = userData?.token_balance ?? 0
    if (currentBalance < buyInAmount) {
      console.warn('[ESCROW] Insufficient tokens for', userId, '| have', currentBalance, '| need', buyInAmount)
      return { ok: false, reason: 'INSUFFICIENT_TOKENS' }
    }

    // Insert escrow ก่อน — ยังไม่แตะ token_balance เลย ณ จุดนี้
    const { data: escrowRow, error: insertError } = await supabaseAdmin
      .from('match_escrow')
      .insert({ user_id: userId, room_id: roomId, tier: validTier, buyin_amount: buyInAmount, status: 'in_match' })
      .select('escrow_id')
      .single()

    if (insertError || !escrowRow) {
      console.error('[ESCROW] Failed to insert match_escrow for', userId, '| room', roomId, '| tier', validTier, insertError)
      return { ok: false, reason: 'SERVER_ERROR' }
    }

    const newBalance = currentBalance - buyInAmount
    const { error: deductError } = await supabaseAdmin.from('users').update({ token_balance: newBalance }).eq('user_id', userId)

    if (deductError) {
      // escrow insert สำเร็จแต่หัก token ไม่ได้ — ยังไม่มีเงินถูกหักไปจริง จึงแค่ mark escrow นี้เป็น
      // 'refunded' (เทียบเท่า "voided" — status enum มีแค่ 3 ค่า ไม่มี column ให้เพิ่ม 'failed' แยก)
      // กัน escrow ค้างสถานะ in_match ทั้งที่ไม่เคยมีเงินถูกหักไปเลย
      await supabaseAdmin.from('match_escrow').update({ status: 'refunded', settled_at: new Date().toISOString() }).eq('escrow_id', escrowRow.escrow_id)
      console.error('[ESCROW] Failed to deduct token_balance for', userId, '| escrow', escrowRow.escrow_id, 'voided (no deduction occurred)', deductError)
      return { ok: false, reason: 'SERVER_ERROR' }
    }

    console.log('[ESCROW] Buy-in', buyInAmount, 'deducted from', userId, '| escrow', escrowRow.escrow_id, '| New balance:', newBalance)
    return { ok: true, escrowId: escrowRow.escrow_id, buyInAmount }
  } catch (err) {
    console.error('[ESCROW] Error in escrowBuyIn for', userId, err)
    return { ok: false, reason: 'SERVER_ERROR' }
  }
}

// Settle escrow ครั้งเดียว — token += finalStack (buyin ถูกหักไปแล้วตอน escrowBuyIn), update match_escrow เป็น settled
// finalStack = stack ปัจจุบันตอน settle (จบแมตช์ปกติ, หลุด, หรือกด Lobby กลางเกม — Spec §4 ทั้งหมดใช้ path นี้)
// คืนยอด token_balance ใหม่หลัง write สำเร็จ (null ถ้า error) — ให้ผู้เรียกแนบไปกับ event ที่ส่งผลแมตช์
// ให้ client แทน ห้าม client คำนวณเองจาก buyin/stack (bug: Profile ค้างยอดเก่าเพราะ client ไม่เคยรู้ยอดจริงหลัง settle)
export async function settleEscrow(userId: string, escrowId: string, finalStack: number): Promise<number | null> {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('token_balance').eq('user_id', userId).single()
    const newBalance = (userData?.token_balance ?? 0) + finalStack
    await supabaseAdmin.from('users').update({ token_balance: newBalance }).eq('user_id', userId)
    await supabaseAdmin.from('match_escrow')
      .update({ status: 'settled', final_stack: finalStack, settled_at: new Date().toISOString() })
      .eq('escrow_id', escrowId)
    console.log('[ESCROW] Settled', userId, '| finalStack', finalStack, '| New balance:', newBalance)
    return newBalance
  } catch (err) {
    console.error('[ESCROW] Error settling escrow for', userId, err)
    return null
  }
}

// Refund เต็มจำนวน — ใช้เฉพาะตอน escrow บาง seat ในกลุ่ม join พร้อมกันล้มเหลว (rollback seat ที่หักไปแล้วก่อนหน้า)
export async function refundEscrow(userId: string, escrowId: string, buyInAmount: number): Promise<void> {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('token_balance').eq('user_id', userId).single()
    const newBalance = (userData?.token_balance ?? 0) + buyInAmount
    await supabaseAdmin.from('users').update({ token_balance: newBalance }).eq('user_id', userId)
    await supabaseAdmin.from('match_escrow')
      .update({ status: 'refunded', settled_at: new Date().toISOString() })
      .eq('escrow_id', escrowId)
    console.log('[ESCROW] Refunded', buyInAmount, 'to', userId, '(join rollback)')
  } catch (err) {
    console.error('[ESCROW] Error refunding escrow for', userId, err)
  }
}

// ============================================================
// startMatch — เริ่ม Match ใหม่
// ============================================================
export async function startMatch(
  io: Server,
  roomId: string,
  humanPlayerId: string,
  tier: string,
  devBossId?: string, // Patch High Noble: Dev Boss Selector (__DEV__ only) — เลือกจตุรเทพให้นั่ง P3
  bossId?: string,    // Patch Mastermind Conquest: Sentinel ที่ผู้เล่นเลือกเองจาก select.tsx/story.tsx (บังคับสำหรับ tier mastermind)
): Promise<void> {

  const totalRounds = 5

  // ── Escrow Buy-in: หัก DB ครั้งเดียว, AI ได้ virtual stack เท่ากัน (Buy-in Spec §2) ──
  const escrow = await escrowBuyIn(humanPlayerId, roomId, tier)
  if (!escrow.ok) {
    io.to(roomId).emit('match_error', { roomId, message: escrow.reason })
    return
  }
  const { escrowId, buyInAmount } = escrow

  const initBalance: Record<string, number> = { [humanPlayerId]: buyInAmount }
  AI_CONFIGS.forEach(ai => initBalance[ai.id] = buyInAmount)

  const state: MatchState = {
    roomId, tier, humanPlayerId,
    roundNumber: 1, totalRounds,
    humanWinStreak: 0,
    tokenBalance: initBalance,
    results: [],
    phase: 'waiting',
    buyInAmount, escrowId,
  }
  // Patch High Noble: Boss (P3) ต้องเป็นจตุรเทพ 1 ใน 4 เสมอ — ถ้า devBossId ไม่ระบุ (production จริง) สุ่มเอา
  if (tier === 'highNoble') {
    const chosenGod = (devBossId && FOUR_GODS.find(g => g.id === devBossId))
      || FOUR_GODS[Math.floor(Math.random() * FOUR_GODS.length)]
    ;(state as any)._bossOverride = chosenGod
  }
  // Patch Mastermind Conquest: Boss (P3) = Sentinel ที่ผู้เล่นเลือกจริง (ไม่สุ่ม) — fallback Iron Wall ถ้า bossId ไม่ตรงตัวไหนเลย
  if (tier === 'mastermind') {
    const chosenSentinel = NINE_SENTINELS.find(s => s.bossId === bossId) ?? NINE_SENTINELS[0]
    ;(state as any)._bossOverride = chosenSentinel
    ;(state as any)._bossId = chosenSentinel.bossId // เก็บไว้ใช้ตอน match_end เขียน conquered_sentinels

    // LobbyMatchmaking_Spec_v1_0 §5: P2/P4 = Minion สุ่ม 2 ใน 25 (แทน Sage/Reckless/Ghost เดิม) —
    // สุ่มครั้งเดียวตอนเริ่มแมตช์ ไม่สุ่มใหม่ทุก Round, personality สุ่ม 1 ใน 3 แบบ Tier C (ไม่ผูกกับชื่อ)
    const minionPersonalities: AIPersonality[] = ['sage', 'reckless', 'ghost']
    const minionNames = pickRandomMinions(2)
    const fillerIds = [AI_CONFIGS[1].id, AI_CONFIGS[2].id]
    const minionOverrides: Record<string, { name: string; personality: AIPersonality }> = {}
    fillerIds.forEach((id, i) => {
      minionOverrides[id] = {
        name: minionNames[i],
        personality: minionPersonalities[Math.floor(Math.random() * minionPersonalities.length)],
      }
    })
    ;(state as any)._minionOverrides = minionOverrides
  }
  matchStates.set(roomId, state)

  await startRound(io, roomId)
}

// Patch High Noble / Mastermind Conquest: คืน AIConfig ที่ใช้จริง — ถ้าเป็น Boss (AI_CONFIGS[0]) + มี override ให้ใช้ Boss แทน
// LobbyMatchmaking_Spec_v1_0 §5: Mastermind P2/P4 (AI_CONFIGS[1]/[2]) ใช้ Minion override (ชื่อ+personality สุ่ม) ถ้ามี
function getEffectiveAIConfig(state: MatchState, ai: AIConfig): AIConfig {
  const bossOverride = (state as any)._bossOverride as AIConfig | undefined
  const isBossSeat = ai.id === AI_CONFIGS[0].id && (state.tier === 'highNoble' || state.tier === 'mastermind')
  if (bossOverride && isBossSeat) return bossOverride

  const minionOverrides = (state as any)._minionOverrides as Record<string, { name: string; personality: AIPersonality }> | undefined
  const minionOverride = minionOverrides?.[ai.id]
  if (state.tier === 'mastermind' && minionOverride) {
    return { ...ai, name: minionOverride.name, emoji: '🤖', personality: minionOverride.personality }
  }

  return ai
}

// ============================================================
// startRound — เริ่ม Round ใหม่
// ============================================================
export async function startRound(io: Server, roomId: string): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state) return

  state.phase = 'arrangement'
  state.humanArrangement = undefined

  // สับและแจกไพ่
  const dealt = dealCards()
  const playerIds = [state.humanPlayerId, ...AI_CONFIGS.map(a => a.id)]

  // map ไพ่แต่ละคน
  const cardsMap: Record<string, Card[]> = {}
  playerIds.forEach((id, i) => cardsMap[id] = dealt.players[i])

  const community: CommunityCards = {
    row1: dealt.community.row1,
    row2: dealt.community.row2,
    row3: dealt.community.row3,
  }

  // AI decide arrangement ทันที (ซ่อนไว้ก่อน)
  // Patch High Noble: Boss (AI_CONFIGS[0]) ใช้ personality จตุรเทพที่เลือกไว้ (ถ้ามี)
  // LobbyMatchmaking_Spec_v1_0 §5: Mastermind Minion (P2/P4) ใช้ greedyArrangement เสมอ ไม่ผ่าน aiDecideArrangement
  // (tier='mastermind' จะเข้า arrangeByPersonality ปกติ ซึ่งไม่ใช่ greedy — ต้องเรียกตรงสำหรับ 2 ที่นั่งนี้)
  const minionOverrides = (state as any)._minionOverrides as Record<string, unknown> | undefined
  const aiArrangements: Record<string, PlayerArrangement> = {}
  AI_CONFIGS.forEach((ai, i) => {
    const effectiveAI = getEffectiveAIConfig(state, ai)
    aiArrangements[ai.id] = (state.tier === 'mastermind' && minionOverrides?.[ai.id])
      ? greedyArrangement(cardsMap[ai.id], community)
      : aiDecideArrangement(
          effectiveAI,
          cardsMap[ai.id],
          community,
          state.roundNumber,
          state.tier,
          state.humanWinStreak,
        )
  })

  // เก็บ ai arrangements ใน state ชั่วคราว
  ;(state as any)._aiArrangements = aiArrangements
  ;(state as any)._community = community
  ;(state as any)._cardsMap = cardsMap
  ;(state as any)._blindAuction = dealt.blindAuction // Patch: เก็บไพ่ Blind Auction ไว้ใช้ตอน resolve จริง

  // Emit ให้ human
  io.to(roomId).emit('round_start', {
    roomId,
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    cards: {
      [state.humanPlayerId]: cardsMap[state.humanPlayerId].map(cardKey),
    },
    communityCards: {
      pile1: community.row1.map(cardKey),
      pile2: community.row2.map(cardKey),
      pile3: community.row3.map(cardKey),
    },
    blindAuction: dealt.blindAuction.map(cardKey),
    aiNames: AI_CONFIGS.map(a => { const eff = getEffectiveAIConfig(state, a); return { id: a.id, name: eff.name, emoji: eff.emoji } }),
    tokenBalance: state.tokenBalance,
    timer: (gameConfig.arrangementTimer as Record<string, number>)[state.tier] ?? gameConfig.arrangementTimer.initiate,
    ...(state.roundNumber === 1 ? { buyInAmount: state.buyInAmount } : {}),
  })
}

// ============================================================
// submitArrangement — Human ส่ง arrangement มา
// ============================================================
export async function submitArrangement(
  io: Server,
  roomId: string,
  arrangement: PlayerArrangement
): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'arrangement') return

  state.humanArrangement = arrangement
  state.phase = 'showdown'

  const community: CommunityCards = (state as any)._community
  const aiArrangements: Record<string, PlayerArrangement> = (state as any)._aiArrangements

  // ตรวจ Foul ทุกคน
  const fouled: Record<string, boolean> = {}
  const foulReasons: Record<string, string> = {}
  const humanFoul = checkFoul(arrangement, community)
  fouled[state.humanPlayerId] = humanFoul.isFoul
  if (humanFoul.isFoul && humanFoul.reason) foulReasons[state.humanPlayerId] = humanFoul.reason
  AI_CONFIGS.forEach(ai => {
    const aiFoul = checkFoul(aiArrangements[ai.id], community)
    fouled[ai.id] = aiFoul.isFoul
    if (aiFoul.isFoul && aiFoul.reason) foulReasons[ai.id] = aiFoul.reason
  })

  const allArrangements: Record<string, PlayerArrangement> = {
    [state.humanPlayerId]: arrangement,
    ...aiArrangements,
  }
  const playerIds = [state.humanPlayerId, ...AI_CONFIGS.map(a => a.id)]

  // Patch High Noble: ประมูลตอนไพ่ครบ 11 ใบ — ข้าม Foul-check/Reveal รอบนี้ ไปประมูลก่อน
  // (Foul-check จริงจะทำหลัง Arrangement รอบ2 ใน submitArrangementRound2)
  if (state.tier === 'highNoble') {
    state.phase = 'blind_auction'
    startBlindAuction(io, roomId, state)
    return
  }
  // Patch Mastermind/Last Boss: Tier >= Mastermind ใช้ Sequential Reveal + Fog of War
  // (ยังไม่ครบ Auction/Discard/GrandFinale — รอ patch ถัดไป จบแค่ Fog of War ก่อน)
  if (['mastermind', 'lastBoss'].includes(state.tier)) {
    await resolveMastermindPile12(io, roomId, state, allArrangements, community, fouled, foulReasons, playerIds)
    return
  }

  // ── Countdown 3-2-1 ──────────────────────────────────────
  io.to(roomId).emit('showdown_countdown', { roomId, seconds: 3 })
  await delay(3500)

  // ── Resolve ทุก Pile พร้อมกัน ────────────────────────────
  const p1Winner = resolvePile(1, allArrangements, community, fouled)
  const p2Winner = resolvePile(2, allArrangements, community, fouled)
  const p3Winner = resolvePile(3, allArrangements, community, fouled)
  const hand1W = p1Winner ? evaluateHand([...allArrangements[p1Winner].pile1, ...community.row1]) : null
  const hand2W = p2Winner ? evaluateHand([...allArrangements[p2Winner].pile2, ...community.row2]) : null
  const hand3W = p3Winner ? evaluateHand([...allArrangements[p3Winner].pile3.slice(0,3), ...community.row3]) : null

  // ── emit showdown_result ครั้งเดียว ─────────────────────
  io.to(roomId).emit('showdown_result', {
    roomId,
    foulReasons,
    pileResults: [
      { pileNumber: 1, arrangements: revealArrangements(allArrangements, 1), winner: p1Winner, winnerHandRank: hand1W ? handRankLabel(hand1W) : '', fouled },
      { pileNumber: 2, arrangements: revealArrangements(allArrangements, 2), winner: p2Winner, winnerHandRank: hand2W ? handRankLabel(hand2W) : '', fouled },
      { pileNumber: 3, arrangements: revealArrangements(allArrangements, 3), winner: p3Winner, winnerHandRank: hand3W ? handRankLabel(hand3W) : '', fouled },
    ],
  })

  const deltas = calcDeltas(p1Winner, p2Winner, p3Winner, playerIds, state.tier)
  playerIds.forEach(id => {
    state.tokenBalance[id] = (state.tokenBalance[id] ?? state.buyInAmount) + (deltas[id] ?? 0)
  })

  // ── Human win streak ────────────────────────────────────
  const humanWins = [p1Winner, p2Winner, p3Winner].filter(w => w === state.humanPlayerId).length
  if (humanWins >= 2) state.humanWinStreak++
  else state.humanWinStreak = 0

  // เก็บ result
  const result: RoundResult = {
    roundNumber: state.roundNumber,
    pile1Winner: p1Winner,
    pile2Winner: p2Winner,
    pile3Winner: p3Winner,
    tokenDeltas: deltas,
    arrangements: allArrangements,
    community,
    hasFoul: fouled,
  }
  state.results.push(result)

  // ── Emit round result ────────────────────────────────────
  io.to(roomId).emit('round_result', {
    roomId,
    roundNumber: state.roundNumber,
    pile1Winner: p1Winner,
    pile2Winner: p2Winner,
    pile3Winner: p3Winner,
    tokenDeltas: deltas,
    tokenBalance: state.tokenBalance,
    hasFoul: fouled,
  })

      await waitForContinue(roomId)

  // ── ต่อ Round หรือจบ Match ───────────────────────────────
  if (state.roundNumber >= state.totalRounds) {
    state.phase = 'match_end'
    const finalWinner = playerIds.reduce((a, b) =>
      (state.tokenBalance[a] ?? 0) > (state.tokenBalance[b] ?? 0) ? a : b
    )
    // ── Settle Escrow ครั้งเดียว (Buy-in Spec §4 — จบแมตช์ปกติ) ──
    let newTokenBalance: number | null = null
    if (state.escrowId) {
      newTokenBalance = await settleEscrow(state.humanPlayerId, state.escrowId, state.tokenBalance[state.humanPlayerId] ?? state.buyInAmount)
    }
    // End-of-Match Stats Recording (games_played/won, xp, streak, best_hands, debt recovery)
    // แทนที่ recordGameResults() เดิม — Initiate ใช้ Simultaneous Showdown, derive จาก state.results ได้ตรงๆ
    const { bestHand: initiateBestHand, tripleSweep: initiateTripleSweep } =
      deriveBestHandFromResults(state.results, state.humanPlayerId)
    await recordMatchStats([{
      userId: state.humanPlayerId,
      tier: 'initiate',
      won: finalWinner === state.humanPlayerId,
      isTripleSweep: initiateTripleSweep,
      bestHandThisMatch: initiateBestHand,
    }])

    io.to(roomId).emit('match_end', {
      roomId,
      finalWinner,
      tokenBalance: state.tokenBalance,
      results: state.results,
      totalRounds: state.totalRounds,
      buyInAmount: state.buyInAmount,
      newTokenBalance,
    })
  } else {
    state.roundNumber++
    state.phase = 'arrangement'
      await delay(2000)
    await startRound(io, roomId)
  }
}

// ============================================================
// Patch Mastermind: Sequential Reveal Pile1+2 -> Fog of War
// ============================================================
async function resolveMastermindPile12(
  io: Server,
  roomId: string,
  state: MatchState,
  allArrangements: Record<string, PlayerArrangement>,
  community: CommunityCards,
  fouled: Record<string, boolean>,
  foulReasons: Record<string, string>,
  playerIds: string[],
): Promise<void> {
  state.phase = 'showdown'
  // Patch Grand Finale: เก็บ foulMap ไว้ใช้ใน startGrandFinale (ตัดสิทธิ์คน Foul Pile1/2 ออกจาก Betting)
  ;(state as any)._foulMap = { ...fouled }
  const revealTime = 4000 // ms — เวลาแสดงผลแต่ละ Pile ก่อนไปกองต่อไป (ปรับได้)

  io.to(roomId).emit('showdown_countdown', { roomId, seconds: 3 })
  await delay(3500)

  // ── Pile 1 ──────────────────────────────────────────────
  const pile1Winner = resolvePile(1, allArrangements, community, fouled)
  const hand1 = pile1Winner ? evaluateHand([...allArrangements[pile1Winner].pile1, ...community.row1]) : null
  io.to(roomId).emit('pile_reveal', {
    roomId,
    pileNumber: 1,
    winner: pile1Winner,
    winnerHandRank: hand1 ? handRankLabel(hand1) : '',
    arrangements: revealWinnerOnly(allArrangements, 1, pile1Winner),
    fouled,
    foulReasons,
  })
  // End-of-Match Stats: เก็บ hand ของ human เอง (ไม่ใช่แค่ผู้ชนะ) ไว้เทียบ best_hands ตอน settle
  if (!fouled[state.humanPlayerId]) {
    const humanPile1 = [...allArrangements[state.humanPlayerId].pile1, ...community.row1]
    trackBestHandLive(state, evaluateHand(humanPile1), humanPile1, 1, pile1Winner === state.humanPlayerId)
  }
  await delay(revealTime)

  // ── Pile 2 ──────────────────────────────────────────────
  const pile2Winner = resolvePile(2, allArrangements, community, fouled)
  const hand2 = pile2Winner ? evaluateHand([...allArrangements[pile2Winner].pile2, ...community.row2]) : null
  io.to(roomId).emit('pile_reveal', {
    roomId,
    pileNumber: 2,
    winner: pile2Winner,
    winnerHandRank: hand2 ? handRankLabel(hand2) : '',
    arrangements: revealWinnerOnly(allArrangements, 2, pile2Winner),
    fouled,
    foulReasons,
  })
  if (!fouled[state.humanPlayerId]) {
    const humanPile2 = [...allArrangements[state.humanPlayerId].pile2, ...community.row2]
    trackBestHandLive(state, evaluateHand(humanPile2), humanPile2, 2, pile2Winner === state.humanPlayerId)
  }
  await delay(revealTime)

  // ── Fog of War ───────────────────────────────────────────
  // เก็บผลไว้รอ Auction/Discard/GrandFinale (ยังไม่ implement — patch ถัดไป)
  state.phase = 'fog_of_war'
  state._pendingPile12 = { pile1Winner, pile2Winner, allArrangements, community, fouled, playerIds }

  io.to(roomId).emit('fog_of_war', {
    roomId,
    message: 'Pile 1 & 2 ถูกซ่อนแล้ว — เหลือ Pile 3 ในมือคุณเท่านั้นที่เห็น',
  })

  // Patch Blind Auction: หน่วง 5 วิ ให้เห็นจอ Fog of War + อีก 3 วิ ให้ Client เฟดไพ่ Pile1+2 ออกก่อนเข้าประมูล
  await delay(8000)
  startBlindAuction(io, roomId, state)
}

// ============================================================
// Patch Blind Auction — เริ่มประมูล + AI bid + รอ Human bid
// ============================================================
function startBlindAuction(io: Server, roomId: string, state: MatchState): void {
  state.phase = 'blind_auction'
  const tier = state.tier as 'mastermind' | 'highNoble' | 'lastBoss'
  const bidLevelsMap = gameConfig.blindAuction.bidLevels as unknown as Record<string, number[]>
  const bidLevels = bidLevelsMap[tier] ?? bidLevelsMap.mastermind
  const decisionMs = gameConfig.blindAuction.decisionTimeMs

  ;(state as any)._auctionBids = {} as Record<string, { cardIndex: 0 | 1; level: number }>

  io.to(roomId).emit('blind_auction_start', {
    roomId,
    bidLevels,
    decisionTimeMs: decisionMs,
  })

  // AI bid ทันที (สุ่มแบบง่าย — ปรับ logic ฉลาดขึ้นได้ทีหลังตาม AI tier)
  // Patch High Noble / Mastermind Conquest: Boss (จตุรเทพ หรือ Sentinel) มีสไตล์ประมูลตาม personality
  const bossOverride = (state as any)._bossOverride as AIConfig | undefined
  AI_CONFIGS.forEach(ai => {
    const isBoss = bossOverride && ai.id === AI_CONFIGS[0].id && (state.tier === 'highNoble' || state.tier === 'mastermind')
    if (isBoss) {
      const cardIndex: 0 | 1 = Math.random() < 0.5 ? 0 : 1
      let willBid: boolean
      let level: number
      switch (bossOverride!.personality) {
        case 'reaper': // ดุที่สุด — ประมูลแทบทุกครั้งด้วยราคาสูงสุด
          willBid = Math.random() < 0.9
          level = bidLevels.length - 1
          break
        case 'crag': // ป้องกันแน่น — ประมูลค่อนข้างบ่อย ราคาระดับกลาง-สูง เพื่อเสริมกองที่ใช้
          willBid = Math.random() < 0.75
          level = Math.min(bidLevels.length - 1, Math.floor(bidLevels.length * 0.6) + Math.floor(Math.random() * 2))
          break
        case 'cortex': // คำนวณ EV เย็นชา — bid แค่พอประมาณ ไม่ทุ่มเกินจำเป็น
          willBid = Math.random() < 0.6
          level = Math.floor(Math.random() * Math.ceil(bidLevels.length / 2))
          break
        // ── The Nine Sentinels — ตัวเลขตีความจาก MasterPlan v1.1 (คำอธิบายเชิงคุณภาพ ไม่ใช่ตัวเลขตรงๆ)
        case 'iron_wall': // ต่ำ-กลาง ระมัดระวัง
          willBid = Math.random() < 0.5
          level = Math.floor(Math.random() * Math.ceil(bidLevels.length / 2))
          break
        case 'chivalry': // กลาง สม่ำเสมอ — level คงที่ ไม่สุ่ม
          willBid = Math.random() < 0.65
          level = Math.floor(bidLevels.length / 2)
          break
        case 'war_lord': // สูง บุกไม่หยุด
          willBid = Math.random() < 0.95
          level = bidLevels.length - 1
          break
        case 'phantom': // กลาง variance สูง — สุ่มเต็ม range
          willBid = Math.random() < 0.6
          level = Math.floor(Math.random() * bidLevels.length)
          break
        case 'dark_shark': // สูงสุดในกลุ่ม — ประมูลทุกครั้งด้วยราคาสูงสุด
          willBid = true
          level = bidLevels.length - 1
          break
        case 'oracle': // ตาม EV คำนวณ — deterministic ไม่มี randomness เลย
          willBid = true
          level = Math.max(0, Math.ceil(bidLevels.length * 0.65) - 1)
          break
        case 'phoenix': // กลาง-สูง คงที่ — level คงที่ ไม่สุ่ม
          willBid = Math.random() < 0.8
          level = Math.floor(bidLevels.length * 0.7)
          break
        case 'black_magic': { // กลาง ปรับตาม pot size — ใช้ tokenBalance ของตัวเองเป็น proxy (ยังไม่มีตัวแปร pot size ณ จุดนี้)
          willBid = Math.random() < 0.65
          const myBalance = state.tokenBalance[ai.id] ?? state.buyInAmount
          level = myBalance > 6000 ? bidLevels.length - 1 : myBalance > 4000 ? Math.floor(bidLevels.length / 2) : 0
          break
        }
        case 'jester': // สุ่มทุกครั้ง — สุ่มกว้างกว่า Cipher (เต็ม range ไม่ใช่แค่หัว-ท้าย)
          willBid = Math.random() < 0.7
          level = Math.floor(Math.random() * bidLevels.length)
          break
        case 'cipher': // คาดเดาไม่ได้ — สุ่มทุกอย่างแบบสุดขั้ว (เสี่ยงสูงหรือไม่เล่นเลย)
        default:
          willBid = Math.random() < 0.7
          level = Math.random() < 0.5 ? 0 : bidLevels.length - 1
          break
      }
      if (willBid) (state as any)._auctionBids[ai.id] = { cardIndex, level }
      return
    }
    const willBid = Math.random() < 0.7
    if (!willBid) return
    const cardIndex: 0 | 1 = Math.random() < 0.5 ? 0 : 1
    const level = Math.floor(Math.random() * bidLevels.length)
    ;(state as any)._auctionBids[ai.id] = { cardIndex, level }
  })

  setTimeout(() => resolveBlindAuctionTimeout(io, roomId), decisionMs)
}

// Human submit bid — เรียกจาก socket handler ใน gameSocket.ts
export function submitAuctionBid(
  roomId: string,
  playerId: string,
  cardIndex: 0 | 1,
  level: number
): { ok: boolean; reason?: string } {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'blind_auction') return { ok: false, reason: 'not_in_auction' }
  const bids = (state as any)._auctionBids as Record<string, { cardIndex: 0 | 1; level: number }>
  if (bids[playerId]) return { ok: false, reason: 'already_bid' } // กดได้ครั้งเดียว/ใบ
  bids[playerId] = { cardIndex, level }
  return { ok: true }
}

// Resolve ผลประมูล — Human ชนะก่อน AI เสมอ / Human-vs-Human สุ่ม 50/50 (CoreRules v1.3)
async function resolveBlindAuctionTimeout(io: Server, roomId: string): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'blind_auction') return

  const tier = state.tier as 'mastermind' | 'highNoble' | 'lastBoss'
  const bidLevelsMap = gameConfig.blindAuction.bidLevels as unknown as Record<string, number[]>
  const bidLevels = bidLevelsMap[tier] ?? bidLevelsMap.mastermind
  const bids = (state as any)._auctionBids as Record<string, { cardIndex: 0 | 1; level: number }>
  const blindCards: Card[] = (state as any)._blindAuction ?? []

  const results: Array<{ cardIndex: 0 | 1; winnerId: string | null; level: number | null; amount: number; cardKey: string }> = []
  const auctionWonCards: Record<string, Card> = (state as any)._auctionWonCards ?? {}

  for (const cardIndex of [0, 1] as const) {
    const candidates = Object.entries(bids).filter(([, b]) => b.cardIndex === cardIndex)
    if (candidates.length === 0) {
      results.push({ cardIndex, winnerId: null, level: null, amount: 0, cardKey: cardKey(blindCards[cardIndex]) })
      continue
    }
    const maxLevel = Math.max(...candidates.map(([, b]) => b.level))
    const topBidders = candidates.filter(([, b]) => b.level === maxLevel).map(([pid]) => pid)

    let winnerId: string
    const humanTop = topBidders.filter(pid => pid === state.humanPlayerId)
    if (humanTop.length > 0) {
      winnerId = humanTop[0] // Human ชนะก่อน AI เสมอ
    } else if (topBidders.length === 1) {
      winnerId = topBidders[0]
    } else {
      winnerId = topBidders[Math.floor(Math.random() * topBidders.length)] // สุ่ม 50/50 (AI vs AI หรือเสมอกันเอง)
    }

    const amount = bidLevels[maxLevel] ?? 0
    state.tokenBalance[winnerId] = (state.tokenBalance[winnerId] ?? 0) - amount // Burn 100%
    auctionWonCards[winnerId] = blindCards[cardIndex]
    results.push({ cardIndex, winnerId, level: maxLevel, amount, cardKey: cardKey(blindCards[cardIndex]) })
  }

  ;(state as any)._auctionWonCards = auctionWonCards
  state.phase = 'auction_done'

  io.to(roomId).emit('blind_auction_result', {
    roomId,
    results,
    tokenBalance: state.tokenBalance,
  })

  // Patch Discard Phase: หน่วง 3 วิ ให้เห็นผล Auction ก่อน ค่อยเริ่ม Discard
  await delay(3000)

  // Patch High Noble: เปิด Arrangement รอบ 2 — ผู้เล่นจัดไพ่ใหม่รวมไพ่ที่ประมูลได้ (สูงสุด 12 ใบ)
  // ไพ่ประมูลจัดลง pile ไหนก็ได้ ไม่บังคับลง pile3 แบบ Mastermind
  if (state.tier === 'highNoble') {
    const community: CommunityCards = (state as any)._community
    const aiArrangements: Record<string, PlayerArrangement> = (state as any)._aiArrangements
    const cardsMap: Record<string, Card[]> = (state as any)._cardsMap

    // AI ที่ชนะประมูล — จัดไพ่ใหม่ด้วยมือ 12 ใบ (เหมือนผู้เล่นจริง ไม่บังคับลง pile3)
    // Patch High Noble: Boss ใช้ personality จตุรเทพที่เลือกไว้ (ถ้ามี) ตอนจัดไพ่รอบ2 ด้วย
    // LobbyMatchmaking_Spec_v1_0 §5: Mastermind Minion ใช้ greedyArrangement รอบ 2 เหมือนกัน
    const minionOverridesR2 = (state as any)._minionOverrides as Record<string, unknown> | undefined
    AI_CONFIGS.forEach(ai => {
      if (auctionWonCards[ai.id]) {
        const effectiveAI = getEffectiveAIConfig(state, ai)
        const fullHand = [...cardsMap[ai.id], auctionWonCards[ai.id]]
        aiArrangements[ai.id] = (state.tier === 'mastermind' && minionOverridesR2?.[ai.id])
          ? greedyArrangement(fullHand, community)
          : aiDecideArrangement(effectiveAI, fullHand, community, state.roundNumber, state.tier, state.humanWinStreak)
      }
    })
    ;(state as any)._aiArrangements = aiArrangements

    state.phase = 'arrangement_2'
    // Patch: เรียงไพ่ตาม humanArrangement ที่ user submit R1 + auction card ต่อท้าย (ใบขวาสุดของ Pile 3)
    const arr = state.humanArrangement
    const humanHand = arr
      ? [...arr.pile1, ...arr.pile2, ...arr.pile3]
      : [...cardsMap[state.humanPlayerId]]
    if (auctionWonCards[state.humanPlayerId]) humanHand.push(auctionWonCards[state.humanPlayerId])

    // Patch: อ่าน timer จาก gameConfig.arrangementTimer (single source of truth — ครั้งหน้าแก้ที่ config ที่เดียว)
    const r2Timer = (gameConfig.arrangementTimer as Record<string, number>)[state.tier] ?? gameConfig.arrangementTimer.initiate
    io.to(roomId).emit('arrangement_2_start', {
      roomId,
      cards: humanHand.map(cardKey),
      timer: r2Timer,
    })
    setTimeout(() => resolveArrangementRound2Timeout(io, roomId), r2Timer * 1000)
    return
  }

  startDiscardPhase(io, roomId, state)
}

// ============================================================
// Patch High Noble: Arrangement รอบ 2 — รับ arrangement สมบูรณ์ (สูงสุด 12 ใบ) จาก Human
// เรียกจาก socket handler submit_arrangement_2 ใน gameSocket.ts
// ============================================================
export async function submitArrangementRound2(
  io: Server,
  roomId: string,
  arrangement: PlayerArrangement
): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'arrangement_2') return
  await resolveArrangementRound2(io, roomId, state, arrangement)
}

async function resolveArrangementRound2(
  io: Server,
  roomId: string,
  state: MatchState,
  arrangement: PlayerArrangement,
): Promise<void> {
  // Patch (บั๊กแก้): ไม่ตรวจ Foul ที่จุดนี้แล้ว — เพราะ pile1/pile2 อาจยังไม่ใช่ 3 ใบเป๊ะ
  // (ผู้เล่นจัดไพ่ประมูลลง pile ใดก็ได้ อาจทำให้ pile1/pile2 เกิน 3 ใบชั่วคราว)
  // ตรวจ Foul จริงจะเลื่อนไปทำหลัง Discard เสร็จ (ไพ่เหลือกองละ 3 ใบเป๊ะแน่นอนแล้ว) ดู submitDiscard/resolveDiscardTimeout
  state.humanArrangement = arrangement
  ;(state as any)._foulMap = (state as any)._foulMap ?? {}
  ;(state as any)._foulReasons = (state as any)._foulReasons ?? {}

  startDiscardPhase(io, roomId, state)
}

async function resolveArrangementRound2Timeout(io: Server, roomId: string): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'arrangement_2') return
  // Fallback: Human ไม่ submit ทันเวลา — ใช้ arrangement รอบ1 เดิม + บวกไพ่ประมูล (ถ้ามี) ลง pile3
  const auctionWon: Record<string, Card> = (state as any)._auctionWonCards ?? {}
  const fallback: PlayerArrangement = {
    pile1: state.humanArrangement!.pile1,
    pile2: state.humanArrangement!.pile2,
    pile3: auctionWon[state.humanPlayerId]
      ? [...state.humanArrangement!.pile3, auctionWon[state.humanPlayerId]]
      : state.humanArrangement!.pile3,
  }
  await resolveArrangementRound2(io, roomId, state, fallback)
}

// ============================================================
// Patch Discard Phase — AI auto-discard / Human เลือกเอง (มี suggestion)
// บังคับรวม Community Pile3 (2 ใบ) เสมอ ตามสเปค
// ============================================================

// หา 3 ใบที่ดีที่สุดจากไพ่ในมือ (5-6 ใบ) โดยรวม Community Pile3 บังคับ
function bestThreeFromHand(hand: Card[], community3: Card[]): { keep: Card[]; discard: Card[] } {
  const n = hand.length
  let bestScore = -Infinity
  let bestKeepIdx: number[] = [0, 1, 2]

  // ลอง combination ทุกแบบที่เลือก 3 จาก n (n=5 หรือ 6 ไม่เยอะ ลองหมดได้สบาย)
  const combo = (start: number, chosen: number[]) => {
    if (chosen.length === 3) {
      const keepCards = chosen.map(i => hand[i])
      const hand5 = evaluateHand([...keepCards, ...community3])
      if (hand5.score > bestScore) {
        bestScore = hand5.score
        bestKeepIdx = [...chosen]
      }
      return
    }
    for (let i = start; i < n; i++) {
      combo(i + 1, [...chosen, i])
    }
  }
  combo(0, [])

  const keep = bestKeepIdx.map(i => hand[i])
  const discard = hand.filter((_, i) => !bestKeepIdx.includes(i))
  return { keep, discard }
}

function startDiscardPhase(io: Server, roomId: string, state: MatchState): void {
  state.phase = 'discard'
  const community: CommunityCards = (state as any)._community
  const community3: Card[] = community.row3
  const isHighNoble = state.tier === 'highNoble'
  const auctionWon: Record<string, Card> = (state as any)._auctionWonCards ?? {}
  const aiArrangements: Record<string, PlayerArrangement> = (state as any)._aiArrangements
  const finalPile3: Record<string, Card[]> = {}

  if (isHighNoble) {
    const fouled: Record<string, boolean> = (state as any)._foulMap ?? {}
    const foulReasons: Record<string, string> = (state as any)._foulReasons ?? {}
    AI_CONFIGS.forEach(ai => {
      const hand = [...aiArrangements[ai.id].pile3]
      const { keep } = bestThreeFromHand(hand, community3)
      finalPile3[ai.id] = keep
      const aiFoul = checkFoul({ pile1: aiArrangements[ai.id].pile1, pile2: aiArrangements[ai.id].pile2, pile3: keep }, community)
      fouled[ai.id] = aiFoul.isFoul
      if (aiFoul.isFoul && aiFoul.reason) foulReasons[ai.id] = aiFoul.reason
    })
    ;(state as any)._finalPile3 = finalPile3
    ;(state as any)._foulMap = fouled
    ;(state as any)._foulReasons = foulReasons

    const arr = state.humanArrangement!
    io.to(roomId).emit('discard_phase_start_highnoble', {
      roomId,
      pile1: arr.pile1.map(cardKey),
      pile2: arr.pile2.map(cardKey),
      pile3: arr.pile3.map(cardKey),
      needDiscard: {
        pile1: Math.max(0, arr.pile1.length - 3),
        pile2: Math.max(0, arr.pile2.length - 3),
        pile3: Math.max(0, arr.pile3.length - 3),
      },
      decisionTimeMs: 20000,
    })
    setTimeout(() => resolveDiscardTimeout(io, roomId), 20000)
    return
  }

  AI_CONFIGS.forEach(ai => {
    const hand = [...aiArrangements[ai.id].pile3]
    if (auctionWon[ai.id]) hand.push(auctionWon[ai.id])
    const { keep } = bestThreeFromHand(hand, community3)
    finalPile3[ai.id] = keep
  })
  ;(state as any)._finalPile3 = finalPile3

  const humanHand = [...state.humanArrangement!.pile3]
  if (auctionWon[state.humanPlayerId]) humanHand.push(auctionWon[state.humanPlayerId])
  const { keep: suggestedKeep } = bestThreeFromHand(humanHand, community3)

  io.to(roomId).emit('discard_phase_start', {
    roomId,
    hand: humanHand.map(cardKey),
    suggestedKeep: suggestedKeep.map(cardKey),
    decisionTimeMs: 20000,
  })

  setTimeout(() => resolveDiscardTimeout(io, roomId), 20000)
}

// Human submit — เรียกจาก socket handler ใน gameSocket.ts
export function submitDiscard(io: Server, roomId: string, playerId: string, keepKeys: string[]): { ok: boolean; reason?: string } {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'discard') return { ok: false, reason: 'not_in_discard' }

  if (state.tier === 'highNoble') {
    if (keepKeys.length !== 9) return { ok: false, reason: 'must_keep_exactly_9' }
    const arr = state.humanArrangement!
    const newPile1 = arr.pile1.filter(c => keepKeys.includes(cardKey(c)))
    const newPile2 = arr.pile2.filter(c => keepKeys.includes(cardKey(c)))
    const newPile3 = arr.pile3.filter(c => keepKeys.includes(cardKey(c)))
    if (newPile1.length !== 3 || newPile2.length !== 3 || newPile3.length !== 3) {
      return { ok: false, reason: 'invalid_pile_distribution' }
    }
    const finalArrangement: PlayerArrangement = { pile1: newPile1, pile2: newPile2, pile3: newPile3 }
    state.humanArrangement = finalArrangement

    const community: CommunityCards = (state as any)._community
    const humanFoul = checkFoul(finalArrangement, community)
    const fouled: Record<string, boolean> = (state as any)._foulMap ?? {}
    const foulReasons: Record<string, string> = (state as any)._foulReasons ?? {}
    fouled[playerId] = humanFoul.isFoul
    if (humanFoul.isFoul && humanFoul.reason) foulReasons[playerId] = humanFoul.reason
    else delete foulReasons[playerId]
    ;(state as any)._foulMap = fouled
    ;(state as any)._foulReasons = foulReasons

    const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
    finalPile3[playerId] = newPile3
    ;(state as any)._finalPile3 = finalPile3
    ;(state as any)._humanDiscardSubmitted = true
    resolveDiscardTimeout(io, roomId).catch(err => console.error('resolveDiscardTimeout error:', err))
    return { ok: true }
  }

  if (keepKeys.length !== 3) return { ok: false, reason: 'must_keep_exactly_3' }

  const auctionWon: Record<string, Card> = (state as any)._auctionWonCards ?? {}
  const humanHand = [...state.humanArrangement!.pile3]
  if (auctionWon[playerId]) humanHand.push(auctionWon[playerId])

  const keepCards = keepKeys.map(k => humanHand.find(c => cardKey(c) === k)).filter(Boolean) as Card[]
  if (keepCards.length !== 3) return { ok: false, reason: 'invalid_cards' }

  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
  finalPile3[playerId] = keepCards
  ;(state as any)._finalPile3 = finalPile3
  ;(state as any)._humanDiscardSubmitted = true
  resolveDiscardTimeout(io, roomId).catch(err => console.error('resolveDiscardTimeout error:', err))

  return { ok: true }
}

async function resolveDiscardTimeout(io: Server, roomId: string): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'discard') return

  // ถ้า Human ยังไม่ submit ภายในเวลา -> auto-discard ด้วย suggestion (best 3)
  if (!(state as any)._humanDiscardSubmitted) {
    const community: CommunityCards = (state as any)._community
    if (state.tier === 'highNoble') {
      const arr = state.humanArrangement!
      // Patch: ทิ้ง "ใบสุดท้าย" ของแต่ละกอง (ตรงกับ X ที่ frontend โชว์ไว้ให้ผู้เล่นเห็นล่วงหน้า)
      // ไม่ใช้ bestThreeFromHand แล้ว เพื่อให้ผลลัพธ์ตรงกับที่ผู้เล่นเห็นบนจอเป๊ะ
      const trim = (pile: Card[]) => pile.length > 3 ? pile.slice(0, 3) : pile
      const finalP1 = trim(arr.pile1)
      const finalP2 = trim(arr.pile2)
      const finalP3 = trim(arr.pile3)
      const finalArrangement: PlayerArrangement = { pile1: finalP1, pile2: finalP2, pile3: finalP3 }
      state.humanArrangement = finalArrangement

      const humanFoul = checkFoul(finalArrangement, community)
      const fouled: Record<string, boolean> = (state as any)._foulMap ?? {}
      const foulReasons: Record<string, string> = (state as any)._foulReasons ?? {}
      fouled[state.humanPlayerId] = humanFoul.isFoul
      if (humanFoul.isFoul && humanFoul.reason) foulReasons[state.humanPlayerId] = humanFoul.reason
      ;(state as any)._foulMap = fouled
      ;(state as any)._foulReasons = foulReasons

      const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
      finalPile3[state.humanPlayerId] = finalP3
      ;(state as any)._finalPile3 = finalPile3
    } else {
      const community3: Card[] = community.row3
      const auctionWon: Record<string, Card> = (state as any)._auctionWonCards ?? {}
      const humanHand = [...state.humanArrangement!.pile3]
      if (auctionWon[state.humanPlayerId]) humanHand.push(auctionWon[state.humanPlayerId])
      const { keep } = bestThreeFromHand(humanHand, community3)
      const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
      finalPile3[state.humanPlayerId] = keep
      ;(state as any)._finalPile3 = finalPile3
    }
  }

  state.phase = 'discard_done'
  ;(state as any)._humanDiscardSubmitted = false // reset เผื่อ Round ถัดไป

  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3
  io.to(roomId).emit('discard_phase_result', {
    roomId,
    finalHandSizes: Object.fromEntries(Object.entries(finalPile3).map(([pid, cards]) => [pid, cards.length])),
    // Patch: ส่งไพ่จริงของ Human กลับไปด้วย (3 ใบหลัง Discard) เพื่อแสดงใน Grand Finale
    myFinalHand: (finalPile3[state.humanPlayerId] ?? []).map(cardKey),
  })

  // Patch High Noble: ค่อย reveal Pile1+Pile2 ตรงนี้ (เพราะ arrangement สมบูรณ์แล้วหลัง Discard)
  // ต่างจาก Mastermind/Last Boss ที่ reveal ไปแล้วก่อนหน้า Auction (resolveMastermindPile12)
  if (state.tier === 'highNoble') {
    const community: CommunityCards = (state as any)._community
    const aiArrangements: Record<string, PlayerArrangement> = (state as any)._aiArrangements
    const fouled: Record<string, boolean> = (state as any)._foulMap ?? {}
    const foulReasons: Record<string, string> = (state as any)._foulReasons ?? {}
    const allArrangements: Record<string, PlayerArrangement> = {
      [state.humanPlayerId]: state.humanArrangement!,
      ...aiArrangements,
    }
    const playerIds = [state.humanPlayerId, ...AI_CONFIGS.map(a => a.id)]
    const revealTime = 4000

    // ── Pile 1 ──────────────────────────────────────────────
    const pile1Winner = resolvePile(1, allArrangements, community, fouled)
    const hand1 = pile1Winner ? evaluateHand([...allArrangements[pile1Winner].pile1, ...community.row1]) : null
    io.to(roomId).emit('pile_reveal', {
      roomId, pileNumber: 1, winner: pile1Winner,
      winnerHandRank: hand1 ? handRankLabel(hand1) : '',
      arrangements: revealWinnerOnly(allArrangements, 1, pile1Winner),
      fouled, foulReasons,
    })
    await delay(revealTime)

    // ── Pile 2 ──────────────────────────────────────────────
    const pile2Winner = resolvePile(2, allArrangements, community, fouled)
    const hand2 = pile2Winner ? evaluateHand([...allArrangements[pile2Winner].pile2, ...community.row2]) : null
    io.to(roomId).emit('pile_reveal', {
      roomId, pileNumber: 2, winner: pile2Winner,
      winnerHandRank: hand2 ? handRankLabel(hand2) : '',
      arrangements: revealWinnerOnly(allArrangements, 2, pile2Winner),
      fouled, foulReasons,
    })
    await delay(revealTime)

    // Patch (บั๊กแก้): เก็บผล Pile1/2 ลง _pendingPile12 ให้ finalizeGrandFinale อ่านไปจ่ายเงินได้
    // (เดิมลืมเก็บ ทำให้ Pile1/2 ไม่ได้จ่าย/หักเงินเลยถึงแม้ popup โชว์ผู้ชนะถูกต้อง)
    ;(state as any)._pendingPile12 = { pile1Winner, pile2Winner, allArrangements, community, fouled, playerIds }

    // ── Fog of War ────────────────────────────────────────────
    ;(state as any)._foulMap = fouled // เก็บไว้ใช้ใน startGrandFinale (ตัดสิทธิ์คน Foul Pile1/2)
    state.phase = 'fog_of_war'
    io.to(roomId).emit('fog_of_war', {
      roomId,
      message: 'Pile 1 & 2 ถูกซ่อนแล้ว — เหลือ Pile 3 ในมือคุณเท่านั้นที่เห็น',
    })
    await delay(8000)
    startGrandFinale(io, roomId)
    return
  }

  // Patch Grand Finale: เริ่มทันทีหลัง Discard จบ
  await delay(1000)
  startGrandFinale(io, roomId)
}

// ============================================================
// Patch Grand Finale Betting (Phase สุดท้ายของ Mastermind+)
// กฎหลัก:
//   - ใครก็ตามที่ Foul Pile1 หรือ Pile2 → หมดสิทธิ์ ไม่ได้ Call/Fold ใน Grand Finale
//   - Round 1: ตามเข็ม P3→P4→P1→P2 (ถ้า P3 Foul เริ่มที่ P4 แทน)
//   - Call = หงายไพ่ใบแรก / Fold = ไม่หงาย
//   - Fold หมดเหลือ 1 คน → ชนะทันที (ไม่หงายไพ่อีก)
//   - Round 2: ทวนเข็ม P2→P1→P4→P3 (เฉพาะคนที่ยัง Call อยู่)
//   - Call Round 2 ไม่หงายไพ่จนกว่าจะครบทุกคน → หงาย 2 ใบที่เหลือพร้อมกัน → เทียบ Hand
//   - ทุก Foul → Pot Pile 3 BURN ทิ้ง
//   - เงิน Call เข้า Pot Pile 3 เพิ่ม
// ============================================================

interface GrandFinaleState {
  roundNumber: 1 | 2
  eligiblePlayers: string[]        // คนที่ไม่ Foul + ยัง Call อยู่
  foldedPlayers: string[]          // คน Fold แล้ว
  foulPlayers: string[]            // คน Foul (excluded ตลอด)
  currentTurnIdx: number           // index ใน eligiblePlayers
  turnOrder: string[]              // ลำดับ turn ใน round นี้
  pile3Pot: number                 // Pot Pile 3 (เริ่มจาก ante stake รวม + Call ทุกครั้ง)
  pendingAction: 'call' | 'fold' | null
  decisionTimerId?: any
  // Patch High Noble: เก็บไพ่ที่ผู้เล่นแต่ละคน "Call" หงายไปแล้วในรอบ1 — Boss จตุรเทพใช้ประเมิน winrate ตอน Call/Fold
  revealedCards: Record<string, Card[]>
}

function startGrandFinale(io: Server, roomId: string): void {
  const state = matchStates.get(roomId)
  if (!state) return
  state.phase = 'grand_finale'

  const allPlayerIds = [state.humanPlayerId, ...AI_CONFIGS.map(a => a.id)]
  const lastResult = state.results[state.results.length - 1]
  const fouled: Record<string, boolean> = {}
  // ใช้ผล Foul จาก Pile 1+2 (ไม่ใช่ Pile 3 เพราะ Pile 3 ยังไม่ได้ resolve)
  // _community ของ Pile 1, 2 ใช้ Foul check จาก submitArrangement (เก็บอยู่ใน MatchState ตอนแรก)
  const foulMap: Record<string, boolean> = (state as any)._foulMap ?? {}

  const foulPlayers = allPlayerIds.filter(pid => foulMap[pid])
  let eligible = allPlayerIds.filter(pid => !foulMap[pid])

  // คำนวณ Pile 3 Pot เริ่มต้น (ante ของทุกคนรวม — ไม่หัก foul เพราะ ante จ่ายไปแล้วก่อน round เริ่ม)
  const stakes = gameConfig.tokenPot.tiers[state.tier as 'mastermind' | 'highNoble' | 'lastBoss']
  const pile3Pot = stakes.pile3 * allPlayerIds.length

  // เคสพิเศษ: Foul หมดทุกคน → ไม่มีผู้ชนะ Pile 3, Burn ทิ้ง
  if (eligible.length === 0) {
    io.to(roomId).emit('grand_finale_all_foul', { roomId, pile3Pot, burned: true })
    finalizeGrandFinale(io, roomId, null, pile3Pot, foulPlayers, foulMap, true)
    return
  }
  // เคสพิเศษ: เหลือคนไม่ Foul แค่ 1 คน → ชนะทันที ไม่ต้อง Betting
  if (eligible.length === 1) {
    io.to(roomId).emit('grand_finale_walkover', { roomId, winnerId: eligible[0], pile3Pot })
    finalizeGrandFinale(io, roomId, eligible[0], pile3Pot, foulPlayers, foulMap, false)
    return
  }

  // ลำดับ turn Round 1 ตามเข็ม: เริ่ม P3 → P4 → P1 → P2 (ถ้า P3 Foul เริ่มคนถัดไป)
  const clockwiseOrder = [
    'AI_SAGE',       // P3 (Boss) — สมมุติว่า AI_SAGE เป็น P3 ตามสเปคเดิม
    'AI_RECKLESS',   // P4
    state.humanPlayerId, // P1
    'AI_GHOST',      // P2
  ]
  const turnOrder = clockwiseOrder.filter(pid => eligible.includes(pid))

  const gfState: GrandFinaleState = {
    roundNumber: 1,
    eligiblePlayers: [...eligible],
    foldedPlayers: [],
    foulPlayers,
    currentTurnIdx: 0,
    turnOrder,
    pile3Pot,
    pendingAction: null,
    revealedCards: {}, // Patch: เก็บไพ่ที่หงายแล้วของผู้เล่นที่ Call ในรอบ1
  }
  ;(state as any)._grandFinale = gfState

  io.to(roomId).emit('grand_finale_start', {
    roomId,
    roundNumber: 1,
    turnOrder,
    foulPlayers,
    pile3Pot,
  })

  startNextTurn(io, roomId)
}

// ─── ตัดสินใจตา AI/Human คนปัจจุบัน ────────────────────────
function startNextTurn(io: Server, roomId: string): void {
  const state = matchStates.get(roomId)
  if (!state) return
  const gf = (state as any)._grandFinale as GrandFinaleState
  if (!gf) return

  // จบ Round → ไป Round 2 หรือจบเกม
  if (gf.currentTurnIdx >= gf.turnOrder.length) {
    // จบ Round
    if (gf.roundNumber === 1) {
      const stillIn = gf.turnOrder.filter(pid => !gf.foldedPlayers.includes(pid))
      if (stillIn.length <= 1) {
        // Round 1 จบแล้วเหลือ ≤ 1 คน → คนนั้นชนะ (ถ้าเหลือ 1) หรือไม่มีผู้ชนะ (เหลือ 0 — ไม่น่าเกิด เพราะ fold สุดท้ายคนสุดท้ายแพ้เอง)
        const winner = stillIn[0] ?? null
        finalizeGrandFinale(io, roomId, winner, gf.pile3Pot, gf.foulPlayers, {}, winner === null)
        return
      }
      // เข้า Round 2: ทวนเข็ม P2→P1→P4→P3
      const counterclockwise = ['AI_GHOST', state.humanPlayerId, 'AI_RECKLESS', 'AI_SAGE']
      gf.roundNumber = 2
      gf.turnOrder = counterclockwise.filter(pid => stillIn.includes(pid))
      gf.currentTurnIdx = 0
      io.to(roomId).emit('grand_finale_round_start', { roomId, roundNumber: 2, turnOrder: gf.turnOrder, pile3Pot: gf.pile3Pot })
      startNextTurn(io, roomId)
      return
    } else {
      // Round 2 จบ → เทียบไพ่
      const stillIn = gf.turnOrder.filter(pid => !gf.foldedPlayers.includes(pid))
      if (stillIn.length === 0) {
        finalizeGrandFinale(io, roomId, null, gf.pile3Pot, gf.foulPlayers, {}, true)
        return
      }
      if (stillIn.length === 1) {
        finalizeGrandFinale(io, roomId, stillIn[0], gf.pile3Pot, gf.foulPlayers, {}, false)
        return
      }
      // หงาย 2 ใบที่เหลือ + เทียบ Hand Strength
      const winner = resolveGrandFinaleShowdown(io, roomId, stillIn)
      finalizeGrandFinale(io, roomId, winner, gf.pile3Pot, gf.foulPlayers, {}, false)
      return
    }
  }

  // ตาผู้เล่นคนปัจจุบัน
  const currentPid = gf.turnOrder[gf.currentTurnIdx]
  const isHuman = currentPid === state.humanPlayerId
  const callAmount = (gameConfig.grandFinale.callAmount as Record<string, number | null>)[state.tier] ?? 0

  io.to(roomId).emit('grand_finale_turn', {
    roomId,
    playerId: currentPid,
    roundNumber: gf.roundNumber,
    callAmount,
    timeLimitMs: ((gameConfig.grandFinale.betTimer as Record<string, number | null>)[state.tier] ?? 10) * 1000,
  })

  if (isHuman) {
    // รอ socket event 'grand_finale_action' จาก client + ตั้ง timeout auto-fold
    if (gf.decisionTimerId) clearTimeout(gf.decisionTimerId)
    // Patch High Noble: หมดเวลา = Auto-Call ใบ default (เดิมเป็น Auto-Fold)
    // ผู้เล่นจะ Fold ได้ผ่าน swipe down เท่านั้น (เป็น opt-in action ไม่ใช่ default)
    gf.decisionTimerId = setTimeout(() => {
      // Patch: หมดเวลา = Auto-Call ใบ default (Mastermind+ ใช้ UX แบบ click+swipe ไม่มีปุ่ม CALL)
      const action = (state.tier === 'highNoble' || state.tier === 'mastermind') ? 'call' : 'fold'
      applyGrandFinaleAction(io, roomId, currentPid, action)
    }, ((gameConfig.grandFinale.betTimer as Record<string, number | null>)[state.tier] ?? 10) * 1000)
  } else {
    // AI ตัดสินใจตามความแข็งของไพ่ (Mastermind: ดู Hand Strength)
    // สุ่ม delay 3500-4500ms ให้ดูเหมือนคิดจริง
    const aiThinkMs = 7000 + Math.floor(Math.random() * 3000) // สุ่ม 7000-10000ms ให้ดูเหมือนคิดนาน
    setTimeout(() => {
      const action = decideAIGrandFinaleAction(state, currentPid)
      applyGrandFinaleAction(io, roomId, currentPid, action)
    }, aiThinkMs)
  }
}

// ============================================================
// Patch High Noble — Card Counting Heuristic สำหรับ Boss จตุรเทพ
// ประเมิน "โอกาสชนะ" ของ Boss โดยอ่านไพ่ที่เปิดเผยแล้ว:
//   - Community ทั้ง 6 ใบ (row1/row2/row3)
//   - Pile1/Pile2 ของทุกคน (เปิดเผยก่อน Fog of War)
//   - ไพ่ที่ผู้เล่นอื่น Call หงายในรอบ1 Grand Finale
// แล้วเทียบกับ "case แย่ที่สุด" ของคู่ต่อสู้แต่ละคน
// ============================================================
function estimateBossWinrate(state: MatchState, bossId: string): number {
  const community: CommunityCards = (state as any)._community
  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
  const pendingPile12 = (state as any)._pendingPile12 as { allArrangements: Record<string, PlayerArrangement> } | undefined
  const gf = (state as any)._grandFinale as GrandFinaleState | undefined
  if (!gf) return 0.5

  const myHand = finalPile3[bossId] ?? []
  if (myHand.length !== 3) return 0
  const myResult = evaluateHand([...myHand, ...community.row3])

  // รวบรวมไพ่ที่เปิดเผยแล้วทั้งหมด → หาไพ่ที่ยังไม่เห็น (unseen)
  const cardId = (c: Card) => `${c.rank}_${c.suit}`
  const seen = new Set<string>()
  community.row1.forEach(c => seen.add(cardId(c)))
  community.row2.forEach(c => seen.add(cardId(c)))
  community.row3.forEach(c => seen.add(cardId(c)))
  myHand.forEach(c => seen.add(cardId(c)))
  if (pendingPile12) {
    for (const arr of Object.values(pendingPile12.allArrangements)) {
      arr.pile1.forEach(c => seen.add(cardId(c)))
      arr.pile2.forEach(c => seen.add(cardId(c)))
    }
  }
  for (const cards of Object.values(gf.revealedCards)) {
    cards.forEach(c => seen.add(cardId(c)))
  }

  // สร้าง deck เต็มแล้ว filter "unseen"
  const SUITS: Array<Card['suit']> = ['spades', 'hearts', 'diamonds', 'clubs']
  const RANKS: Array<Card['rank']> = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
  const VALUE: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 }
  const unseen: Card[] = []
  for (const r of RANKS) {
    for (const s of SUITS) {
      const id = `${r}_${s}`
      if (!seen.has(id)) unseen.push({ rank: r, suit: s, value: VALUE[r] })
    }
  }

  // ประเมินคู่ต่อสู้แต่ละคนที่ยัง Call อยู่
  const opponents = gf.turnOrder.filter(pid => pid !== bossId && !gf.foldedPlayers.includes(pid))
  if (opponents.length === 0) return 1.0 // ไม่มีคู่ต่อสู้ = ชนะแน่

  let opponentsBeatMe = 0
  for (const oppId of opponents) {
    const revealed = gf.revealedCards[oppId] ?? []
    // สมมติคู่ต่อสู้มี 3 ใบ: ที่เห็นแล้ว N ใบ + ที่ไม่เห็น (3-N) ใบ
    // ลองแทน (3-N) ใบที่ดีที่สุดที่เป็นไปได้ จาก unseen pool
    const need = 3 - revealed.length
    // หา "ไพ่ที่อันตรายที่สุด" ใน unseen — สมมติคู่ต่อสู้ได้ใบที่ค่ามากสุด (rank สูงสุด) มา
    const dangerCards = [...unseen].sort((a, b) => b.value - a.value).slice(0, need)
    const bestOppHand = [...revealed, ...dangerCards]
    if (bestOppHand.length !== 3) continue
    const oppResult = evaluateHand([...bestOppHand, ...community.row3])
    if (compareHands(oppResult, myResult) > 0) opponentsBeatMe++
  }

  // winrate = สัดส่วนคู่ต่อสู้ที่ "ไม่อาจชนะเรา" แม้ในกรณีดีสุดของเขา
  const safeOpponents = opponents.length - opponentsBeatMe
  return safeOpponents / opponents.length
}

// AI ตัดสินใจ Call/Fold ตามความแข็งของไพ่ (Mastermind)
// ใช้ rankIndex จาก handEvaluator: 3=three_of_a_kind, 2=two_pair, 1=one_pair, 0=high_card
function decideAIGrandFinaleAction(state: MatchState, aiId: string): 'call' | 'fold' {
  const community3: Card[] = ((state as any)._community as CommunityCards).row3
  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
  const hand3 = finalPile3[aiId] ?? []
  if (hand3.length !== 3) return 'fold'
  const result = evaluateHand([...hand3, ...community3])
  // Threshold ตามลำดับความแข็งของไพ่
  let callProb: number
  if (result.rankIndex >= 3) callProb = 0.99       // Three of a Kind+: เกือบ Call แน่
  else if (result.rankIndex === 2) callProb = 0.90 // Two Pair: Call 90%
  else if (result.rankIndex === 1) callProb = 0.80 // One Pair: Call 80%
  else callProb = 0.40                              // High Card: Call 40%

  // Patch High Noble / Mastermind Conquest: Boss ที่นั่ง P3 ใช้ Card Counting ประเมิน winrate + ปรับตาม personality
  const bossOverride = (state as any)._bossOverride as AIConfig | undefined
  if (bossOverride && aiId === AI_CONFIGS[0].id && (state.tier === 'highNoble' || state.tier === 'mastermind')) {
    const winrate = estimateBossWinrate(state, aiId) // 0.0 - 1.0 (worst case ของคู่ต่อสู้)
    switch (bossOverride.personality) {
      case 'reaper': // ดุที่สุด — ใช้ winrate แต่ bias +0.2 ให้ Call ง่ายขึ้น (กดดัน)
        callProb = Math.min(0.99, winrate + 0.20)
        break
      case 'crag': // ป้องกันแน่น — ใช้ winrate แต่ bias -0.15 ให้ Fold ง่ายขึ้น (ระแวดระวัง)
        callProb = Math.max(0.05, winrate - 0.15)
        break
      case 'cortex': // คำนวณเย็นชา — ตัดสินตาม winrate ตรงๆ ไม่มี randomness
        return winrate >= 0.5 ? 'call' : 'fold'
      case 'cipher': // คาดเดาไม่ได้ — 30% เมิน winrate สุ่มล้วน ที่เหลือใช้ winrate ตรงๆ
        if (Math.random() < 0.3) return Math.random() < 0.5 ? 'call' : 'fold'
        callProb = winrate
        break
      // ── The Nine Sentinels — Threshold canon จาก MasterPlan v1.1 (ห้ามแก้ค่า)
      case 'iron_wall': // Fold ถ้า winrate < 60%
        return winrate >= 0.6 ? 'call' : 'fold'
      case 'chivalry': // Call ที่ winrate >= 50%
        return winrate >= 0.5 ? 'call' : 'fold'
      case 'war_lord': // Call แม้ winrate ~35% — บุกไม่หยุด
        return winrate >= 0.35 ? 'call' : 'fold'
      case 'phantom': // 40% บลัฟล้วน + 60% ใช้ winrate ตรงๆ
        if (Math.random() < 0.4) return Math.random() < 0.5 ? 'call' : 'fold'
        return winrate >= 0.5 ? 'call' : 'fold'
      case 'dark_shark': // Call ที่ winrate >= 50%
        return winrate >= 0.5 ? 'call' : 'fold'
      case 'oracle': // Deterministic: >=50% → Call
        return winrate >= 0.5 ? 'call' : 'fold'
      case 'phoenix': // winrate +15% (แบบ Reaper แต่เบากว่า)
        callProb = Math.min(0.99, winrate + 0.15)
        break
      case 'black_magic': // Call ที่ winrate >= 45-50% — ใช้ค่ากลาง 47.5%
        return winrate >= 0.475 ? 'call' : 'fold'
      case 'jester': // 30% random ล้วน + 70% ใช้ winrate ตรงๆ
        if (Math.random() < 0.3) return Math.random() < 0.5 ? 'call' : 'fold'
        callProb = winrate
        break
    }
  }

  return Math.random() < callProb ? 'call' : 'fold'
}

// Patch High Noble: เลือกใบไพ่ที่จะหงายของ AI
// - Boss จตุรเทพ (ยกเว้น Cipher): ใช้กลยุทธ์ "หลอกลวง" (deception) — หงายใบที่ปกปิดมือแข็งของตัวเอง
// - Cipher + AI ปกติ (P2/P4): หงายใบอ่อนสุดที่ยังไม่หงาย
function pickRevealCard(state: MatchState, playerId: string, hand: Card[], alreadyRevealed: Card[]): Card | undefined {
  if (hand.length === 0) return undefined
  const remaining = hand.filter(c => !alreadyRevealed.some(r => r.rank === c.rank && r.suit === c.suit))
  if (remaining.length === 0) return undefined

  const bossOverride = (state as any)._bossOverride as AIConfig | undefined
  const isBoss = bossOverride && playerId === AI_CONFIGS[0].id && (state.tier === 'highNoble' || state.tier === 'mastermind')

  // Patch Mastermind Conquest: Jester คาดเดาไม่ได้เหมือน Cipher — ไม่ใช้กลยุทธ์หลอกลวง
  if (isBoss && bossOverride!.personality !== 'cipher' && bossOverride!.personality !== 'jester') {
    // กลยุทธ์หลอกลวง: ดู rank ของมือ + community Row3 → หาใบ "ไม่ใช่ส่วนของชุดแข็ง" หงาย
    const community: CommunityCards = (state as any)._community
    const fullHand = [...hand, ...community.row3]
    // นับจำนวน rank แต่ละแบบ
    const rankCount: Record<string, number> = {}
    fullHand.forEach(c => { rankCount[c.rank] = (rankCount[c.rank] ?? 0) + 1 })
    // หาใบใน remaining ที่ rank "ไม่ซ้ำ" (kicker) — ปกปิดมือแข็งได้ดีสุด
    const kickers = remaining.filter(c => rankCount[c.rank] === 1)
    if (kickers.length > 0) {
      // เลือก kicker ที่ค่าน้อยกว่าสุด (ผู้เล่นจะคิดว่า Boss มือ low ก็ได้)
      return kickers.reduce((min, c) => c.value < min.value ? c : min, kickers[0])
    }
    // ถ้าไม่มี kicker (เช่น Three of a Kind ที่ไม่มีใบเดี่ยว) — เลือกใบที่ค่าน้อยที่สุด
  }

  // AI ปกติ / Cipher: ใบอ่อนสุดที่ยังไม่หงาย
  return remaining.reduce((min, c) => c.value < min.value ? c : min, remaining[0])
}

function applyGrandFinaleAction(io: Server, roomId: string, playerId: string, action: 'call' | 'fold', revealedCardKey?: string): void {
  const state = matchStates.get(roomId)
  if (!state) return
  const gf = (state as any)._grandFinale as GrandFinaleState
  if (!gf) return
  // ป้องกัน race condition: ถ้าไม่ใช่ตาคนนี้ ทิ้ง action
  if (gf.turnOrder[gf.currentTurnIdx] !== playerId) return
  if (gf.decisionTimerId) clearTimeout(gf.decisionTimerId)

  const callAmount = (gameConfig.grandFinale.callAmount as Record<string, number | null>)[state.tier] ?? 0

  if (action === 'fold') {
    gf.foldedPlayers.push(playerId)
  } else {
    state.tokenBalance[playerId] = (state.tokenBalance[playerId] ?? 0) - callAmount
    gf.pile3Pot += callAmount
  }

  // Patch High Noble: หงายไพ่ทั้ง Round 1 และ Round 2 (เดิมรอบ 2 ห้ามหงาย)
  // - ถ้า Human ส่ง revealedCardKey มา → ใช้ใบนั้น
  // - AI → ใช้ pickRevealCard (Boss จตุรเทพใช้กลยุทธ์หลอกลวง, ที่เหลือใบอ่อนสุด)
  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
  const handForReveal = finalPile3[playerId] ?? []
  const alreadyRevealed = gf.revealedCards[playerId] ?? []
  let revealedCard: Card | undefined
  if (action === 'call') {
    if (revealedCardKey) {
      revealedCard = handForReveal.find(c => cardKey(c) === revealedCardKey
        && !alreadyRevealed.some(r => r.rank === c.rank && r.suit === c.suit))
    }
    if (!revealedCard) {
      revealedCard = pickRevealCard(state, playerId, handForReveal, alreadyRevealed)
    }
  }

  // เก็บไพ่ที่หงายลง state ให้ Boss จตุรเทพอ่านได้ตอนตัดสินใจ Call/Fold
  if (revealedCard) {
    if (!gf.revealedCards[playerId]) gf.revealedCards[playerId] = []
    gf.revealedCards[playerId].push(revealedCard)
  }

  io.to(roomId).emit('grand_finale_action', {
    roomId,
    playerId,
    action,
    revealedCard: revealedCard ? cardKey(revealedCard) : null,
    roundNumber: gf.roundNumber, // เพิ่ม: ให้ frontend รู้ว่าหงายในรอบไหน
    pile3Pot: gf.pile3Pot,
    tokenBalance: state.tokenBalance,
  })

  gf.currentTurnIdx++
  setTimeout(() => startNextTurn(io, roomId), 800) // delay สั้นๆให้ animation ขึ้น
}

// Round 2 จบ — เทียบ Hand Strength
function resolveGrandFinaleShowdown(io: Server, roomId: string, stillIn: string[]): string | null {
  const state = matchStates.get(roomId)
  if (!state) return null
  const community3: Card[] = ((state as any)._community as CommunityCards).row3
  const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}

  let bestScore = -Infinity
  let winnerId: string | null = null
  const reveals: Record<string, string[]> = {}
  for (const pid of stillIn) {
    const hand = finalPile3[pid] ?? []
    reveals[pid] = hand.map(cardKey)
    const result = evaluateHand([...hand, ...community3])
    if (result.score > bestScore) {
      bestScore = result.score
      winnerId = pid
    }
  }

  io.to(roomId).emit('grand_finale_reveal_all', {
    roomId,
    reveals,
    winnerId,
  })
  return winnerId
}

// Human submit Call/Fold (เรียกจาก socket handler) — รับ io ตรงๆเลย
// Patch High Noble: รับ revealedCardKey เพิ่ม — ใบที่ Human เลือกหงายเอง (ทั้งรอบ 1 และรอบ 2)
export function submitGrandFinaleAction(io: Server, roomId: string, playerId: string, action: 'call' | 'fold', revealedCardKey?: string): { ok: boolean; reason?: string } {
  const state = matchStates.get(roomId)
  if (!state || state.phase !== 'grand_finale') return { ok: false, reason: 'not_in_grand_finale' }
  const gf = (state as any)._grandFinale as GrandFinaleState
  if (!gf || gf.turnOrder[gf.currentTurnIdx] !== playerId) return { ok: false, reason: 'not_your_turn' }
  applyGrandFinaleAction(io, roomId, playerId, action, revealedCardKey)
  return { ok: true }
}

// ─── จบเกม Grand Finale — รวมจ่าย Token Pile1+2+3 ──────────
function finalizeGrandFinale(
  io: Server,
  roomId: string,
  winnerId: string | null,
  pile3Pot: number,
  foulPlayers: string[],
  _foulMap: Record<string, boolean>,
  burned: boolean,
): void {
  const state = matchStates.get(roomId)
  if (!state) return
  state.phase = 'grand_finale_done'

  const allPlayerIds = [state.humanPlayerId, ...AI_CONFIGS.map(a => a.id)]
  const stakes = gameConfig.tokenPot.tiers[state.tier as 'mastermind' | 'highNoble' | 'lastBoss']

  // คำนวณจ่าย Token รวม Pile 1+2 (ที่ resolve ไปก่อนหน้านี้ แต่ยังไม่จ่าย)
  const pile1Winner = (state as any)._pendingPile12?.pile1Winner as string | undefined
  const pile2Winner = (state as any)._pendingPile12?.pile2Winner as string | undefined
  const deltas: Record<string, number> = {}
  allPlayerIds.forEach(id => deltas[id] = 0)
  const rake = gameConfig.tokenPot.rake

  // Pile 1
  if (pile1Winner) {
    const pot = stakes.pile1 * allPlayerIds.length
    const net = Math.floor(pot * (1 - rake))
    allPlayerIds.forEach(id => deltas[id] += (id === pile1Winner ? net - stakes.pile1 : -stakes.pile1))
  }
  // Pile 2
  if (pile2Winner) {
    const pot = stakes.pile2 * allPlayerIds.length
    const net = Math.floor(pot * (1 - rake))
    allPlayerIds.forEach(id => deltas[id] += (id === pile2Winner ? net - stakes.pile2 : -stakes.pile2))
  }
  // Pile 3 — pile3Pot รวมทั้ง ante เดิม + Call ที่จ่ายไปแล้ว (ถูกหักจาก tokenBalance ระหว่างทาง)
  // แต่ ante stake ของ pile3 ยังไม่ได้หักจาก tokenBalance เลย ต้องหัก -stakes.pile3 ให้ทุกคนตรงนี้
  allPlayerIds.forEach(id => deltas[id] += -stakes.pile3)
  if (winnerId && !burned) {
    const net = Math.floor(pile3Pot * (1 - rake))
    deltas[winnerId] += net
  }

  // อัพเดท tokenBalance รวม (Call ที่จ่ายไปก่อนหน้าโดน hak ไปแล้วใน applyGrandFinaleAction)
  allPlayerIds.forEach(id => {
    state.tokenBalance[id] = (state.tokenBalance[id] ?? state.buyInAmount) + (deltas[id] ?? 0)
  })

  // Patch: คำนวณ Rank ของผู้ชนะ Pile 3 + Jackpot flag (ชนะทั้ง 3 กอง)
  let winnerRank: string | null = null
  if (winnerId && !burned) {
    const community3: Card[] = ((state as any)._community as CommunityCards).row3
    const finalPile3: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
    const winnerHand = finalPile3[winnerId] ?? []
    if (winnerHand.length === 3) {
      const result = evaluateHand([...winnerHand, ...community3])
      winnerRank = result.rank // e.g. "one_pair", "two_pair", "three_of_a_kind"
    }
  }
  // Jackpot: ใครก็ตามที่ชนะทั้ง 3 กอง
  const jackpotWinner = (pile1Winner && pile1Winner === pile2Winner && pile2Winner === winnerId) ? winnerId : null

  // End-of-Match Stats: เก็บ hand pile3 ของ human เอง (ถ้ามีไพ่จริง ไม่ fold/foul) + triple sweep flag
  {
    const community3ForStats: Card[] = ((state as any)._community as CommunityCards).row3
    const finalPile3ForStats: Record<string, Card[]> = (state as any)._finalPile3 ?? {}
    const humanPile3 = finalPile3ForStats[state.humanPlayerId]
    if (humanPile3 && humanPile3.length === 3) {
      const humanHand3Cards = [...humanPile3, ...community3ForStats]
      trackBestHandLive(state, evaluateHand(humanHand3Cards), humanHand3Cards, 3, winnerId === state.humanPlayerId)
    }
    if (jackpotWinner === state.humanPlayerId) state.tripleSweepThisMatch = true
  }

  // Patch Triple Sweep Jackpot v1.2: ชนะทั้ง 3 กอง → Bonus + Rake
  // Patch (2026-07-17): ยกเลิก Rake 10% เฉพาะ Jackpot round — ใช้ rake อัตราเดียว 5% (ตัวเดียวกับ
  // pot ปกติ) ทุกกรณีแล้ว
  // Formula: bonus = stakes.pile3 × (n_players-1) เก็บจากผู้แพ้คนละ stakes.pile3
  //          jackpot_total = pot_net (จาก 3 piles หัก rake 5%) + bonus
  //          rake_jackpot = jackpot_total × 5% burn
  //          winner_extra = bonus - rake_jackpot (เพิ่มจาก delta เดิมที่ได้จาก pot ปกติ)
  let jackpotBonus = 0
  let jackpotRake = 0
  if (jackpotWinner) {
    jackpotBonus = stakes.pile3 * (allPlayerIds.length - 1) // ผู้แพ้ 3 คน × pile3 ante
    // pot_net รวม 3 piles (ค่าที่ winner ได้จาก pot ปกติแล้ว — ก่อนลบ ante ของตัวเอง)
    const potNet1 = Math.floor(stakes.pile1 * allPlayerIds.length * (1 - rake))
    const potNet2 = Math.floor(stakes.pile2 * allPlayerIds.length * (1 - rake))
    const potNet3 = Math.floor(pile3Pot * (1 - rake)) // pile3Pot รวม Call amounts ที่จ่ายระหว่าง Grand Finale
    const jackpotSubtotal = potNet1 + potNet2 + potNet3 + jackpotBonus
    jackpotRake = Math.floor(jackpotSubtotal * rake)
    // ปรับ delta: winner ได้ bonus เพิ่ม - rake_jackpot
    deltas[jackpotWinner] += (jackpotBonus - jackpotRake)
    // ผู้แพ้ทุกคน จ่าย bonus เพิ่มคนละ stakes.pile3
    allPlayerIds.forEach(id => {
      if (id !== jackpotWinner) deltas[id] += -stakes.pile3
    })
  }

  io.to(roomId).emit('grand_finale_result', {
    roomId,
    winnerId,
    winnerRank,
    pile3Pot,
    foulPlayers,
    burned,
    pile1Winner: pile1Winner ?? null,
    pile2Winner: pile2Winner ?? null,
    pile1Pot: pile1Winner ? Math.floor(stakes.pile1 * allPlayerIds.length * (1 - rake)) : 0,
    pile2Pot: pile2Winner ? Math.floor(stakes.pile2 * allPlayerIds.length * (1 - rake)) : 0,
    jackpotWinner,
    jackpotBonus, // Patch: bonus ที่ winner ได้รับเพิ่ม (สำหรับแสดง UI)
    jackpotRake,  // Patch: rake 5% ที่ burn (สำหรับแสดง UI)
    tokenDeltas: deltas,
    tokenBalance: state.tokenBalance,
  })

  // ── ต่อ Round หรือจบ Match (เหมือน Initiate)
  ;(state as any)._grandFinale = undefined
  ;(state as any)._foulMap = undefined
  ;(state as any)._pendingPile12 = undefined
  ;(state as any)._auctionWonCards = undefined
  ;(state as any)._finalPile3 = undefined

  const result: RoundResult = {
    roundNumber: state.roundNumber,
    pile1Winner: pile1Winner ?? '',
    pile2Winner: pile2Winner ?? '',
    pile3Winner: winnerId ?? '',
    tokenDeltas: deltas,
    arrangements: {},
    community: (state as any)._community,
    hasFoul: {},
  }
  state.results.push(result)

  setTimeout(async () => {
    if (state.roundNumber >= state.totalRounds) {
      state.phase = 'match_end'
      const finalWinner = allPlayerIds.reduce((a, b) =>
        (state.tokenBalance[a] ?? 0) > (state.tokenBalance[b] ?? 0) ? a : b
      )
      // ── Settle Escrow ครั้งเดียว (Buy-in Spec §4 — จบแมตช์ปกติ) ──
      let newTokenBalance: number | null = null
      if (state.escrowId) {
        newTokenBalance = await settleEscrow(state.humanPlayerId, state.escrowId, state.tokenBalance[state.humanPlayerId] ?? state.buyInAmount)
      }
      // End-of-Match Stats Recording — แทนที่ recordGameResults() เดิม — Mastermind ใช้ Sequential Showdown
      // (Fog of War/Auction/Grand Finale) ดังนั้น bestHandThisMatch/tripleSweepThisMatch ต้องมาจาก live
      // tracking ระหว่างเกม (resolveMastermindPile12/finalizeGrandFinale) ไม่ใช่ derive จาก state.results
      const statsTier: StatsTier = (['initiate', 'adept', 'mastermind', 'highNoble'].includes(state.tier)
        ? state.tier : 'mastermind') as StatsTier
      await recordMatchStats([{
        userId: state.humanPlayerId,
        tier: statsTier,
        won: finalWinner === state.humanPlayerId,
        isTripleSweep: state.tripleSweepThisMatch ?? false,
        bestHandThisMatch: state.bestHandThisMatch ?? null,
      }])

      // Patch Mastermind Conquest: ผู้เล่นได้อันดับ 1 → บันทึก conquered_sentinels (กันซ้ำ)
      let sentinelConquered = false
      let allSentinelsConquered = false
      if (state.tier === 'mastermind' && finalWinner === state.humanPlayerId) {
        const conqueredBossId = (state as any)._bossId as string | undefined
        if (conqueredBossId) {
          try {
            const { data: userData } = await supabaseAdmin
              .from('users')
              .select('conquered_sentinels')
              .eq('user_id', state.humanPlayerId)
              .single()
            const current: string[] = userData?.conquered_sentinels ?? []
            const updated = current.includes(conqueredBossId) ? current : [...current, conqueredBossId]
            if (!current.includes(conqueredBossId)) {
              await supabaseAdmin
                .from('users')
                .update({ conquered_sentinels: updated })
                .eq('user_id', state.humanPlayerId)
            }
            sentinelConquered = true
            allSentinelsConquered = updated.length >= 9
          } catch (err) {
            // Patch: ถ้า migration 005_nine_sentinels.sql ยังไม่ได้รันบน Supabase คอลัมน์นี้จะยังไม่มี — log ไว้เฉยๆ ไม่ throw
            console.error('[CONQUEST] Error updating conquered_sentinels:', err)
          }
        }
      }

      io.to(roomId).emit('match_end', {
        roomId,
        finalWinner,
        tokenBalance: state.tokenBalance,
        results: state.results,
        totalRounds: state.totalRounds,
        sentinelConquered,
        allSentinelsConquered,
        buyInAmount: state.buyInAmount,
        newTokenBalance,
      })
    } else {
      state.roundNumber++
      state.phase = 'arrangement'
      await delay(2000)
      await startRound(io, roomId)
    }
  }, 10000) // ให้เห็นผล Grand Finale 5s + Round Summary 5s ก่อนต่อ Round ใหม่
}

// ── Helper: เปิดเผยไพ่เฉพาะคนที่ชนะ Pile นั้น (คนอื่นเห็นแค่หลังไพ่ = ไม่ส่งค่าไพ่มา) ──
function revealWinnerOnly(
  arrangements: Record<string, PlayerArrangement>,
  pileNum: 1 | 2 | 3,
  winnerId: string
): Record<string, string[] | null> {
  const result: Record<string, string[] | null> = {}
  for (const pid of Object.keys(arrangements)) {
    if (pid !== winnerId) {
      result[pid] = null // Frontend: null = แสดงหลังไพ่
      continue
    }
    const arr = arrangements[pid]
    const pile = pileNum === 1 ? arr.pile1 : pileNum === 2 ? arr.pile2 : arr.pile3
    result[pid] = pile.map(cardKey)
  }
  return result
}

// ── Helper: เปิดเผย arrangement เฉพาะ pile ที่ต้องการ ──────
function revealArrangements(
  arrangements: Record<string, PlayerArrangement>,
  pileNum: 1 | 2 | 3
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [pid, arr] of Object.entries(arrangements)) {
    const pile = pileNum === 1 ? arr.pile1 : pileNum === 2 ? arr.pile2 : arr.pile3
    result[pid] = pile.map(c => {
      const s = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }[c.suit]
      return c.rank.toLowerCase() + s
    })
  }
  return result
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// รอ player กด CONTINUE
const continueResolvers = new Map<string, () => void>()

export function resolveContinue(roomId: string): void {
  const resolve = continueResolvers.get(roomId)
  if (resolve) { resolve(); continueResolvers.delete(roomId) }
}

function waitForContinue(roomId: string): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      continueResolvers.delete(roomId)
      resolve()
    }, 10000)
    continueResolvers.set(roomId, () => {
      clearTimeout(timer)
      resolve()
    })
  })
}


// ============================================================
// MULTIPLAYER (Adept — Simultaneous Showdown, 1-3 Human + AI fill)
// ระบบแยกจาก single-player เดิมทั้งหมด (ไม่แตะ startMatch/submitArrangement เดิม)
// ============================================================

// Seat snapshot ตอนเริ่มแมตช์ (ไม่เปลี่ยนระหว่างเกม แม้คนหลุด/AI เล่นแทน — ที่นั่งยังโชว์เป็นคนเดิม
// เพราะ AI แค่ "เล่นแทน" ไม่ใช่ "เปลี่ยนตัวละคร") ใช้ทั้งแก้ Bug B (P4 ไม่โชว์หลังไพ่) และ Bug C
// (avatar/ชื่อผู้เล่นคนอื่นไม่โชว์) — client render จาก field นี้แทนการเดา index จาก aiNames
interface MultiSeatInfo {
  seat: number
  userId: string        // userId จริงถ้า Human, aiConfigId ถ้า AI
  displayName: string
  avatarUrl?: string     // เฉพาะ Human ที่ส่งมา — AI ไม่มี
  isHuman: boolean
  emoji?: string         // เฉพาะ AI (จาก AI_CONFIGS) — client ใช้ avatarUrl ก่อนถ้ามี ไม่งั้น fallback emoji
}

// A5: Grace Period 60s — เก็บว่า userId ไหนกำลัง "หลุดชั่วคราว" อยู่ (ยังไม่ถูกไล่ออกจาก humanPlayerIds
// จริง รอ reconnect ได้) graceTimer ยิง finalizeAFKReplacement เมื่อครบ 60s ไม่มี reconnect
interface AFKInfo {
  disconnectedAt: number
  graceTimer: NodeJS.Timeout
}

interface MultiMatchState {
  roomId: string
  tier: 'adept'
  humanPlayerIds: string[]
  aiPlayerIds: string[]
  roundNumber: number
  totalRounds: number
  tokenBalance: Record<string, number>
  buyInAmount: number             // Escrow Buy-in Spec §2 — เท่ากันทุกคนในแมตช์เดียวกัน (tier เดียวกัน)
  escrowIds: Record<string, string>  // เฉพาะ human seat — ใช้ settle ตอนจบแมตช์/หลุดกลางเกม
  results: RoundResult[]
  phase: 'waiting' | 'arrangement' | 'showdown' | 'match_end'
  submittedArrangements: Record<string, PlayerArrangement>
  community?: CommunityCards
  cardsMap?: Record<string, Card[]>
  seatOrder: MultiSeatInfo[]      // snapshot ตอน startMultiplayerMatch — คงที่ตลอดแมตช์
  afkPlayers: Record<string, AFKInfo>
}

const multiMatchStates = new Map<string, MultiMatchState>()

// Audit 2026-07-17 (Bug A): ต้องเช็คจุดนี้ก่อนทุกจุดที่ game loop รอ action จาก userId คนหนึ่ง —
// ถ้า AFK อยู่ ห้ามรอ ต้องให้ AI ตอบแทนทันที ไม่งั้นโต๊ะจะค้างระหว่าง grace period (60s)
function isPlayerAFK(state: MultiMatchState, userId: string): boolean {
  return !!state.afkPlayers[userId]
}

// ให้ AI ตัดสินใจ arrangement แทน userId ที่กำลัง AFK อยู่ (ที่นั่งยังโชว์เป็นคนเดิม — แค่ตัดสินใจแทน)
// ใช้ทั้งตอน markPlayerAFK (หลุดกลาง arrangement phase) และตอน startMultiRound (รอบใหม่เริ่มขณะยังไม่กลับมา)
function autoSubmitArrangementForAFKPlayer(state: MultiMatchState, userId: string): void {
  if (!state.community || !state.cardsMap || state.submittedArrangements[userId]) return
  const decisionConfig = AI_CONFIGS[state.humanPlayerIds.indexOf(userId) % AI_CONFIGS.length] ?? AI_CONFIGS[0]
  state.submittedArrangements[userId] = aiDecideArrangement(
    decisionConfig, state.cardsMap[userId], state.community, state.roundNumber, state.tier, 0,
  )
}

// A2: escrow ต้องผ่านครบก่อนถึงจะให้ผู้เรียก (gameSocket.ts) broadcast room_ready — ฟังก์ชันนี้เอง
// "ไม่" emit อะไรตอน escrow ล้มเหลวอีกแล้ว (เดิม emit match_error ตรงนี้ แต่ผู้เล่นอาจ navigate ไป
// หน้าเกมไปแล้วตั้งแต่ room_ready ยิงก่อนหน้า ไม่ทันเห็น) — คืนผลลัพธ์ให้ผู้เรียกตัดสินใจแทน
export type StartMultiplayerMatchResult = { ok: true } | { ok: false; reason?: string }

// เรียกจาก gameSocket.ts ตอน room เต็ม (room_ready) — เรียก "ก่อน" broadcast room_ready เสมอ (A2)
export async function startMultiplayerMatch(
  io: Server,
  roomId: string,
  seats: Array<{ type: 'human' | 'ai' | 'empty'; userId?: string; name: string; aiConfigId?: string; avatarUrl?: string }>,
  tier: 'adept',
): Promise<StartMultiplayerMatchResult> {
  const humanSeats = seats.filter(s => s.type === 'human' && s.userId)
  const aiSeatsFromRoom = seats.filter(s => s.type === 'ai')

  const humanPlayerIds = humanSeats.map(s => s.userId!)
  // LobbyMatchmaking_Spec_v1_0 §4.2-4.3: ใช้ aiConfigId จริงที่ roomRegistry เลือกไว้ (Sage เข้ารอทันที
  // + สุ่ม Ghost/Reckless ตอน Human คนที่ 2) แทน index 0,1 แบบเดิมซึ่งได้ Sage+Reckless คงที่ทุกเกม ไม่เคยสุ่มได้ Ghost
  const aiPlayerIds = aiSeatsFromRoom.map((s, i) => s.aiConfigId ?? AI_CONFIGS[i % AI_CONFIGS.length].id)

  const totalRounds = 5
  const buyInAmount = gameConfig.buyIn[tier]
  const tokenBalance: Record<string, number> = {}
  const escrowIds: Record<string, string> = {}

  // Escrow Buy-in ทีละคน (sequential — ไม่ Promise.all) เพื่อ rollback ได้ถูกต้องถ้าคนใดคนหนึ่ง token ไม่พอ
  for (const uid of humanPlayerIds) {
    const escrow = await escrowBuyIn(uid, roomId, tier)
    if (!escrow.ok) {
      // rollback คนที่หักไปแล้วก่อนหน้าในกลุ่มเดียวกัน — ไม่ emit เอง ให้ gameSocket.ts จัดการแจ้ง client
      // (ตอนนี้ room ยังไม่ถูกประกาศ room_ready เลย ไม่มีใคร navigate ไปไหนที่จะพลาด error)
      await Promise.all(Object.entries(escrowIds).map(([doneUid, escrowId]) => refundEscrow(doneUid, escrowId, buyInAmount)))
      return { ok: false, reason: escrow.reason }
    }
    escrowIds[uid] = escrow.escrowId
    tokenBalance[uid] = escrow.buyInAmount
  }
  aiPlayerIds.forEach(id => tokenBalance[id] = buyInAmount)

  // Bug B/C: seatOrder เก็บ snapshot ที่นั่งทั้ง 4 ตามลำดับจริงในห้อง — คงที่ตลอดแมตช์ ไม่เปลี่ยนตาม AFK/AI takeover
  const seatOrder: MultiSeatInfo[] = seats.map((s, i) => {
    if (s.type === 'human' && s.userId) {
      return { seat: i, userId: s.userId, displayName: s.name, avatarUrl: s.avatarUrl, isHuman: true }
    }
    const aiConfig = AI_CONFIGS.find(a => a.id === s.aiConfigId) ?? AI_CONFIGS[0]
    return { seat: i, userId: aiConfig.id, displayName: aiConfig.name, isHuman: false, emoji: aiConfig.emoji }
  })

  const state: MultiMatchState = {
    roomId, tier, humanPlayerIds, aiPlayerIds,
    roundNumber: 1, totalRounds,
    tokenBalance, buyInAmount, escrowIds,
    results: [],
    phase: 'waiting',
    submittedArrangements: {},
    seatOrder,
    afkPlayers: {},
  }
  multiMatchStates.set(roomId, state)

  await startMultiRound(io, roomId)
  return { ok: true }
}

async function startMultiRound(io: Server, roomId: string): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state) return

  state.phase = 'arrangement'
  state.submittedArrangements = {}

  const dealt = dealCards()
  const playerIds = [...state.humanPlayerIds, ...state.aiPlayerIds]
  const cardsMap: Record<string, Card[]> = {}
  playerIds.forEach((id, i) => cardsMap[id] = dealt.players[i])

  const community: CommunityCards = {
    row1: dealt.community.row1,
    row2: dealt.community.row2,
    row3: dealt.community.row3,
  }
  state.community = community
  state.cardsMap = cardsMap

  const aiArrangements: Record<string, PlayerArrangement> = {}
  state.aiPlayerIds.forEach((aiId) => {
    const aiConfig = AI_CONFIGS.find(a => a.id === aiId) ?? AI_CONFIGS[0]
    aiArrangements[aiId] = aiDecideArrangement(aiConfig, cardsMap[aiId], community, state.roundNumber, state.tier, 0)
  })
  state.submittedArrangements = { ...aiArrangements }

  // A5 patch: \u0e04\u0e19\u0e17\u0e35\u0e48\u0e22\u0e31\u0e07 AFK \u0e2d\u0e22\u0e39\u0e48\u0e02\u0e49\u0e32\u0e21\u0e23\u0e2d\u0e1a (grace period \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e2b\u0e21\u0e14\u0e15\u0e2d\u0e19\u0e23\u0e2d\u0e1a\u0e43\u0e2b\u0e21\u0e48\u0e40\u0e23\u0e34\u0e48\u0e21) \u0e15\u0e49\u0e2d\u0e07\u0e43\u0e2b\u0e49 AI \u0e15\u0e31\u0e14\u0e2a\u0e34\u0e19\u0e43\u0e08
  // \u0e17\u0e31\u0e19\u0e17\u0e35 \u0e44\u0e21\u0e48\u0e07\u0e31\u0e49\u0e19\u0e23\u0e2d\u0e1a\u0e43\u0e2b\u0e21\u0e48\u0e08\u0e30\u0e23\u0e2d submit \u0e02\u0e2d\u0e07\u0e04\u0e19\u0e17\u0e35\u0e48\u0e44\u0e21\u0e48\u0e21\u0e35\u0e17\u0e32\u0e07\u0e2a\u0e48\u0e07\u0e2d\u0e30\u0e44\u0e23\u0e21\u0e32\u0e2d\u0e35\u0e01\u0e41\u0e25\u0e49\u0e27\u0e08\u0e19\u0e01\u0e27\u0e48\u0e32 grace timer \u0e08\u0e30\u0e2b\u0e21\u0e14 (\u0e42\u0e15\u0e4a\u0e30\u0e04\u0e49\u0e32\u0e07)
  state.humanPlayerIds.forEach(uid => {
    if (isPlayerAFK(state, uid)) autoSubmitArrangementForAFKPlayer(state, uid)
  })

  const timer = (gameConfig.arrangementTimer as Record<string, number>)[state.tier] ?? gameConfig.arrangementTimer.adept

  state.humanPlayerIds.forEach(uid => {
    io.to(uid).emit('round_start', {
      roomId,
      roundNumber: state.roundNumber,
      totalRounds: state.totalRounds,
      cards: { [uid]: cardsMap[uid].map(cardKey) },
      communityCards: {
        pile1: community.row1.map(cardKey),
        pile2: community.row2.map(cardKey),
        pile3: community.row3.map(cardKey),
      },
      seats: state.seatOrder,
      tokenBalance: state.tokenBalance,
      timer,
      ...(state.roundNumber === 1 ? { buyInAmount: state.buyInAmount } : {}),
    })
  })

  // Edge case: ถ้า Human ทุกคนในห้องดัน AFK พร้อมกันพอดีตอนรอบใหม่เริ่ม (เช่น 2 คนหลุดพร้อมกัน)
  // AI ตอบแทนครบทุกคนไปแล้วข้างบน — ต้อง resolve เองเลย ไม่งั้นไม่มีใครส่ง player_ready_multi มาอีก
  const allAlreadySubmitted = state.humanPlayerIds.every(uid => state.submittedArrangements[uid])
  if (allAlreadySubmitted) await resolveMultiShowdown(io, roomId)
}

export async function submitMultiArrangement(
  io: Server,
  roomId: string,
  userId: string,
  arrangement: PlayerArrangement,
): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state || state.phase !== 'arrangement') return
  if (!state.humanPlayerIds.includes(userId)) return

  state.submittedArrangements[userId] = arrangement
  io.to(roomId).emit('player_ready_ack', { playerId: userId })

  const allSubmitted = state.humanPlayerIds.every(uid => state.submittedArrangements[uid])
  if (!allSubmitted) return

  await resolveMultiShowdown(io, roomId)
}

async function resolveMultiShowdown(io: Server, roomId: string): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state || !state.community) return
  state.phase = 'showdown'

  const community = state.community
  const playerIds = [...state.humanPlayerIds, ...state.aiPlayerIds]
  const allArrangements = state.submittedArrangements

  const fouled: Record<string, boolean> = {}
  const foulReasons: Record<string, string> = {}
  playerIds.forEach(pid => {
    const f = checkFoul(allArrangements[pid], community)
    fouled[pid] = f.isFoul
    if (f.isFoul && f.reason) foulReasons[pid] = f.reason
  })

  io.to(roomId).emit('showdown_countdown', { roomId, seconds: 3 })
  await delay(3500)

  const p1Winner = resolvePile(1, allArrangements, community, fouled)
  const p2Winner = resolvePile(2, allArrangements, community, fouled)
  const p3Winner = resolvePile(3, allArrangements, community, fouled)
  const hand1W = p1Winner ? evaluateHand([...allArrangements[p1Winner].pile1, ...community.row1]) : null
  const hand2W = p2Winner ? evaluateHand([...allArrangements[p2Winner].pile2, ...community.row2]) : null
  const hand3W = p3Winner ? evaluateHand([...allArrangements[p3Winner].pile3.slice(0,3), ...community.row3]) : null

  io.to(roomId).emit('showdown_result', {
    roomId,
    foulReasons,
    pileResults: [
      { pileNumber: 1, arrangements: revealArrangements(allArrangements, 1), winner: p1Winner, winnerHandRank: hand1W ? handRankLabel(hand1W) : '', fouled },
      { pileNumber: 2, arrangements: revealArrangements(allArrangements, 2), winner: p2Winner, winnerHandRank: hand2W ? handRankLabel(hand2W) : '', fouled },
      { pileNumber: 3, arrangements: revealArrangements(allArrangements, 3), winner: p3Winner, winnerHandRank: hand3W ? handRankLabel(hand3W) : '', fouled },
    ],
  })

  const deltas = calcDeltas(p1Winner, p2Winner, p3Winner, playerIds, state.tier)
  playerIds.forEach(id => {
    state.tokenBalance[id] = (state.tokenBalance[id] ?? state.buyInAmount) + (deltas[id] ?? 0)
  })

  const result: RoundResult = {
    roundNumber: state.roundNumber,
    pile1Winner: p1Winner, pile2Winner: p2Winner, pile3Winner: p3Winner,
    tokenDeltas: deltas, arrangements: allArrangements, community, hasFoul: fouled,
  }
  state.results.push(result)

  io.to(roomId).emit('round_result', {
    roomId, roundNumber: state.roundNumber,
    pile1Winner: p1Winner, pile2Winner: p2Winner, pile3Winner: p3Winner,
    tokenDeltas: deltas, tokenBalance: state.tokenBalance, hasFoul: fouled,
  })

  await waitForContinue(roomId)

  if (state.roundNumber >= state.totalRounds) {
    state.phase = 'match_end'
    const finalWinner = playerIds.reduce((a, b) => (state.tokenBalance[a] ?? 0) > (state.tokenBalance[b] ?? 0) ? a : b)

    // ── Settle Escrow ครั้งเดียวต่อคน (Buy-in Spec §4 — จบแมตช์ปกติ) ──
    const newTokenBalances: Record<string, number | null> = {}
    await Promise.all(state.humanPlayerIds.map(async uid => {
      newTokenBalances[uid] = await settleEscrow(uid, state.escrowIds[uid], state.tokenBalance[uid] ?? state.buyInAmount)
    }))
    // End-of-Match Stats Recording — แทนที่ recordGameResults() เดิม — Adept ใช้ Simultaneous Showdown
    // เหมือน Initiate, derive best_hands/triple sweep จาก state.results ได้ตรงๆ ต่อ human ทุกคน
    await recordMatchStats(state.humanPlayerIds.map(uid => {
      const { bestHand, tripleSweep } = deriveBestHandFromResults(state.results, uid)
      return {
        userId: uid,
        tier: 'adept' as StatsTier,
        won: finalWinner === uid,
        isTripleSweep: tripleSweep,
        bestHandThisMatch: bestHand,
      }
    }))

    io.to(roomId).emit('match_end', {
      roomId, finalWinner, tokenBalance: state.tokenBalance,
      results: state.results, totalRounds: state.totalRounds,
      buyInAmount: state.buyInAmount,
      newTokenBalances,
    })
    // เคลียร์ grace timer ที่อาจค้างอยู่ (คนหลุดรอบสุดท้ายแต่ยังไม่ครบ 60s ตอนแมตช์จบพอดี) กัน
    // finalizeAFKReplacement ยิงซ้ำใส่ state ที่ลบไปแล้ว (แม้จะปลอดภัยอยู่แล้วเพราะเช็ค !state ก็ตาม)
    Object.values(state.afkPlayers).forEach(afk => clearTimeout(afk.graceTimer))
    multiMatchStates.delete(roomId)
  } else {
    state.roundNumber++
    await delay(2000)
    await startMultiRound(io, roomId)
  }
}

// A5 (Grace Period 60s): Disconnect — "ไม่" settle/ไล่ออกจาก humanPlayerIds ทันทีอีกต่อไป (นั่นคือบั๊ก
// A1 เดิม — settleEscrow blocking อยู่หน้า logic ที่ unblock รอบ) แค่ mark AFK + ให้ AI ตอบแทน action
// ปัจจุบันทันที (ถ้ามี) แล้วตั้งเวลา 60s รอ reconnect ก่อนค่อย finalize จริงจัง
export async function markPlayerAFK(io: Server, roomId: string, userId: string): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state) return
  if (!state.humanPlayerIds.includes(userId)) return
  if (isPlayerAFK(state, userId)) return // กันซ้ำ (เช่น disconnect event ยิงซ้ำ)

  const seatInfo = state.seatOrder.find(s => s.userId === userId)
  state.afkPlayers[userId] = {
    disconnectedAt: Date.now(),
    graceTimer: setTimeout(() => { finalizeAFKReplacement(io, roomId, userId).catch(err => {
      console.error('[AFK] finalizeAFKReplacement failed for', userId, 'in', roomId, err)
    }) }, 60_000),
  }

  io.to(roomId).emit('player_disconnected_replaced', {
    roomId, disconnectedUserId: userId, displayName: seatInfo?.displayName ?? userId, graceSeconds: 60,
  })

  // ตัวจุดเดียวที่ Adept multiplayer รอ action จาก Human จริง — ต้องให้ AI ตอบแทนทันที ไม่รอ
  // arrangementTimer เต็ม (75s) ไม่งั้นโต๊ะค้างระหว่าง grace period ทั้งที่ตั้งใจให้ AI เล่นแทนได้เลย
  if (state.phase === 'arrangement') {
    autoSubmitArrangementForAFKPlayer(state, userId)
    const allSubmitted = state.humanPlayerIds.every(uid => state.submittedArrangements[uid])
    if (allSubmitted) await resolveMultiShowdown(io, roomId)
  }
}

// Grace period หมด 60s ไม่มี reconnect — เอาออกจาก humanPlayerIds จริง, เติม AI ถาวรแทน, settle
// escrow ตอนนี้เท่านั้น (ย้ายออกจาก markPlayerAFK แล้ว — A1: ห้าม DB latency บล็อกคนที่เหลือ)
async function finalizeAFKReplacement(io: Server, roomId: string, userId: string): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state) return
  if (!isPlayerAFK(state, userId)) return // reconnect ไปแล้วก่อนหน้านี้ — ไม่ต้องทำอะไร

  delete state.afkPlayers[userId]

  const escrowId = state.escrowIds[userId]
  if (escrowId) {
    await settleEscrow(userId, escrowId, state.tokenBalance[userId] ?? state.buyInAmount)
  }

  state.humanPlayerIds = state.humanPlayerIds.filter(id => id !== userId)
  const replacementAI = AI_CONFIGS[state.aiPlayerIds.length % AI_CONFIGS.length]
  state.aiPlayerIds.push(replacementAI.id)
  state.tokenBalance[replacementAI.id] = state.tokenBalance[userId] ?? state.buyInAmount

  // รอบปัจจุบัน (ถ้ามี arrangement ค้างอยู่) — AI ตัดสินใจแทนไปแล้วตอน markPlayerAFK ใต้ userId เดิม
  // ย้าย submission นั้นไปอยู่ใต้ replacementAI.id แทน ให้สอดคล้องกับ humanPlayerIds ที่เปลี่ยนไปแล้ว
  if (state.submittedArrangements[userId]) {
    state.submittedArrangements[replacementAI.id] = state.submittedArrangements[userId]
    delete state.submittedArrangements[userId]
  }
}

export function getMultiMatchState(roomId: string): MultiMatchState | undefined {
  return multiMatchStates.get(roomId)
}

// เรียกตอน player_leave (ออกกลางเกม) — A3/A4: settle escrow ให้ Human "ทุกคน" ในห้อง ไม่ใช่แค่คนที่ leave
// (เดิมพลาดจุดนี้ ทำให้คนที่เหลือมี match_escrow ค้าง status='in_match' ไปกวนโต๊ะใหม่ทีหลัง) + ลบ
// multiMatchStates กันหน่วยความจำรั่ว (เดิมไม่เคยลบตอน leave กลางเกมเลย มีแต่ตอนจบแมตช์ปกติ)
export async function settleAndEndMultiMatch(roomId: string, leavingPlayerId: string): Promise<number | null> {
  const state = multiMatchStates.get(roomId)
  if (!state) return null

  let leavingBalance: number | null = null
  await Promise.all(Object.entries(state.escrowIds).map(async ([uid, escrowId]) => {
    const bal = await settleEscrow(uid, escrowId, state.tokenBalance[uid] ?? state.buyInAmount)
    if (uid === leavingPlayerId) leavingBalance = bal
  }))

  Object.values(state.afkPlayers).forEach(afk => clearTimeout(afk.graceTimer))
  multiMatchStates.delete(roomId)
  return leavingBalance
}



// Client เข้ามา game screen แล้ว join user room + ขอไพ่ปัจจุบัน
// (แก้ race condition: server อาจ emit round_start ตั้งแต่ก่อน client พร้อม)
export async function resendRoundStartToPlayer(io: Server, roomId: string, userId: string): Promise<void> {
  const state = multiMatchStates.get(roomId)
  if (!state) return
  if (!state.humanPlayerIds.includes(userId)) return

  // A5: ยกเลิก grace timer ทันทีถ้า userId นี้กำลัง AFK อยู่ (คือ reconnect จริง) — คืนที่นั่งให้ควบคุมเอง
  // ต่อ ทำก่อนเช็ค phase เสมอ (เดิม resend ทำงานแค่ phase 'arrangement' เท่านั้น ทำให้ reconnect ตอน
  // phase อื่นไม่ได้ยกเลิก grace เลย ค้างจนกว่า 60s หมดทั้งที่ผู้เล่นกลับมาแล้วจริงๆ)
  const afk = state.afkPlayers[userId]
  if (afk) {
    clearTimeout(afk.graceTimer)
    delete state.afkPlayers[userId]
  }

  // ข้อมูลที่มีให้ resend จริงมีแค่ตอน phase 'arrangement' เท่านั้น (phase อื่นสั้นมาก/ไม่มี state ค้าง
  // ให้ต้องส่งคืน — ผู้เล่นจะได้ round_start/match_end ตามปกติจาก broadcast รอบถัดไปเอง)
  if (state.phase !== 'arrangement' || !state.community || !state.cardsMap) return

  const community = state.community
  const cardsMap = state.cardsMap
  const timer = (gameConfig.arrangementTimer as Record<string, number>)[state.tier] ?? gameConfig.arrangementTimer.adept

  io.to(userId).emit('round_start', {
    roomId,
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    cards: { [userId]: cardsMap[userId].map(cardKey) },
    communityCards: {
      pile1: community.row1.map(cardKey),
      pile2: community.row2.map(cardKey),
      pile3: community.row3.map(cardKey),
    },
    seats: state.seatOrder,
    tokenBalance: state.tokenBalance,
    timer,
    ...(state.roundNumber === 1 ? { buyInAmount: state.buyInAmount } : {}),
  })
  console.log('[GAME_JOIN] Resent round_start to', userId, 'in room', roomId)
}

// ── Export getState ──────────────────────────────────────────
export function getMatchState(roomId: string): MatchState | undefined {
  return matchStates.get(roomId)
}

// Disconnect/กด Lobby กลางเกม — single-player (Initiate/Mastermind, ไม่มี tier อื่นให้ AI-replace เพราะ
// เป็น 1 Human + AI อยู่แล้ว) — Buy-in Spec §4: settle ทันทีด้วย stack ปัจจุบัน แล้วปิดแมตช์
export async function settleAndEndSoloMatch(roomId: string): Promise<void> {
  const state = matchStates.get(roomId)
  if (!state) return
  if (state.escrowId) {
    await settleEscrow(state.humanPlayerId, state.escrowId, state.tokenBalance[state.humanPlayerId] ?? state.buyInAmount)
  }
  matchStates.delete(roomId)
}
