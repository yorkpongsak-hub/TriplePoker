export type SpectatorConnectionStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ENDED'

export interface ActiveTableSummary {
  tableId: string; broadcastId: string; tierId: string; tierName: string; bossName?: string
  liveStatus: 'LIVE' | 'FULL' | 'ENDING'; matchStatus: string; round?: number; totalRounds?: number
  viewerCount: number; viewerLimit: number; canWatch: boolean
}

export interface SpectatorSnapshot {
  tableId: string; snapshotAt: number; tierId: string; boss?: { id: string; name: string }
  players: Array<{ seat: number; displayName: string; avatarUrl?: string; isAI?: boolean }>
  round: number; totalRounds: number; publicCenterCards: unknown[]; publicPiles: unknown[]
  publicPot: { amount: number }; matchStatus: string; viewerCount: number; viewerLimit: number
}

export interface DelayedSpectatorEvent {
  eventId: string; tableId: string; occurredAt: number; broadcastAt: number
  payload: { type: string; [key: string]: unknown }
}
