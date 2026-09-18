import { decideInterstitial } from '../../src/game/adManager'

const base={point:'restart' as const,membership:'FREE' as const,state:{interstitialsShown:0},now:100_000,providerAvailable:true}
test('probability boundary is injected and deterministic',()=>{
  expect(decideInterstitial({...base,random:()=>0}).show).toBe(true)
  expect(decideInterstitial({...base,random:()=>.99}).show).toBe(false)
})
test('cooldowns, cap, and membership prevent forced ads',()=>{
  expect(decideInterstitial({...base,state:{interstitialsShown:8},random:()=>0}).reason).toBe('session_cap')
  expect(decideInterstitial({...base,state:{interstitialsShown:0,lastInterstitialAt:99_999},random:()=>0}).reason).toBe('global_cooldown')
  expect(decideInterstitial({...base,state:{interstitialsShown:0,lastRewardedAt:99_999},random:()=>0}).reason).toBe('rewarded_cooldown')
  expect(decideInterstitial({...base,membership:'VIP_PRO',random:()=>0}).reason).toBe('membership')
})
