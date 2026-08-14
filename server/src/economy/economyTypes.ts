// Central Economy Ledger — shared types (server/src/economy/*)
// Backend/ledger unit for Crown is always CREST (12 Crest = 1 Crown, see arena/economy/crest.ts).

export type Currency = 'TOKEN' | 'CREST'
export type AccountType = 'PLAYER' | 'NPC_POOL' | 'SYSTEM_RESERVE'
export type Wallet = 'EARNED' | 'PURCHASED'
export type TransactionType = 'GENESIS' | 'TRANSFER' | 'BURN' | 'MINT' | 'REVERSAL' | 'ADMIN_ADJUSTMENT'

export type NpcPoolKey =
  | 'BOT_POOL'
  | 'MINION_POOL'
  | 'NINE_SENTINELS_POOL'
  | 'FOUR_GODS_POOL'
  | 'MONARCH_POOL'
  | 'SOREN_VEYL_POOL'
  | 'CAELUM_POOL'

export type PoolKey = NpcPoolKey | 'SYSTEM_RESERVE'

// Extensible allowlist (spec §18 — adding a reason must never require a DB migration).
// Add new literals here as new gameplay/shop/reward paths get wired into the ledger.
export type EconomyReason =
  | 'GENESIS'
  | 'INITIAL_FUNDING'
  | 'NPC_INITIAL_FUNDING'
  | 'TEST_ACCOUNT_FUNDING'
  | 'MATCH_SETTLEMENT'
  | 'ANTE'
  | 'POT'
  | 'AUCTION'
  | 'AUTO_SORT'
  | 'RETRY'
  | 'TOKEN_TO_CROWN'
  | 'SHOP_PURCHASE'
  | 'JOURNEY_PASS'
  | 'EVENT_REWARD'
  | 'ACHIEVEMENT'
  | 'PROMOTION'
  | 'ADMIN_CORRECTION'
  | 'DEBT_CARRY'
  | 'WELCOME_BONUS'
  | 'STREAK_BONUS'
  | 'STREAK_MILESTONE_BONUS'
  | 'AD_REWARD'
  | 'OTHER'

export interface AccountRef {
  accountType: AccountType
  accountId: string // users.user_id (UUID) when PLAYER, else a PoolKey
}

export interface LedgerEntryInput {
  accountType: AccountType
  accountId: string
  currency: Currency
  wallet?: Wallet // meaningful for CREST + PLAYER only
  amount: number // signed; positive = credit, negative = debit
}

export interface EconomyContext {
  matchId?: string
  tableId?: string
  roundId?: string
  playerId?: string
  tier?: string
  npcGroup?: string
  bossId?: string
  reversalOfTransactionId?: number
}

// BURN only. When provided, overrides the implicit SUM(-amount)-across-entries burn calculation —
// needed when an entry set legitimately contains an untracked-money-returning component (e.g.
// match settlement's escrow buy-in return) that must not itself be counted as burned. Omit for
// simple burns (e.g. a plain Shop purchase) where the implicit calculation is already correct.
export interface BurnOverride {
  token?: number
  crest?: number
}

// BURN only, independent of burnOverride. Needed when a BURN transaction's entries burn one
// currency and mint another (e.g. a Token->Crown conversion) — TOKEN/CREST are separate economies
// with separate Genesis/Mint/Burn counters, so both must be bumped correctly in the same call.
export type MintOverride = BurnOverride

export interface ApplyTransactionInput {
  idempotencyKey: string
  type: TransactionType
  reason: EconomyReason
  entries: LedgerEntryInput[]
  metadata?: Record<string, unknown>
  context?: EconomyContext
  createdBy?: string
  burnOverride?: BurnOverride
  mintOverride?: MintOverride
}

export interface ApplyTransactionResult {
  transactionId: number
  replayed: boolean
}

export interface ReconciliationRow {
  currency: Currency
  genesis: number
  cumulativeMint: number
  cumulativeBurn: number
  expectedSupply: number
  playerPool: number
  npcPool: number
  systemReserve: number
  actualSupply: number
  difference: number
}
