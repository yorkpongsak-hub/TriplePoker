import { AD_CONFIG, type AdPoint } from './adConfig'
import type { Membership } from './adPolicy'

export type AdSessionState = { interstitialsShown: number; lastInterstitialAt?: number | null; lastRewardedAt?: number | null; lastWasInterstitial?: boolean }
export type AdDecision = { show: boolean; point: AdPoint; selectedChance?: number; multiplier?: number; finalChance?: number; roll?: number; reason?: string }

export function decideInterstitial(input: { point: AdPoint; membership: Membership; state: AdSessionState; now: number; providerAvailable: boolean; random?: () => number }): AdDecision {
  const { point, membership, state, now, providerAvailable } = input; const random = input.random ?? Math.random; const config = AD_CONFIG.interstitial
  const skip = (reason: string): AdDecision => ({ show: false, point, reason })
  if (!AD_CONFIG.enabled) return skip('disabled')
  if (membership !== 'FREE') return skip('membership')
  if (!providerAvailable) return skip('provider_unavailable')
  if (!config.eligiblePoints[point]) return skip('point_disabled')
  if (state.interstitialsShown >= config.maxPerSession) return skip('session_cap')
  if (state.lastInterstitialAt && now - state.lastInterstitialAt < config.globalCooldownSec * 1000) return skip('global_cooldown')
  if (state.lastRewardedAt && now - state.lastRewardedAt < config.rewardedCooldownSec * 1000) return skip('rewarded_cooldown')
  if (!config.allowBackToBack && state.lastWasInterstitial) return skip('back_to_back')
  const selectedChance = config.chancePool[Math.min(config.chancePool.length - 1, Math.floor(random() * config.chancePool.length))]
  const multiplier = config.pointMultiplier[point] ?? 1; const finalChance = Math.max(0, Math.min(1, selectedChance * multiplier)); const roll = random()
  return { show: roll < finalChance, point, selectedChance, multiplier, finalChance, roll, reason: roll < finalChance ? undefined : 'probability' }
}
