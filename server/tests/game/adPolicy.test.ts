import { canRequestRewardedAd, canShowForcedInterstitial, DAILY_STREAK_MULTIPLIERS, drawWeighted, getDailyStreakReward, membershipFromVipStatus, NORMAL_ITEM_WEIGHTS, socialBonusAllowed, SOCIAL_ITEM_WEIGHTS, streakProtectionEntitlement } from '../../src/game/adPolicy'

test('membership mapping separates Free, VIP Pro and VIP Pro Plus', () => {
  expect(membershipFromVipStatus('none')).toBe('FREE')
  expect(membershipFromVipStatus('vip')).toBe('PRO')
  expect(membershipFromVipStatus('vip_pro')).toBe('PRO_PLUS')
  expect(socialBonusAllowed('FREE')).toBe(false); expect(socialBonusAllowed('PRO')).toBe(false); expect(socialBonusAllowed('PRO_PLUS')).toBe(true)
  expect(streakProtectionEntitlement('FREE')).toBe(0); expect(streakProtectionEntitlement('PRO')).toBe(1); expect(streakProtectionEntitlement('PRO_PLUS')).toBe(2)
})

test('legacy policy keeps Free-only gating while AdManager owns the five-minute cooldown', () => {
  const now=1_000_000
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:now-300_000,rewardedGraceUntil:null,providerAvailable:true})).toBe(true)
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:now-299_999,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'TIER_D_RETRY',now,lastForcedAt:null,rewardedGraceUntil:now+1,providerAvailable:true})).toBe(false)
  expect(canShowForcedInterstitial({membership:'PRO',naturalBreak:'CLASSIC_GAME_SETTLED',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
  // Loss exits have their own named post-settlement break, but retain the
  // identical central Free/cooldown policy rather than a per-tier override.
  expect(canShowForcedInterstitial({membership:'FREE',naturalBreak:'CLASSIC_POST_SETTLEMENT_EXIT',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(true)
  expect(canShowForcedInterstitial({membership:'PRO_PLUS',naturalBreak:'CLASSIC_POST_SETTLEMENT_EXIT',now,lastForcedAt:null,rewardedGraceUntil:null,providerAvailable:true})).toBe(false)
})

test('daily schedule and weighted pools keep social items separate from the six gameplay items', () => {
  expect(DAILY_STREAK_MULTIPLIERS).toEqual([1,1,2,1,2,1,2,3])
  expect(NORMAL_ITEM_WEIGHTS.reduce((n,x)=>n+x.weight,0)).toBe(100)
  expect(SOCIAL_ITEM_WEIGHTS.reduce((n,x)=>n+x.weight,0)).toBe(100)
  expect(NORMAL_ITEM_WEIGHTS.map(x=>x.item)).not.toEqual(expect.arrayContaining(['heart','rose']))
  expect(SOCIAL_ITEM_WEIGHTS.map(x=>x.item)).toEqual(['heart','rose'])
  expect(drawWeighted(NORMAL_ITEM_WEIGHTS,()=>.99).item).toBe('freeze')
  expect(drawWeighted(SOCIAL_ITEM_WEIGHTS,()=>0).item).toBe('heart')
  expect(canRequestRewardedAd('PRO_PLUS','RANDOM_ITEM')).toBe(true)
})

test('Swap remains the scarcest normal strategic-item drop', () => {
  const weights=Object.fromEntries(NORMAL_ITEM_WEIGHTS.map(({item,weight})=>[item,weight]))
  expect(weights).toMatchObject({undo:8,shuffle:14,double_pile:16,swap:4,auto_sort:26,freeze:32})
  expect(weights.swap).toBeLessThan(weights.undo)
  expect(weights.swap).toBeLessThan(weights.shuffle)
  expect(weights.swap).toBeLessThan(weights.double_pile)
  expect(weights.swap).toBeLessThan(weights.auto_sort)
  expect(weights.swap).toBeLessThan(weights.freeze)
})

test.each([3,5,7,8])('Pro Plus receives exactly one additional social item on Day %i', day => {
  const proPlus=getDailyStreakReward(day,'PRO_PLUS',10,()=>0)
  expect(proPlus.items).toHaveLength(DAILY_STREAK_MULTIPLIERS[day-1])
  expect(proPlus.socialItem).toBe('heart')
  expect(getDailyStreakReward(day,'FREE',10,()=>.99).socialItem).toBeUndefined()
  expect(getDailyStreakReward(day,'PRO',10,()=>.99).socialItem).toBeUndefined()
})
