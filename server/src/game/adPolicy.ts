/** Central advertising and membership policy.  Provider UI is deliberately separate. */
import { entitlementsForPlan, planFromVipStatus, type MembershipPlan } from './membershipEntitlements'

export type Membership = MembershipPlan
export type RewardedAdCategory = 'RANDOM_ITEM' | 'SELECTED_ITEM_REFILL' | 'TOKEN_RESCUE' | 'DAILY_STREAK' | 'PROGRESSION_REWARD'
export type NaturalBreak = 'TIER_D_LEVEL_COMPLETE' | 'TIER_D_RETRY' | 'TIER_D_EXIT_TO_LOBBY' | 'TIER_D_TOP20_CONTINUE' | 'CLASSIC_GAME_SETTLED' | 'CLASSIC_POST_SETTLEMENT_EXIT' | 'PROFITABLE_AI_MATCH'
export const REWARDED_AD_GRACE_MS = 45_000

// The legacy database values intentionally remain stable: vip is Pro and
// vip_pro is the product's Pro Plus entitlement.
export function membershipFromVipStatus(value: string | null | undefined): Membership {
  return planFromVipStatus(value)
}
export const needsDailyStreakRewardedAd = (membership: Membership) => membership === 'FREE'
export const socialBonusAllowed = (membership: Membership) => entitlementsForPlan(membership).canUseProPlusSocialBenefits
export const streakProtectionEntitlement = (membership: Membership) => membership === 'PRO_PLUS' ? 2 : membership === 'PRO' ? 1 : 0

export function canRequestRewardedAd(membership: Membership, category: RewardedAdCategory): boolean {
  if (category === 'DAILY_STREAK') return membership === 'FREE'
  return entitlementsForPlan(membership).canUseRewardedAdsForExtras
}

export function canShowForcedInterstitial(input: { membership: Membership; naturalBreak: NaturalBreak; now: number; lastForcedAt?: number | null; rewardedGraceUntil?: number | null; providerAvailable: boolean }): boolean {
  if (entitlementsForPlan(input.membership).hasNoForcedInterstitialAds || !input.providerAvailable) return false
  if (input.rewardedGraceUntil && input.rewardedGraceUntil > input.now) return false
  return !input.lastForcedAt || input.now - input.lastForcedAt >= 300_000
}

export const DAILY_STREAK_MULTIPLIERS = [1, 1, 2, 1, 2, 1, 2, 3] as const
export const NORMAL_ITEM_WEIGHTS = [
  // Central normal-item reward pool. Swap is deliberately scarce because its
  // card replacement effect has more strategic leverage than utility items.
  { item: 'undo', weight: 8 }, { item: 'shuffle', weight: 14 }, { item: 'double_pile', weight: 16 },
  { item: 'swap', weight: 4 }, { item: 'auto_sort', weight: 26 }, { item: 'freeze', weight: 32 },
] as const
export const SOCIAL_ITEM_WEIGHTS = [{ item: 'heart', weight: 50 }, { item: 'rose', weight: 50 }] as const

export function getDailyStreakReward(cycleDay: number, membership: Membership, dailyBaseToken: number, random = Math.random) {
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 8 || dailyBaseToken < 0) throw new Error('Invalid Daily Streak reward request')
  const multiplier = DAILY_STREAK_MULTIPLIERS[cycleDay - 1]
  const items = Array.from({ length: multiplier }, () => drawWeighted(NORMAL_ITEM_WEIGHTS, random).item)
  const socialItem = socialBonusAllowed(membership) ? drawWeighted(SOCIAL_ITEM_WEIGHTS, random).item : undefined
  return { cycleDay, multiplier, items, tokenAmount: dailyBaseToken * multiplier, socialItem }
}

export function drawWeighted<T extends { weight: number }>(pool: readonly T[], random = Math.random): T {
  const pick = random() * pool.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = 0
  for (const entry of pool) { cursor += entry.weight; if (pick < cursor) return entry }
  return pool[pool.length - 1]
}
