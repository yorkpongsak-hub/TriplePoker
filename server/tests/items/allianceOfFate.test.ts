// allianceOfFate.test.ts
// Test suite สำหรับ Alliance of Fate Signaling Module
// ครอบคลุม: initiate · accept · card selection · mutual swap · error cases · cancel
// Target: 10 test cases

import {
  initiateSignal,
  acceptSignal,
  submitCardSelection,
  getSessionState,
  cancelSession,
} from '../../src/items/allianceOfFate'
import { Server as SocketIOServer } from 'socket.io'

// ── Mock Socket.IO Server
function createMockIO(): { io: SocketIOServer; emitted: { event: string; data: any }[] } {
  const emitted: { event: string; data: any }[] = []
  const io = {
    to: (_roomId: string) => ({
      emit: (event: string, data: any) => {
        emitted.push({ event, data })
      },
    }),
  } as unknown as SocketIOServer
  return { io, emitted }
}

// ── ล้าง in-memory session ระหว่าง test ด้วยการ cancel
afterEach(() => {
  // ล้าง session ทุก room ที่อาจค้างอยู่
  const { io } = createMockIO()
  cancelSession(io, 'room-test')
  cancelSession(io, 'room-A')
  cancelSession(io, 'room-B')
})

// ────────────────────────────────────────────────────────────
// GROUP 1: Initiate Signal (3 cases)
// ────────────────────────────────────────────────────────────

describe('allianceOfFate — initiateSignal', () => {

  // Case 1: Initiate สำเร็จ — session ถูกสร้าง + emit alliance_signal
  test('Case 1: initiateSignal creates session and emits alliance_signal', () => {
    const { io, emitted } = createMockIO()
    const result = initiateSignal(io, 'room-test', 'player-A')

    expect(result.success).toBe(true)

    const session = getSessionState('room-test')
    expect(session).not.toBeNull()
    expect(session?.initiatorId).toBe('player-A')
    expect(session?.status).toBe('pending')

    const signal = emitted.find(e => e.event === 'alliance_signal')
    expect(signal).toBeDefined()
    expect(signal?.data.initiatorId).toBe('player-A')
    expect(signal?.data.timeoutMs).toBe(3000)
  })

  // Case 2: Initiate ซ้ำในห้องเดิม → error (มี session active อยู่แล้ว)
  test('Case 2: Cannot initiate if alliance already active in room', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-A', 'player-A')

    const { io: io2, emitted: emitted2 } = createMockIO()
    const result = initiateSignal(io2, 'room-A', 'player-B')

    expect(result.success).toBe(false)
    expect(result.error).toContain('already active')
  })

  // Case 3: session state หลัง initiate ต้อง pending
  test('Case 3: Session status is pending after initiate', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-B', 'player-X')

    const session = getSessionState('room-B')
    expect(session?.status).toBe('pending')
    expect(session?.responderId).toBeNull()
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 2: Accept Signal (3 cases)
// ────────────────────────────────────────────────────────────

describe('allianceOfFate — acceptSignal', () => {

  // Case 4: Accept สำเร็จ — status เปลี่ยนเป็น selecting
  test('Case 4: acceptSignal sets status to selecting', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')

    const { io: io2, emitted } = createMockIO()
    const result = acceptSignal(io2, 'room-test', 'player-B')

    expect(result.success).toBe(true)
    const session = getSessionState('room-test')
    expect(session?.status).toBe('selecting')
    expect(session?.responderId).toBe('player-B')

    const acceptEvent = emitted.find(e => e.event === 'alliance_accepted')
    expect(acceptEvent).toBeDefined()
  })

  // Case 5: Accept โดย initiator เอง → error
  test('Case 5: Initiator cannot accept own signal', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')

    const { io: io2 } = createMockIO()
    const result = acceptSignal(io2, 'room-test', 'player-A')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Cannot accept your own')
  })

  // Case 6: Accept เมื่อไม่มี active session → error
  test('Case 6: Accept with no active session returns error', () => {
    const { io } = createMockIO()
    const result = acceptSignal(io, 'room-nonexistent', 'player-B')

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active alliance')
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 3: Card Selection และ Swap (3 cases)
// ────────────────────────────────────────────────────────────

describe('allianceOfFate — submitCardSelection และ Swap', () => {

  // Case 7: ทั้งคู่เลือกไพ่แล้ว → emit alliance_execute_swap พร้อม burn 800
  test('Case 7: Both players select cards triggers execute_swap with 800 burn', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')
    acceptSignal(io, 'room-test', 'player-B')

    const { io: io2, emitted } = createMockIO()
    submitCardSelection(io2, 'room-test', 'player-A', 2) // A เลือก index 2

    const { io: io3, emitted: emitted3 } = createMockIO()
    submitCardSelection(io3, 'room-test', 'player-B', 4) // B เลือก index 4

    // หา swap event จาก emitted ทั้งหมด
    const swapEvent = [...emitted, ...emitted3].find(e => e.event === 'alliance_execute_swap')
    expect(swapEvent).toBeDefined()
    expect(swapEvent?.data.initiatorCardIndex).toBe(2)
    expect(swapEvent?.data.responderCardIndex).toBe(4)
    expect(swapEvent?.data.totalBurn).toBe(800)
    expect(swapEvent?.data.burnPerPlayer).toBe(400)
  })

  // Case 8: card index ไม่ถูกต้อง (>4) → error
  test('Case 8: Invalid card index returns error', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')
    acceptSignal(io, 'room-test', 'player-B')

    const { io: io2 } = createMockIO()
    const result = submitCardSelection(io2, 'room-test', 'player-A', 5) // index 5 ไม่มี

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid card index')
  })

  // Case 9: player ที่ไม่ได้อยู่ใน alliance พยายาม submit → error
  test('Case 9: Non-participant cannot submit card selection', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')
    acceptSignal(io, 'room-test', 'player-B')

    const { io: io2 } = createMockIO()
    const result = submitCardSelection(io2, 'room-test', 'player-C', 1)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not part of this alliance')
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 4: Cancel (1 case)
// ────────────────────────────────────────────────────────────

describe('allianceOfFate — cancelSession', () => {

  // Case 10: Cancel session → session ถูกลบ + emit alliance_cancelled
  test('Case 10: cancelSession removes session and emits alliance_cancelled', () => {
    const { io } = createMockIO()
    initiateSignal(io, 'room-test', 'player-A')

    const { io: io2, emitted } = createMockIO()
    cancelSession(io2, 'room-test')

    expect(getSessionState('room-test')).toBeNull()

    const cancelEvent = emitted.find(e => e.event === 'alliance_cancelled')
    expect(cancelEvent).toBeDefined()
  })

})
