export const GRANDMASTER_UNLOCK_TOKEN_EXCLUSIVE = 1_000_000
export const UNIFIED_TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const
export type UnifiedTierKey = typeof UNIFIED_TIER_ORDER[number]

export function isKnownUnifiedTier(value: unknown): value is UnifiedTierKey {
  return typeof value === 'string' && (UNIFIED_TIER_ORDER as readonly string[]).includes(value)
}

export function hasPermanentGrandmasterUnlock(tierUnlockedMax: unknown): boolean {
  return tierUnlockedMax === 'grandmaster'
}

export function qualifiesForGrandmasterUnlock(tokenBalance: number): boolean {
  if (!Number.isSafeInteger(tokenBalance) || tokenBalance < 0) throw new Error('TOKEN_BALANCE_MUST_BE_NON_NEGATIVE_SAFE_INTEGER')
  return tokenBalance > GRANDMASTER_UNLOCK_TOKEN_EXCLUSIVE
}

export function canAccessGrandmaster(tokenBalance: number, tierUnlockedMax: unknown): boolean {
  return hasPermanentGrandmasterUnlock(tierUnlockedMax) || qualifiesForGrandmasterUnlock(tokenBalance)
}
