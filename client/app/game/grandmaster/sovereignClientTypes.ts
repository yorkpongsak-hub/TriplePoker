export type SovereignLobbyMode = 'PUBLIC_SPECTATOR' | 'STANDBY' | 'SELECTED_PLAYER' | 'MANDATORY_RENAME'
export type SovereignEventDay = 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export interface SovereignEventSummary {
  cycleLabel: string
  mode: SovereignLobbyMode
  eventDay: SovereignEventDay | null
  serverNow: string
  checkInOpenAt: string
  checkInCloseAt: string
  requiredCrown: 30
  spectatorDelaySeconds: 30
  spectatorCapacity: 100
}

export interface SovereignStandbyView {
  queuePosition: number
  reservedCrest: 360
  connection: 'CONNECTED' | 'GRACE' | 'EXPIRED'
  promoted: boolean
}

export interface LastBossGraveyardEntry {
  reignNumber: number
  throneName: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number | null
  conquerorName: string | null
  conquerorNewName: string | null
  status: 'ACTIVE' | 'CLOSED' | 'ANNULLED'
}

export interface SovereignPublicFeedState {
  matchId: string | null
  label: 'LIVE — 30s DELAY'
  lastSequence: number
  capacityReached: boolean
  events: Array<{ eventId: string; sequence: number; type: string; publicPayload: Record<string, unknown> }>
}
