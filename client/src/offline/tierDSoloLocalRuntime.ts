// tierDSoloLocalRuntime.ts
// Local (ออฟไลน์) runtime สำหรับ Tier D Solo — แทนที่ server/src/game/tierDSoloRuntime.ts
// ที่เดิมห่อ engine บริสุทธิ์ด้วย io:Server + supabaseAdmin ด้วยการเรียก engine ตรงๆ แล้วเซฟผล
// ลง playerStore.ts แทนการ emit/เขียน DB
//
// ขอบเขตรอบนี้ (Step 2 ของแผนพอร์ต Tier D Solo): เฉพาะ loop หลัก level 1-999 (คู่ต่อสู้ปกติสูงสุด
// 3 ตัวพร้อมกัน) เท่านั้น — ไม่รวม Duel sub-mode (level>=1000, ดู engine/tierDRiseDuel.ts),
// ไม่รวม royal-flush broadcast/leaderboard/mini-tournament (เก็บไว้ทำเวอร์ชัน local ทีหลังตามมติ),
// ไม่รวม timer/freeze/VFX-pause choreography ของ tierDSoloRuntime.ts เดิม (เป็นเรื่องจังหวะ
// socket round-trip จริง ฝั่ง local เรียกฟังก์ชันตรงๆ ไม่มี network latency ให้ป้องกัน —
// จังหวะ animation ของหน้าจอเป็นงานขั้นถัดไปที่จะจัดการเองฝั่ง client ได้เลยโดยไม่ต้องมี server
// คอยกันพลาดเหมือนเดิม)
//
// engine/ ทั้งโฟลเดอร์เป็นไฟล์ก็อปมาจาก server/src/game/ ตรงๆ (ยืนยันแล้วว่า pure — ไม่มี import
// supabaseAdmin/redis/socket.io เลยสักจุดในทั้ง 17 ไฟล์) ไม่ได้แก้โค้ดข้างในเพื่อให้ diff กับ
// ต้นฉบับง่ายถ้า engine ฝั่ง server อัปเดตทีหลัง

import {
  createTierDLevel,
  submitTierDArrangement,
  submitTierDUndoArrangement,
  swapTierDHandCard,
  resolveTierDGame,
  rollbackTierDGame,
  commitTierDCombo,
  applyTierDLevelOutcome,
  type TierDLevelState,
  type TierDArrangement,
  type TierDGameNumber,
  type TierDGameResolution,
} from './engine/tierDSolo'
import { isSharedArrangementFoul } from './engine/sharedCardRules'
import { levelRewardSchedule, tierDLevelRewardPlan } from './engine/tierDRewards'
import { resolveGameRules, itemPolicyError, newMatchItemState, domainItem, type MatchItemState } from './engine/unifiedTierRules'
import { usePlayerStore, TIER_D_ITEM_KEYS, type TierDItemKey } from './playerStore'

export const TIER_D_SOLO_HUMAN_ID = 'local-player'

export type TierDSoloSession = {
  state: TierDLevelState
  currentGame: TierDGameNumber
  matchNumber: 1 | 2 | 3
  /** รวมคะแนนของ 3 Match ใน Level เดียวกัน (แยกจาก state.scores ที่เป็นแค่ Match ปัจจุบัน) */
  cumulativeScores: Record<string, number>
  items: MatchItemState
  committedThrough: number
  levelStartedAt: number
}

function freshMatchState(level: number, random: () => number, comboBotId?: string): TierDLevelState {
  return createTierDLevel(level, TIER_D_SOLO_HUMAN_ID, random, comboBotId ? { comboBotId } : undefined)
}

/** เริ่ม Level ใหม่จาก level ปัจจุบันใน playerStore (ไม่มี profile = เริ่มที่ level 1)
 * random เป็น parameter แยกไว้ (เหมือน engine เอง) ให้เทสคุมผลลัพธ์แบบ deterministic ได้ */
export function startTierDSoloLevel(random: () => number = Math.random): TierDSoloSession {
  const level = usePlayerStore.getState().profile?.tierDSolo.level ?? 1
  const state = freshMatchState(level, random)
  return {
    state,
    currentGame: 1,
    matchNumber: 1,
    cumulativeScores: Object.fromEntries(state.seats.map((seat) => [seat.id, 0])),
    items: newMatchItemState(),
    committedThrough: 0,
    levelStartedAt: Date.now(),
  }
}

export function submitArrangement(session: TierDSoloSession, arrangement: TierDArrangement): void {
  submitTierDArrangement(session.state, TIER_D_SOLO_HUMAN_ID, arrangement)
}

export function submitUndoArrangement(session: TierDSoloSession, arrangement: TierDArrangement, unlockedFrom: TierDGameNumber): void {
  submitTierDUndoArrangement(session.state, TIER_D_SOLO_HUMAN_ID, arrangement, unlockedFrom)
}

export function swapHandCard(session: TierDSoloSession, cardIndex: number): void {
  swapTierDHandCard(session.state, TIER_D_SOLO_HUMAN_ID, cardIndex)
}

export function revealCurrentGame(session: TierDSoloSession): TierDGameResolution {
  return resolveTierDGame(session.state, session.currentGame)
}

/** เช็ค G1 < G2 < G3 สดก่อน submitArrangement จริง — submitTierDArrangement() ของ engine
 * ไม่ throw เมื่อ order ผิด (แค่บันทึกเป็น foul เงียบๆ) จุดนี้ให้ UI เตือนผู้เล่นได้ก่อนล็อกไพ่จริง */
export function isTierDArrangementLegal(session: TierDSoloSession, arrangement: TierDArrangement): boolean {
  return !isSharedArrangementFoul(arrangement, session.state.communityPiles)
}

export function undoCurrentReveal(session: TierDSoloSession, scoreSnapshot: Record<string, number>): void {
  rollbackTierDGame(session.state, session.currentGame, scoreSnapshot)
}

/** ปิด G ปัจจุบัน (รวม Combo/Super Combo) แล้วขยับไป G ถัดไป — คืน true ถ้ายังมี G เหลือใน Match นี้ */
export function commitCurrentGame(session: TierDSoloSession, random: () => number = Math.random): boolean {
  if (session.committedThrough >= session.currentGame) return session.currentGame < 3
  session.committedThrough = session.currentGame
  commitTierDCombo(session.state, random, session.currentGame)
  if (session.currentGame < 3) {
    session.currentGame = (session.currentGame + 1) as TierDGameNumber
    return true
  }
  return false
}

export type TierDSoloMatchOutcome =
  | { kind: 'next_match'; session: TierDSoloSession }
  | { kind: 'level_complete'; playerWon: boolean; rewardedItems: { item: TierDItemKey; quantity: number }[]; milestoneTokensGranted: number }

/** เรียกหลัง G3 ของ Match ถูก commit แล้ว (session.committedThrough===3) — รวมคะแนน Match นี้เข้า
 * cumulativeScores แล้วตัดสินว่าจะเดินต่อ Match ถัดไปใน Level เดียวกัน หรือจบ Level */
export function finishMatch(session: TierDSoloSession, random: () => number = Math.random): TierDSoloMatchOutcome {
  if (session.committedThrough < 3) throw new Error('Commit G3 before finishing the Match')
  for (const seat of session.state.seats) {
    session.cumulativeScores[seat.id] = (session.cumulativeScores[seat.id] ?? 0) + (session.state.scores[seat.id] ?? 0)
  }

  if (session.matchNumber < 3) {
    const nextState = freshMatchState(session.state.level, random, session.state.comboBotId)
    nextState.missionStreak = session.state.missionStreak
    const nextSession: TierDSoloSession = {
      state: nextState,
      currentGame: 1,
      matchNumber: (session.matchNumber + 1) as 1 | 2 | 3,
      cumulativeScores: session.cumulativeScores,
      items: newMatchItemState(),
      committedThrough: 0,
      levelStartedAt: session.levelStartedAt,
    }
    return { kind: 'next_match', session: nextSession }
  }

  const aiScores = session.state.seats.filter((seat) => seat.isBot).map((seat) => session.cumulativeScores[seat.id] ?? 0)
  const highestAiScore = aiScores.length ? Math.max(...aiScores) : 0
  const playerScore = session.cumulativeScores[TIER_D_SOLO_HUMAN_ID] ?? 0
  const playerWon = playerScore >= highestAiScore
  const elapsedMs = Math.max(0, Date.now() - session.levelStartedAt)
  return completeLevel(session.state.level, playerWon, elapsedMs, playerScore, random)
}

function completeLevel(level: number, playerWon: boolean, elapsedMs: number, finalScore: number, random: () => number): TierDSoloMatchOutcome {
  const store = usePlayerStore.getState()
  if (!store.profile) return { kind: 'level_complete', playerWon, rewardedItems: [], milestoneTokensGranted: 0 } // status!=='ok' — ไม่มี profile ให้เขียนลง ถือว่าจบ level แบบไม่มีผลข้างเคียงใดๆ
  store.recordTierDLevelResult({ won: playerWon, matchTimeMs: elapsedMs, matchScore: finalScore })

  // level/currentWinStreak/bestWinStreak ของจริงมาจาก applyTierDLevelOutcome() ของ engine เอง
  // (คุม Bronze exception ไว้แล้ว: level<51 ชนะก็ไม่นับ streak) ไม่คำนวณเองซ้ำที่นี่ — อ่านสดอีกรอบ
  // หลัง recordTierDLevelResult (ไม่พึ่ง snapshot เดิมที่ถืออยู่ก่อนหน้า กันพังถ้าใครเพิ่ม logic ทีหลัง)
  const prevSolo = usePlayerStore.getState().profile!.tierDSolo
  const nextProgress = applyTierDLevelOutcome(
    { level: prevSolo.level, currentWinStreak: prevSolo.currentWinStreak, bestWinStreak: prevSolo.bestWinStreak },
    playerWon
  )
  store.setTierDSoloProgress(nextProgress)

  const rewardedItems: { item: TierDItemKey; quantity: number }[] = []
  let milestoneTokensGranted = 0

  if (playerWon) {
    for (const { item, quantity } of rollRewardItems(level, random)) {
      store.grantTierDItem(item, quantity)
      rewardedItems.push({ item, quantity })
    }
    // Milestone มินต์ token ที่ 250/500 เท่านั้น — claimTierDMilestone กันแจกซ้ำเองอยู่แล้ว (คืน false ถ้าเคลมไปแล้ว)
    if (level === 250 && store.claimTierDMilestone(250, 10_000)) milestoneTokensGranted += 10_000
    if (level === 500 && store.claimTierDMilestone(500, 10_000)) milestoneTokensGranted += 10_000
  }

  return { kind: 'level_complete', playerWon, rewardedItems, milestoneTokensGranted }
}

// สร้างใหม่ตามรอยของ tierDRewardService.ts's grant_tier_d_level_random_item (ฝั่ง Supabase เดิม
// เป็น SQL stored procedure อ่าน "เลือก item ชนิดไหนยังไง" จริงๆ ไม่ได้ — โค้ดฝั่งนั้นมองไม่เห็น)
// ใช้กฎที่มีจริงแค่ 2 จุดคือ levelRewardSchedule (level นี้ได้ของไหม) กับ tierDLevelRewardPlan
// (ได้กี่ชนิด/ชนิดละกี่ชิ้น) แล้วสุ่มเลือกว่าชนิดไหนเองแบบง่ายที่สุดเท่าที่กฎที่มีอยู่จริงจะยืนยันได้
// — นี่คือการสร้างใหม่ (reconstruction) ไม่ใช่การพอร์ตของเดิม
function rollRewardItems(level: number, random: () => number): { item: TierDItemKey; quantity: number }[] {
  const schedule = levelRewardSchedule(level, random)
  if (schedule.kind === 'none') return []
  const plan = tierDLevelRewardPlan(level)
  const pool = [...TIER_D_ITEM_KEYS]
  const picked: TierDItemKey[] = []
  for (let i = 0; i < plan.baseItemTypes && pool.length > 0; i++) {
    const index = Math.floor(random() * pool.length)
    picked.push(pool.splice(index, 1)[0])
  }
  return picked.map((item) => ({ item, quantity: plan.baseQuantityPerType === '1-2' ? (random() < 0.5 ? 1 : 2) : 1 }))
}

// ─── Item ────────────────────────────────────────────────────────────────
// playerCount ใช้ 4 คงที่ (เพดานสูงสุดของ Tier D Solo) ได้จริง เพราะ itemCapabilities/
// itemUsagePolicies ที่ resolveGameRules คืนมาไม่ได้แปรผันตามค่านี้เลย (ดู engine/unifiedTierRules.ts)
const TIER_D_GAME_RULES = resolveGameRules({ tier: 'D', gameMode: 'SOLO', playerCount: 4 })

/** ใช้ item 1 ชิ้น — เช็คกฎการใช้งาน (unifiedTierRules) + สต็อกใน playerStore ก่อนหักจริง */
export function useTierDItemLocal(session: TierDSoloSession, item: TierDItemKey): { ok: boolean; reason?: string } {
  const domain = domainItem(item)
  if (!domain) return { ok: false, reason: 'Unknown item.' }
  const policyError = itemPolicyError(TIER_D_GAME_RULES, session.items, domain)
  if (policyError) return { ok: false, reason: policyError }
  if (!usePlayerStore.getState().spendTierDItem(item)) return { ok: false, reason: 'No item in stock.' }
  session.items.usage[domain] = (session.items.usage[domain] ?? 0) + 1
  return { ok: true }
}
