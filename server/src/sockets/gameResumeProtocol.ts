export const GAME_RESUME_EVENT = 'game:resume' as const
export const GAME_RESUME_RESULT_EVENT = 'game:resume:result' as const

export type GameResumeMatchType =
  | 'INITIATE'
  | 'ADEPT'
  | 'MASTERMIND'
  | 'HIGH_NOBLE'
  | 'MONARCH'
  | 'VIP_PLUS'
  | 'ARENA'

export interface GameResumeRequest {
  protocolVersion: 1
  roomId: string
  userId: string
  accessToken?: string | null
  matchType: GameResumeMatchType
  lastSeenVersion?: number
}

export type GameResumeResult =
  | { ok: true; status: 'RESUMED'; roomId: string; matchType: GameResumeMatchType; serverVersion?: number }
  | { ok: false; status: 'MATCH_NOT_FOUND' | 'NOT_A_MEMBER' | 'MATCH_ENDED' | 'UNAUTHORIZED' | 'UNSUPPORTED_MATCH_TYPE'; roomId: string; matchType: GameResumeMatchType }

export function isGameResumeRequest(value: unknown): value is GameResumeRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<GameResumeRequest>
  return request.protocolVersion === 1
    && typeof request.roomId === 'string' && request.roomId.length > 0
    && typeof request.userId === 'string' && request.userId.length > 0
    && typeof request.matchType === 'string'
}
