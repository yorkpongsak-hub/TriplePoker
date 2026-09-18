export type ClientAdMode = 'mock' | 'google_test' | 'production'
export type RewardedContext = 'DAILY_STREAK' | 'RANDOM_ITEM' | 'SELECTED_ITEM_REFILL' | 'TOKEN_RESCUE' | 'PROGRESSION_REWARD'

// Production is deliberately opt-in twice. A release build with no explicit
// gate stays mock/fail-closed instead of accidentally requesting live ads.
const requested = process.env.EXPO_PUBLIC_AD_MODE
const releaseGate = process.env.EXPO_PUBLIC_AD_RELEASE_GATE === 'enabled'
export const adMode: ClientAdMode = requested === 'google_test' ? 'google_test'
  : requested === 'production' && releaseGate ? 'production' : 'mock'

export const productionRewardedUnitId = process.env.EXPO_PUBLIC_ADMOB_REWARDED_AD_UNIT_ID
export const productionInterstitialUnitId = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_AD_UNIT_ID
export const isGoogleTestMode = adMode === 'google_test'
