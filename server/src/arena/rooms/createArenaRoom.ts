import { ArenaRoomSnapshot } from '../contracts/arenaContracts'

// Skeleton ของห้องใหม่เท่านั้น ยังไม่เชื่อม socket/loop ของ Tier เดิมใน Gate 1
export function createArenaRoom(roomId: string): ArenaRoomSnapshot {
  if (!roomId.trim()) throw new Error('ARENA_ROOM_ID_REQUIRED')

  return {
    roomId,
    tier: 'grandmaster',
    phase: 'WAITING_FOR_PLAYERS',
    gameNumber: 0,
    bossComposition: { kind: 'NONE', bosses: [] },
    version: 1,
  }
}
