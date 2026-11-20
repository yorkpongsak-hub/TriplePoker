import { adMode, type RewardedContext } from './adConfig'
import type { AdResult, ClientAdProvider } from './adProvider.types'

// Web never imports the native SDK. Development mock is deterministic for
// browser/UI testing, but a production build cannot mint a reward through it.
const mockResult = (): AdResult => adMode === 'mock' && __DEV__
  ? { shown: true, earned: true } : { shown: false, earned: false, reason: adMode === 'production' ? 'disabled' : 'unsupported' }

export const adProvider: ClientAdProvider = {
  mode: adMode,
  async initialize() { console.info(`[ads] mode=${adMode}; web native ads disabled`) },
  async preloadRewarded(_context?: RewardedContext) {},
  async preloadInterstitial() {},
  async showRewarded(_context: RewardedContext) { return mockResult() },
  async showInterstitial() { return mockResult() },
}
