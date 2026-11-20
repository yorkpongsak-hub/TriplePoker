import { entitlementsForPlan, resolveMembershipPlan } from '../../src/game/membershipEntitlements'
import { canRequestRewardedAd, canShowForcedInterstitial } from '../../src/game/adPolicy'

describe('VIP membership entitlements', () => {
  test.each([
    ['FREE', false, false, false, false],
    ['PRO', true, true, true, false],
    ['PRO_PLUS', true, true, true, true],
  ] as const)('%s centralizes ad, table, Golf Group and social access', (plan, noForcedAds, privateTable, golfGroup, social) => {
    expect(entitlementsForPlan(plan)).toMatchObject({ hasNoForcedInterstitialAds: noForcedAds, canUseRewardedAdsForExtras: true, canCreatePrivateTable: privateTable, canUsePrivateTablePin: privateTable, canUseGolfGroupMode: golfGroup, canViewAnalysisWithoutAd: privateTable, canUseProPlusSocialBenefits: social })
  })

  test.each(['FREE', 'PRO', 'PRO_PLUS'] as const)('%s keeps voluntary rewarded extras available', plan => {
    expect(canRequestRewardedAd(plan, 'TOKEN_RESCUE')).toBe(true)
    expect(canRequestRewardedAd(plan, 'PROGRESSION_REWARD')).toBe(true)
  })

  test('only Free can receive forced interstitials', () => {
    const base = { naturalBreak: 'TIER_D_RETRY' as const, now: 1_000_000, lastForcedAt: null, rewardedGraceUntil: null, providerAvailable: true }
    expect(canShowForcedInterstitial({ ...base, membership: 'FREE' })).toBe(true)
    expect(canShowForcedInterstitial({ ...base, membership: 'PRO' })).toBe(false)
    expect(canShowForcedInterstitial({ ...base, membership: 'PRO_PLUS' })).toBe(false)
  })

  test('expired membership falls back to Free while cancelled remains paid through expiry', () => {
    expect(resolveMembershipPlan({ vipStatus: 'vip_pro', subscriptionState: 'EXPIRED' })).toBe('FREE')
    expect(resolveMembershipPlan({ vipStatus: 'vip', subscriptionState: 'CANCELLED', expiresAt: 2_000, now: 1_000 })).toBe('PRO')
    expect(resolveMembershipPlan({ vipStatus: 'vip', subscriptionState: 'CANCELLED', expiresAt: 1_000, now: 2_000 })).toBe('FREE')
  })
})
