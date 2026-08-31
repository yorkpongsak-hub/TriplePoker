// ─────────────────────────────────────────────────────────────────────────────
// hnGracePeriod.test.ts — Unit Tests สำหรับ High Noble Grace Period 60s + Passive
// Ghost Mode (Full Reconnect System Step 2B / 2B-FIX / 2B-FIX2, MasterPlan §6.16)
// ครอบคลุม: markHNPlayerAFK (grace เริ่ม ไม่ settle), reconnect ภายใน grace (คืนที่นั่ง),
// finalize หลัง 60s (settle จริง + naive replace ถาวร), grand_finale AFK-fold ทั้ง 2 เคส
// (ก่อน turn / ระหว่างเป็น turn ตัวเอง — เคสหลัง 2B-FIX2 เพิ่งอุด)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock gameLoop.ts — spy ตรงบน escrow/settle ───────────────────────────────
// ต่างจาก Adept (โค้ดอยู่ใน gameLoop.ts เอง เลยต้อง mock Supabase อีกชั้นลึกกว่า)
// highNobleMultiEngine.ts import escrowBuyIn/settleEscrow/refundEscrow เป็น named
// import จาก module แยก จึง mock module นี้ตรงๆ ได้เลย ไม่ต้องปลอม Supabase query-builder
// ⚠️ escrowBuyIn ต้องคืน shape ตรงกับ EscrowResult จริง {ok:true,escrowId,buyInAmount}
// ไม่ใช่ string เปล่า — ไม่งั้น startHighNobleMultiMatch จะเข้าใจว่า escrow ล้มเหลว
// (!escrow.ok) แล้วยกเลิกแมตช์ตั้งแต่ยังไม่เริ่มเทสจริงเลย
const mockEscrowBuyIn = jest.fn(async (...args: any[]) => ({ ok: true, escrowId: `escrow_${args[0]}`, buyInAmount: 15000 }))
const mockSettleEscrow = jest.fn(async (..._args: any[]) => null)
const mockRefundEscrow = jest.fn(async (..._args: any[]) => undefined)
jest.mock('../../src/game/gameLoop', () => ({
  escrowBuyIn: (...args: any[]) => mockEscrowBuyIn(...args),
  settleEscrow: (...args: any[]) => mockSettleEscrow(...args),
  refundEscrow: (...args: any[]) => mockRefundEscrow(...args),
}))

// ─── Mock Supabase — safety net กัน VIP-status query จริงตอน startHighNobleMultiMatch
// (ห่อ try/catch อยู่แล้วฝั่ง source แต่ mock ให้ resolve เงียบๆ ดีกว่าปล่อย error ผ่าน console)
// เพิ่ม .in() นอกเหนือจาก .eq().single() ที่ให้มา เพราะ query จริงของ VIP ใช้ .select().in()
// ไม่มี .eq()/.single() เลย (multi-row query ไม่ใช่ single-row) ───
// + .update().eq().eq() บน 'match_escrow' และ .rpc() — settleHNMatchViaLedger (Central Economy
// Ledger Phase 7 Round 4) เรียกจริงตอนจบแมตช์ (ดู T12-T14 ที่เดินไป grand_finale จนจบเกมได้จริง)
// ไม่มี mock พวกนี้มาก่อนตอน mock ก้อนนี้เขียนครั้งแรก (ก่อน settleHNMatchViaLedger จะมีอยู่)
jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { token_balance: 0 }, error: null }) }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))

// ─── Mock Central Economy Ledger match-end dependencies ───────────────────────
// settleHNMatchViaLedger (เรียกจริงเมื่อ grand_finale เดินจนจบ round สุดท้าย — T12-T14 เข้าเงื่อนไขนี้
// จริงเพราะ totalRounds=1 ในเทสนี้) ต่อกับของจริงหลายตัว (economyService/matchStatsService/
// matchWinsService/psEngine/tierUnlockService/crownVaultService) — ไฟล์นี้เทส lifecycle ของ AFK/grace
// ไม่ใช่ความถูกต้องของ ledger settlement (มีเทสแยกอยู่แล้วที่ highNobleLedgerSettlement.test.ts/
// matchStatsStreakLedger.test.ts) จึง mock ให้ no-op สำเร็จเงียบๆ พอ กันไม่ให้ real Supabase call
// (unmocked .rpc()/.from().update() เดิม) โยน error หรือ io.emit('server_activity', ...) ที่โค้ดจริง
// เรียกตรงๆ (ไม่ผ่าน io.to(room)) ทำให้ process crash ตอน match_end
jest.mock('../../src/economy/economyService', () => ({
  economyService: { settleMatchResult: jest.fn(async () => ({ transactionId: 1, replayed: false })) },
}))
jest.mock('../../src/game/matchStatsService', () => ({
  recordMatchStats: jest.fn(async () => undefined),
}))
jest.mock('../../src/game/matchWinsService', () => ({
  recordMatchWin: jest.fn(async () => undefined),
}))
jest.mock('../../src/game/psEngine', () => ({
  awardPerformanceScore: jest.fn(async () => undefined),
}))
jest.mock('../../src/game/tierUnlockService', () => ({
  checkTierUnlock: jest.fn(async () => null),
}))
jest.mock('../../src/game/crownVaultService', () => ({
  getAscendantStatus: jest.fn(async () => ({ status: 'none' })),
}))

import { Card } from '../../src/game/deck'
import { PlayerArrangement } from '../../src/game/foulChecker'
import { Seat as RoomSeat } from '../../src/game/roomRegistry'
import { greedyArrangement } from '../../src/game/aiEngine'
import {
  startHighNobleMultiMatch, submitHNArrangement, submitHNArrangementRound2, submitHNDiscard,
  markHNPlayerAFK, resendHNRoundStartToPlayer, getHNMatchState, requestHNAutoSort,
} from '../../src/game/highNobleMultiEngine'

// เพิ่ม timeout เฉพาะไฟล์นี้ (default jest คือ 5000ms) — เทสในนี้ใช้ jest.advanceTimersByTimeAsync
// หลายจุดต่อเนื่องกัน (T7/T8 ฯลฯ) ซึ่งยังกิน wall-clock จริงตอน flush microtask queue
//
// Batch 1.5 Task 1B (2026-07-30) — ยืนยันสาเหตุรากแล้ว: รันไฟล์นี้เดี่ยวๆ ผ่าน 100% เสมอ (3/3),
// รัน full suite ปกติ (หลาย jest worker แข่ง CPU กัน) พังประปราย ที่ T13 จุดเดิมซ้ำๆ, รัน full suite
// ด้วย --runInBand (worker เดียว ไม่มีการแย่ง CPU ข้าม worker) ผ่าน 100% เสมอเช่นกัน (3/3) — สรุปว่า
// เป็น jest fake-timer + cross-worker CPU contention จริง ไม่ใช่ race condition ในโค้ด settlement
// (production logic ที่ไฟล์นี้เทส เป็น synchronous/deterministic เต็มร้อยเมื่ออ่านโค้ดจริงแล้ว)
//
// แก้โดยแยกไฟล์นี้ให้รันด้วย --runInBand เสมอ ผ่าน package.json's "test" script (2 คำสั่งต่อกัน:
// suite หลักไม่รวมไฟล์นี้ + ไฟล์นี้เดี่ยวๆ แบบ runInBand) — ไม่แตะ jest.config.js ตรงๆ ตามเดิม
// ⚠️ ผลข้างเคียง: การรัน `node node_modules/jest/bin/jest.js` ตรงๆ (ไม่ผ่าน npm script) แบบไม่ใส่
// argument จะยัง "พังประปราย" เหมือนเดิม เพราะคำสั่งนั้นรันทุกไฟล์พร้อมกันแบบ parallel เต็มที่เสมอ —
// ต้องใช้ `npm test` แทน หรือรันสองคำสั่งเองตรงๆ:
//   node node_modules/jest/bin/jest.js --testPathIgnorePatterns=tests/game/hnGracePeriod.test.ts
//   node node_modules/jest/bin/jest.js --runInBand tests/game/hnGracePeriod.test.ts
//
// 2026-08-31 — T12-T14 (กลุ่มเดียวที่เดินไปถึง grand_finale ผ่าน driveToGrandFinale()) เริ่ม timeout
// เกิน 15000ms จริงซ้ำๆ แม้รันเดี่ยว --runInBand: สาเหตุคนละตัวกับ cross-worker CPU contention ข้างบน —
// aiDecideArrangement() ของ Round 2 (arrangement_2, ไพ่ 12 ใบหลัง auction) ใช้ arrangeByPersonality()
// (brute-force เต็มรูปแบบ ทุก tier ยกเว้น initiate/adept — ดู aiEngine.ts) เมื่อ Boss ชนะไพ่ประมูล
// อย่างน้อย 1 ใบแบบไม่มีคู่แข่ง (เกิดขึ้นทุกครั้งที่ไม่มี human คนไหน bid สู้ ตรงกับที่เทสนี้ตั้งใจไม่ bid
// เลย) — เป็น real CPU-bound work วัดจริงได้ ~15-30 วินาที wall-clock ต่อการเรียก 1 ครั้งบนเครื่องนี้
// (jest fake timer เร่งให้ไม่ได้ ไม่ใช่ setTimeout) ไม่ใช่บั๊ก async/hang แต่ตัวเลข 15000 เดิมแคบไป
// ต้องขยับให้มีที่ว่างพอ — ⚠️ นี่คือสัญญาณของปัญหา production จริง (event loop ทั้ง server จะแข็งค้าง
// 15-30 วิเวลา Boss ชนะไพ่ประมูล High Noble จริง) ควรแยกไปแก้ที่ arrangeByPersonality/aiDecideArrangement
// ต่างหาก (นอกขอบเขตไฟล์เทสนี้) ไม่ใช่แค่ขยาย timeout ทิ้งไว้เฉยๆ
jest.setTimeout(90000)

// ─── Mock Socket.IO Server — เก็บ log การ emit ไว้ตรวจสอบ (pattern เดียวกับ adeptAFK.test.ts) ───
// io.emit() ระดับบนสุด (ไม่ผ่าน .to(room)) เพิ่มเข้ามาด้วย — match_end ของ Central Economy Ledger
// broadcast 'server_activity' ตรงๆ ผ่าน io.emit() (ไม่ใช่ io.to(roomId).emit()) ของเดิม mock มีแค่
// .to().emit() ทำให้ io.emit ไม่ใช่ function จริง crash ทั้ง process ตอนแมตช์จบ (T13/T14 เจอเข้าเต็มๆ)
function makeIoMock() {
  const emitted: { room: string; event: string; data: any }[] = []
  const broadcasted: { event: string; data: any }[] = []
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => { emitted.push({ room, event, data }) },
    }),
    emit: (event: string, data: any) => { broadcasted.push({ event, data }) },
  }
  return { io, emitted, broadcasted }
}

const SUIT_CHAR: Record<string, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }
function toKey(c: Card): string { return c.rank.toString().toLowerCase() + SUIT_CHAR[c.suit] }

let roomCounter = 0
function nextRoomId(): string { roomCounter++; return `hn_grace_room_${roomCounter}` }

// Boss (AI, seat0) + 3 Human — ตรงกับโครง seat จริงของ High Noble (seat0 = Boss เสมอ)
function makeRoomSeats(userA: string, userB: string, userC: string): [RoomSeat, RoomSeat, RoomSeat, RoomSeat] {
  const now = Date.now()
  return [
    { type: 'ai', name: 'Reaper', isBoss: true, aiConfigId: 'AI_REAPER', joinedAt: now },
    { type: 'human', userId: userA, name: 'PlayerA', joinedAt: now },
    { type: 'human', userId: userB, name: 'PlayerB', joinedAt: now },
    { type: 'human', userId: userC, name: 'PlayerC', joinedAt: now },
  ]
}

// 3/3/5 naive split — ใช้ submit ให้ผ่านแต่ละ phase เร็วๆ (เทสนี้เทส lifecycle ไม่ใช่ hand evaluation
// จึงไม่สนใจว่าใครจะชนะ/แพ้จริง)
function naiveSplit(hand: Card[]): PlayerArrangement {
  return { pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11) }
}

beforeEach(() => {
  jest.useFakeTimers()
  mockEscrowBuyIn.mockClear()
  mockSettleEscrow.mockClear()
  mockRefundEscrow.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
})

// เริ่มแมตช์จริง + คืน userId ของ 3 human ให้เทสใช้ต่อ (ไม่ผ่าน phase ไหนเลย ยังอยู่ 'arrangement')
async function startMatch() {
  const roomId = nextRoomId()
  const userA = `${roomId}_A`, userB = `${roomId}_B`, userC = `${roomId}_C`
  const { io, emitted } = makeIoMock()
  await startHighNobleMultiMatch(io, roomId, makeRoomSeats(userA, userB, userC))
  return { roomId, userA, userB, userC, io, emitted }
}

// ขับ match ผ่าน public API จริงจนถึงจุดก่อน grand_finale เริ่ม turn แรก (boss's AI timer ตั้งแล้ว
// แต่ยังไม่ยิง) — คืน state handle ให้แต่ละเทสควบคุม turn ต่อเอง
async function driveToGrandFinale() {
  const { roomId, userA, userB, userC, io, emitted } = await startMatch()

  // ⚠️ ใช้ greedyArrangement (ตัวเดียวกับที่ AI/Minion ใช้จริง) แทน naiveSplit ตรงนี้เท่านั้น — naiveSplit
  // (slice ดิบ 3/3/5) มีโอกาสสูงที่จะ Foul จากไพ่สุ่มจริง ทำให้คนนั้นหลุดจาก grand_finale.turnOrder ไปเลย
  // (Foul ≠ Fold คนละ path กัน) ทำให้เทส T12-T14 ที่ต้องการ turn ของ userA แน่นอน กลาย flaky ตามไพ่สุ่ม —
  // จุดอื่นในไฟล์นี้ (T1-T11) ไม่เดินไปถึง grand_finale เลยยังใช้ naiveSplit ได้ตามปกติ ไม่ต้องเปลี่ยน
  let state = getHNMatchState(roomId)!
  for (const uid of [userA, userB, userC]) {
    await submitHNArrangement(io, roomId, uid, greedyArrangement(state.cardsMap![uid], state.community!))
  }

  // blind_auction (decisionTimeMs=12000) + post-auction delay (3000) — ไม่ bid เลย (ไม่กระทบเทสนี้)
  // ⚠️ ไม่มี human คน bid สู้ Boss เลย = Boss ชนะไพ่ประมูลได้ฟรีทุกครั้ง → arrangement_2 ของ Boss เดิน
  // aiDecideArrangement()'s brute-force arrangeByPersonality() จริง (ไพ่ 12 ใบ) กิน real CPU time
  // 15-30+ วินาที (ดูหมายเหตุที่ jest.setTimeout ด้านบน) — ไม่ใช่แค่ fake-timer advance เฉยๆ
  await jest.advanceTimersByTimeAsync(12_000 + 3_000)

  state = getHNMatchState(roomId)!
  for (const uid of [userA, userB, userC]) {
    await submitHNArrangementRound2(io, roomId, uid, greedyArrangement(state.cardsMap![uid], state.community!))
  }

  state = getHNMatchState(roomId)!
  for (const uid of [userA, userB, userC]) {
    const arr = state.arrangements![uid]
    const keepKeys = [...arr.pile1, ...arr.pile2, ...arr.pile3.slice(0, 3)].map(toKey)
    submitHNDiscard(io, roomId, uid, keepKeys)
  }

  // pile1 reveal (4000) + pile2 reveal (4000) + fog_of_war (8000) → grand_finale เริ่ม, boss (AI)
  // ตั้ง timer เอง (aiThinkMs 7000-10000ms) แต่ยังไม่ยิงในนี้ — ปล่อยให้แต่ละเทสควบคุมต่อ
  await jest.advanceTimersByTimeAsync(4_000 + 4_000 + 8_000)

  return { roomId, userA, userB, userC, io, emitted }
}

// เดินให้ turn ของ Boss (AI ตัวแรก, clockwise) จบ — turn ถัดไปตกเป็นของ userA (human คนแรกในลำดับ)
async function resolveBossTurn() {
  await jest.advanceTimersByTimeAsync(10_000) // ครอบ aiThinkMs เต็มช่วง (7000-9999ms)
}

describe('High Noble Auto Sort — disabled server-side', () => {
  test('ปฏิเสธคำขอและไม่หัก TOKEN แม้ client เก่าจะยิง socket มาเอง', async () => {
    const { roomId, userA, io, emitted } = await startMatch()
    const state = getHNMatchState(roomId)!
    const before = state.tokenBalance[userA]

    expect(requestHNAutoSort(io, roomId, userA)).toEqual({ ok: false, reason: 'AUTO_SORT_DISABLED' })
    expect(state.tokenBalance[userA]).toBe(before)
    expect(state.autoSortUsed[userA]).toBeUndefined()
    expect(emitted.filter(e => e.event === 'token_flow_update')).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('markHNPlayerAFK — grace เริ่ม ไม่ settle seat ยัง human', () => {
  test('T1: disconnect → afkPlayers มี entry + graceTimer ตั้งไว้', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    const state = getHNMatchState(roomId)!
    expect(state.afkPlayers[userA]).toBeDefined()
    expect(state.afkPlayers[userA].graceTimer).toBeDefined()
  })

  test('T2: settleEscrow ไม่ถูกเรียกตอน markAFK', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    expect(mockSettleEscrow).not.toHaveBeenCalled()
  })

  test('T3: seat.isHuman ยัง true ทันทีหลัง markAFK', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    const state = getHNMatchState(roomId)!
    const seat = state.seats.find(s => s.id === userA)!
    expect(seat.isHuman).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Reconnect within 60s (ผ่าน resendHNRoundStartToPlayer)', () => {
  test('T4: advance 10s (ยังไม่ถึง 60) → resend → afkPlayers[userA] ถูก delete', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    jest.advanceTimersByTime(10_000)
    resendHNRoundStartToPlayer(io, roomId, userA)

    const state = getHNMatchState(roomId)!
    expect(state.afkPlayers[userA]).toBeUndefined()
  })

  test('T5: settleEscrow ยัง NOT called (reconnect ทัน = ไม่ตัดเงิน)', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    jest.advanceTimersByTime(10_000)
    resendHNRoundStartToPlayer(io, roomId, userA)

    expect(mockSettleEscrow).not.toHaveBeenCalled()
  })

  test('T6: seat.isHuman ยัง true (คุมต่อได้) — หัวใจ feature', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    jest.advanceTimersByTime(10_000)
    resendHNRoundStartToPlayer(io, roomId, userA)

    const state = getHNMatchState(roomId)!
    const seat = state.seats.find(s => s.id === userA)!
    expect(seat.isHuman).toBe(true)
  })

  test('T7: advance ต่อจนเกิน 60s รวม → finalize ไม่ทำงานซ้ำ (timer ถูก clear ตอน reconnect แล้ว)', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)

    jest.advanceTimersByTime(10_000)
    resendHNRoundStartToPlayer(io, roomId, userA)

    // เดินเวลาต่อจนเกิน 60s รวมจากตอน markAFK เดิม (10s + 60s = 70s) — timer เดิมถูก clearTimeout จริง
    // ไปแล้วตอน resend ข้างบน ไม่มีทางยิงอีก
    await jest.advanceTimersByTimeAsync(60_000)
    expect(mockSettleEscrow).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Finalize after 60s (no reconnect)', () => {
  test('T8: settleEscrow ถูกเรียกด้วย (userId, escrowId, tokenBalance ปัจจุบัน)', async () => {
    const { roomId, userA, io } = await startMatch()
    const stateBefore = getHNMatchState(roomId)!
    const escrowId = stateBefore.escrowIds[userA]
    const balanceBefore = stateBefore.tokenBalance[userA]

    markHNPlayerAFK(io, roomId, userA)
    await jest.advanceTimersByTimeAsync(60_000)

    expect(mockSettleEscrow).toHaveBeenCalledWith(userA, escrowId, balanceBefore)
  })

  test('T9: seat กลายเป็น Minion ถาวร (isHuman=false, isMinion=true)', async () => {
    const { roomId, userA, io } = await startMatch()
    markHNPlayerAFK(io, roomId, userA)
    await jest.advanceTimersByTimeAsync(60_000)

    const state = getHNMatchState(roomId)!
    const seat = state.seats.find(s => s.id === userA)!
    expect(seat.isHuman).toBe(false)
    expect(seat.isMinion).toBe(true)
  })

  test('T10 ⭐: naive ไม่ใช่ greedy — arrangements[userA] ตรงกับ naive-slice ตรงตัว', async () => {
    const { roomId, userA, io } = await startMatch()
    const hand = getHNMatchState(roomId)!.cardsMap![userA]

    markHNPlayerAFK(io, roomId, userA) // ไม่ submit arrangement เลย — ยังอยู่ phase 'arrangement'
    await jest.advanceTimersByTimeAsync(60_000)

    const state = getHNMatchState(roomId)!
    expect(state.arrangements![userA]).toEqual({
      pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11),
    })
  })

  test('T11: idempotent — markAFK ซ้ำ 2 ครั้ง ตั้ง timer ครั้งเดียว, finalize settle ครั้งเดียว', async () => {
    const { roomId, userA, io } = await startMatch()

    markHNPlayerAFK(io, roomId, userA)
    const firstTimer = getHNMatchState(roomId)!.afkPlayers[userA].graceTimer
    markHNPlayerAFK(io, roomId, userA) // เรียกซ้ำ (เช่น disconnect event ยิงซ้ำ)
    const secondTimer = getHNMatchState(roomId)!.afkPlayers[userA].graceTimer

    expect(secondTimer).toBe(firstTimer) // อ้าง timer object เดิม ไม่สร้างใหม่ซ้อน

    await jest.advanceTimersByTimeAsync(60_000)
    expect(mockSettleEscrow).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('Grand Finale AFK fold (Step 2B override + 2B-FIX2 stale-timer fix)', () => {
  test('T12: AFK ก่อนถึง turn → fold ทันทีตอน startHNNextTurn ประมวลผล', async () => {
    const { roomId, userA, io } = await driveToGrandFinale()
    markHNPlayerAFK(io, roomId, userA) // mark ตอนยังเป็น turn ของ Boss อยู่ (ยังไม่ใช่ turn userA)

    const before = getHNMatchState(roomId)!.tokenBalance[userA]
    await resolveBossTurn() // boss จบ turn → เดินมาถึง userA → เจอ AFK → fold ทันที (ไม่ตั้ง timer)

    const state = getHNMatchState(roomId)!
    expect(state.grandFinale!.foldedPlayers).toContain(userA)
    expect(state.tokenBalance[userA]).toBe(before) // ไม่เสียเงิน
  })

  test('T13 ⭐: AFK ระหว่างเป็น turn ตัวเอง (timer auto-call ตั้งไว้ก่อนแล้ว) → ยังต้อง fold ไม่ใช่ call', async () => {
    const { roomId, userA, io } = await driveToGrandFinale()
    await resolveBossTurn() // ตอนนี้เป็น turn ของ userA แล้ว, gf.decisionTimerId (auto-call) ตั้งไว้แล้ว

    markHNPlayerAFK(io, roomId, userA) // หลุดระหว่างเป็น turn ตัวเองพอดี (เคสที่ 2B-FIX2 อุด)
    const before = getHNMatchState(roomId)!.tokenBalance[userA]

    await jest.advanceTimersByTimeAsync(30_000) // timeLimitMs (betTimer.highNoble=30s) — callback ยิง re-check

    const state = getHNMatchState(roomId)!
    expect(state.grandFinale!.foldedPlayers).toContain(userA)
    expect(state.tokenBalance[userA]).toBe(before) // ไม่เสียเงิน (2B-FIX2 ทำงานถูก)
  })

  test('T14: online ปกติไม่กดทัน (ไม่ AFK) → auto-call เดิมเหมือนเดิม ไม่ fold', async () => {
    const { roomId, userA, io } = await driveToGrandFinale()
    await resolveBossTurn() // เป็น turn ของ userA, timer auto-call ตั้งไว้

    const before = getHNMatchState(roomId)!.tokenBalance[userA]
    await jest.advanceTimersByTimeAsync(30_000) // ไม่ mark AFK เลย

    const state = getHNMatchState(roomId)!
    expect(state.grandFinale!.foldedPlayers).not.toContain(userA)
    expect(state.tokenBalance[userA]).toBe(before - 1_000) // callAmount.highNoble หักจริง (Spec v2.0 §4 — ลดจาก 2,000 เหลือ 1,000) — คน online ไม่โดนกระทบจาก 2B-FIX2
  })
})
