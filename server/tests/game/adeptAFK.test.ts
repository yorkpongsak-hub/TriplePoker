// ─────────────────────────────────────────────────────────────────────────────
// adeptAFK.test.ts — Unit Tests สำหรับ Adept Multiplayer Grace Period (Bug A fix, 2026-07-17)
// ครอบคลุม: markPlayerAFK (AI ตอบแทนทันที), reconnect ภายใน grace (คืนที่นั่ง), finalize หลัง 60s
// (settle escrow + AI ถาวร), settleAndEndMultiMatch (leave กลางเกม settle ครบทุกคน)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock supabaseAdmin — จำลอง token_balance ต่อ userId จริง อัปเดตตาม escrow flow จริง ───
// (ไม่ mock ตายตัวเป็น queue เพราะ escrowBuyIn/settleEscrow ถูกเรียกหลายครั้งคนละลำดับกันในแต่ละเทส
// ให้ mock ฉลาดพอตอบตาม table/operation แทน — token_balance เป็น state จริงที่เปลี่ยนตาม update ได้)
let tokenBalances: Record<string, number> = {}
let escrowIdCounter = 0
let escrowStatuses: Record<string, string> = {}

function makeSupabaseAdminMock() {
  const from = jest.fn((table: string) => {
    let lastEqValues: [string, any][] = []
    let pendingUpdate: any = null
    let isInsert = false

    const builder: any = {}
    builder.select = jest.fn(() => builder)
    builder.eq = jest.fn((col: string, val: any) => { lastEqValues.push([col, val]); return builder })
    builder.limit = jest.fn(() => builder)
    builder.lt = jest.fn(() => builder)
    builder.insert = jest.fn(() => { isInsert = true; return builder })
    builder.update = jest.fn((payload: any) => { pendingUpdate = payload; return builder })

    builder.single = jest.fn(async () => {
      if (table === 'users') {
        const userId = lastEqValues.find(([c]) => c === 'user_id')?.[1]
        return { data: { token_balance: tokenBalances[userId] ?? 0 }, error: null }
      }
      if (table === 'match_escrow' && isInsert) {
        escrowIdCounter++
        const id = `escrow-${escrowIdCounter}`
        escrowStatuses[id] = 'in_match'
        return { data: { escrow_id: id }, error: null }
      }
      return { data: null, error: null }
    })
    // active-escrow check (escrowBuyIn) — happy path เสมอ ไม่มี escrow ค้างจากรอบก่อน
    builder.maybeSingle = jest.fn(async () => ({ data: null, error: null }))

    // await builder ตรงๆ ไม่มี .single()/.maybeSingle() — ใช้กับ update() balance/status และ
    // recoverStaleEscrow (ต้องการ array ว่างจาก match_escrow — ไม่มี escrow ค้างเกิน 60 นาที)
    builder.then = (resolve: any) => {
      if (table === 'users' && pendingUpdate && 'token_balance' in pendingUpdate) {
        const userId = lastEqValues.find(([c]) => c === 'user_id')?.[1]
        if (userId) tokenBalances[userId] = pendingUpdate.token_balance
      }
      if (table === 'match_escrow' && pendingUpdate?.status) {
        const escrowId = lastEqValues.find(([c]) => c === 'escrow_id')?.[1]
        if (escrowId) escrowStatuses[escrowId] = pendingUpdate.status
      }
      resolve({ data: table === 'match_escrow' ? [] : null, error: null })
    }
    return builder
  })
  return { from }
}

jest.mock('../../src/config/supabase', () => ({
  get supabaseAdmin() { return makeSupabaseAdminMock() },
}))

import {
  startMultiplayerMatch, markPlayerAFK, resendRoundStartToPlayer,
  settleAndEndMultiMatch, getMultiMatchState, submitMultiArrangement,
} from '../../src/game/gameLoop'

// ─── Mock Socket.IO Server — เก็บ log การ emit ไว้ตรวจสอบ ───
function makeIoMock() {
  const emitted: { room: string; event: string; data: any }[] = []
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => { emitted.push({ room, event, data }) },
    }),
  }
  return { io, emitted }
}

const USER_A = 'user-a'
const USER_B = 'user-b'
const ROOM_ID = 'adept_test_room'

// ที่นั่งจำลองแบบ Adept จริง (Sage เข้ารอ + 2 Human + Bot ตัวที่ 2) — ตรงกับ roomRegistry.ts seat order
const SEATS = [
  { type: 'ai' as const, name: 'The Sage', aiConfigId: 'sage' },
  { type: 'human' as const, userId: USER_A, name: 'PlayerA', avatarUrl: '🐉' },
  { type: 'human' as const, userId: USER_B, name: 'PlayerB', avatarUrl: '🦊' },
  { type: 'ai' as const, name: 'The Ghost', aiConfigId: 'ghost' },
]

beforeEach(() => {
  tokenBalances = { [USER_A]: 100_000, [USER_B]: 100_000 }
  escrowIdCounter = 0
  escrowStatuses = {}
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Adept Grace Period — markPlayerAFK', () => {
  test('Case 1: หลุดกลาง arrangement → AI ตอบแทนทันที ไม่รอ timeout เต็ม, ยังไม่ settle escrow', async () => {
    const { io } = makeIoMock()
    const result = await startMultiplayerMatch(io, ROOM_ID, SEATS, 'adept')
    expect(result.ok).toBe(true)

    await markPlayerAFK(io, ROOM_ID, USER_B)

    const state: any = getMultiMatchState(ROOM_ID)
    expect(state).toBeDefined()
    // ยังอยู่ใน humanPlayerIds (ที่นั่งคืนได้ถ้า reconnect ทัน grace)
    expect(state.humanPlayerIds).toContain(USER_B)
    // แต่มี arrangement ให้แล้วโดย AI (ไม่ต้องรอ USER_B ส่งจริง)
    expect(state.submittedArrangements[USER_B]).toBeDefined()
    // ยังไม่ settle escrow ตอนนี้ (A1: ต้องรอ finalize 60s ก่อน ไม่บล็อก DB latency กลางรอบ)
    expect(escrowStatuses[state.escrowIds[USER_B]]).toBe('in_match')
  })

  test('Case 2: หลุดแล้วอีกคนส่ง arrangement ปกติ → รอบเดินต่อได้ ไม่ค้าง (allSubmitted ครบ)', async () => {
    const { io, emitted } = makeIoMock()
    await startMultiplayerMatch(io, ROOM_ID, SEATS, 'adept')
    await markPlayerAFK(io, ROOM_ID, USER_B)

    const arrangement = { pile1: [], pile2: [], pile3: [] } as any
    // ไม่ await ตรงๆ — resolveMultiShowdown ข้างในมี delay(3500) แบบ setTimeout จริง (fake timer ไม่ขยับ
    // เอง) แค่ต้องการยืนยันว่า "เดินเข้ารอบ showdown ได้" (allSubmitted ครบ ไม่ค้างรอ USER_B ตลอดกาล)
    // ซึ่งเห็นผลได้จาก event showdown_countdown ที่ยิงก่อนถึง await ตัวแรกข้างในแล้ว
    void submitMultiArrangement(io, ROOM_ID, USER_A, arrangement)

    expect(emitted.some(e => e.event === 'showdown_countdown')).toBe(true)
  })
})

describe('Adept Grace Period — Reconnect within 60s', () => {
  test('Case 3: reconnect ก่อนหมดเวลา → ยกเลิก grace timer, ส่ง round_start คืนที่นั่งให้', async () => {
    const { io, emitted } = makeIoMock()
    await startMultiplayerMatch(io, ROOM_ID, SEATS, 'adept')
    await markPlayerAFK(io, ROOM_ID, USER_B)

    let state: any = getMultiMatchState(ROOM_ID)
    expect(state.afkPlayers[USER_B]).toBeDefined()

    // reconnect ภายใน grace (ยังไม่ครบ 60s)
    jest.advanceTimersByTime(10_000)
    await resendRoundStartToPlayer(io, ROOM_ID, USER_B)

    state = getMultiMatchState(ROOM_ID)
    expect(state.afkPlayers[USER_B]).toBeUndefined() // grace ถูกยกเลิกแล้ว
    expect(state.humanPlayerIds).toContain(USER_B)   // ยังเป็น human ปกติ ไม่โดนแทนถาวร
    expect(emitted.some(e => e.event === 'round_start' && e.room === USER_B)).toBe(true)

    // เดินเวลาต่อจนครบ 60s จากตอน markPlayerAFK เดิม — finalizeAFKReplacement ต้องไม่ทำอะไรแล้ว
    // (เพราะ reconnect ไปแล้ว ไม่ใช่ AFK อีกต่อไป)
    jest.advanceTimersByTime(60_000)
    state = getMultiMatchState(ROOM_ID)
    expect(state.humanPlayerIds).toContain(USER_B)
    expect(escrowStatuses[state.escrowIds[USER_B]]).toBe('in_match') // ไม่ถูก settle เพราะไม่ได้หลุดจริง
  })
})

describe('Adept Grace Period — Finalize after 60s (no reconnect)', () => {
  test('Case 4: ไม่ reconnect จนครบ 60s → ไล่ออกจาก humanPlayerIds จริง, settle escrow, เติม AI ถาวร', async () => {
    const { io } = makeIoMock()
    await startMultiplayerMatch(io, ROOM_ID, SEATS, 'adept')
    const stateBefore: any = getMultiMatchState(ROOM_ID)
    const aiCountBefore = stateBefore.aiPlayerIds.length

    await markPlayerAFK(io, ROOM_ID, USER_B)
    const escrowId = getMultiMatchState(ROOM_ID)!.escrowIds[USER_B]

    // ไม่มีใคร reconnect เลยจนครบ 60 วิ
    await jest.advanceTimersByTimeAsync(60_000)

    const state: any = getMultiMatchState(ROOM_ID)
    expect(state.humanPlayerIds).not.toContain(USER_B) // ไล่ออกจริงแล้ว
    expect(state.afkPlayers[USER_B]).toBeUndefined()
    expect(state.aiPlayerIds.length).toBe(aiCountBefore + 1) // เติม AI ถาวรแทน
    expect(escrowStatuses[escrowId]).toBe('settled') // A1: settle ตอน finalize เท่านั้น ไม่ใช่ตอน markPlayerAFK
  })
})

describe('Adept — settleAndEndMultiMatch (player_leave)', () => {
  test('Case 5: leave กลางเกม → settle escrow ให้ Human ทุกคนในห้อง ไม่ใช่แค่คน leave + ลบ state', async () => {
    const { io } = makeIoMock()
    await startMultiplayerMatch(io, ROOM_ID, SEATS, 'adept')
    const state: any = getMultiMatchState(ROOM_ID)
    const escrowA = state.escrowIds[USER_A]
    const escrowB = state.escrowIds[USER_B]

    const leavingBalance = await settleAndEndMultiMatch(ROOM_ID, USER_A)

    // ทั้งคู่ต้อง settled — A3 fix (เดิมมีแค่คน leave เท่านั้นที่ถูก settle)
    expect(escrowStatuses[escrowA]).toBe('settled')
    expect(escrowStatuses[escrowB]).toBe('settled')
    expect(leavingBalance).not.toBeNull()

    // A4: multiMatchStates ต้องถูกลบ กันหน่วยความจำรั่ว
    expect(getMultiMatchState(ROOM_ID)).toBeUndefined()
  })
})
