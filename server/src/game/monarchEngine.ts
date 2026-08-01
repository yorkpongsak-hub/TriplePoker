// ============================================================
// monarchEngine.ts — Boss Monarch 1v1 Table (1 Human + 2 Minion + Monarch)
// แยกไฟล์ใหม่ทั้งหมด ไม่แตะ gameLoop.ts / mastermind / highNoble เดิม
// ตามสถาปัตยกรรม "Tier ใหม่ = copy จาก Tier ที่เสร็จแล้วมาแก้เฉพาะจุด"
//
// Canon (Monarch_Spec): กติกา 2-2-0 — ทุกกอง (G1/G2/G3) เป็นมือโป๊กเกอร์ 5 ใบเต็ม ประเมินด้วย
// evaluateHand() ตัวเดียวกันทั้ง 3 กอง ไม่ผสม community ซ้ำแบบ Tier ปกติ (G1=player3+commA2,
// G2=player3+commB2, G3=player5+0) — ต่างจาก resolvePile/checkFoul เดิมที่ทุก pile ใช้ player3+community2
// เสมอ (รวม pile3) เพราะงั้นห้าม reuse ฟังก์ชันเดิมตรงๆ ต้องมี monarchResolvePile/monarchCheckFoul ของตัวเอง
//
// Entry roll (Sprint 2 → Batch 1 Task 2/3, Monarch v2.2): ทุกครั้งที่ human คนแรก join โต๊ะ A+
// (High Noble) — เส้นทางเดียวเท่านั้นที่จะสุ่มเจอ Monarch ได้ (rollHighNobleBoss() ใน monarchSpawn.ts
// ถูกถอด Monarch ออกไปแล้วที่ Batch 1 Task 2 เหลือแค่ Four Gods ไม่มีทางคืน Monarch อีกต่อไป — ปัญหา
// เดิมที่ Monarch สุ่มได้ 2 ทางคู่ขนานกันถูกแก้แล้ว) pity ผูกกับ user_id ของคนที่ trigger การ roll เอง
// (ไม่ใช่ max ของโต๊ะแบบเดิม — reuse คอลัมน์ users.monarch_pity_counter เดิมจาก migration 006)
//
// Round flow (Sprint 3): deal → auto-arrange Minion/Boss ทันที (foul-only, dumb ตาม Monarch Minion
// spec) → human กด "Auto Arrange & Submit" (MVP มติลุงเยาะ Sprint 3 — ยังไม่มี UI จัดไพ่เองจริง
// ใช้ logic เดียวกับ Minion ไปก่อน) → ครบ 4 ที่นั่ง → resolveG1 (G2/G3 ยัง stub รอ sprint ถัดไป)
// Pull model ตาม known bug #2 (CLAUDE.md): client ต่อ socket ใหม่หลัง navigate แล้วต้องขอ state เอง
// ผ่าน monarch_join ห้าม push ตรงจาก room_auto_match เพราะ client ยังไม่ได้ mount/join ห้องทัน
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Server } from 'socket.io'
import { Card } from './deck'
import { dealCards } from './cardEngine'
import { evaluateHand, compareHands, HandResult } from './handEvaluator'
import { FoulCheckResult, PlayerArrangement } from './foulChecker'
import { AIPersonality, pickRandomMinions } from './aiEngine'
import { gameConfig, getMonarchSpawnRate, isRoyalHour } from '../config/gameConfig'
import { supabaseAdmin } from '../config/supabase'
import { escrowBuyIn, settleEscrow } from './gameLoop'
import { rollAndRecordMonarchRelic, MonarchRelicResult } from './monarchSpawn'
import { computeHNHumanPayout } from './highNobleMultiEngine'
import { recordMatchStats } from './matchStatsService'
import { recordBossResult } from './bossStatsService'

// ── Seat & Match State ──────────────────────────────────────
export interface MonarchSeat {
  id: string                    // human: userId จริง | AI: stable id 'MONARCH_MINION_1'/'MONARCH_MINION_2'/'MONARCH_BOSS'
  role: 'human' | 'minion1' | 'minion2' | 'boss'
  isHuman: boolean
  name: string
  emoji: string
  avatarUrl?: string
  personality?: AIPersonality   // เฉพาะ Minion — Boss ใช้ personality lock แยกต่างหาก (sprint ถัดไป, เทียบ monarchAI.ts เดิม)
  // Hotfix (token leak): เดิมพันจริงมีแค่ Human vs Monarch เท่านั้นตาม Spec v2.1 §5.1/§6 — Minion
  // ไม่มีเดิมพันจริง ต้อง gate ทุกจุดที่แตะ tokenBalance/pot ด้วย flag นี้ (root cause เดิม: seats
  // ทั้ง 4 ถูกตั้ง tokenBalance เท่ากันหมดตอน init ไม่มีอะไรแยกว่าที่นั่งไหน "มีเงินจริง" ในเกม)
  hasRealStake: boolean
}

export interface MonarchMatchState {
  roomId: string
  seats: [MonarchSeat, MonarchSeat, MonarchSeat, MonarchSeat]   // [human, minion1, minion2, boss]
  humanUserId: string
  buyInAmount: number
  escrowId: string
  tokenBalance: Record<string, number>
  // phase state machine — Sprint 5: 'grand_finale' ครอบคลุมเฉพาะ G3 (G1/G2 เป็นแค่ reveal ธรรมดา
  // ไม่มี betting) 'match_end' = จบแมตช์แล้ว (Monarch เป็นแมตช์รอบเดียว ไม่มี roundNumber/totalRounds
  // แบบ Tier อื่น — ยืนยันตั้งแต่ Sprint 2)
  phase: 'waiting' | 'arrangement' | 'g1_reveal' | 'g2_reveal' | 'grand_finale' | 'match_end'
  // scratch ต่อรอบ — 2-2-0: commA=community ของ G1, commB=community ของ G2, G3 ไม่มี community
  community?: { commA: Card[]; commB: Card[] }
  cardsMap?: Record<string, Card[]>
  arrangements?: Record<string, PlayerArrangement>
  foulMap?: Record<string, boolean>
  foulReasons?: Record<string, string>
  submittedArrangement: Set<string>
  g1Winner?: string
  g2Winner?: string
  g3Winner?: string
  // Grand Finale (Sprint 5) — Minion auto-fold ทันทีตอนเข้าเฟส (canon: Monarch Minion เล่นแค่ G1
  // ปกติ ที่เหลือ auto-fold) เหลือแค่ Human↔Boss ตัดสินใจจริง 2 รอบ (เปิด G3 แบบ 3+1 ใบ)
  // clockwise/counterclockwise เพราะมีแค่ 2 คนที่ตัดสินใจได้จริง)
  grandFinale?: {
    foldedPlayers: string[]
    pot: number
    turn: 'human' | 'boss' | 'done'
    round?: 1 | 2
    revealedCount?: 0 | 3 | 4
    humanRevealOrder?: string[]
  }
  matchEnded?: boolean
  // Arrangement deadline (60s, ไม่มี auto-arrange ช่วยแล้ว) arrangementDeadlineAt
  // เป็น epoch ms ส่งออกผ่าน buildMonarchRoundSnapshot ให้ Batch 2 เอาไปทำ UI countdown ต่อ
  arrangementDeadlineAt?: number
  arrangementTimer?: ReturnType<typeof setTimeout>
  // Batch 1.5 Task 6 — human หลุดการเชื่อมต่อหลัง seal แล้ว (reuse state.phase/grandFinale.turn ที่มี
  // อยู่แล้วเป็นตัวบอก "sealed หรือยัง"/"commit Call หรือยัง" ตามที่โจทย์เสนอเป็นทางเลือก ไม่เพิ่ม field
  // ซ้ำซ้อน) flag นี้มีไว้จุดเดียว: บอก startMonarchGrandFinale ว่าต้อง auto-fold ทันทีแทนตั้ง
  // turn:'human' รอ action ที่ไม่มีทางมาอีกแล้ว (ครอบคลุมเคส disconnect ตอน g1_reveal/g2_reveal ที่ยัง
  // ไม่ถึง Grand Finale ด้วย ไม่ใช่แค่เคส disconnect ตอนอยู่ใน grand_finale พอดี)
  humanDisconnected?: boolean
  // Batch 3E Task 1 — grace 20s เฉพาะ grand_finale ตอน turn==='human' เท่านั้น (ดู markMonarchGrace/
  // clearMonarchGrace) แยก field ใหม่จาก humanDisconnected เดิมโดยเจตนา เพราะ humanDisconnected
  // สื่อความหมาย "หลุดแล้ว ให้ resolve/fold ทันที" (commit-based §11) ส่วน 2 field นี้สื่อความหมายคนละ
  // อย่าง "หลุดแล้ว แต่ยังไม่ต้อง resolve — รอดูก่อนว่าจะกลับมาทันไหม" ถ้าเอามาปนกันจะทำให้
  // startMonarchGrandFinale (ที่เช็ค humanDisconnected อยู่แล้ว) งงว่า "หลุด" ที่เจอหมายถึง fold ทันที
  // หรือรอ grace กันแน่ — ห้ามลบ/แก้ humanDisconnected เดิมเด็ดขาด
  disconnectedAt?: number
  graceTimer?: ReturnType<typeof setTimeout>
}

const monarchMatchStates = new Map<string, MonarchMatchState>()

export function getMonarchMatchState(roomId: string): MonarchMatchState | undefined {
  return monarchMatchStates.get(roomId)
}

// ── Helper: แปลง Card เป็น key string (duplicate จาก gameLoop.ts ตั้งใจ — เหมือน
// highNobleMultiEngine.ts:37-40 ที่ duplicate helper เล็กๆ แทน import กันผูกกับการแก้ไขไฟล์เดิมในอนาคต) ──
function cardKey(c: Card): string {
  const s = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }[c.suit]
  return c.rank.toLowerCase() + s
}

// ── Helper: หน่วงเวลาระหว่างเปิดกอง (เทียบ delay() เดิมใน highNobleMultiEngine.ts:132-134 — duplicate
// ตั้งใจ ไม่ import เพื่อไม่ผูกกับไฟล์เดิม) ใช้ pacing ระหว่าง G1 → G2 reveal (4s เท่า Tier อื่น) ──
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Entry Roll (Sprint 2 Part A → Batch 1 Task 3: pity ต่อผู้เล่นจริง) ──────
// เดิม flat rate ไม่มี pity — ย้าย pity mechanism มาไว้ตรงนี้แทน (เดิมอยู่ที่ rollHighNobleBoss() ใน
// monarchSpawn.ts ซึ่งถูกถอด Monarch ออกไปแล้วที่ Batch 1 Task 2) reuse คอลัมน์ users.monarch_pity_counter
// เดิม (migration 006_monarch_spawn_reward.sql มีอยู่แล้ว ไม่ต้องรัน SQL เพิ่ม) — ไม่แตะ
// monarch_encounters ที่นี่ (นับตอน match settlement แทน ดู recordMonarchVictory ที่ Batch 1 Task 5)
// getMonarchSpawnRate() คูณ Royal Hour multiplier ให้แล้วถ้าเข้าเงื่อนไข (Batch 1 Task 4) — คูณเฉพาะ
// base ก่อนบวก pity step ไม่ใช่คูณทั้ง effectiveRate (ห้าม Royal Hour ข้าม pity)
export async function rollMonarchEntry(userId: string): Promise<boolean> {
  const cfg = gameConfig.monarchConfig
  let pity = 0
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('monarch_pity_counter')
      .eq('user_id', userId)
      .single()
    pity = data?.monarch_pity_counter ?? 0
  } catch (err) {
    // fallback pity=0 ถ้าอ่านไม่ได้ (เช่น migration ยังไม่รัน) — ไม่ throw กัน matchmaking ค้าง
    console.error('[MONARCH] Error reading pity counter for', userId, err)
  }

  const guaranteed = pity >= cfg.pityGuaranteeAt
  const effectiveRate = guaranteed ? 1 : Math.min(1, getMonarchSpawnRate() + pity * cfg.pityStepPerGame)
  const isMonarch = Math.random() < effectiveRate

  // Batch 1 Task 4 — log ไว้ tuning ทีหลัง (ไม่ส่งอะไรไปที่ client ทั้งสิ้น)
  if (isMonarch && isRoyalHour()) {
    console.log(`[MONARCH] Spawned during Royal Hour (userId=${userId}, pity=${pity}, effectiveRate=${effectiveRate.toFixed(4)})`)
  }

  try {
    await supabaseAdmin
      .from('users')
      .update({ monarch_pity_counter: isMonarch ? 0 : pity + 1 })
      .eq('user_id', userId)
  } catch (err) {
    console.error('[MONARCH] Error updating pity counter for', userId, err)
  }

  return isMonarch
}

// ── Matchmaking (Sprint 2 Part B) — 1 Human + 2 Minion + Boss คงที่ ไม่ต้องรอ human คนอื่น ──
// reuse fill pattern จาก gameLoop.ts:438-476 (Mastermind _minionOverrides) แต่เขียนใหม่ในบริบท Monarch
// เพราะโต๊ะนี้เป็น engine แยกต่างหากทั้งก้อน ไม่ผูกกับ AI_CONFIGS/matchStates ของ gameLoop.ts เลย
export async function startMonarchMatch(
  io: Server, roomId: string, humanUserId: string, humanName: string, humanAvatarUrl?: string,
): Promise<MonarchMatchState | null> {
  // Monarch เป็นบอสของ Tier A+ (High Noble) — ใช้ buy-in เดียวกับ High Noble (30,000) ผ่าน escrowBuyIn
  // เดิม ไม่เพิ่ม tier ใหม่เข้า gameLoop.ts's toEscrowTier whitelist (จะกลายเป็นแตะไฟล์เดิม)
  const escrow = await escrowBuyIn(humanUserId, roomId, 'highNoble')
  if (!escrow.ok) {
    io.to(roomId).emit('match_error', { roomId, message: escrow.reason })
    return null
  }
  const { escrowId, buyInAmount } = escrow

  const minionNames = pickRandomMinions(2)
  const minionPersonalities: AIPersonality[] = ['sage', 'reckless', 'ghost']
  const randomPersonality = () => minionPersonalities[Math.floor(Math.random() * minionPersonalities.length)]

  const seats: [MonarchSeat, MonarchSeat, MonarchSeat, MonarchSeat] = [
    { id: humanUserId, role: 'human', isHuman: true, name: humanName, emoji: '🧑', avatarUrl: humanAvatarUrl, hasRealStake: true },
    { id: 'MONARCH_MINION_1', role: 'minion1', isHuman: false, name: minionNames[0], emoji: '🤖', personality: randomPersonality(), hasRealStake: false },
    { id: 'MONARCH_MINION_2', role: 'minion2', isHuman: false, name: minionNames[1], emoji: '🤖', personality: randomPersonality(), hasRealStake: false },
    { id: 'MONARCH_BOSS', role: 'boss', isHuman: false, name: gameConfig.monarchIdentity.name, emoji: gameConfig.monarchIdentity.emoji, hasRealStake: true },
  ]

  const tokenBalance: Record<string, number> = {}
  seats.forEach(s => { tokenBalance[s.id] = buyInAmount })

  const state: MonarchMatchState = {
    roomId, seats, humanUserId, buyInAmount, escrowId, tokenBalance, phase: 'waiting',
    submittedArrangement: new Set(),
  }
  monarchMatchStates.set(roomId, state)
  return state
}

// ── 2-2-0 Card Distribution (Sprint 1 Part A) ───────────────
// ใช้ dealCards() เดิมจาก cardEngine.ts ตรงๆ (pure shuffle+split ไม่ผูก tier ใดๆ อยู่แล้ว) — Monarch
// ใช้แค่ row1/row2 เป็น community ของ G1/G2 (commA/commB) ส่วน row3 + blindAuction ไม่ใช้ (เผื่อไว้เฉยๆ
// กันไพ่ไม่ครบ 52 ใบตอน validateDeal()) — G3 ไม่มี community เลยตาม canon 2-2-0
export function monarchDealCards(): { players: Card[][]; commA: Card[]; commB: Card[] } {
  const dealt = dealCards()
  return { players: dealt.players, commA: dealt.community.row1, commB: dealt.community.row2 }
}

// ── Evaluator Wiring (Sprint 1 Part B) ──────────────────────
// ประเมินมือ 5 ใบดิบล้วน (ไม่ผสม community ซ้ำ) — ใช้ตัวเดียวกันทั้ง G1/G2/G3 ตาม canon 2-2-0
// evaluateHand() เดิมไม่ validate ความยาว (handEvaluator.ts:36) จึงเช็คเองตรงนี้กันพลาดซ้ำ known bug #6
export function monarchResolvePile(hand5: Card[]): HandResult {
  if (hand5.length !== 5) {
    throw new Error(`monarchResolvePile: expected exactly 5 cards, got ${hand5.length}`)
  }
  return evaluateHand(hand5)
}

// ── Foul Check เวอร์ชัน Monarch (Sprint 1 Part C) ───────────
// เช็ค G1 <= G2 <= G3 จากมือ 5 ใบสำเร็จรูปทั้ง 3 กองตรงๆ ไม่ slice ไม่ผสม community (ต่างจาก
// foulChecker.checkFoul เดิมที่ใช้ pile3.slice(0,3)+community) — ไม่แตะไฟล์นั้นเลย
export function monarchCheckFoul(g1_5: Card[], g2_5: Card[], g3_5: Card[]): FoulCheckResult {
  const hand1 = monarchResolvePile(g1_5)
  const hand2 = monarchResolvePile(g2_5)
  const hand3 = monarchResolvePile(g3_5)

  if (compareHands(hand1, hand2) > 0) {
    return { isFoul: true, reason: 'G1 cannot be stronger than G2', foulPile: 1 }
  }
  if (compareHands(hand2, hand3) > 0) {
    return { isFoul: true, reason: 'G2 cannot be stronger than G3', foulPile: 2 }
  }
  return { isFoul: false }
}

// ── Helper: ประกอบ arrangement (pile1=G1 3 ใบ, pile2=G2 3 ใบ, pile3=G3 5 ใบ) ให้เป็นมือ 5 ใบ
// สำเร็จรูปทั้ง 3 กอง — ใช้ร่วมกันทั้ง arrangement (foul check ก่อน submit) และ resolveG1/G2/G3 ───
export function assembleMonarchHands(
  arr: PlayerArrangement, commA: Card[], commB: Card[],
): { g1: Card[]; g2: Card[]; g3: Card[] } {
  return { g1: [...arr.pile1, ...commA], g2: [...arr.pile2, ...commB], g3: arr.pile3 }
}

// ── Arrangement (Sprint 3) — Minion/Boss auto ทันทีตอน deal, Human กด "Auto Arrange & Submit"
// (MVP มติลุงเยาะ Sprint 3 — logic เดียวกับ Minion ไปก่อน ยังไม่มี UI จัดไพ่เองจริง) ─────────────
// สุ่มจัดไพ่จนผ่าน monarchCheckFoul → ใช้เลย (ไม่ optimize) — เทียบ firstValidArrangement เดิมใน
// aiEngine.ts:79-93 แต่ reuse ตรงๆ ไม่ได้เพราะตัวนั้นผูกกับ checkFoul()/CommunityCards เดิม (3-card mix)
export function monarchFirstValidArrangement(cards11: Card[], commA: Card[], commB: Card[]): PlayerArrangement {
  const maxAttempts = 100
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = [...cards11].sort(() => Math.random() - 0.5)
    const arr: PlayerArrangement = {
      pile1: shuffled.slice(0, 3),
      pile2: shuffled.slice(3, 6),
      pile3: shuffled.slice(6),
    }
    const { g1, g2, g3 } = assembleMonarchHands(arr, commA, commB)
    if (!monarchCheckFoul(g1, g2, g3).isFoul) return arr
  }
  // fallback ถ้าสุ่ม 100 ครั้งไม่ผ่าน → brute force หา arrangement ที่ไม่ foul แน่นอน (เทียบ
  // bestArrangement เดิมใน aiEngine.ts:183-226 — G3 ของ Monarch เป็น 5 ใบสุดท้ายตรงๆ ไม่ต้องหา
  // best 3 จาก N แบบเดิม เพราะ pile3 คงที่ 5 ใบเป๊ะ ไม่มีเคส "ก่อน Discard" แบบ Tier อื่น)
  return monarchBestArrangement(cards11, commA, commB)
}

function monarchBestArrangement(
  cards11: Card[], commA: Card[], commB: Card[],
  weights: { w1: number; w2: number; w3: number } = { w1: 1, w2: 2, w3: 4 },
): PlayerArrangement {
  let bestScore = -Infinity
  let bestArr: PlayerArrangement = { pile1: cards11.slice(0, 3), pile2: cards11.slice(3, 6), pile3: cards11.slice(6) }
  const n = cards11.length
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const p1 = [cards11[i], cards11[j], cards11[k]]
        const rest = cards11.filter((_, idx) => idx !== i && idx !== j && idx !== k)
        for (let a = 0; a < rest.length - 2; a++) {
          for (let b = a + 1; b < rest.length - 1; b++) {
            for (let c = b + 1; c < rest.length; c++) {
              const p2 = [rest[a], rest[b], rest[c]]
              const p3 = rest.filter((_, idx) => idx !== a && idx !== b && idx !== c)
              const h1 = monarchResolvePile([...p1, ...commA])
              const h2 = monarchResolvePile([...p2, ...commB])
              const h3 = monarchResolvePile(p3)
              if (compareHands(h1, h2) > 0 || compareHands(h2, h3) > 0) continue
              const total = h1.score * weights.w1 + h2.score * weights.w2 + h3.score * weights.w3
              if (total > bestScore) { bestScore = total; bestArr = { pile1: p1, pile2: p2, pile3: p3 } }
            }
          }
        }
      }
    }
  }
  return bestArr
}

// ── Boss Personality Lock (Sprint 7) — เทียบ monarchAI.ts เดิม (evaluateMonarchHandStrength +
// lockMonarchPersonality) แต่ต้องเขียนแยกเพราะของเดิมผูกกับ CommunityCards แบบ pile3=3ใบ+community
// เดิม ไม่ตรงกับ 2-2-0 (G3 = 5 ใบดิบ ไม่มี community) — reuse gameConfig.monarchConfig.
// handStrengthQuartile ตัวเดียวกับของเดิม (ค่า config ไม่ใช่ logic ไม่ต้อง duplicate) + mapping
// personality เดียวกันเป๊ะ (veryStrong→cortex, medium→reaper, mediumWeak→crag, else→cipher)
// ล็อกครั้งเดียวตอนแจกไพ่ (Monarch เป็นแมตช์รอบเดียว ไม่มี "Round 1 เท่านั้น" ต้องระบุแบบต้นแบบ)
function lockMonarchBossPersonality(strength: number): AIPersonality {
  const q = gameConfig.monarchConfig.handStrengthQuartile
  if (strength >= q.veryStrong) return 'cortex'
  if (strength >= q.medium) return 'reaper'
  if (strength >= q.mediumWeak) return 'crag'
  return 'cipher'
}

// ── Weight ตาม personality — ค่าเดียวกับ aiEngine.ts:284-300 เป๊ะ (Four Gods, ไม่ duplicate ตัวเลข
// เอง ยกเว้น cipher ที่ต้องสุ่มใหม่ทุกครั้งตามสเปคเดิม จะ cache เป็นค่าคงที่ไม่ได้) ──────────────
function monarchBossWeights(personality: AIPersonality): { w1: number; w2: number; w3: number } {
  switch (personality) {
    case 'reaper': return { w1: 1, w2: 2, w3: 4 }
    case 'cortex': return { w1: 2, w2: 3, w3: 4 }
    case 'crag':   return { w1: 5, w2: 5, w3: 4 }
    default:       return {
      w1: Math.floor(Math.random() * 5) + 1,
      w2: Math.floor(Math.random() * 5) + 1,
      w3: Math.floor(Math.random() * 5) + 1,
    }
  }
}

// ── Round Start (Sprint 3, Boss upgrade Sprint 7) — deal + auto-arrange Minion/Boss ทันที ──
// ไม่ emit ตรงจากตรงนี้ (known bug #2, CLAUDE.md: client ยัง mount/join ห้องไม่ทันตอน room_auto_match
// สั่งเริ่มแมตช์ทันที) — client ต้อง pull เอาเองผ่าน monarch_join หลัง mount แล้ว (ดู buildMonarchRoundSnapshot)
export function startMonarchRound(io: Server, roomId: string): void {
  const state = monarchMatchStates.get(roomId)
  if (!state) return

  const { players, commA, commB } = monarchDealCards()
  const cardsMap: Record<string, Card[]> = {}
  state.seats.forEach((seat, i) => { cardsMap[seat.id] = players[i] })

  state.community = { commA, commB }
  state.cardsMap = cardsMap
  state.arrangements = {}
  state.foulMap = {}
  state.foulReasons = {}
  state.submittedArrangement = new Set()
  state.g1Winner = undefined
  state.g2Winner = undefined
  state.g3Winner = undefined
  state.phase = 'arrangement'

  // Timer starts only after the player accepts Monarch's Rule on the client.
  // This prevents the intro/dialogue from consuming arrangement time.
  state.arrangementDeadlineAt = undefined
  if (state.arrangementTimer) clearTimeout(state.arrangementTimer)
  state.arrangementTimer = undefined

  // Minion auto-arrange แบบเดิม (dumb, foul-only ตาม Monarch Minion spec) — Boss ยกระดับเป็น
  // personality-weighted optimal solver (Sprint 7)
  for (const seat of state.seats) {
    if (seat.isHuman) continue

    if (seat.role === 'boss') {
      // Probe ด้วย weight กลางๆ (คอร์เท็กซ์ 2/3/4) วัด hand strength แล้วทิ้งอาร์เรนจ์เมนต์นั้น
      // (เทียบ monarchAI.ts PROBE_CONFIG เดิมที่ใช้ personality 'cortex' เป็นตัววัดกลาง)
      const probe = monarchBestArrangement(cardsMap[seat.id], commA, commB, { w1: 2, w2: 3, w3: 4 })
      const probeHands = assembleMonarchHands(probe, commA, commB)
      const strength = (
        monarchResolvePile(probeHands.g1).rankIndex
        + monarchResolvePile(probeHands.g2).rankIndex
        + monarchResolvePile(probeHands.g3).rankIndex
      ) / 27
      const personality = lockMonarchBossPersonality(strength)
      seat.personality = personality
      // จัดไพ่จริงด้วย weight ตาม personality ที่ล็อกแล้ว (ทุกตนจัดไพ่เต็มฝีมือ bestArrangement
      // เหมือน Four Gods เดิม — ความต่างอยู่ที่สไตล์ Call/Fold ตอน Grand Finale ไม่ใช่ตอนจัดไพ่)
      state.arrangements[seat.id] = monarchBestArrangement(cardsMap[seat.id], commA, commB, monarchBossWeights(personality))
    } else {
      state.arrangements[seat.id] = monarchFirstValidArrangement(cardsMap[seat.id], commA, commB)
    }
    state.submittedArrangement.add(seat.id)
  }
}

function orderedMonarchG3ForReveal(state: MonarchMatchState, playerId: string): Card[] {
  const { commA, commB } = state.community!
  const g3 = assembleMonarchHands(state.arrangements![playerId], commA, commB).g3
  if (playerId !== state.humanUserId || !state.grandFinale?.humanRevealOrder?.length) return g3
  const byKey = new Map(g3.map(card => [cardKey(card), card]))
  const selected = state.grandFinale.humanRevealOrder
    .map(key => byKey.get(key))
    .filter((card): card is Card => !!card)
  const selectedKeys = new Set(state.grandFinale.humanRevealOrder)
  return [...selected, ...g3.filter(card => !selectedKeys.has(cardKey(card)))]
}

export function startMonarchArrangementTimer(
  io: Server, roomId: string, userId: string,
): { ok: true; deadlineAt: number } | { ok: false; reason: string } {
  const state = monarchMatchStates.get(roomId)
  if (!state || state.humanUserId !== userId) return { ok: false, reason: 'MATCH_NOT_FOUND' }
  if (state.phase !== 'arrangement') return { ok: false, reason: 'INVALID_PHASE' }

  // Idempotent: repeated taps/reconnect messages must never reset or extend the clock.
  if (state.arrangementDeadlineAt && state.arrangementTimer) {
    return { ok: true, deadlineAt: state.arrangementDeadlineAt }
  }

  state.arrangementDeadlineAt = Date.now() + gameConfig.monarchConfig.arrangementDeadlineMs
  state.arrangementTimer = setTimeout(
    () => forceSealMonarchArrangement(io, roomId),
    gameConfig.monarchConfig.arrangementDeadlineMs,
  )
  return { ok: true, deadlineAt: state.arrangementDeadlineAt }
}

// ── Snapshot สำหรับ pull model (monarch_join) ───────────────
// Batch 3E Task 3 (Full Reconnect) — เดิม snapshot นี้รองรับแค่ phase 'arrangement' จริง (ไม่มี reveal
// history/grand finale live state เลย) reconnect ตอน g1_reveal/g2_reveal/grand_finale จะได้ phase
// ถูกต้องแต่ไม่มีข้อมูลพอวาด UI เฟสนั้น (ดู audit 3E ข้อ 7) แก้โดย reconstruct g1Result/g2Result/
// grandFinale จาก state ที่เก็บถาวรอยู่แล้ว (g1Winner/g2Winner/arrangements/foulMap/tokenBalance —
// ไม่มีอะไรหายเพราะไม่เคย delete ตัวแปรพวกนี้ทิ้งเลยตลอดแมตช์) shape เดียวกับ event สดที่ resolveG1/
// resolveG2 เคย emit ไปแล้วเป๊ะ (client ใช้ handler เดิม monarch_g1_result/monarch_g2_result รับต่อได้
// เลยไม่ต้องแยกโค้ดฝั่ง client) — field เดิมทั้งหมดไม่ถูกแตะ แค่เพิ่ม field ใหม่ต่อท้าย
export function buildMonarchRoundSnapshot(state: MonarchMatchState): Record<string, any> {
  const humanCards = state.cardsMap?.[state.humanUserId] ?? []
  const commA = state.community?.commA ?? []
  const commB = state.community?.commB ?? []

  // reveal เฉพาะกองที่ "เปิดไปแล้วจริง" เท่านั้น (phase ผ่านจุดนั้นมาแล้ว) — arrangements ของทุกที่นั่ง
  // ล็อกไว้ตั้งแต่ seal แล้ว ไม่ใช่ไพ่ที่ยังไม่ตัดสินใจ จึงไม่มีทางหลุดไพ่ที่ยังไม่ควรเห็นออกไป
  const revealedG1 = state.phase !== 'waiting' && state.phase !== 'arrangement'
  const revealedG2 = revealedG1 && state.phase !== 'g1_reveal'

  const g1Result = revealedG1 && state.arrangements ? {
    roomId: state.roomId,
    g1Winner: state.g1Winner || null,
    foulMap: state.foulMap ?? {},
    reveals: state.seats.map(s => ({
      id: s.id,
      g1Cards: assembleMonarchHands(state.arrangements![s.id], commA, commB).g1.map(cardKey),
    })),
    tokenBalance: state.tokenBalance,
  } : null

  const g2Result = revealedG2 && state.arrangements ? {
    roomId: state.roomId,
    g2Winner: state.g2Winner || null,
    foulMap: state.foulMap ?? {},
    reveals: state.seats.map(s => ({
      id: s.id,
      g2Cards: assembleMonarchHands(state.arrangements![s.id], commA, commB).g2.map(cardKey),
      folded: !s.hasRealStake,
    })),
    tokenBalance: state.tokenBalance,
  } : null

  const grandFinale = state.grandFinale ? {
    roomId: state.roomId,
    foldedPlayers: state.grandFinale.foldedPlayers,
    pot: state.grandFinale.pot,
    callAmount: gameConfig.grandFinale.callAmount.highNoble ?? 0,
    turn: state.grandFinale.turn,
    round: state.grandFinale.round ?? 1,
    revealedCount: state.grandFinale.revealedCount ?? 0,
    reveals: state.arrangements && state.community
      ? state.seats
          .filter(s => s.role === 'human' || s.role === 'boss')
          .map(s => ({
            id: s.id,
             g3Cards: orderedMonarchG3ForReveal(state, s.id)
               .slice(0, state.grandFinale!.revealedCount ?? 0).map(cardKey),
          }))
      : [],
  } : null

  return {
    roomId: state.roomId,
    phase: state.phase,
    seats: state.seats.map(s => ({ id: s.id, role: s.role, isHuman: s.isHuman, name: s.name, emoji: s.emoji, avatarUrl: s.avatarUrl })),
    yourCards: humanCards.map(cardKey),
    commA: commA.map(cardKey),
    commB: commB.map(cardKey),
    tokenBalance: state.tokenBalance,
    buyInAmount: state.buyInAmount,
    // Batch 1 Task 6 — เตรียมไว้ให้ Batch 2 ทำ UI countdown (ยังไม่มี client อ่านค่านี้ในบัตช์นี้)
    arrangementDeadlineAt: state.arrangementDeadlineAt ?? null,
    // Batch 3E Task 3 — null ถ้ายังไม่ถึงจุดนั้น ให้ client (Task 6) hydrate UI กลับให้ถูก phase จริง
    g1Result,
    g2Result,
    grandFinale,
  }
}

// ── Helper: แปลง card key จาก client (Sprint 6 manual arrangement) กลับเป็น Card object โดยอิง
// จากไพ่ 11 ใบที่แจกจริง (state.cardsMap[userId]) — ปฏิเสธถ้า key ไม่ตรง/ซ้ำ/จำนวนผิด กันโกงหรือ
// bug ฝั่ง client ส่งไพ่ที่ไม่มีจริงมา ── ไม่ export เพราะใช้แค่ภายในไฟล์นี้
function resolveArrangementFromKeys(
  hand: Card[], keys: { g1: string[]; g2: string[]; g3: string[] },
): PlayerArrangement | null {
  if (keys.g1.length !== 3 || keys.g2.length !== 3 || keys.g3.length !== 5) return null
  const allKeys = [...keys.g1, ...keys.g2, ...keys.g3]
  if (new Set(allKeys).size !== 11) return null // ห้ามซ้ำ/ขาด

  const byKey = new Map(hand.map(c => [cardKey(c), c]))
  const pick = (ks: string[]): Card[] | null => {
    const cards: Card[] = []
    for (const k of ks) {
      const c = byKey.get(k)
      if (!c) return null
      cards.push(c)
    }
    return cards
  }

  const pile1 = pick(keys.g1)
  const pile2 = pick(keys.g2)
  const pile3 = pick(keys.g3)
  if (!pile1 || !pile2 || !pile3) return null
  return { pile1, pile2, pile3 }
}

// ── Batch 1 Task 6 — ปิดผนึก arrangement ของผู้เล่น (ใช้ร่วมกันทั้ง submit เอง และ auto-seal ตอน
// หมดเวลา) ไม่เช็ค foul ตรงนี้เลย — resolveG1 คำนวณ+เก็บ foulMap ของทุกที่นั่งเองอยู่แล้วตอนเปิดกอง ──
function sealMonarchArrangement(io: Server, state: MonarchMatchState, userId: string, arr: PlayerArrangement): void {
  if (state.arrangementTimer) { clearTimeout(state.arrangementTimer); state.arrangementTimer = undefined }
  state.arrangements![userId] = arr
  state.submittedArrangement.add(userId)

  if (state.submittedArrangement.size === state.seats.length) {
    void resolveG1(io, state)
  }
}

// ── Human submit arrangement (Sprint 3/6 → Batch 1 Task 6, Monarch v2.2 canon: "ไม่มีปุ่มช่วยจัด
// ไพ่ใดๆ ในโต๊ะ Monarch" + "Foul → ยัง submit ได้ แต่แพ้ทันที") ──────────────────────────────────
// เปลี่ยนจากเดิม 2 จุด: (1) arrangementKeys ไม่ใช่ optional ในทางปฏิบัติอีกต่อไป — ไม่ส่งมา = reject
// ตรงๆ (ไม่มี auto-arrange fallback ให้ช่วยจัดแล้ว) (2) foul ไม่ reject ให้แก้ใหม่แบบเดิมอีกต่อไป —
// รับ submit เสมอแล้วปล่อยให้แพ้ตามกติกา Foul ทั่วไป (resolveG1/resolveG2 กันไม่ให้ที่นั่ง foul ชนะ
// อยู่แล้ว, resolveMonarchBossTurn มี guard เพิ่มให้ G3 แพ้แน่นอนด้วยเช่นกัน)
export function submitMonarchArrangement(
  io: Server, roomId: string, userId: string,
  arrangementKeys?: { g1: string[]; g2: string[]; g3: string[] },
): { ok: boolean; reason?: string } {
  const state = monarchMatchStates.get(roomId)
  if (!state) return { ok: false, reason: 'ROOM_NOT_FOUND' }
  if (state.phase !== 'arrangement') return { ok: false, reason: 'WRONG_PHASE' }
  if (userId !== state.humanUserId) return { ok: false, reason: 'NOT_YOUR_SEAT' }
  if (state.submittedArrangement.has(userId)) return { ok: false, reason: 'ALREADY_SUBMITTED' }
  if (!state.cardsMap || !state.community) return { ok: false, reason: 'NOT_DEALT' }
  if (!arrangementKeys) return { ok: false, reason: 'INVALID_ARRANGEMENT' }

  const resolved = resolveArrangementFromKeys(state.cardsMap[userId], arrangementKeys)
  if (!resolved) return { ok: false, reason: 'INVALID_ARRANGEMENT' }

  sealMonarchArrangement(io, state, userId, resolved)
  return { ok: true }
}

// ── Batch 1 Task 6 — หมดเวลาจัดไพ่ (gameConfig.monarchConfig.arrangementDeadlineMs) แล้ว human
// ยังไม่ submit → auto-seal ด้วยไพ่ตามลำดับที่แจกจริงเป๊ะ (cardsMap ดิบ ตัด 3/3/5) ห้ามใช้
// monarchFirstValidArrangement/monarchBestArrangement ช่วยจัดโดยเด็ดขาด (canon: ไม่มีปุ่มช่วยจัดไพ่
// ใดๆ ในโต๊ะนี้ — auto-seal ต้อง "ไม่ช่วย" ด้วยเช่นกัน) ผลลัพธ์มีโอกาสสูงที่จะ foul เพราะไม่ได้จัดตาม
// กติกา G1<G2<G3 เลย ซึ่งจะแพ้ทันทีตามกติกา Foul ปกติ — ยังไม่มี UI countdown ในบัตช์นี้
function forceSealMonarchArrangement(io: Server, roomId: string): void {
  const state = monarchMatchStates.get(roomId)
  if (!state || state.matchEnded) return
  if (state.phase !== 'arrangement') return // submit ทันเวลาไปแล้ว (เข้า resolveG1 แล้ว) ไม่ต้องทำอะไร
  if (state.submittedArrangement.has(state.humanUserId)) return // กันชนกับ submit ที่มาถึงพอดีตอน timer ยิง

  const rawHand = state.cardsMap![state.humanUserId]
  const arr: PlayerArrangement = {
    pile1: rawHand.slice(0, 3),
    pile2: rawHand.slice(3, 6),
    pile3: rawHand.slice(6),
  }
  sealMonarchArrangement(io, state, state.humanUserId, arr)
}

// ── resolveG1 (Sprint 3) — เปิดกอง G1 ก่อน แล้วหน่วง 4s ต่อด้วย resolveG2 อัตโนมัติ (Sprint 4) —
// arrangement ทั้ง 3 กองถูกล็อกพร้อมกันตอน submit ครบแล้ว (เหมือน Tier อื่นทุกตัว) การเปิดกองเลย
// เป็นแค่ sequence การเผยผล ไม่ต้องรอ action เพิ่มจาก human — G3/Grand Finale ยัง stub รอ sprint ถัดไป
// Pot formula เทียบ calcDeltas เดิมใน highNobleMultiEngine.ts:73-96 (ทุกที่นั่งจ่าย stake เข้ากอง
// เสมอไม่ว่าจะ foul หรือไม่ — foul แค่ตัดสิทธิ์ชนะ) — stake ใช้ gameConfig.tokenPot.tiers.highNoble
// ตามมติลุงเยาะ Sprint 3 (เศรษฐกิจเดียวกับ escrow buy-in ที่ตัดสินใจไปแล้ว Sprint 2)
export async function resolveG1(io: Server, state: MonarchMatchState): Promise<void> {
  if (state.matchEnded) return // Sprint 10: match ถูกจบไปแล้ว (เช่น human disconnect) — เลิก chain ต่อ
  const { commA, commB } = state.community!
  const g1Hands: Record<string, HandResult> = {}

  for (const seat of state.seats) {
    const arr = state.arrangements![seat.id]
    const { g1, g2, g3 } = assembleMonarchHands(arr, commA, commB)
    const foul = monarchCheckFoul(g1, g2, g3)
    state.foulMap![seat.id] = foul.isFoul
    if (foul.isFoul) state.foulReasons![seat.id] = foul.reason ?? 'Foul'
    g1Hands[seat.id] = monarchResolvePile(g1)
  }

  let winnerId = ''
  let bestScore = -Infinity
  for (const seat of state.seats) {
    if (state.foulMap![seat.id]) continue
    const score = g1Hands[seat.id].score
    if (score > bestScore) { bestScore = score; winnerId = seat.id }
  }

  // Hotfix (token leak, Spec v2.1 §5.1): Minion ยังร่วมเทียบไพ่ G1 ได้เพื่อ "ชนะเชิงสัญลักษณ์"
  // ตาม canon แต่ต้องไม่มีผลเงินเด็ดขาด — ถ้าผู้ชนะ overall เป็น Minion (hasRealStake===false)
  // ให้ข้าม token movement ทั้งกอง (ไม่หัก ไม่จ่ายใครเลยรอบนี้ รวมถึง Human/Monarch เอง) เทียบเท่า
  // "กองนี้ไม่มีเดิมพันจริงเกิดขึ้น" ส่วนถ้าผู้ชนะเป็น Human/Monarch คำนวณเงินตามเดิมแต่หาร pot
  // เฉพาะที่นั่งที่ hasRealStake จริง (ไม่ใช่ seats.length เต็ม 4) กัน pot พองจากสตางค์ผีของ Minion
  const winnerSeat = state.seats.find(s => s.id === winnerId)
  const isSymbolicWin = !!winnerSeat && !winnerSeat.hasRealStake
  const stake = gameConfig.tokenPot.tiers.highNoble.pile1
  const rake = gameConfig.tokenPot.rake
  if (winnerId && !isSymbolicWin) {
    const realSeats = state.seats.filter(s => s.hasRealStake)
    const totalPot = stake * realSeats.length
    const net = Math.floor(totalPot * (1 - rake))
    for (const seat of realSeats) {
      state.tokenBalance[seat.id] += (seat.id === winnerId ? net - stake : -stake)
    }
  }
  if (winnerId) state.g1Winner = winnerId
  // เคส "ทุกที่นั่ง foul หมด" ทางปฏิบัติแทบเป็นไปไม่ได้ (monarchFirstValidArrangement การันตี
  // foul-free ด้วย retry+fallback brute force) — ถ้าเกิดขึ้นจริง pot รอบนี้ไม่ถูกแจก/ไม่หัก
  // TODO sprint ถัดไปถ้าต้องการ Fee&Rake bucket จริงแบบ Tier อื่น (state ยังไม่มี field นี้)

  state.phase = 'g1_reveal'

  io.to(state.roomId).emit('monarch_g1_result', {
    roomId: state.roomId,
    g1Winner: winnerId || null,
    g1WinnerSymbolic: isSymbolicWin,   // true = Minion ชนะเชิงสัญลักษณ์ ไม่มีผลเงิน (client แสดง badge เฉยๆ)
    foulMap: state.foulMap,
    reveals: state.seats.map(s => ({
      id: s.id,
      g1Cards: assembleMonarchHands(state.arrangements![s.id], commA, commB).g1.map(cardKey),
    })),
    tokenBalance: state.tokenBalance,
  })

  await delay(4000)
  await resolveG2(io, state)
}

// ── resolveG2 (Sprint 4) — เปิดกอง G2 ต่อจาก G1 อัตโนมัติ (ไม่ต้องรอ action จาก human เพิ่ม
// เพราะ arrangement ทั้ง 3 กองล็อกไปพร้อมกันตั้งแต่ submit แล้ว) foulMap ใช้ตัวที่ resolveG1
// เช็คไว้แล้วตรงๆ ไม่ recompute ซ้ำ (foul เป็นการตัดสินทั้ง arrangement ไม่ใช่รายกอง) — stake ใช้
// gameConfig.tokenPot.tiers.highNoble.pile2 (มติลุงเยาะ Sprint 3 ใช้เศรษฐกิจ highNoble ทุกกอง) —
// G3/Grand Finale ยัง stub รอ sprint ถัดไป
// Hotfix (token leak, Spec v2.1 §5.1): "G2: Minion หมอบทันที (auto-fold)" — ต่างจาก resolveG1
// ตรงที่ G1 ยอมให้ Minion ร่วมเทียบแบบสัญลักษณ์ได้ แต่ G2 ต้องตัด Minion ออกจาก comparison
// ทั้งหมดตั้งแต่ต้น (ไม่ใช่แค่ gate เงินทีหลังแบบ G1) ผู้ชนะ G2 มาจาก Human vs Monarch เท่านั้น —
// EV decision ที่ G3 (decideMonarchBossAction/estimateMonarchBossWinrate) อ่าน state.arrangements
// ตรงๆ ไม่ได้อ่าน state.g2Winner เลย ยืนยันแล้วว่าไม่กระทบ (ดู audit ก่อนหน้า)
export async function resolveG2(io: Server, state: MonarchMatchState): Promise<void> {
  if (state.matchEnded) return // Sprint 10: match ถูกจบไปแล้ว (เช่น human disconnect) — เลิก chain ต่อ
  const { commA, commB } = state.community!
  const realSeats = state.seats.filter(s => s.hasRealStake)
  const g2Hands: Record<string, HandResult> = {}

  for (const seat of realSeats) {
    const arr = state.arrangements![seat.id]
    const { g2 } = assembleMonarchHands(arr, commA, commB)
    g2Hands[seat.id] = monarchResolvePile(g2)
  }

  let winnerId = ''
  let bestScore = -Infinity
  for (const seat of realSeats) {
    if (state.foulMap![seat.id]) continue
    const score = g2Hands[seat.id].score
    if (score > bestScore) { bestScore = score; winnerId = seat.id }
  }

  const stake = gameConfig.tokenPot.tiers.highNoble.pile2
  const rake = gameConfig.tokenPot.rake
  if (winnerId) {
    const totalPot = stake * realSeats.length
    const net = Math.floor(totalPot * (1 - rake))
    for (const seat of realSeats) {
      state.tokenBalance[seat.id] += (seat.id === winnerId ? net - stake : -stake)
    }
    state.g2Winner = winnerId
  }
  // เคส "ทุกที่นั่งจริง foul หมด" — เหมือน resolveG1 ทางปฏิบัติแทบเป็นไปไม่ได้ ถ้าเกิดขึ้นจริง pot
  // รอบนี้ไม่ถูกแจก/ไม่หัก (TODO เดียวกับ resolveG1 — รอ Fee&Rake bucket จริงถ้าจำเป็น)

  state.phase = 'g2_reveal'

  io.to(state.roomId).emit('monarch_g2_result', {
    roomId: state.roomId,
    g2Winner: winnerId || null,
    foulMap: state.foulMap,
    reveals: state.seats.map(s => ({
      id: s.id,
      g2Cards: assembleMonarchHands(state.arrangements![s.id], commA, commB).g2.map(cardKey),
      folded: !s.hasRealStake,   // Minion หมอบตั้งแต่ G2 ตาม Spec §5.1 — client ใช้ badge "Folded" แทนการเทียบ
    })),
    tokenBalance: state.tokenBalance,
  })

  await delay(4000)
  startMonarchGrandFinale(io, state)
}

// ── Grand Finale (Sprint 5) — G3 เท่านั้นที่มี betting (G1/G2 เป็นแค่ reveal ธรรมดา) ─────────
// Minion auto-fold ทันทีตอนเข้าเฟส (canon Sprint 0: Minion เล่นแค่ G1 ปกติ ที่เหลือ auto-fold)
// เหลือ Human↔Boss ตัดสินใจจริง 2 รอบ: Call รอบแรกเปิด 3 ใบ รอบสองเปิดเพิ่ม 1 ใบ
// ไพ่ใบที่ 5 ยังคง sealed ใน UI แต่ server ใช้ครบ 5 ใบตัดสิน ยังไม่มี timer บังคับ (เทียบมติ
// Sprint 3 ที่ข้าม timer ของ arrangement ไปก่อนเหมือนกัน)
export function startMonarchGrandFinale(io: Server, state: MonarchMatchState): void {
  if (state.matchEnded) return // Sprint 10: match ถูกจบไปแล้ว (เช่น human disconnect) — เลิก chain ต่อ
  const stake = gameConfig.tokenPot.tiers.highNoble.pile3
  const minion1 = state.seats.find(s => s.role === 'minion1')!
  const minion2 = state.seats.find(s => s.role === 'minion2')!
  // Hotfix (token leak, Spec v2.1 §5.1/§6): pot ตั้งต้นต้องนับเฉพาะที่นั่งที่ hasRealStake จริง
  // (Human + Monarch = 2) ไม่ใช่ seats.length เต็ม 4 — เดิม pot พองจาก "เงินผี" ของ Minion ที่ไม่มี
  // เดิมพันจริง ทำให้ผู้ชนะได้ payout เกินจริง
  const realSeatCount = state.seats.filter(s => s.hasRealStake).length

  state.grandFinale = {
    foldedPlayers: [minion1.id, minion2.id],
    pot: stake * realSeatCount,
    turn: 'human',
    round: 1,
    revealedCount: 0,
  }
  state.phase = 'grand_finale'

  io.to(state.roomId).emit('monarch_grand_finale_start', {
    roomId: state.roomId,
    foldedPlayers: state.grandFinale.foldedPlayers,
    pot: state.grandFinale.pot,
    callAmount: gameConfig.grandFinale.callAmount.highNoble ?? 0,
    turn: 'human',
    round: 1,
    revealedCount: 0,
  })

  // Batch 1.5 Task 6 (มติ commit-based 2026-07-30): human หลุดการเชื่อมต่อไปแล้วก่อนถึงจุดนี้ (เช่น
  // disconnect ตอน g1_reveal/g2_reveal ที่ automatic chain เพิ่งวิ่งมาถึง Grand Finale ทีหลัง) —
  // ไม่มี timer สำหรับ human's turn เหมือน High Noble ปกติ (ต่างจาก boss ที่มี 2.5s decision timer
  // เสมอ) ถ้าปล่อยไว้จะค้างที่ turn:'human' ตลอดไป → บังคับ Fold ทันที (ไม่บังคับจ่ายเพิ่ม)
  if (state.humanDisconnected) {
    const bossSeat = state.seats.find(s => s.role === 'boss')!
    state.grandFinale.foldedPlayers.push(state.humanUserId)
    void finalizeMonarchG3(io, state, bossSeat.id)
  }
}

// ── Human submit Call/Fold ──────────────────────────────────
export function submitMonarchGrandFinaleAction(
  io: Server, roomId: string, userId: string, action: 'call' | 'fold',
  revealedCardKeys?: string[],
): { ok: boolean; reason?: string } {
  const state = monarchMatchStates.get(roomId)
  if (!state) return { ok: false, reason: 'ROOM_NOT_FOUND' }
  if (state.phase !== 'grand_finale' || !state.grandFinale) return { ok: false, reason: 'WRONG_PHASE' }
  if (userId !== state.humanUserId) return { ok: false, reason: 'NOT_YOUR_SEAT' }
  if (state.grandFinale.turn !== 'human') return { ok: false, reason: 'NOT_YOUR_TURN' }

  const bossSeat = state.seats.find(s => s.role === 'boss')!

  if (action === 'fold') {
    state.grandFinale.foldedPlayers.push(userId)
    state.grandFinale.turn = 'done'
    void finalizeMonarchG3(io, state, bossSeat.id)
    return { ok: true }
  }

  // Call — หักจาก stack จริงทันที (เทียบ applyGrandFinaleAction เดิม ฝั่ง non-tokenFlow ที่หัก
  // real-time ระหว่างเกม แล้วค่อยหัก ante ก้อนใหญ่ทีเดียวตอน finalize)
  const callAmount = gameConfig.grandFinale.callAmount.highNoble ?? 0
  if ((state.tokenBalance[userId] ?? 0) < callAmount) {
    return { ok: false, reason: 'INSUFFICIENT_TOKENS' }
  }

  if ((state.grandFinale.round ?? 1) === 1) {
    if (!Array.isArray(revealedCardKeys) || revealedCardKeys.length !== 3 || new Set(revealedCardKeys).size !== 3) {
      return { ok: false, reason: 'SELECT_EXACTLY_THREE_REVEAL_CARDS' }
    }
    const { commA, commB } = state.community!
    const humanG3Keys = new Set(
      assembleMonarchHands(state.arrangements![userId], commA, commB).g3.map(cardKey),
    )
    if (revealedCardKeys.some(key => !humanG3Keys.has(key))) {
      return { ok: false, reason: 'INVALID_REVEAL_SELECTION' }
    }
    state.grandFinale.humanRevealOrder = [...revealedCardKeys]
  }
  state.tokenBalance[userId] -= callAmount
  state.grandFinale.pot += callAmount
  state.grandFinale.turn = 'boss'

  io.to(state.roomId).emit('monarch_grand_finale_action', {
    roomId: state.roomId, playerId: userId, action: 'call',
    pot: state.grandFinale.pot, tokenBalance: state.tokenBalance,
    round: state.grandFinale.round,
  })

  // Boss คิด (delay สั้นๆ ให้ดูเหมือนคิดจริง — ย่อจาก 7-10s ของ Tier อื่นเพราะ Monarch เป็น 1v1
  // แต่ละ exchange ใช้ delay สั้นเพื่อไม่ให้รอนาน)
  setTimeout(() => { void resolveMonarchBossTurn(io, state) }, 2500)
  return { ok: true }
}

// ── Card Counting (Sprint 7) — เทียบ estimateBossWinrate เดิมใน gameLoop.ts:1596-1657 ปรับสำหรับ
// 2-2-0: G3 ของ Monarch เป็น 5 ใบดิบไม่มี community และไม่มีกลไกหงายทีละใบระหว่าง Grand Finale
// (ต่างจาก Tier อื่น) ดังนั้น "unseen" ของ Human คือทั้ง 5 ใบเสมอ ไม่ใช่ 2-3 ใบที่เหลือแบบเดิม —
// ใช้ worst-case heuristic เดียวกัน (สมมติคู่ต่อสู้ได้ 5 ใบแรงสุดจาก unseen pool) แต่เพราะมีคู่ต่อสู้
// แค่ 1 คน (ไม่ใช่ 2-3 คนแบบ Tier อื่น) ผลลัพธ์จะออกมาเกือบ binary (0 หรือ 1) เป็นข้อจำกัดที่ทราบ
// อยู่แล้ว — ปรับจูนได้ทีหลังถ้า playtest จริงแล้วรู้สึกเดาทางง่ายเกินไป
function estimateMonarchBossWinrate(state: MonarchMatchState): number {
  const bossSeat = state.seats.find(s => s.role === 'boss')!
  const { commA, commB } = state.community!

  const { g3: bossG3 } = assembleMonarchHands(state.arrangements![bossSeat.id], commA, commB)
  const myResult = monarchResolvePile(bossG3)

  const seen = new Set<string>()
  commA.forEach(c => seen.add(cardKey(c)))
  commB.forEach(c => seen.add(cardKey(c)))
  state.cardsMap![bossSeat.id].forEach(c => seen.add(cardKey(c))) // ไพ่ทั้ง 11 ใบของ Boss เอง (G1+G2+G3)
  // G1/G2 ของทุกที่นั่งเปิดเผยแล้วจริงตอน resolveG1/resolveG2 (monarch_g1_result/g2_result) — G3
  // ของที่นั่งอื่นยังไม่เปิดเผย (รวม Minion ที่ fold ไปแล้วโดยไม่หงาย) ห้ามเอามานับใน seen
  for (const seat of state.seats) {
    if (seat.id === bossSeat.id) continue
    const arr = state.arrangements![seat.id]
    arr.pile1.forEach(c => seen.add(cardKey(c)))
    arr.pile2.forEach(c => seen.add(cardKey(c)))
  }

  const SUITS: Array<Card['suit']> = ['spades', 'hearts', 'diamonds', 'clubs']
  const RANKS: Array<Card['rank']> = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
  const VALUE: Record<string, number> = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 }
  const unseen: Card[] = []
  for (const r of RANKS) {
    for (const s of SUITS) {
      const c: Card = { rank: r, suit: s, value: VALUE[r] }
      if (!seen.has(cardKey(c))) unseen.push(c)
    }
  }

  // Human G3 ไม่เคยหงายทีละใบใน Monarch (ต่าง Tier อื่น) → สมมติกรณีเลวร้ายสุด: Human ได้ 5 ใบ
  // แรงสุดที่เหลือใน unseen pool ทั้งหมด
  const dangerHand = [...unseen].sort((a, b) => b.value - a.value).slice(0, 5)
  const oppResult = monarchResolvePile(dangerHand)

  return compareHands(myResult, oppResult) >= 0 ? 1 : 0
}

// ── Boss decision (Sprint 5 flat threshold → Sprint 7 card-counting + personality bias) —
// เทียบ decideAIGrandFinaleAction เดิมใน gameLoop.ts:1661-1718 เฉพาะ 4 branch ของ Four Gods
// (reaper/crag/cortex/cipher — personality อื่นของต้นแบบ Boss Monarch ล็อกไม่ได้อยู่แล้ว ดู
// lockMonarchBossPersonality) ค่า bias เดียวกับต้นฉบับเป๊ะ ไม่ duplicate ตัวเลขเอง ─────────────
function decideMonarchBossAction(state: MonarchMatchState): 'call' | 'fold' {
  const bossSeat = state.seats.find(s => s.role === 'boss')!
  const { commA, commB } = state.community!
  const { g3 } = assembleMonarchHands(state.arrangements![bossSeat.id], commA, commB)
  const result = monarchResolvePile(g3)

  let callProb: number
  if (result.rankIndex >= 3) callProb = 0.99
  else if (result.rankIndex === 2) callProb = 0.90
  else if (result.rankIndex === 1) callProb = 0.80
  else callProb = 0.40

  const winrate = estimateMonarchBossWinrate(state)
  switch (bossSeat.personality) {
    case 'reaper': // ดุที่สุด — winrate + bias +0.20 ให้ Call ง่ายขึ้น
      callProb = Math.min(0.99, winrate + 0.20)
      break
    case 'crag': // ป้องกันแน่น — winrate + bias -0.15 ให้ Fold ง่ายขึ้น
      callProb = Math.max(0.05, winrate - 0.15)
      break
    case 'cortex': // คำนวณเย็นชา — ตัดสินตาม winrate ตรงๆ ไม่มี randomness
      return winrate >= 0.5 ? 'call' : 'fold'
    case 'cipher': // คาดเดาไม่ได้ — 30% เมิน winrate สุ่มล้วน ที่เหลือใช้ winrate ตรงๆ
      if (Math.random() < 0.3) return Math.random() < 0.5 ? 'call' : 'fold'
      callProb = winrate
      break
  }

  return Math.random() < callProb ? 'call' : 'fold'
}

export async function resolveMonarchBossTurn(io: Server, state: MonarchMatchState): Promise<void> {
  if (state.matchEnded) return // Sprint 10: match ถูกจบไปแล้ว (เช่น human disconnect) — เลิก chain ต่อ
  const bossSeat = state.seats.find(s => s.role === 'boss')!
  const humanSeat = state.seats.find(s => s.role === 'human')!

  // Batch 1 Task 6 (Foul rule): Human ที่ arrangement foul แพ้ G3 เสมอ ไม่ว่า Boss จะตัดสินใจอย่างไร
  // (กันเคส Boss สุ่ม Fold ทั้งที่ Human การันตีแพ้อยู่แล้ว ซึ่งจะทำให้ Human ชนะทั้งที่ foul) — ข้าม
  // การตัดสินใจของ Boss ไปเลยในเคสนี้ ไม่ต้องมี broadcast แยก (UI ของกรณีนี้เป็นงาน Batch 2)
  if (state.foulMap![humanSeat.id]) {
    await finalizeMonarchG3(io, state, bossSeat.id)
    return
  }

  const { commA, commB } = state.community!
  const { g3: bossG3 } = assembleMonarchHands(state.arrangements![bossSeat.id], commA, commB)
  const bossHand = monarchResolvePile(bossG3)
  const action = decideMonarchBossAction(state)

  if (action === 'fold') {
    state.grandFinale!.foldedPlayers.push(bossSeat.id)
    io.to(state.roomId).emit('monarch_grand_finale_action', {
      roomId: state.roomId, playerId: bossSeat.id, action: 'fold',
      pot: state.grandFinale!.pot, tokenBalance: state.tokenBalance,
      round: state.grandFinale!.round,
    })
    await finalizeMonarchG3(io, state, humanSeat.id)
    return
  }

  const callAmount = gameConfig.grandFinale.callAmount.highNoble ?? 0
  state.tokenBalance[bossSeat.id] -= callAmount
  state.grandFinale!.pot += callAmount
  io.to(state.roomId).emit('monarch_grand_finale_action', {
    roomId: state.roomId, playerId: bossSeat.id, action: 'call',
    pot: state.grandFinale!.pot, tokenBalance: state.tokenBalance,
    round: state.grandFinale!.round,
  })

  const currentRound = state.grandFinale!.round ?? 1
  const revealCount = currentRound === 1 ? 3 : 4
  state.grandFinale!.revealedCount = revealCount
  const partialReveals = state.seats
    .filter(s => s.role === 'human' || s.role === 'boss')
    .map(s => ({
      id: s.id,
       g3Cards: orderedMonarchG3ForReveal(state, s.id).slice(0, revealCount).map(cardKey),
    }))
  io.to(state.roomId).emit('monarch_grand_finale_round_complete', {
    roomId: state.roomId,
    round: currentRound,
    revealedCount: revealCount,
    reveals: partialReveals,
    pot: state.grandFinale!.pot,
    tokenBalance: state.tokenBalance,
  })

  if (currentRound === 1) {
    state.grandFinale!.round = 2
    state.grandFinale!.turn = 'human'
    io.to(state.roomId).emit('monarch_grand_finale_round_start', {
      roomId: state.roomId,
      round: 2,
      revealedCount: 3,
      pot: state.grandFinale!.pot,
      callAmount,
      turn: 'human',
    })
    if (state.humanDisconnected) {
      state.grandFinale!.foldedPlayers.push(state.humanUserId)
      state.grandFinale!.turn = 'done'
      await finalizeMonarchG3(io, state, bossSeat.id)
    }
    return
  }

  // Showdown G3 จริง — ทั้ง Human กับ Boss Call ครบแล้ว เทียบมือที่ล็อกไว้ตั้งแต่ arrangement
  const { g3: humanG3 } = assembleMonarchHands(state.arrangements![humanSeat.id], commA, commB)
  const humanHand = monarchResolvePile(humanG3)
  const cmp = compareHands(humanHand, bossHand)
  // เสมอเป๊ะ (คะแนนชนกัน) แทบเป็นไปไม่ได้จริงแต่กันไว้ — สุ่มเท่าๆกัน ไม่ favor ฝั่งใดฝั่งหนึ่ง
  const winnerId = cmp > 0 ? humanSeat.id : cmp < 0 ? bossSeat.id : (Math.random() < 0.5 ? humanSeat.id : bossSeat.id)
  await delay(1500)
  await finalizeMonarchG3(io, state, winnerId)
}

// ── Settlement G3 — ante ทุกที่นั่งหักเหมือน G1/G2 + ผู้ชนะได้ pot ทั้งก้อน (หัก rake) แล้วจบ
// แมตช์ทันที (Monarch เป็นแมตช์รอบเดียว) ──────────────────────────────────────────────────
async function finalizeMonarchG3(io: Server, state: MonarchMatchState, winnerId: string): Promise<void> {
  if (state.matchEnded) return // Sprint 10: match ถูกจบไปแล้ว (เช่น human disconnect) — เลิก chain ต่อ
  const stake = gameConfig.tokenPot.tiers.highNoble.pile3
  const rake = gameConfig.tokenPot.rake
  const pot = state.grandFinale!.pot

  // Hotfix (token leak, Spec v2.1 §5.1/§6): หัก ante เฉพาะที่นั่งที่ hasRealStake จริง (Human +
  // Monarch) ให้ตรงกับ pot ที่ตั้งไว้ตอน startMonarchGrandFinale (stake * realSeatCount) — เดิมหัก
  // จากทั้ง 4 ที่นั่งรวม Minion ที่ไม่มีเดิมพันจริง
  for (const seat of state.seats) {
    if (!seat.hasRealStake) continue
    state.tokenBalance[seat.id] -= stake
  }
  state.tokenBalance[winnerId] += Math.floor(pot * (1 - rake))
  state.g3Winner = winnerId
  state.phase = 'match_end'

  const { commA, commB } = state.community!
  io.to(state.roomId).emit('monarch_g3_result', {
    roomId: state.roomId,
    g3Winner: winnerId,
    foldedPlayers: state.grandFinale!.foldedPlayers,
    reveals: state.seats.map(s => ({
      id: s.id,
      g3Cards: assembleMonarchHands(state.arrangements![s.id], commA, commB).g3.map(cardKey),
    })),
    tokenBalance: state.tokenBalance,
  })

  // Batch 1 Task 5: victory/badge ย้ายไปตัดสินด้วย netDelta > 0 ใน settleMonarchMatch แทน (ไม่ใช่
  // g3Winner ตรงๆ แบบเดิม) — ดูเหตุผลที่นั่น ต้องรอ netDelta คำนวณเสร็จก่อนถึงจะรู้ผลแพ้ชนะจริง
  await settleMonarchMatch(io, state)
}

// ── Match End (Sprint 5) — จุดแรกที่ Monarch เขียนเงินจริงกลับ Supabase (Sprint 2-4 หักแค่ escrow
// ตอนเข้าเกม ยังไม่เคย settle) ────────────────────────────────────────────────────────────
// Bug fix (audit): เดิมใช้ state.tokenBalance ตรงๆ เป็น finalStack เลย ไม่เคยคูณ Pot×2 ตอน human
// ชนะ Monarch จริงสักครั้ง (ต่างจากเส้นทางเก่า computeHNHumanPayout ใน highNobleMultiEngine.ts ที่ทำ
// ถูกอยู่แล้ว) — reuse ฟังก์ชันเดียวกันแทนเขียนสูตรซ้ำ กัน 2 สูตรขัดกันในอนาคต
export async function settleMonarchMatch(io: Server, state: MonarchMatchState): Promise<void> {
  // Batch 1.5 Task 4 (ยืนยัน audit 2026-07-30 — ลำดับนี้ถูกต้องอยู่แล้ว ห้ามสลับ ห้ามเรียก
  // computeHNHumanPayout ซ้ำที่ไหนอีก กัน apply Pot×2 ซ้อน): ลำดับบังคับ 4 ขั้น —
  //   1) คำนวณ netDelta จากผล G1/G2/G3 จริง (state.tokenBalance ที่สะสมมาแล้วตลอด G1/G2/G3)
  //   2) isHumanWinner = netDelta > 0 (เกณฑ์ "ชนะ Monarch" เดียว ไม่ใช่ g3Winner — Canon 2026-07-30)
  //   3) ถ้าชนะ → apply Pot×2 ผ่าน computeHNHumanPayout ครั้งเดียวเท่านั้น (คูณ netDelta ก่อน apply
  //      ไม่ใช่คูณ pot ดิบ) ได้ payout สุดท้าย
  //   4) ถ้าชนะ → badge (recordMonarchVictory) + encounter/monarch_defeats — ใช้ isHumanWinner ตัวเดียวกับ (3)
  const netDelta = (state.tokenBalance[state.humanUserId] ?? state.buyInAmount) - state.buyInAmount // (1)
  const isHumanWinner = netDelta > 0 // (2) — netDelta===0 (เสมอพอดี) ก็ isHumanWinner=false เช่นกัน ไม่ใช่แค่ < 0
  const payout = computeHNHumanPayout(netDelta, isHumanWinner, gameConfig.monarchConfig.potMultiplier) // (3) ครั้งเดียว
  const finalStack = state.buyInAmount + payout

  let relicResult: MonarchRelicResult | null = null
  if (isHumanWinner) { // (4) — badge เกตด้วย isHumanWinner ตัวเดียวกับ (2)/(3) กันนิยาม "ชนะ" 2 มาตรฐาน
    const humanSeat = state.seats.find(s => s.role === 'human')!
    io.emit('server_activity', { kind: 'monarch_win', winnerName: humanSeat.name, timestamp: Date.now() })
    // Batch 3D-1 Task 4: try/catch แยกของตัวเอง — relic roll พลาดต้อง "ไม่" ทำให้ settlement/badge/
    // Pot×2 ข้างบนพัง (ทุกอย่างข้างบนคำนวณ/เขียนเสร็จไปแล้วก่อนถึงบรรทัดนี้) log error พอ ไม่ throw ต่อ
    try {
      relicResult = await rollAndRecordMonarchRelic(state.humanUserId)
    } catch (err) {
      console.error('[MONARCH_RELIC] Unexpected error rolling relic for', state.humanUserId, err)
    }
  }

  const newBalance = await settleEscrow(state.humanUserId, state.escrowId, finalStack)

  // Boss matches count toward aggregate profile stats, but intentionally do not call
  // recordMatchWin(): Boss results belong in the Bosses tab, never regular History.
  await recordMatchStats([{
    userId: state.humanUserId,
    tier: 'highNoble',
    won: isHumanWinner,
    isTripleSweep: false,
    bestHandThisMatch: null,
  }])
  try {
    await recordBossResult({
      userId: state.humanUserId,
      bossId: 'monarch',
      won: isHumanWinner,
      bestHand: null,
    })
  } catch (err) {
    // Stats must never prevent the already-settled match from reaching the client.
    console.error('[BOSS_STATS] Failed to record Monarch result for', state.humanUserId, err)
  }
  state.matchEnded = true
  io.to(state.roomId).emit('monarch_match_end', {
    roomId: state.roomId,
    finalStack,
    tokenBalance: newBalance,
    isVictory: isHumanWinner,
    // Batch 3C-2 Task 1: ส่ง foulReasons ไปด้วยเฉยๆ (field อ่านอย่างเดียว ไม่กระทบ finalStack/settlement
    // ข้างบนเลย) ให้ client โชว์เหตุผลที่แพ้ตรงๆ กัน sudden-death งงว่าโดนโกง
    foulReasons: state.foulReasons ?? {},
    // Batch 3D-1 Task 5: ส่ง relicResult ไปด้วยเฉยๆ (field อ่านอย่างเดียว, null ถ้าแพ้หรือ roll พลาด)
    // ไม่กระทบ finalStack/settlement ข้างบนเลยเช่นกัน — client (3D-2) เอาไปทำ reveal popup ต่อ
    relicResult: relicResult ?? undefined,
  })
  // Sprint 10: เคลียร์ state ออกจาก memory หลังจบแมตช์จริง (เดิมค้างอยู่ตลอดไป ไม่มีใครลบเลย)
  monarchMatchStates.delete(state.roomId)
}

// ── Disconnect Handling (Sprint 10) — Monarch เป็นโต๊ะ solo-like (1 human จริง + AI ล้วน) เทียบ
// pattern settleAndEndSoloMatch ของ Initiate/Mastermind (settle ทันที ไม่มี grace period เพราะไม่มี
// human อื่นให้เล่นต่อรอ) ต่างจาก Adept/HighNoble ที่ mark AFK + รอ 60s เพราะมี human คนอื่นค้างอยู่จริง
// — ก่อนหน้านี้ gameSocket.ts's disconnect handler ไม่มี branch 'monarch' เลย (ค้น audit Sprint 9)
// escrow เลยค้างสถานะ in_match จนกว่า stale-recovery 60 นาทีจะทำงานตอนพยายามเข้าเกมครั้งถัดไป +
// monarchMatchStates leak ตลอดไป — เมธอดนี้ set matchEnded=true ก่อนเสมอ (guard เดียวกับที่ resolveG1/
// resolveG2/startMonarchGrandFinale/resolveMonarchBossTurn/finalizeMonarchG3 เช็คไว้แล้ว) กัน delay/
// setTimeout ที่ค้างอยู่ (เช่น resolveG1→delay(4s)→resolveG2) มาแก้ tokenBalance ซ้ำหลัง settle ไปแล้ว
// Batch 1.5 Task 6 (มติ commit-based 2026-07-30 — ทับ Batch 1 Task 6 เดิมทั้งหมด): เดิมเคยแค่หยิบ
// tokenBalance ดิบมา settle ตรงๆ ไม่ resolve อะไรเลย (freeze) ตอนนี้แยก 2 เคสตาม state.phase
// (reuse ที่มีอยู่แล้วแทนเพิ่ม sealedByPlayer flag ใหม่ตามที่โจทย์เสนอเป็นทางเลือก — phase==='arrangement'
// ก็คือ "ยังไม่ seal" เป๊ะอยู่แล้ว):
//   ก่อน Seal (phase==='arrangement') — ไม่มีเดิมพันเกิดขึ้นเลย จบทันทีเหมือนเดิม (ถูกต้องอยู่แล้ว)
//   หลัง Seal — ต้อง resolve จนถึง match_end เสมอ ห้าม freeze: "ปล่อย" ให้ automatic chain ที่วิ่งอยู่จริง
//     (resolveG1→delay→resolveG2→delay→startMonarchGrandFinale, หรือ boss's 2.5s decision timer หลัง
//     human call ไปแล้ว — reuse grandFinale.turn เดิมแทนเพิ่ม grandFinaleCommitted flag ใหม่: turn==='boss'
//     คือ "commit ไปแล้ว") วิ่งต่อไปเองจนจบแล้ว settle ผ่าน settleMonarchMatch ปกติทุกประการ (badge/Pot×2
//     ตัดสินจาก netDelta จริงของไพ่ที่ผนึกไว้แล้ว ไม่ใช่ snapshot ดิบ)
//
// Batch 3E Task 2 (มติ 2026-07-30 — Royal Challenge Lock, grace 20s เฉพาะจุดเดียว): ก่อนหน้านี้เคส
// grand_finale+turn==='human' บังคับ Fold ทันทีไม่มีโอกาสแก้ตัวเลย ตอนนี้แยก "grace" (รอเฉยๆ ก่อน
// ตัดสิน) ออกจาก "resolve" (ลงมือจริง) เป็นคนละ step กันชัดเจน โดยใช้ field ใหม่ disconnectedAt/
// graceTimer (ดู comment ที่ประกาศ field ด้านบน) ⚠️ ไม่แตะความหมาย/จุดใช้งานของ humanDisconnected เดิม
// เลย (ยังเป็นตัวเดียวที่ startMonarchGrandFinale เช็คเพื่อ auto-fold ทันทีถ้าไปถึงจุดนั้นโดยไม่เคย
// reconnect มาเคลียร์ก่อน — ดู monarch_join Task 4) กติกาต่อ phase:
//   arrangement      — คงเดิมเป๊ะ ไม่มี grace (risk profile เดิม: หลุด=คืนเงินทันที ไม่เสี่ยงอะไร)
//   g1_reveal/g2_reveal — ไม่มีอะไรรอ human อยู่แล้ว (chain วิ่งเองอัตโนมัติ) ไม่ grace ไม่ resolve
//     แค่ตั้ง humanDisconnected=true เหมือนเดิมทุกประการ (เผื่อไปถึง grand_finale โดยไม่เคย reconnect)
//   grand_finale + turn==='human' — จุดเดียวที่มี grace 20s จริง: ตั้ง graceTimer แทนบังคับ Fold ทันที
//     reconnect ทันใน 20s (monarch_join เคลียร์ timer ให้) = เล่นต่อได้ปกติ ไม่งั้นหมดเวลา = default
//     Fold แล้ว resolve เหมือนพฤติกรรมเดิมทุกประการ (แค่ช้าลง 20s เท่านั้น ผลลัพธ์สุดท้ายไม่เปลี่ยน)
//   grand_finale + turn==='boss' — คงเดิมเป๊ะ ไม่ต้องทำอะไรเลย (boss's 2.5s timer เดินเองไม่รอ human)
export async function settleAndEndMonarchMatch(io: Server, roomId: string): Promise<void> {
  const state = monarchMatchStates.get(roomId)
  if (!state || state.matchEnded) return

  if (state.phase === 'arrangement') {
    // ก่อน Seal — ไม่มีเดิมพันเกิดขึ้นเลย (ante ทุกกองหักตอน resolveG1/G2/G3 เท่านั้น) settle ตรงๆ
    // ไม่ต้อง resolve อะไร encounter+1 ไม่ได้ badge (ยืนยันพฤติกรรมเดิมถูกต้องแล้ว — audit Batch 1.5)
    if (state.arrangementTimer) { clearTimeout(state.arrangementTimer); state.arrangementTimer = undefined }
    state.matchEnded = true
    void recordBossResult({ userId: state.humanUserId, bossId: 'monarch', won: false })
      .catch(err => console.error('[BOSS_STATS] Failed to record abandoned Monarch encounter for', state.humanUserId, err))
    const finalStack = state.tokenBalance[state.humanUserId]
    await settleEscrow(state.humanUserId, state.escrowId, finalStack)
    monarchMatchStates.delete(roomId)
    return
  }

  // หลัง Seal: ห้าม set matchEnded=true ตรงนี้ (จะไปตัด chain ที่กำลังวิ่งอยู่จริงทิ้งกลางคัน — นี่คือ
  // bug เดิมที่ต้องแก้) ปล่อยให้วิ่งต่อจนถึง finalizeMonarchG3→settleMonarchMatch ที่จะ set matchEnded/
  // settleEscrow/ลบ state ให้เองเมื่อจบจริง — mark เวลาหลุดไว้เสมอ (bookkeeping, reconnect เคลียร์เอง)
  state.disconnectedAt = Date.now()

  if (
    state.phase === 'grand_finale' && state.grandFinale?.turn === 'human' &&
    !state.grandFinale.foldedPlayers.includes(state.humanUserId)
  ) {
    // Batch 3E Task 2 — grace 20s: กันซ้อนถ้า disconnect event ยิงซ้ำ (เช่น socket flap สั้นๆ)
    if (state.graceTimer) clearTimeout(state.graceTimer)
    state.graceTimer = setTimeout(() => {
      void (async () => {
        if (state.matchEnded) return // เกมจบไปแล้วด้วยทางอื่นระหว่าง grace (กันซ้อน)
        state.graceTimer = undefined
        state.disconnectedAt = undefined
        const bossSeat = state.seats.find(s => s.role === 'boss')!
        state.grandFinale!.foldedPlayers.push(state.humanUserId)
        await finalizeMonarchG3(io, state, bossSeat.id)
      })()
    }, 20_000)
    return
  }

  if (state.phase === 'g1_reveal' || state.phase === 'g2_reveal') {
    state.humanDisconnected = true
  }
  // With two GF betting rounds, a disconnect while the Boss is deciding in R1
  // must carry into R2. If the Boss calls, resolveMonarchBossTurn will auto-fold
  // the absent human as soon as it opens the next human turn.
  if (state.phase === 'grand_finale' && state.grandFinale?.turn === 'boss') {
    state.humanDisconnected = true
  }
  // เคสอื่น (grand_finale ที่ turn==='boss' อยู่แล้ว) ไม่ต้องทำอะไรเพิ่ม — boss's decision timer ที่ตั้งไว้
  // แล้วจะพาไปจบเองตามธรรมชาติ ไม่รอ human
}

// Batch 3E Task 4 — เรียกทุกครั้งที่ monarch_join ยิงมา (ทั้ง join แรกสุดและ reconnect) เคลียร์
// ร่องรอยการหลุดทั้งหมดที่อาจค้างจากก่อนหน้า: graceTimer (ยกเลิก timer แทนปล่อยให้หมดแล้ว auto-fold
// ทั้งที่กลับมาแล้ว), disconnectedAt (bookkeeping เฉยๆ), humanDisconnected (คืนสถานะ "ปกติ" ให้
// startMonarchGrandFinale ไม่ auto-fold ทันทีถ้าไปถึงจุดนั้นทั้งที่กลับมาออนไลน์แล้วจริง — เดิม Batch 1.5
// ไม่เคยเคลียร์ flag นี้เลยหลัง set เป็น true ครั้งเดียว ทำให้ reconnect ระหว่าง g1_reveal/g2_reveal
// เสียเปล่า ยังโดน auto-fold ที่ grand_finale อยู่ดี — แก้จุดนี้ด้วย ไม่ใช่แค่เพิ่ม grace)
// เรียกซ้ำกับ state ที่ไม่เคยหลุดเลยก็ปลอดภัย (ทุก field เป็น falsy/undefined อยู่แล้ว เท่ากับ no-op)
export function clearMonarchDisconnectState(roomId: string, userId: string): void {
  const state = monarchMatchStates.get(roomId)
  if (!state || state.humanUserId !== userId) return
  if (state.graceTimer) { clearTimeout(state.graceTimer); state.graceTimer = undefined }
  state.disconnectedAt = undefined
  state.humanDisconnected = false
}
