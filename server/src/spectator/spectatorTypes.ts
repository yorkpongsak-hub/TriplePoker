export type BroadcastStatus = 'WAITING_FOR_MATCH' | 'BROADCASTING' | 'FINISHED' | 'CANCELLED'

export type SpectatorErrorCode =
  | 'BROADCAST_NOT_FOUND'
  | 'BROADCAST_NOT_AVAILABLE'
  | 'BROADCAST_ALREADY_ENDED'
  | 'SPECTATOR_LIMIT_REACHED'
  | 'INVALID_TABLE_STATE'
  | 'LIVE_NOT_ALLOWED'
  | 'VIP_REQUIRED'
  | 'LIVE_TABLE_CONSENT_REQUIRED'
  | 'SPECTATOR_CONNECTION_FAILED'

export type PublicProfile = { displayName: string; avatarUrl?: string }
export type PublicCard = { rank: string; suit: string }

export type SpectatorEvent =
  | { type: 'MATCH_CREATED'; tableId: string; tierId: string }
  | { type: 'PLAYER_JOINED'; seat: number; publicProfile: PublicProfile }
  | { type: 'BOSS_REVEALED'; bossId: string; bossName: string }
  | { type: 'ROUND_STARTED'; round: number; totalRounds: number }
  | { type: 'CENTER_CARD_REVEALED'; pile: number; card: PublicCard }
  | { type: 'PLAYER_ACTION_CONFIRMED'; seat: number; action: 'CALL' | 'FOLD' | 'RAISE'; amount?: number }
  | { type: 'PILE_REVEALED'; pile: number; publicHands: unknown[] }
  | { type: 'PILE_RESULT'; pile: number; winnerSeats: number[] }
  | { type: 'SHOWDOWN_RESULTS'; results: unknown[] }
  | { type: 'PLAYER_RECONNECTING'; seat: number }
  | { type: 'AI_TAKEOVER'; seat: number }
  | { type: 'MATCH_FINISHED'; winnerSeat: number }
  | { type: 'BROADCAST_ENDED'; reason: string }

export interface DelayedSpectatorEvent {
  eventId: string
  tableId: string
  occurredAt: number
  broadcastAt: number
  payload: SpectatorEvent
}

export interface SpectatorSnapshot {
  tableId: string
  snapshotAt: number
  tierId: string
  boss?: { id: string; name: string }
  players: Array<{ seat: number; displayName: string; avatarUrl?: string; isAI?: boolean }>
  round: number
  totalRounds: number
  publicCenterCards: unknown[]
  publicPiles: unknown[]
  publicPot: { amount: number }
  matchStatus: string
  viewerCount: number
  viewerLimit: number
}

export interface ActiveTableSummary {
  tableId: string
  broadcastId: string
  tierId: string
  tierName: string
  bossName?: string
  liveStatus: 'LIVE' | 'FULL' | 'ENDING'
  matchStatus: string
  round?: number
  totalRounds?: number
  viewerCount: number
  viewerLimit: number
  canWatch: boolean
}
