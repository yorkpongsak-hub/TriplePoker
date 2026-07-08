// Game Room — Create, Join, Matchmaking
import { dealCards, DealtCards } from './cardEngine'

export type Tier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'
export type RoomStatus = 'waiting' | 'arrangement' | 'playing' | 'finished'

export interface Player {
  id: string
  displayName: string
  isAI: boolean
  isReady: boolean
  tokenBalance: number
}

export interface GameRoom {
  id: string
  tier: Tier
  status: RoomStatus
  players: Player[]
  dealtCards?: DealtCards
  createdAt: Date
}

// เก็บ rooms ใน memory (จะย้ายไป Redis ใน Sprint ถัดไป)
const rooms = new Map<string, GameRoom>()

// สร้าง Room ใหม่
export function createRoom(tier: Tier, creatorId: string, displayName: string): GameRoom {
  const room: GameRoom = {
    id: generateRoomId(),
    tier,
    status: 'waiting',
    players: [
      { id: creatorId, displayName, isAI: false, isReady: false, tokenBalance: 1000 },
      // AI player เสมอ
      { id: 'ai-1', displayName: 'AI Player', isAI: true, isReady: true, tokenBalance: 1000 },
    ],
    createdAt: new Date(),
  }
  rooms.set(room.id, room)
  return room
}

// เข้าร่วม Room
export function joinRoom(roomId: string, playerId: string, displayName: string): GameRoom | null {
  const room = rooms.get(roomId)
  if (!room || room.status !== 'waiting' || room.players.length >= 4) return null

  room.players.push({ id: playerId, displayName, isAI: false, isReady: false, tokenBalance: 1000 })

  // ถ้าครบ 4 คน → เริ่มเกม
  if (room.players.length === 4) {
    room.status = 'arrangement'
    room.dealtCards = dealCards()
  }

  return room
}

// ดึง Room
export function getRoom(roomId: string): GameRoom | undefined {
  return rooms.get(roomId)
}

// สร้าง Room ID
function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}
