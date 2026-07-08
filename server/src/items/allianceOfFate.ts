// allianceOfFate.ts
// Alliance of Fate — Competitive Item signaling logic (Separate Module Pattern)
// Pattern เดียวกับ blindAuction.ts (Sprint 4) — รับ io + roomId เข้ามาเป็น parameter
//
// กฎ:
//   ผู้เล่น A กดใช้ → ส่งสัญญาณไป B และ C (icon กระพริบ)
//   B หรือ C กดรับภายใน 3 วินาที → ล็อคคู่ทันที
//   ทั้งคู่เลือกไพ่ 1 ใบจากกอง 3 → สลับ Blind พร้อมกัน
//   ไม่มีคนรับภายใน 3 วินาที → คืนสิทธิ์ A
//   Timing: หลังจัดกอง 3 ก่อน Showdown
//   Burn: 400 Token/คน = 800 Token รวม
//   ใช้กับ AI ไม่ได้

import { Server as SocketIOServer } from 'socket.io'
import { supabase } from '../config/supabase'

const ALLIANCE_COST_PER_PLAYER = 400  // Token ต่อคน
const SIGNAL_TIMEOUT_MS        = 3000 // 3 วินาที รอรับสัญญาณ
const SELECT_TIMEOUT_MS        = 10000 // 10 วินาที รอเลือกไพ่

// สถานะของ Alliance session ในแต่ละห้อง
type AllianceStatus =
  | 'pending'    // A ส่งสัญญาณแล้ว รอคนรับ
  | 'accepted'   // มีคนรับแล้ว รอเลือกไพ่
  | 'selecting'  // กำลังเลือกไพ่
  | 'completed'  // swap เสร็จแล้ว
  | 'cancelled'  // หมดเวลา / ยกเลิก

interface AllianceSession {
  roomId: string
  initiatorId: string        // ผู้เล่น A ที่กดใช้
  responderId: string | null // ผู้เล่น B หรือ C ที่รับสัญญาณ
  status: AllianceStatus
  initiatorCardIndex: number | null  // index ไพ่กอง 3 ที่ A เลือก
  responderCardIndex: number | null  // index ไพ่กอง 3 ที่ B/C เลือก
  timeoutHandle: ReturnType<typeof setTimeout> | null
  createdAt: number
}

// In-memory store สำหรับ active alliance sessions (ต่อ room)
const activeSessions = new Map<string, AllianceSession>()

// ส่งสัญญาณ Alliance of Fate จาก initiator ไปยังผู้เล่นอื่นในห้อง
export function initiateSignal(
  io: SocketIOServer,
  roomId: string,
  initiatorId: string
): { success: boolean; error?: string } {
  // ตรวจสอบว่าห้องนี้มี session active อยู่แล้วหรือไม่
  if (activeSessions.has(roomId)) {
    return { success: false, error: 'Alliance already active in this room' }
  }

  // สร้าง session ใหม่
  const session: AllianceSession = {
    roomId,
    initiatorId,
    responderId: null,
    status: 'pending',
    initiatorCardIndex: null,
    responderCardIndex: null,
    timeoutHandle: null,
    createdAt: Date.now(),
  }

  // ตั้ง timeout 3 วินาที — ถ้าไม่มีคนรับ → คืนสิทธิ์
  session.timeoutHandle = setTimeout(() => {
    const current = activeSessions.get(roomId)
    if (current?.status === 'pending') {
      activeSessions.delete(roomId)
      // แจ้ง initiator ว่าไม่มีคนรับ — คืนสิทธิ์
      io.to(roomId).emit('alliance_timeout', {
        roomId,
        initiatorId,
        message: 'No response — item returned',
      })
    }
  }, SIGNAL_TIMEOUT_MS)

  activeSessions.set(roomId, session)

  // broadcast ไปทุกคนในห้อง — ผู้เล่นอื่น (B, C) จะเห็น icon กระพริบ
  io.to(roomId).emit('alliance_signal', {
    roomId,
    initiatorId,
    timeoutMs: SIGNAL_TIMEOUT_MS,
    message: 'Alliance of Fate activated — tap to accept within 3 seconds',
  })

  return { success: true }
}

// ผู้เล่น B หรือ C กดรับสัญญาณ
export function acceptSignal(
  io: SocketIOServer,
  roomId: string,
  responderId: string
): { success: boolean; error?: string } {
  const session = activeSessions.get(roomId)

  if (!session) {
    return { success: false, error: 'No active alliance in this room' }
  }

  if (session.status !== 'pending') {
    return { success: false, error: 'Alliance already accepted or expired' }
  }

  if (responderId === session.initiatorId) {
    return { success: false, error: 'Cannot accept your own alliance signal' }
  }

  // ยกเลิก timeout เดิม
  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle)
    session.timeoutHandle = null
  }

  session.responderId = responderId
  session.status = 'accepted'

  // ตั้ง timeout รอเลือกไพ่ 10 วินาที
  session.timeoutHandle = setTimeout(() => {
    const current = activeSessions.get(roomId)
    if (current?.status === 'accepted' || current?.status === 'selecting') {
      activeSessions.delete(roomId)
      io.to(roomId).emit('alliance_select_timeout', {
        roomId,
        message: 'Card selection timed out — alliance cancelled, items returned',
      })
    }
  }, SELECT_TIMEOUT_MS)

  // แจ้งทุกคนว่ามีคนรับแล้ว — ให้ทั้งคู่เลือกไพ่กอง 3
  io.to(roomId).emit('alliance_accepted', {
    roomId,
    initiatorId: session.initiatorId,
    responderId,
    selectTimeoutMs: SELECT_TIMEOUT_MS,
    message: 'Select 1 card from your Pile 3 to swap',
  })

  session.status = 'selecting'

  return { success: true }
}

// ผู้เล่นส่ง index ไพ่กอง 3 ที่ต้องการสลับ
export function submitCardSelection(
  io: SocketIOServer,
  roomId: string,
  playerId: string,
  cardIndex: number // index 0-4 จากกอง 3 (5 ใบ)
): { success: boolean; error?: string } {
  const session = activeSessions.get(roomId)

  if (!session) {
    return { success: false, error: 'No active alliance in this room' }
  }

  if (session.status !== 'selecting') {
    return { success: false, error: 'Not in card selection phase' }
  }

  if (cardIndex < 0 || cardIndex > 4) {
    return { success: false, error: 'Invalid card index (must be 0-4)' }
  }

  // บันทึก card selection
  if (playerId === session.initiatorId) {
    session.initiatorCardIndex = cardIndex
  } else if (playerId === session.responderId) {
    session.responderCardIndex = cardIndex
  } else {
    return { success: false, error: 'Player not part of this alliance' }
  }

  // ถ้าทั้งคู่เลือกแล้ว → execute swap
  if (session.initiatorCardIndex !== null && session.responderCardIndex !== null) {
    return executeSwap(io, session)
  }

  // รออีกคนเลือก
  io.to(roomId).emit('alliance_card_selected', {
    roomId,
    playerId,
    message: 'Waiting for partner to select card...',
  })

  return { success: true }
}

// Execute swap — หลังจากทั้งคู่เลือกไพ่แล้ว
function executeSwap(
  io: SocketIOServer,
  session: AllianceSession
): { success: boolean; error?: string } {
  const { roomId, initiatorId, responderId, initiatorCardIndex, responderCardIndex } = session

  if (!responderId || initiatorCardIndex === null || responderCardIndex === null) {
    return { success: false, error: 'Incomplete alliance data' }
  }

  // ยกเลิก timeout
  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle)
    session.timeoutHandle = null
  }

  session.status = 'completed'
  activeSessions.delete(roomId)

  // ส่ง event ให้ game engine (gameSocket.ts) ทำการ swap ใน server state
  io.to(roomId).emit('alliance_execute_swap', {
    roomId,
    initiatorId,
    responderId,
    initiatorCardIndex,
    responderCardIndex,
    burnPerPlayer: ALLIANCE_COST_PER_PLAYER,
    totalBurn: ALLIANCE_COST_PER_PLAYER * 2,
    message: 'Alliance swap executed — cards swapped blind',
  })

  return { success: true }
}

// ดึงสถานะ session ปัจจุบันของห้อง (ใช้ debug หรือ reconnect)
export function getSessionState(roomId: string): AllianceSession | null {
  return activeSessions.get(roomId) ?? null
}

// ยกเลิก session และคืนสิทธิ์ (ใช้กรณี initiator ออกจากห้อง)
export function cancelSession(io: SocketIOServer, roomId: string): void {
  const session = activeSessions.get(roomId)
  if (!session) return

  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle)
  }

  activeSessions.delete(roomId)

  io.to(roomId).emit('alliance_cancelled', {
    roomId,
    message: 'Alliance of Fate cancelled',
  })
}
