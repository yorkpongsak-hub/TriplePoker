export type MembershipPlan = 'FREE' | 'PRO' | 'PRO_PLUS'
export type SubscriptionState = 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'NONE'

export interface MembershipEntitlements {
  plan: MembershipPlan
  hasNoForcedInterstitialAds: boolean
  canUseRewardedAdsForExtras: boolean
  canCreatePrivateTable: boolean
  canUsePrivateTablePin: boolean
  canUseGolfGroupMode: boolean
  canViewAnalysisWithoutAd: boolean
  canUseProPlusSocialBenefits: boolean
}

const FREE: MembershipEntitlements = {
  plan: 'FREE',
  hasNoForcedInterstitialAds: false,
  canUseRewardedAdsForExtras: true,
  canCreatePrivateTable: false,
  canUsePrivateTablePin: false,
  canUseGolfGroupMode: false,
  canViewAnalysisWithoutAd: false,
  canUseProPlusSocialBenefits: false,
}

export function planFromVipStatus(value: string | null | undefined): MembershipPlan {
  return value === 'vip_pro' ? 'PRO_PLUS' : value === 'vip' ? 'PRO' : 'FREE'
}

export function resolveMembershipPlan(input: {
  vipStatus?: string | null
  subscriptionState?: SubscriptionState | null
  expiresAt?: string | number | Date | null
  now?: number
}): MembershipPlan {
  const state = input.subscriptionState ?? (input.vipStatus && input.vipStatus !== 'none' ? 'ACTIVE' : 'NONE')
  if (state === 'EXPIRED' || state === 'NONE') return 'FREE'
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= (input.now ?? Date.now())) return 'FREE'
  // Google Play cancellation keeps access until the paid-through expiry date.
  return planFromVipStatus(input.vipStatus)
}

export function entitlementsForPlan(plan: MembershipPlan): MembershipEntitlements {
  if (plan === 'FREE') return { ...FREE }
  return {
    plan,
    hasNoForcedInterstitialAds: true,
    canUseRewardedAdsForExtras: true,
    canCreatePrivateTable: true,
    canUsePrivateTablePin: true,
    canUseGolfGroupMode: true,
    canViewAnalysisWithoutAd: true,
    canUseProPlusSocialBenefits: plan === 'PRO_PLUS',
  }
}

export function entitlementsFromVipStatus(value: string | null | undefined): MembershipEntitlements {
  return entitlementsForPlan(planFromVipStatus(value))
}
