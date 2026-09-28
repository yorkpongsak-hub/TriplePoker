export type MembershipPlan = 'FREE' | 'PRO' | 'PRO_PLUS'
export type LegacyVipStatus = 'none' | 'vip' | 'vip_pro'

export const planFromVipStatus = (value: LegacyVipStatus | string | null | undefined): MembershipPlan =>
  value === 'vip_pro' ? 'PRO_PLUS' : value === 'vip' ? 'PRO' : 'FREE'

export function entitlementsFromVipStatus(value: LegacyVipStatus | string | null | undefined) {
  const plan = planFromVipStatus(value)
  const isPro = plan !== 'FREE'
  return {
    plan,
    hasNoForcedInterstitialAds: isPro,
    canUseRewardedAdsForExtras: true,
    canCreatePrivateTable: isPro,
    canUsePrivateTablePin: isPro,
    canUseGolfGroupMode: isPro,
    canViewAnalysisWithoutAd: isPro,
    canUseProPlusSocialBenefits: plan === 'PRO_PLUS',
  } as const
}
