import { canRequestRewardedAd, canShowForcedInterstitial, DAILY_STREAK_MULTIPLIERS, drawWeighted, getDailyStreakReward, membershipFromVipStatus, NORMAL_ITEM_WEIGHTS, socialBonusAllowed, SOCIAL_ITEM_WEIGHTS, streakProtectionEntitlement } from '../../src/game/adPolicy'

test('membership mapping separates Free, VIP Pro and VIP Pro Plus', () => {
  expect(membershipFromVipStatus('none')).toBe('FREE')
  expect(membershipFromVipStatus('vip')).toBe('VIP_PRO')
  expect(membershipFromVipStatus('vip_pro')).toBe('VIP_PRO_PLUS')
  expect(socialBonusAllowed('FREE')).toBe(false); expect(socialBonusAllowed('VIP_PRO')).toBe(false); expect(socialBonusAllowed('VIP_PRO_PLUS')).toBe(true)
  expect(streakProtectionEntitlement('FREE')).toBe(0); expect(streakProtectionEntitlement('VIP_PRO')).toBe(1); expect(streakProtectionEntitlement('VIP_PRO_PLUS')).toBe(2)
})

test('legacy policy keeps Free-only gating while AdManager owns the 60-second probability cooldown', () => {
  const now=1_000_000
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:now-60_000,rewardedGraceUntil:null,providerAvailable:true})).toBe(true)
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:now-59_999,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:null,rewardedGraceUntil:now+1,providerAvailable:true})).toBe(false)
  expect(canShowForcedInterstitial({membership:'VIP_PRO',naturalBreak:'CLASSIC_GAME_SETTLED',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
  // Loss exits have their own named post-settlement break, but retain the
  // identical central Free/cooldown policy rather than a per-tier override.
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'CLASSIC_POST_SETTLEMENT_EXIT',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(true)
  expect(canShowForcedInterstitial({membership:'VIP_PRO_PLUS',naturalBreak:'CLASSIC_POST_SETTLEMENT_EXIT',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
})

test('daily schedule and weighted pools keep social items separate from the six gameplay items', () => {
  expect(DAILY_STREAK_MULTIPLIERS).toEqual([1,1,2,1,2,1,2,3])
  expect(NORMAL_ITEM_WEIGHTS.reduce((n,x)=>n+x.weight,0)).toBe(100)
  expect(SOCIAL_ITEM_WEIGHTS.reduce((n,x)=>n+x.weight,0)).toBe(100)
  expect(NORMAL_ITEM_WEIGHTS.map(x=>x.item)).not.toEqual(expect.arrayContaining(['heart','rose']))
  expect(SOCIAL_ITEM_WEIGHTS.map(x=>x.item)).toEqual(['heart','rose'])
  expect(drawWeighted(NORMAL_ITEM_WEIGHTS,()=>.99).item).toBe('freeze')
  expect(drawWeighted(SOCIAL_ITEM_WEIGHTS,()=>0).item).toBe('heart')
  expect(canRequestRewardedAd('VIP_PRO_PLUS','RANDOM_ITEM')).toBe(false)
})

test.each([3,5,7,8])('Pro Plus receives exactly one additional social item on Day %i', day => {
  const proPlus=getDailyStreakReward(day,'VIP_PRO_PLUS',10,()=>0)
  expect(proPlus.items).toHaveLength(DAILY_STREAK_MULTIPLIERS[day-1])
  expect(proPlus.socialItem).toBe('heart')
  expect(getDailyStreakReward(day,'FREE',10,()=>.99).socialItem).toBeUndefined()
  expect(getDailyStreakReward(day,'VIP_PRO',10,()=>.99).socialItem).toBeUndefined()
})
