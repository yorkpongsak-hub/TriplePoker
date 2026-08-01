// ─────────────────────────────────────────────────────────────────────────────
// monarchEngine.test.ts — Batch 1.5 Task 5: Boundary tests สำหรับ settlement
// (netDelta > 0 ตัดสิน badge + Pot×2 — Canon 2026-07-30) + Task 5 foul-guarantee
// ทดสอบ settleMonarchMatch/resolveMonarchBossTurn/resolveG1 ตรงๆ ด้วย MonarchMatchState
// ที่สร้างมือ (ไม่ผ่านการแจกไพ่จริง — ฟังก์ชันเหล่านี้ไม่ตรวจ deck uniqueness เอง จึงสร้าง
// การ์ดซ้ำข้าม seat ได้อย่างปลอดภัยสำหรับเทสระดับนี้)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

const mockSettleEscrow = jest.fn(async (..._args: any[]) => 99999)
const mockEscrowBuyIn = jest.fn(async (...args: any[]) => ({ ok: true, escrowId: `escrow_${args[0]}`, buyInAmount: 30000 }))
jest.mock('../../src/game/gameLoop', () => ({
  escrowBuyIn: (...args: any[]) => mockEscrowBuyIn(...args),
  settleEscrow: (...args: any[]) => mockSettleEscrow(...args),
}))

const mockRecordMonarchVictory = jest.fn(async (..._args: any[]) => undefined)
const mockRecordMonarchEncounter = jest.fn(async (..._args: any[]) => undefined)
jest.mock('../../src/game/monarchSpawn', () => ({
  recordMonarchVictory: (...args: any[]) => mockRecordMonarchVictory(...args),
  recordMonarchEncounter: (...args: any[]) => mockRecordMonarchEncounter(...args),
  rollAndRecordMonarchRelic: async () => null,
}))

const mockRecordMatchStats = jest.fn(async (..._args: any[]) => undefined)
const mockRecordBossResult = jest.fn(async (input: any) => {
  await mockRecordMonarchEncounter(input.userId)
  if (input.won) await mockRecordMonarchVictory(input.userId)
})
jest.mock('../../src/game/matchStatsService', () => ({
  recordMatchStats: (...args: any[]) => mockRecordMatchStats(...args),
}))
jest.mock('../../src/game/bossStatsService', () => ({
  recordBossResult: (input: any) => mockRecordBossResult(input),
}))

import { Card } from '../../src/game/deck'
import { PlayerArrangement } from '../../src/game/foulChecker'
import {
  MonarchSeat, MonarchMatchState, settleMonarchMatch, resolveMonarchBossTurn, resolveG1,
  startMonarchMatch, startMonarchRound, submitMonarchArrangement, submitMonarchGrandFinaleAction,
  settleAndEndMonarchMatch, getMonarchMatchState, clearMonarchDisconnectState,
} from '../../src/game/monarchEngine'

const HUMAN = 'u_human'
const BOSS = 'MONARCH_BOSS'
const MINION1 = 'MONARCH_MINION_1'
const MINION2 = 'MONARCH_MINION_2'

function c(rank: Card['rank'], suit: Card['suit']): Card {
  const VALUE: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 }
  return { rank, suit, value: VALUE[rank] }
}

function makeIoMock() {
  const emitted: { room: string; event: string; data: any }[] = []
  const io: any = {
    to: (room: string) => ({ emit: (event: string, data: any) => { emitted.push({ room, event, data }) } }),
    emit: (event: string, data: any) => { emitted.push({ room: '*', event, data }) },
  }
  return { io, emitted }
}

function makeSeats(): [MonarchSeat, MonarchSeat, MonarchSeat, MonarchSeat] {
  return [
    { id: HUMAN, role: 'human', isHuman: true, name: 'PlayerA', emoji: '🧑', hasRealStake: true },
    { id: MINION1, role: 'minion1', isHuman: false, name: 'Minion1', emoji: '🤖', personality: 'sage', hasRealStake: false },
    { id: MINION2, role: 'minion2', isHuman: false, name: 'Minion2', emoji: '🤖', personality: 'reckless', hasRealStake: false },
    { id: BOSS, role: 'boss', isHuman: false, name: 'Monarch', emoji: '👑', personality: 'cortex', hasRealStake: true },
  ]
}

// ── ชุดเทส 1: settleMonarchMatch — badge/Pot×2 ตัดสินด้วย netDelta > 0 ล้วน ──────────────
describe('settleMonarchMatch — netDelta > 0 ตัดสิน badge + Pot×2 (Canon 2026-07-30)', () => {
  const BUY_IN = 30000

  function makeState(finalTokenBalance: number): MonarchMatchState {
    return {
      roomId: 'room1',
      seats: makeSeats(),
      humanUserId: HUMAN,
      buyInAmount: BUY_IN,
      escrowId: 'escrow_1',
      tokenBalance: { [HUMAN]: finalTokenBalance },
      phase: 'grand_finale',
      submittedArrangement: new Set(),
    }
  }

  beforeEach(() => {
    mockSettleEscrow.mockClear()
    mockRecordMonarchVictory.mockClear()
    mockRecordMonarchEncounter.mockClear()
    mockRecordMatchStats.mockClear()
    mockRecordBossResult.mockClear()
  })

  test('net +1 → badge + Pot×2 (potMultiplier=2.0 จาก gameConfig จริง)', async () => {
    const { io } = makeIoMock()
    const state = makeState(BUY_IN + 1) // netDelta = +1
    await settleMonarchMatch(io, state)

    expect(mockRecordMonarchVictory).toHaveBeenCalledWith(HUMAN)
    expect(mockRecordMonarchEncounter).toHaveBeenCalledWith(HUMAN)
    expect(mockRecordMatchStats).toHaveBeenCalledWith([expect.objectContaining({ userId: HUMAN, won: true })])
    expect(mockRecordBossResult).toHaveBeenCalledWith(expect.objectContaining({ userId: HUMAN, bossId: 'monarch', won: true }))
    // payout = netDelta(1) * potMultiplier(2.0) = 2 → finalStack = buyIn + 2
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN + 2)
  })

  test('net 0 (เสมอพอดี) → ไม่ได้ badge ไม่ได้ Pot×2', async () => {
    const { io } = makeIoMock()
    const state = makeState(BUY_IN) // netDelta = 0
    await settleMonarchMatch(io, state)

    expect(mockRecordMonarchVictory).not.toHaveBeenCalled()
    expect(mockRecordMonarchEncounter).toHaveBeenCalledWith(HUMAN) // encounter นับทุกกรณี
    expect(mockRecordMatchStats).toHaveBeenCalledWith([expect.objectContaining({ userId: HUMAN, won: false })])
    expect(mockRecordBossResult).toHaveBeenCalledWith(expect.objectContaining({ userId: HUMAN, bossId: 'monarch', won: false }))
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN) // payout = 0
  })

  test('net -1 → ไม่ได้ badge ไม่ได้ Pot×2 (ไม่คูณผลลบให้แย่ลง)', async () => {
    const { io } = makeIoMock()
    const state = makeState(BUY_IN - 1) // netDelta = -1
    await settleMonarchMatch(io, state)

    expect(mockRecordMonarchVictory).not.toHaveBeenCalled()
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN - 1) // payout = -1 เดิม ไม่คูณ
  })

  test('⭐ ชนะ G1+G2 แพ้ G3 แต่ net รวมยังบวก → ได้ badge + Pot×2 (ไม่สนใจว่าใครชนะ G3)', async () => {
    // จำลองผลลัพธ์: G1 ชนะ (+500), G2 ชนะ (+1000), G3 แพ้ (-800) → net = +700 ยังบวก
    // settleMonarchMatch ไม่รู้/ไม่สนใจเลยว่าใครชนะกองไหน อ่านแค่ tokenBalance สุดท้าย — พิสูจน์ว่า
    // ไม่ได้แอบอิง g3Winner ที่ไหนเข้ามาแทรกอีกแล้วจริงๆ (นี่คือประเด็นสำคัญสุดของ Canon 2026-07-30)
    const netDelta = 500 + 1000 - 800 // = 700
    const { io } = makeIoMock()
    const state = makeState(BUY_IN + netDelta)
    state.g3Winner = BOSS // g3Winner เป็น Boss (มนุษย์แพ้ G3) แต่ net ยังบวก — ต้องไม่กระทบผลลัพธ์
    await settleMonarchMatch(io, state)

    expect(mockRecordMonarchVictory).toHaveBeenCalledWith(HUMAN)
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN + netDelta * 2)
  })

  test('ชนะ G3 (g3Winner=human) แต่ net รวมติดลบ → ไม่ได้ badge ไม่ได้ Pot×2', async () => {
    const { io } = makeIoMock()
    const state = makeState(BUY_IN - 2000) // netDelta = -2000 ทั้งที่ชนะ G3
    state.g3Winner = HUMAN
    await settleMonarchMatch(io, state)

    expect(mockRecordMonarchVictory).not.toHaveBeenCalled()
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN - 2000)
  })

  test('Pot×2 apply ครั้งเดียวเท่านั้น (ไม่ double-count)', async () => {
    const { io } = makeIoMock()
    const state = makeState(BUY_IN + 1000)
    await settleMonarchMatch(io, state)

    // ถ้า apply ซ้ำ (bug) payout จะกลายเป็น 1000*2*2=4000 ไม่ใช่ 1000*2=2000
    expect(mockSettleEscrow).toHaveBeenCalledWith(HUMAN, 'escrow_1', BUY_IN + 2000)
    expect(mockSettleEscrow).toHaveBeenCalledTimes(1)
  })
})

// ── ชุดเทส 2: Foul → แพ้ทันที ไม่ว่ากองอื่นเป็นอย่างไร (Batch 1 Task 6 guarantee) ──────────
describe('Foul → แพ้เสมอ ไม่ว่ากองอื่น/ไพ่จริงจะแรงแค่ไหน', () => {
  beforeEach(() => {
    mockSettleEscrow.mockClear()
    mockRecordMonarchVictory.mockClear()
    mockRecordMonarchEncounter.mockClear()
  })

  test('resolveG1: human foul (G1 แรงสุดจริง แต่ foul) → ไม่มีทางเป็น g1Winner', () => {
    // resolveG1 คำนวณ foulMap/g1Winner แบบ synchronous ทั้งหมดก่อนถึง `await delay(4000)` (เทียบ resolveG2
    // ต่อ) — ใช้ fake timer เฉพาะเทสนี้กัน setTimeout(4000) จริงค้างเป็น open handle หลังเทสจบ (ไม่ต้อง
    // advance เลยเพราะ assertion ที่สนใจเกิดขึ้นก่อนถึง await delay ทั้งหมดอยู่แล้ว)
    jest.useFakeTimers()
    const commA = [c('A', 'clubs'), c('K', 'spades')]
    const commB = [c('7', 'spades'), c('8', 'hearts')]

    // Human: G1 = four-of-a-kind Aces (แรงสุดในโต๊ะ) แต่ G2 อ่อนกว่า G1 → foul (G1>G2)
    const humanArr: PlayerArrangement = {
      pile1: [c('A', 'spades'), c('A', 'hearts'), c('A', 'diamonds')], // + commA(A,K) = four aces
      pile2: [c('2', 'spades'), c('3', 'hearts'), c('4', 'diamonds')], // + commB(7,8) = high card
      pile3: [c('9', 'clubs'), c('9', 'diamonds'), c('5', 'spades'), c('6', 'hearts'), c('2', 'clubs')], // pair nines (>= G2 high card)
    }
    // Boss/Minion: G1 อ่อน (high card) < G2 (pair) < G3 (two pair) — ไม่ foul
    const weakArr: PlayerArrangement = {
      pile1: [c('2', 'diamonds'), c('5', 'clubs'), c('7', 'diamonds')], // + commA(A,K) = high card A
      pile2: [c('9', 'clubs'), c('9', 'hearts'), c('2', 'hearts')], // + commB(7,8) = pair nines
      pile3: [c('K', 'clubs'), c('K', 'diamonds'), c('3', 'spades'), c('3', 'hearts'), c('4', 'diamonds')], // two pair K/3
    }

    const state: MonarchMatchState = {
      roomId: 'room2',
      seats: makeSeats(),
      humanUserId: HUMAN,
      buyInAmount: 30000,
      escrowId: 'escrow_2',
      tokenBalance: { [HUMAN]: 30000, [MINION1]: 30000, [MINION2]: 30000, [BOSS]: 30000 },
      phase: 'g1_reveal',
      community: { commA, commB },
      cardsMap: {},
      arrangements: { [HUMAN]: humanArr, [MINION1]: weakArr, [MINION2]: weakArr, [BOSS]: weakArr },
      foulMap: {},
      foulReasons: {},
      submittedArrangement: new Set([HUMAN, MINION1, MINION2, BOSS]),
    }

    const { io } = makeIoMock()
    void resolveG1(io, state) // ไม่ await — ดูเหตุผลใน comment ด้านบน

    expect(state.foulMap![HUMAN]).toBe(true) // ยืนยันว่า foul ถูกตรวจจับจริง (ไม่ใช่เทสที่ไม่มีความหมาย)
    expect(state.g1Winner).not.toBe(HUMAN) // แม้ G1 แรงสุดจริง (four aces) ก็ยังแพ้เพราะ foul
    // ผู้ชนะจริงคือคนที่ไม่ foul (minion1/minion2/boss ไพ่เท่ากันหมดโดยตั้งใจ — ตัวไหนชนะ tie ไม่ใช่
    // ประเด็นที่เทสนี้สนใจ แค่ต้องไม่ใช่ human ที่ foul)
    expect([MINION1, MINION2, BOSS]).toContain(state.g1Winner)
    jest.useRealTimers() // ทิ้ง fake timer ที่ยังค้างอยู่ (setTimeout 4000ms ที่ไม่มีทางถูกเรียกจริง)
  })

  test('resolveMonarchBossTurn: human foul + G3 แรงกว่า Boss จริง → Boss ชนะเสมอ (ไม่เทียบไพ่เลย)', async () => {
    const commA = [c('2', 'spades'), c('3', 'hearts')]
    const commB = [c('4', 'spades'), c('5', 'hearts')]
    // Human G3 = four-of-a-kind (แรงกว่า Boss มาก) — แต่ foulMap บังคับให้แพ้อยู่แล้วโดยไม่ต้องเทียบ
    const humanArr: PlayerArrangement = {
      pile1: [c('6', 'clubs'), c('7', 'clubs'), c('8', 'clubs')],
      pile2: [c('9', 'diamonds'), c('10', 'diamonds'), c('J', 'diamonds')],
      pile3: [c('K', 'spades'), c('K', 'hearts'), c('K', 'diamonds'), c('K', 'clubs'), c('2', 'clubs')], // four kings
    }
    const bossArr: PlayerArrangement = {
      pile1: [c('6', 'hearts'), c('7', 'hearts'), c('8', 'hearts')],
      pile2: [c('9', 'clubs'), c('10', 'clubs'), c('J', 'clubs')],
      pile3: [c('2', 'diamonds'), c('5', 'clubs'), c('7', 'spades'), c('9', 'hearts'), c('Q', 'clubs')], // high card queen (อ่อนมาก)
    }

    const state: MonarchMatchState = {
      roomId: 'room3',
      seats: makeSeats(),
      humanUserId: HUMAN,
      buyInAmount: 30000,
      escrowId: 'escrow_3',
      tokenBalance: { [HUMAN]: 29000, [MINION1]: 30000, [MINION2]: 30000, [BOSS]: 29000 },
      phase: 'grand_finale',
      community: { commA, commB },
      cardsMap: {},
      arrangements: { [HUMAN]: humanArr, [MINION1]: bossArr, [MINION2]: bossArr, [BOSS]: bossArr },
      foulMap: { [HUMAN]: true, [MINION1]: false, [MINION2]: false, [BOSS]: false }, // ⚠️ human foul
      foulReasons: { [HUMAN]: 'G1 cannot be stronger than G2' },
      submittedArrangement: new Set([HUMAN, MINION1, MINION2, BOSS]),
      grandFinale: { foldedPlayers: [MINION1, MINION2], pot: 3000, turn: 'boss' },
    }

    const { io } = makeIoMock()
    await resolveMonarchBossTurn(io, state)

    expect(state.g3Winner).toBe(BOSS) // Boss ชนะเสมอเพราะ human foul — ไม่ใช่เพราะไพ่ Boss แรงกว่า (จริงๆ อ่อนกว่ามาก)
    expect(mockRecordMonarchVictory).not.toHaveBeenCalled() // human ไม่ได้ badge แน่นอน
  })
})

// ── ชุดเทส 3: settleAndEndMonarchMatch — Disconnect resolution (Batch 1.5 Task 6) ──────────
// ขับ engine จริงผ่าน public API (startMonarchMatch/startMonarchRound/submitMonarchArrangement/
// submitMonarchGrandFinaleAction) ด้วย fake timers — ต่างจากชุดเทส 1/2 ที่สร้าง state มือ เพราะ
// settleAndEndMonarchMatch อ่าน state จาก map ภายในไฟล์เอง (ไม่รับ state เป็น parameter ตรงๆ)
describe('settleAndEndMonarchMatch — disconnect resolution (มติ commit-based 2026-07-30)', () => {
  let roomCounter = 0
  function nextRoomId(): string { roomCounter++; return `monarch_disc_room_${roomCounter}` }

  const SUIT_CHAR: Record<string, string> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }
  function toKeys(cards: Card[]): string[] { return cards.map(cc => cc.rank.toLowerCase() + SUIT_CHAR[cc.suit]) }

  beforeEach(() => {
    jest.useFakeTimers()
    mockSettleEscrow.mockClear()
    mockEscrowBuyIn.mockClear()
    mockRecordMonarchVictory.mockClear()
    mockRecordMonarchEncounter.mockClear()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  async function startMatch() {
    const roomId = nextRoomId()
    const humanUserId = `${roomId}_human`
    const { io, emitted } = makeIoMock()
    await startMonarchMatch(io, roomId, humanUserId, 'PlayerA')
    startMonarchRound(io, roomId)
    return { roomId, humanUserId, io, emitted }
  }

  test('ก่อน seal (phase=arrangement) → settle ทันทีด้วย tokenBalance ดิบ ไม่ resolve อะไร ไม่ได้ badge', async () => {
    const { roomId, humanUserId, io } = await startMatch()
    await settleAndEndMonarchMatch(io, roomId)

    expect(mockRecordMonarchEncounter).toHaveBeenCalledWith(humanUserId)
    expect(mockRecordMonarchVictory).not.toHaveBeenCalled()
    expect(mockSettleEscrow).toHaveBeenCalledWith(humanUserId, expect.any(String), 30000) // buy-in เต็ม ไม่มีเดิมพันเกิดขึ้นเลย
    expect(getMonarchMatchState(roomId)).toBeUndefined() // ลบ state ออกจาก memory แล้ว
  })

  test('หลัง seal แต่ยังไม่ถึง Grand Finale (g1_reveal) → resolve จนจบเอง ห้าม freeze', async () => {
    const { roomId, humanUserId, io } = await startMatch()
    const state = getMonarchMatchState(roomId)!
    const keys = toKeys(state.cardsMap![humanUserId])
    const result = submitMonarchArrangement(io, roomId, humanUserId, {
      g1: keys.slice(0, 3), g2: keys.slice(3, 6), g3: keys.slice(6, 11),
    })
    expect(result.ok).toBe(true) // ต้อง submit สำเร็จเสมอไม่ว่า foul หรือไม่ (Batch 1 Task 6)
    expect(getMonarchMatchState(roomId)!.phase).toBe('g1_reveal') // resolveG1 ทำงานแล้ว (synchronous ก่อนถึง delay)

    await settleAndEndMonarchMatch(io, roomId) // disconnect ระหว่าง g1_reveal (ยังไม่ถึง Grand Finale)
    expect(getMonarchMatchState(roomId)!.humanDisconnected).toBe(true)
    expect(mockSettleEscrow).not.toHaveBeenCalled() // ยังไม่จบทันที (ต่างจาก bug เดิมที่ freeze/settle ดิบทันที)

    // ปล่อย chain อัตโนมัติวิ่งต่อ: resolveG1's delay(4s) → resolveG2 → delay(4s) → startMonarchGrandFinale
    // → เจอ humanDisconnected=true → auto-fold → finalizeMonarchG3 → settleMonarchMatch
    await jest.advanceTimersByTimeAsync(4_000 + 4_000)

    expect(mockSettleEscrow).toHaveBeenCalledTimes(1) // จบจริงแล้ว ไม่ freeze
    expect(getMonarchMatchState(roomId)).toBeUndefined()
  })

  test('Grand Finale — human กด Call ไปแล้ว (turn=boss) แล้วหลุด → Boss ตัดสินใจแทนตามไพ่ผนึกจริง', async () => {
    const { roomId, humanUserId, io } = await startMatch()
    const state = getMonarchMatchState(roomId)!
    const keys = toKeys(state.cardsMap![humanUserId])
    submitMonarchArrangement(io, roomId, humanUserId, { g1: keys.slice(0, 3), g2: keys.slice(3, 6), g3: keys.slice(6, 11) })
    await jest.advanceTimersByTimeAsync(4_000 + 4_000) // g1_reveal → g2_reveal → grand_finale (turn=human)

    expect(getMonarchMatchState(roomId)!.phase).toBe('grand_finale')
    const callResult = submitMonarchGrandFinaleAction(io, roomId, humanUserId, 'call', keys.slice(6, 9))
    expect(callResult.ok).toBe(true)
    expect(getMonarchMatchState(roomId)!.grandFinale!.turn).toBe('boss') // commit ไปแล้ว (มติ commit-based)

    await settleAndEndMonarchMatch(io, roomId) // disconnect หลังกด Call
    expect(mockSettleEscrow).not.toHaveBeenCalled() // ยังไม่จบ รอ boss's 2.5s decision timer เดิม

    await jest.advanceTimersByTimeAsync(5_000) // ครอบคลุม boss decision + delayed showdown กรณี Call
    expect(mockSettleEscrow).toHaveBeenCalledTimes(1) // จบจริงแล้ว ไม่ freeze
  })

  test('Batch 3E — Grand Finale, human ยังไม่กด Call/Fold (turn=human) แล้วหลุด → grace 20s ก่อน default Fold', async () => {
    const { roomId, humanUserId, io } = await startMatch()
    const state = getMonarchMatchState(roomId)!
    const keys = toKeys(state.cardsMap![humanUserId])
    submitMonarchArrangement(io, roomId, humanUserId, { g1: keys.slice(0, 3), g2: keys.slice(3, 6), g3: keys.slice(6, 11) })
    await jest.advanceTimersByTimeAsync(4_000 + 4_000)

    expect(getMonarchMatchState(roomId)!.grandFinale!.turn).toBe('human') // ยังไม่ได้กด Call/Fold เลย

    await settleAndEndMonarchMatch(io, roomId) // disconnect ก่อนกดอะไรเลย

    // Batch 3E: ไม่ fold ทันทีอีกต่อไป — grace 20s ก่อน (แยก grace ออกจาก resolve)
    expect(getMonarchMatchState(roomId)).toBeDefined() // ยังไม่จบ ระหว่าง grace
    expect(getMonarchMatchState(roomId)!.graceTimer).toBeDefined()
    expect(mockSettleEscrow).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(20_000) // หมด grace ไม่กลับมา → default Fold ตามเดิม

    expect(mockSettleEscrow).toHaveBeenCalledTimes(1)
    expect(mockSettleEscrow.mock.calls[0][0]).toBe(humanUserId)
  })

  test('Batch 3E — Grand Finale grace: reconnect ภายใน 20s → ยกเลิก grace เล่นต่อได้ปกติ ไม่ auto-fold', async () => {
    const { roomId, humanUserId, io } = await startMatch()
    const state = getMonarchMatchState(roomId)!
    const keys = toKeys(state.cardsMap![humanUserId])
    submitMonarchArrangement(io, roomId, humanUserId, { g1: keys.slice(0, 3), g2: keys.slice(3, 6), g3: keys.slice(6, 11) })
    await jest.advanceTimersByTimeAsync(4_000 + 4_000)

    await settleAndEndMonarchMatch(io, roomId) // disconnect ก่อนกดอะไรเลย
    expect(getMonarchMatchState(roomId)!.graceTimer).toBeDefined()

    await jest.advanceTimersByTimeAsync(10_000) // reconnect ทันใน grace (ยังไม่ถึง 20s)
    clearMonarchDisconnectState(roomId, humanUserId) // monarch_join เรียกจุดนี้ตอน reconnect (Task 4)

    expect(getMonarchMatchState(roomId)!.graceTimer).toBeUndefined()
    expect(getMonarchMatchState(roomId)!.grandFinale!.turn).toBe('human') // ยังไม่ถูก fold เลย เล่นต่อได้

    await jest.advanceTimersByTimeAsync(20_000) // เวลาผ่านไปเกิน 20s เดิมแล้ว แต่ timer ถูกยกเลิกไปแล้ว
    expect(mockSettleEscrow).not.toHaveBeenCalled() // ไม่ถูก auto-fold ทั้งที่กลับมาแล้ว

    const callResult = submitMonarchGrandFinaleAction(io, roomId, humanUserId, 'call', keys.slice(6, 9)) // เล่นต่อได้จริง
    expect(callResult.ok).toBe(true)
  })

  test('Grand Finale two rounds: R1 reveals 3; R2 reveals 4 then settles', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
    const { roomId, humanUserId, io, emitted } = await startMatch()
    const state = getMonarchMatchState(roomId)!
    const keys = toKeys(state.cardsMap![humanUserId])
    submitMonarchArrangement(io, roomId, humanUserId, {
      g1: keys.slice(0, 3), g2: keys.slice(3, 6), g3: keys.slice(6, 11),
    })
    await jest.advanceTimersByTimeAsync(8_000)
    const live = getMonarchMatchState(roomId)!
    live.foulMap![humanUserId] = false
    live.seats.find(s => s.role === 'boss')!.personality = 'reaper'

    expect(submitMonarchGrandFinaleAction(io, roomId, humanUserId, 'call').ok).toBe(false)
    const selectedRevealKeys = [keys[10], keys[8], keys[6]]
    expect(submitMonarchGrandFinaleAction(io, roomId, humanUserId, 'call', selectedRevealKeys).ok).toBe(true)
    await jest.advanceTimersByTimeAsync(2_500)
    expect(live.grandFinale!.round).toBe(2)
    expect(live.grandFinale!.revealedCount).toBe(3)
    expect(live.grandFinale!.turn).toBe('human')
    const round1 = emitted.filter(e => e.event === 'monarch_grand_finale_round_complete').at(-1)
    expect(round1?.data.round).toBe(1)
    expect(round1?.data.reveals.every((r: any) => r.g3Cards.length === 3)).toBe(true)
    expect(round1?.data.reveals.find((r: any) => r.id === humanUserId)?.g3Cards).toEqual(selectedRevealKeys)

    expect(submitMonarchGrandFinaleAction(io, roomId, humanUserId, 'call').ok).toBe(true)
    await jest.advanceTimersByTimeAsync(2_500)
    const round2 = emitted.filter(e => e.event === 'monarch_grand_finale_round_complete').at(-1)
    expect(round2?.data.round).toBe(2)
    expect(round2?.data.reveals.every((r: any) => r.g3Cards.length === 4)).toBe(true)
    await jest.advanceTimersByTimeAsync(1_500)
    expect(mockSettleEscrow).toHaveBeenCalledTimes(1)
    randomSpy.mockRestore()
  })
})
