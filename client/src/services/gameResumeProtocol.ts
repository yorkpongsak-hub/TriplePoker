import type { Socket } from 'socket.io-client'

export const GAME_RESUME_EVENT = 'game:resume' as const
export const GAME_RESUME_RESULT_EVENT = 'game:resume:result' as const

export type GameResumeMatchType = 'INITIATE' | 'ADEPT' | 'MASTERMIND' | 'HIGH_NOBLE' | 'MONARCH' | 'VIP_PLUS' | 'ARENA'

export interface GameResumeRequest {
  protocolVersion: 1
  roomId: string
  userId: string
  accessToken?: string | null
  matchType: GameResumeMatchType
  lastSeenVersion?: number
}

export function requestGameResume(socket: Socket, request: Omit<GameResumeRequest, 'protocolVersion'>): void {
  socket.emit(GAME_RESUME_EVENT, { protocolVersion: 1, ...request } satisfies GameResumeRequest)
}
