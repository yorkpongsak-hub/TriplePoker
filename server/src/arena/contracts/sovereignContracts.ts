export type SovereignQualificationPath = 'VETERAN' | 'RISING_STAR' | 'ASCENDANT_ROOKIE'
export type SovereignSelectionSource =
  | 'PRIMARY'
  | 'FALLBACK_RANKING'
  | 'PRE_EVENT_RESERVE'
  | 'LIVE_STANDBY'
  | 'BOT'

export type SovereignPool = 'MAIN' | 'ASCENDANT'
export type SovereignEventDay = 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
export type SovereignCycleStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type SovereignMatchState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'CONFIRMATION_OPEN'
  | 'CHECK_IN_PENDING'
  | 'CHECK_IN_OPEN'
  | 'FILLING_SEATS'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

export type SovereignSeatConfirmation =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CONFIRMATION_EXPIRED'

export type SovereignCheckInStatus = 'PENDING' | 'CHECKED_IN' | 'NO_SHOW'
export type SovereignStandbyStatus =
  | 'QUEUED'
  | 'GRACE'
  | 'CLAIMED'
  | 'PROMOTED'
  | 'SKIPPED'
  | 'LEFT'
  | 'EXPIRED'

export type CrownSource = 'EARNED' | 'PURCHASED'
export type WalletReservationStatus = 'ACTIVE' | 'SETTLED' | 'RELEASED' | 'EXPIRED'
export type LastBossReignStatus = 'ACTIVE' | 'CLOSED' | 'ANNULLED'

export interface MonthlySovereignScoreEntry {
  cycleId: string
  matchId: string
  userId: string
  pool: SovereignPool
  humanRank: 1 | 2 | 3
  score: 10 | 6 | 3 | 0
  completedByBot: boolean
  completedAt: string
}

export interface SovereignRankingTieBreak {
  firstPlaceFinishes: number
  allEligibleMatchScore: number
  bestTenAchievedAt: string
  botTakeoverCount: number
  userId: string
}

export interface CrownReservationComposition {
  totalCrest: number
  earnedCrest: number
  purchasedCrest: number
  status: WalletReservationStatus
}

export interface LastBossPublicIdentity {
  reignId: string
  throneName: string
  reignNumber: number
  reignStartedAt: string
  avatarKind: 'DARK_SILHOUETTE'
  auraKey: string
}

export interface DiscardShowdownInput {
  participantId: string
  isLastBoss: boolean
  seat: 1 | 2 | 3 | 4
  discardedCardIds: readonly [string, string] | readonly [string, string, string]
}
