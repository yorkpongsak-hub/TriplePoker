/**
 * roomRegistry.ts
 * Room Registry กลาง (Redis-backed) — ใช้กับ Adept / Mastermind / HighNoble เท่านั้น
 * (Initiate ยังคง 1 Human + 3 AI แบบเดิม ไม่ใช้ไฟล์นี้)
 * Adept: Dynamic 2-3 Human + 1-2 AI — โต๊ะ public (auto-match) รอ human คนที่ 2/3 ผ่าน grace
 * period สั้นๆ (ADEPT_GRACE_MS) ก่อนจะยอมเติม AI/ยกเลิกโต๊ะ (ดู resolveAdeptGraceExpiry ด้านล่าง)
 * โต๊ะ private (PIN) ยังคงพฤติกรรมเดิม (2H+2AI ตายตัว เติม bot ตัวที่ 2 ทันทีที่ human ครบ 2)
 * Mastermind / HighNoble: 3 Human + 1 AI
 * The Sage Unicorn Studio Co., Ltd.
 */

import { redis } from '../config/redis'
import { FOUR_GODS, AI_CONFIGS, AIConfig, pickRandomMinions } from './aiEngine'
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
  isMinion?: boolean    // LobbyMatchmaking_Spec_v1_0 §6.1: true เฉพาะที่นั่งที่เติมด้วย Minion ตอนเลือก "Start Now" ใน Deadlock dialog
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
  // LobbyMatchmaking_Spec_v1_0 §4.4/§6.1: waiting timeout — 'waiting' (รอบแรก 3 นาที) จบแล้วถามผู้เล่น
  // ('awaiting_choice') → เลือก "รอต่อ" เข้า 'extended' (2 นาที) → หมดแล้ว: Adept ลบทันที, High Noble
  // เช็ค Human count ก่อน — ถ้า >=2 เข้า 'awaiting_deadlock_choice' (Host เลือก Start Now/Delete) ถ้า =1 ลบทันที
  timeoutStage?: 'waiting' | 'awaiting_choice' | 'extended' | 'awaiting_deadlock_choice'
}

// ─── Config ต่อ Tier ────────────────────────────────────────────
// humanSeatsRequired: จำนวนที่นั่ง Human ที่ต้องการ — ที่เหลือ (4 - จำนวนนี้) = AI fix ตั้งแต่สร้างห้อง
// adept.waitTimeoutMs/humanSeatsRequired ตอนนี้ใช้แค่ฝั่ง private room เท่านั้น (2H+2AI ตายตัว) —
// โต๊ะ public (auto-match) ใช้ ADEPT_GRACE_MS ด้านล่างแทน (dynamic 2-3H, ดู joinRoom/resolveAdeptGraceExpiry)
export const TIER_ROOM_CONFIG: Record<Tier, { waitTimeoutMs: number; humanSeatsRequired: number }> = {
  adept:      { waitTimeoutMs: 3 * 60_000, humanSeatsRequired: 2 }, // private room เท่านั้น — Sage เข้ารอทันที, Ghost/Reckless สุ่มตอน Human คนที่ 2
  mastermind: { waitTimeoutMs: 120_000,    humanSeatsRequired: 3 }, // 3H + 1AI
  highNoble:  { waitTimeoutMs: 3 * 60_000, humanSeatsRequired: 3 }, // 3H + 1AI (Boss = Four Gods ปกติ 97% / Monarch ลับ 3%+pity — ดู monarchSpawn.ts)
}

// Adept public (auto-match) grace period — โต๊ะรอ human คนถัดไปนานเท่านี้ก่อนตัดสินใจ
// ยกเลิกโต๊ะ (ยังมีแค่ 1H) หรือเติม AI (มี 2H แล้ว) ใช้ค่าเดียวกันทั้ง 2 stage
export const ADEPT_GRACE_MS = 40_000 // tune ได้ในช่วง 30_000-45_000

// §4.4: รอบขยายเวลาหลัง Dialog เลือก "Wait 2 More Minutes"
export const WAIT_EXTENSION_MS = 2 * 60_000

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

// LobbyMatchmaking_Spec_v1_0 §4.2: The Sage เข้ารอทันทีตอนสร้างโต๊ะ Adept
function sageSeat(): Seat {
  const sage = AI_CONFIGS.find(a => a.personality === 'sage')!
  return { type: 'ai', name: sage.name, joinedAt: Date.now(), aiConfigId: sage.id }
}

// §4.3: Human คนที่ 2 join → สุ่ม Bot อีก 1 ตัว (The Ghost หรือ The Reckless)
function secondAdeptBotSeat(): Seat {
  const pool = AI_CONFIGS.filter(a => a.personality === 'ghost' || a.personality === 'reckless')
  const pick = pool[Math.floor(Math.random() * pool.length)]
  return { type: 'ai', name: pick.name, joinedAt: Date.now(), aiConfigId: pick.id }
}

// §4.2: seat 0 = The Sage ทันที, seat 1 ว่างไว้ก่อน (เติมสุ่มตอน Human คนที่ 2 join ใน joinRoom())
function buildAdeptInitialSeats(): [Seat, Seat, Seat, Seat] {
  return [sageSeat(), emptySeat(), emptySeat(), emptySeat()]
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
  // §4.2: Adept มี seat layout พิเศษ — bot ตัวที่ 2 ไม่ fix ตั้งแต่สร้างห้อง (ดู buildAdeptInitialSeats)
  if (tier === 'adept') return buildAdeptInitialSeats()

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

export function humanCount(room: GameRoom): number {
  return room.seats.filter(s => s.type === 'human').length
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

// §4.1: จับ user ใหม่เข้า "โต๊ะที่รอนานที่สุด" เสมอ — Redis SMEMBERS ไม่การันตีลำดับ ต้องดึงมาเทียบ createdAt เอง
export async function findOpenRoom(tier: Tier): Promise<GameRoom | null> {
  const roomIds = await redis.smembers(openSetKey(tier))
  const candidates: GameRoom[] = []
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && !room.isPrivate) candidates.push(room)
  }
  if (candidates.length === 0) return null
  return candidates.reduce((oldest, r) => (r.createdAt < oldest.createdAt ? r : oldest))
}

// ─── สร้างห้องใหม่ — AI seats fix ตาม config ทันที ──────────────
// (เรียกจาก findOrCreateRoom() เท่านั้น — public room เสมอ, isPrivate default false)
export async function createRoom(tier: Tier, isPrivate = false): Promise<GameRoom> {
  const cfg = TIER_ROOM_CONFIG[tier]
  // Adept public: เริ่มนับ grace period รอ human คนที่ 2 ทันที (แทน waitTimeoutMs 3 นาทีเดิม)
  const timeoutAt = tier === 'adept' ? Date.now() + ADEPT_GRACE_MS : Date.now() + cfg.waitTimeoutMs
  const room: GameRoom = {
    roomId: makeRoomId(tier),
    tier,
    seats: buildInitialSeats(tier),
    createdAt: Date.now(),
    timeoutAt,
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

// ─── Distributed lock (Redis SET NX EX) ─────────────────────────
// กัน race condition: findOrCreateRoom (check-then-act) และ joinRoom (read-modify-write)
// ไม่ atomic ทั้งคู่ — ถ้า 2 request ชนกันในช่วงเสี้ยววินาที (คนจริงกดคิวพร้อมกัน) อาจได้ห้องแยกกัน
// หรือที่นั่งถูกเขียนทับเงียบๆ (เจอจริงจากเทส 3-socket เข้า highNoble พร้อมกัน — TestP1/TestP3 ได้ห้อง
// เดียวกัน แต่ TestP2 หลุดไปอีกห้อง) — ล็อกให้ทำทีละคำขอต่อ lockKey เดียวกันแทน
async function acquireLock(lockKey: string, ttlSeconds = 5): Promise<boolean> {
  const result = await redis.set(lockKey, '1', { nx: true, ex: ttlSeconds })
  return result === 'OK'
}

async function releaseLock(lockKey: string): Promise<void> {
  await redis.del(lockKey)
}

async function withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const maxWaitMs = 4000
  const retryDelayMs = 80
  const startedAt = Date.now()
  while (Date.now() - startedAt < maxWaitMs) {
    if (await acquireLock(`lock:${lockKey}`)) {
      try {
        return await fn()
      } finally {
        await releaseLock(`lock:${lockKey}`)
      }
    }
    await new Promise(resolve => setTimeout(resolve, retryDelayMs))
  }
  throw new Error('ระบบกำลังมีคนเข้าคิวเยอะ กรุณาลองใหม่อีกครั้ง')
}

// ─── ใช้แทน findOrCreateRoom() + joinRoom() แยกกันสำหรับ auto-match ───
// ล็อกต่อ tier ตลอดช่วง find/create + จองที่นั่ง กันสองคำขอชนกันได้ห้องคนละใบ หรือแย่งที่นั่งเดียวกัน
export async function findOrCreateRoomAndJoin(
  tier: Tier, userId: string, userName: string, avatarUrl?: string,
): Promise<JoinResult> {
  return withLock(`matchmaking:${tier}`, async () => {
    const room = await findOrCreateRoom(tier)
    return joinRoom(room.roomId, userId, userName, undefined, avatarUrl)
  })
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
  avatarUrl?: string,
): Promise<JoinResult> {
  const room = await getRoom(roomId)
  if (!room) return { ok: false, reason: 'not_found' }
  if (room.status !== 'waiting') return { ok: false, reason: room.status === 'closed' ? 'closed' : 'full' }
  if (room.pin && room.pin !== pin) return { ok: false, reason: 'wrong_pin' }

  const seatIdx = room.seats.findIndex(s => s.type === 'empty')
  if (seatIdx === -1) return { ok: false, reason: 'full' }

  // Bug C fix (2026-07-17): เก็บ avatarUrl ของ Human ไว้ใน seat จริง (เดิม field มีอยู่แล้วใน Seat
  // interface แต่ไม่เคยถูกเซ็ตเลยสักที่) — ใช้ส่งต่อให้ผู้เล่นคนอื่นเห็น avatar กันใน round_start
  room.seats[seatIdx] = { type: 'human', userId, name: userName, joinedAt: Date.now(), avatarUrl }
  if (!room.hostUserId) room.hostUserId = userId // คนแรกที่ join ห้อง public = host (ใช้กับ Deadlock dialog §4.4/§6.1)

  // Adept: private room (PIN) ยังคงพฤติกรรมเดิม — human ครบ 2 → เติม Bot ตัวที่ 2 ทันที
  // (ไม่มี resolveAdeptGraceExpiry() มาช่วยเพราะ private room ไม่อยู่ใน openSetKey เลย — ถ้าไม่เติม
  // ทันทีตรงนี้ที่นั่งจะว่างค้างตลอดไป ไม่มีวันเริ่มเกมได้)
  if (room.tier === 'adept' && room.isPrivate) {
    if (humanCount(room) === TIER_ROOM_CONFIG.adept.humanSeatsRequired) {
      const remainingEmpty = room.seats.findIndex(s => s.type === 'empty')
      if (remainingEmpty !== -1) room.seats[remainingEmpty] = secondAdeptBotSeat()
    }
  } else if (room.tier === 'adept' && humanCount(room) === 2) {
    // Public Adept, human คนที่ 2 เพิ่ง join — ยังไม่เติม Bot ทันที เริ่ม grace period รอบ 2
    // รอ human คนที่ 3 แทน (resolveAdeptGraceExpiry จะเติม Bot เองถ้าหมดเวลาแล้วยังมีแค่ 2H —
    // ไม่ต้องเช็ค humanCount===3 ตรงนี้เพราะที่นั่งสุดท้ายถูกเติมแบบปกติด้านบนอยู่แล้ว isRoomFull()
    // ด้านล่างจะกลายเป็น true เองตามปกติ เหมือน tier อื่น)
    room.timeoutAt = Date.now() + ADEPT_GRACE_MS
  }

  if (isRoomFull(room)) room.status = 'full'

  await saveRoom(room)
  return { ok: true, seatIndex: seatIdx, room }
}

// ล็อกต่อ roomId เดียว (ไม่ล็อกทั้ง tier) — ใช้กับ room_join_private ที่ผู้เล่นรู้ roomId
// อยู่แล้ว (เข้าห้องเฉพาะที่แชร์ลิงก์/PIN มา) กันแค่ 2 คนแย่งที่นั่งเดียวกันในห้องเดียวกันพร้อมกัน
export async function joinRoomLocked(
  roomId: string, userId: string, userName: string, pin?: string,
): Promise<JoinResult> {
  return withLock(`room:${roomId}`, () => joinRoom(roomId, userId, userName, pin))
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

// ─── Waiting Timeout Dialog (§4.4 / §6.1) — 2 stage: 'waiting' รอบแรก → ถาม choice → 'extended' รอบสอง ───

// รอบแรกหมดเวลา (timeoutStage ยังไม่เคยถาม) — เรียกจาก interval check แล้ว emit dialog ให้ client
export async function getRoomsNeedingTimeoutChoice(tier: Tier): Promise<GameRoom[]> {
  const roomIds = await redis.smembers(openSetKey(tier))
  const now = Date.now()
  const result: GameRoom[] = []
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && (room.timeoutStage ?? 'waiting') === 'waiting'
      && room.timeoutAt !== null && now > room.timeoutAt) {
      result.push(room)
    }
  }
  return result
}

// mark ว่ากำลังถาม choice อยู่ — กัน interval ถัดไปยิง dialog ซ้ำจนกว่า client จะตอบ
export async function markAwaitingTimeoutChoice(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  room.timeoutStage = 'awaiting_choice'
  await saveRoom(room)
}

// High Noble §6.1: mark ว่ากำลังถาม Deadlock choice (Start Now/Delete) — กัน interval ถัดไปยิงซ้ำจนกว่า Host จะตอบ
export async function markAwaitingDeadlockChoice(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  room.timeoutStage = 'awaiting_deadlock_choice'
  await saveRoom(room)
}

// Client เลือก "Wait 2 More Minutes" — ต่อเวลาอีก 2 นาที เข้าสถานะ 'extended' (หมดแล้วลบทันที ไม่ถามซ้ำ)
export async function extendRoomWait(roomId: string): Promise<GameRoom | null> {
  const room = await getRoom(roomId)
  if (!room) return null
  room.timeoutStage = 'extended'
  room.timeoutAt = Date.now() + WAIT_EXTENSION_MS
  await saveRoom(room)
  return room
}

// รอบขยาย (extended) หมดเวลา — ลบโต๊ะอัตโนมัติทันที ไม่ถามซ้ำ (§4.4)
export async function getExpiredExtendedRooms(tier: Tier): Promise<GameRoom[]> {
  const roomIds = await redis.smembers(openSetKey(tier))
  const now = Date.now()
  const result: GameRoom[] = []
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && room.timeoutStage === 'extended'
      && room.timeoutAt !== null && now > room.timeoutAt) {
      result.push(room)
    }
  }
  return result
}

// ลบโต๊ะออกจาก Redis จริง (ต่างจาก closeRoom ที่แค่ mark status) — ใช้ตอนเลือก "Delete Table" หรือ extended timeout หมดเวลา
export async function deleteRoomCompletely(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  await redis.srem(openSetKey(room.tier), roomId)
  await redis.del(metaKey(roomId))
  await redis.del(fullKey(roomId))
}

// ─── Adept Dynamic Capacity — grace period scanner + resolver ──────────────
// สแกนหาโต๊ะ Adept public (ไม่ใช่ private) ที่ยัง 'waiting' และ grace period หมดเวลาแล้ว
// คืนแค่ roomId — ผู้เรียกต้องผ่าน resolveAdeptGraceExpiry() เสมอ เพราะระหว่าง scan เสร็จกับ
// resolver ทำงานจริง อาจมี join ใหม่แทรกเข้ามาพอดี (ต้องอ่านสดอีกรอบใน resolver ก่อนตัดสินใจ)
export async function getAdeptGraceExpiredRoomIds(): Promise<string[]> {
  const roomIds = await redis.smembers(openSetKey('adept'))
  const now = Date.now()
  const result: string[] = []
  for (const roomId of roomIds) {
    const room = await getRoom(roomId)
    if (room && room.status === 'waiting' && !room.isPrivate && room.timeoutAt !== null && now > room.timeoutAt) {
      result.push(roomId)
    }
  }
  return result
}

// ตัดสินใจ + แก้ไขห้องจริงสำหรับ 1 roomId — ล็อกด้วย lock เดียวกับ findOrCreateRoomAndJoin (tier
// 'adept') กัน race กับ join ที่กำลังเข้ามาพอดี แล้วอ่านห้องสดอีกรอบ + เช็ค timeoutAt ซ้ำก่อนลงมือ
// จริง (เผื่อ join ใหม่แทรกเข้ามาระหว่าง scan กับตอนนี้พอดี ทำให้ timeoutAt ถูกรีเซ็ตไปแล้ว)
export type AdeptGraceResult =
  | { action: 'noop' }
  | { action: 'cancelled' }
  | { action: 'ai_filled'; room: GameRoom }

export async function resolveAdeptGraceExpiry(roomId: string): Promise<AdeptGraceResult> {
  return withLock('matchmaking:adept', async () => {
    const room = await getRoom(roomId)
    if (!room || room.status !== 'waiting' || room.isPrivate || room.tier !== 'adept') return { action: 'noop' }
    if (room.timeoutAt === null || Date.now() <= room.timeoutAt) return { action: 'noop' } // มี join ใหม่รีเซ็ต timeoutAt ไปแล้ว

    if (humanCount(room) <= 1) {
      await deleteRoomCompletely(roomId)
      return { action: 'cancelled' }
    }

    // มี 2 Human แล้วยังไม่มีคนที่ 3 ทันเวลา — เติม Bot ตัวที่ 2 ให้เริ่มเกมได้
    const remainingEmpty = room.seats.findIndex(s => s.type === 'empty')
    if (remainingEmpty !== -1) room.seats[remainingEmpty] = secondAdeptBotSeat()
    if (isRoomFull(room)) room.status = 'full'
    await saveRoom(room)
    return { action: 'ai_filled', room }
  })
}

export async function markInProgress(roomId: string): Promise<void> {
  const room = await getRoom(roomId)
  if (!room) return
  room.status = 'in_progress'
  await saveRoom(room)
}

// ─── Deadlock Prevention "Start Now" (LobbyMatchmaking_Spec_v1_0 §6.1) ──────
// เติมที่นั่งว่างที่เหลือ (ปกติแค่ 1 ที่สำหรับ High Noble 3H+1Boss) ด้วย Minion สุ่มจาก 25 roster
// (ใช้ pool เดียวกับ Mastermind Phase 3 — greedyArrangement ถูกกำหนดต่อที่ highNobleMultiEngine.ts)
export async function fillWithMinion(roomId: string): Promise<GameRoom | null> {
  const room = await getRoom(roomId)
  if (!room || room.status !== 'waiting') return null

  const emptyIdxs = room.seats.map((s, i) => (s.type === 'empty' ? i : -1)).filter(i => i !== -1)
  const minionNames = pickRandomMinions(emptyIdxs.length)
  emptyIdxs.forEach((idx, i) => {
    room.seats[idx] = { type: 'ai', name: minionNames[i], joinedAt: Date.now(), isMinion: true }
  })

  room.status = 'full'
  await saveRoom(room)
  return room
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
