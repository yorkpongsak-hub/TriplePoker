/** Single source of truth for launch ad and reward tuning. */
export const AD_CONFIG = {
  enabled: true,
  interstitial: {
    chancePool: [0.25, 0.40] as const,
    globalCooldownSec: 60,
    rewardedCooldownSec: 45,
    maxPerSession: 8,
    allowBackToBack: false,
    eligiblePoints: { levelComplete: true, restart: true, top20Continue: true, returnLobby: true },
    pointMultiplier: { levelComplete: 1, restart: 1, top20Continue: 1, returnLobby: 0.8 },
  },
  rewards: {
    randomRewardMaxPerTenLevels: 3,
    milestoneEveryLevels: 10,
    milestoneRareItemCount: 1,
    top20RewardMinItems: 1,
    top20RewardMaxItems: 2,
    top20X2Enabled: true,
  },
  debug: { enableTuningPanel: true, enableDecisionLogging: true },
} as const

export type AdPoint = keyof typeof AD_CONFIG.interstitial.eligiblePoints
