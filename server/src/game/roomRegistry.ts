/**
 * roomRegistry.ts
 * Room Registry กลาง (Redis-backed) — ใช้กับ Adept / Mastermind / HighNoble เท่านั้น
 * (Initiate ยังคง 1 Human + 3 AI แบบเดิม ไม่ใช้ไฟล์นี้)
 * Adept: 2 Human + 2 AI (AI fix ตั้งแต่สร้างห้อง — เต็มทันทีที่ Human ครบ 2)
 * Mastermind / HighNoble: 3 Human + 1 AI
 * The Sage Unicorn Studio Co., Ltd.
 */

import { redis } from '../config/redis'
import { FOUR_GODS, AIConfig } from './aiEngine'
import { rollHighNobleBoss } from './monarchSpawn'

// ─── Types ───────────────────────────────────────────────────────
export type Tier = 'adept' | 'mastermind' | 'highNoble'
export type SeatType = 'human' | 'ai' | 'empty'

export interface Seat {
  type: SeatType
  userId?: string
  name: string
  avatarUrl?: string
  joinedAt: number
  aiConfigId?: string   // Patch Multiplayer HighNoble: เก็บ AIConfig.id ของที่นั่ง AI ไว้ (boss = Four Gods id, filler = generic AI_CONFIGS id)
  isBoss?: boolean      // Patch Multiplayer HighNoble: true เฉพาะที่นั่ง Boss (seat index 0, Four Gods, ห้าม Human เข้าตลอดกาล)
  isMonarch?: boolean   // Monarch Spec v1.3: true เฉพาะที่นั่ง Boss ที่สุ่มโดน Monarch (บุคลิกล็อคครั้งเดียวตอนแจกไพ่ ไม่สลับกลางเกม — ดู monarchAI.ts)
}

export interface GameRoom {
  roomId: string
  tier: Tier
  seats: [Seat, Seat, Seat, Seat] // AI seats fix ตั้งแต่สร้าง, ที่เหลือเป็น Human slots
  createdAt: number
  timeoutAt: number | null        // เผื่อไว้ (Mastermind/HighNoble ยังใช้ AI-fill timeout ปกติ)
  status: 'waiting' | 'full' | 'in_progress' | 'closed'
  isPrivate: boolean
  pin?: string
  hostUserId?: string
}

// ─── Config ต่อ Tier ────────────────────────────────────────────
// humanSeatsRequired: จำนวนที่นั่ง Human ที่ต้องการ — ที่เหลือ (4 - จำนวนนี้) = AI fix ตั้งแต่สร้างห้อง
export const TIER_ROOM_CONFIG: Record<Tier, { waitTimeoutMs: number; humanSeatsRequired: number }> = {
  adept:      { waitTimeoutMs: 90_000,  humanSeatsRequired: 2 }, // 2H + 2AI — AI เต็มทันทีที่ Human ครบ 2
  mastermind: { waitTimeoutMs: 120_000, humanSeatsRequired: 3 }, // 3H + 1AI
  highNoble:  { waitTimeoutMs: 180_000, humanSeatsRequired: 3 }, // 3H + 1AI (Boss = Four Gods ปกติ 97% / Monarch ลับ 3%+pity — ดู monarchSpawn.ts)
}

// ─── Redis Key Helpers ──────────────────────────────────────────
const metaKey = (roomId: string) => `room:${roomId}:meta`
const fullKey = (roomId: string) => `room:${roomId}:full`
const openSetKey = (tier: Tier) => `rooms:open:${tier}`

const ROOM_TTL_SECONDS = 60 * 30

function emptySeat(): Seat {
  return { type: 'empty', name: '', joinedAt: 0 }
}

function aiSeat(idx: number): Seat {
  return { type: 'ai', name: `Minion-${idx + 1}`, joinedAt: Date.now() }
}

// Patch Multiplayer HighNoble: ที่นั่ง Boss (index 0) — สุ่ม placeholder ตอนสร้างห้อง (ยังไม่รู้ว่าใครจะมานั่ง Human บ้าง)
// ตัวจริงจะถูกสุ่มใหม่ทับด้วย finalizeBossSeat() ตอนห้องเต็ม (รู้ user_id ครบ 3 คนแล้ว ใช้คำนวณ Monarch pity ได้)
function bossSeat(): Seat {
  const god: AIConfig = FOUR_GODS[Math.floor(Math.random() * FOUR_GODS.length)]
  return { type: 'ai', name: god.name, joinedAt: Date.now(), aiConfigId: god.id, isBoss: true }
}

function makeRoomId(tier: Tier): string {
  return `${tier}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`
}

function buildInitialSeats(tier: Tier): [Seat, Seat, Seat, Seat] {
  const cfg = TIER_ROOM_CONFIG[tier]
  const aiCount = 4 - cfg.humanSeatsRequired
  const seats: Seat[] = []
  for (let i = 0; i < 4; i++) {
    if (i >= aiCount) { seats.push(emptySeat()); continue }
    // Patch Multiplayer HighNoble: seat 0 = Boss (fixed, never human-joinable) — seat 1+ (ถ้ามี) = generic AI filler
    seats.push(i === 0 && tier === 'highNoble' ? bossSeat() : aiSeat(i))
  }
  return seats as [Seat, Seat, Seat, Seat]
}

function isRoomFull(room: GameRoom): boolean {
  return room.seats.every(s => s.type !== 'empty')
}

// ─── บันทึกห้องลง Redis ───────────────────────────────────────
async function saveRoom(room: GameRoom): Promise<void> {
  const meta = {
    roomId: room.roomId,
    tier: room.tier,
    status: room.status,
    seatsFilled: room.seats.filter(s => s.type !== 'empty').length,
    isPrivate: room.isPrivate,
    createdAt: room.createdAt,
  }
  await redis.set(metaKey(room.roomId), JSON.stringify(meta), { ex: ROOM_TTL_SECONDS })
  await redis.set(fullKey(room.roomId), JSON.stringify(room), { ex: ROOM_TTL_SECONDS })

  if (room.status === 'waiting' && !room.isPrivate) {
    await redis.sadd(openSetKey(room.tier), room.roomId)
  } else {
    await redis.srem(openSetKey(room.tier), room.roomId)
  }
}

export async function getRoom(roomId: string): Promise<GameRoom | null> {
  const raw = await redis.get<string>(fullKey(roomId))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : (raw as unknown as GameRoom)
}

export async function findOpenRoom(tier: Tier): Promise<GameRoom | null> {
  const roomIds = await redis.smembers(openSetKey(tier))
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && !room.isPrivate) return room
  }
  return null
}

// ─── สร้างห้องใหม่ — AI seats fix ตาม config ทันที ──────────────
export async function createRoom(tier: Tier, isPrivate = false): Promise<GameRoom> {
  const cfg = TIER_ROOM_CONFIG[tier]
  const room: GameRoom = {
    roomId: makeRoomId(tier),
    tier,
    seats: buildInitialSeats(tier),
    createdAt: Date.now(),
    timeoutAt: Date.now() + cfg.waitTimeoutMs,
    status: 'waiting',
    isPrivate,
  }
  await saveRoom(room)
  return room
}

export async function findOrCreateRoom(tier: Tier): Promise<GameRoom> {
  const open = await findOpenRoom(tier)
  return open ?? (await createRoom(tier))
}

// ─── สร้างห้อง Private — host เข้าที่นั่ง Human แรกทันที ────────
export async function createPrivateRoom(
  tier: Tier,
  hostUserId: string,
  hostName: string,
  isVipHost: boolean,
  pin?: string,
): Promise<GameRoom> {
  const vipPin = isVipHost && pin ? pin : undefined
  if (vipPin && (!/^\d{4}$/.test(vipPin))) {
    throw new Error('PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น')
  }

  const cfg = TIER_ROOM_CONFIG[tier]
  const seats = buildInitialSeats(tier)
  const firstHumanIdx = seats.findIndex(s => s.type === 'empty')
  if (firstHumanIdx !== -1) {
    seats[firstHumanIdx] = { type: 'human', userId: hostUserId, name: hostName, joinedAt: Date.now() }
  }

  const room: GameRoom = {
    roomId: makeRoomId(tier),
    tier,
    seats,
    createdAt: Date.now(),
    timeoutAt: Date.now() + cfg.waitTimeoutMs,
    status: 'waiting',
    isPrivate: true,
    pin: vipPin,
    hostUserId,
  }
  await saveRoom(room)
  return room
}

// ─── ใส่ Human ลงที่นั่งว่างแรก (AI seats ถูก fix ไว้แล้วตั้งแต่สร้าง) ──
export interface JoinResult {
  ok: boolean
  seatIndex?: number
  room?: GameRoom
  reason?: 'not_found' | 'full' | 'wrong_pin' | 'closed'
}

export async function joinRoom(
  roomId: string,
  userId: string,
  userName: string,
  pin?: string,
): Promise<JoinResult> {
  const room = await getRoom(roomId)
  if (!room) return { ok: false, reason: 'not_found' }
  if (room.status !== 'waiting') return { ok: false, reason: room.status === 'closed' ? 'closed' : 'full' }
  if (room.pin && room.pin !== pin) return { ok: false, reason: 'wrong_pin' }

  const seatIdx = room.seats.findIndex(s => s.type === 'empty')
  if (seatIdx === -1) return { ok: false, reason: 'full' }

  room.seats[seatIdx] = { type: 'human', userId, name: userName, joinedAt: Date.now() }
  if (isRoomFull(room)) room.status = 'full'

  await saveRoom(room)
  return { ok: true, seatIndex: seatIdx, room }
}

// ─── AI-fill ที่นั่งที่เหลือเมื่อ timeout (Mastermind/HighNoble เท่านั้นในทางปฏิบัติ — Adept เต็มก่อนถึง timeout เสมออยู่แล้ว) ──
export async function fillRemainingWithAI(roomId: string): Promise<GameRoom | null> {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'waiting') return null

  let aiIdx = 0
  for (let i = 0; i < 4; i++) {
    if (room.seats[i].type === 'empty') {
      room.seats[i] = { type: 'ai', name: `Minion-Fill-${++aiIdx}`, joinedAt: Date.now() }
    }
  }
  room.status = 'full'
  await saveRoom(room)
  return room
}

export async function getTimedOutRooms(tier: Tier): Promise<GameRoom[]> {
  const roomIds = await redis.smembers(openSetKey(tier))
  const now = Date.now()
  const result: GameRoom[] = []
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && room.timeoutAt !== null && now > room.timeoutAt) {
      result.push(room)
    }
  }
  return result
}

export async function closeRoom(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  room.status = 'closed'
  await saveRoom(room)
}

export async function markInProgress(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  room.status = 'in_progress'
  await saveRoom(room)
}

// ─── Monarch Boss Finalize (Spec v1.3) ──────────────────────────
// เรียกตอนห้อง highNoble เต็ม (รู้ user_id ของ Human ครบ 3 คนแล้ว) — สุ่มทับที่นั่ง Boss (seat 0)
// ด้วย weighted random + pity จริง (bossSeat() ตอนสร้างห้องเป็นแค่ placeholder ระหว่างรอ Human เข้า)
export async function finalizeBossSeat(room: GameRoom): Promise<GameRoom> {
  if (room.tier !== 'highNoble') return room
  const humanUserIds = room.seats.filter(s => s.type === 'human' && s.userId).map(s => s.userId!)
  const result = await rollHighNobleBoss(humanUserIds)

  room.seats[0] = result.isMonarch
    ? { type: 'ai', name: 'Monarch', joinedAt: Date.now(), isBoss: true, isMonarch: true }
    : { type: 'ai', name: result.boss!.name, joinedAt: Date.now(), aiConfigId: result.boss!.id, isBoss: true }

  await saveRoom(room)
  return room
}
