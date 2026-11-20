import {
  adMode,
  GOOGLE_ANDROID_TEST_AD_UNIT_IDS,
  productionInterstitialUnitId,
  productionRewardedUnitId,
  type RewardedContext,
} from './adConfig'
import type { AdResult, ClientAdProvider } from './adProvider.types'

// Expo Go lacks RNGoogleMobileAdsModule. A guarded require prevents that old
// binary from crashing the router; a rebuilt development client resolves it.
let googleAds: any
try {
  googleAds = require('react-native-google-mobile-ads')
} catch {
  googleAds = undefined
}

const rewardedUnit = () => adMode === 'google_test'
  ? GOOGLE_ANDROID_TEST_AD_UNIT_IDS.rewarded
  : productionRewardedUnitId
const interstitialUnit = () => adMode === 'google_test'
  ? GOOGLE_ANDROID_TEST_AD_UNIT_IDS.interstitial
  : productionInterstitialUnitId

const log = (event: string, details?: unknown) => {
  if (!__DEV__) return
  if (details === undefined) console.info(`[ads] ${event}`)
  else console.info(`[ads] ${event}`, details)
}

const warn = (event: string, error?: unknown) => {
  if (__DEV__) console.warn(`[ads] ${event}`, error)
}

class GoogleMobileAdsProvider implements ClientAdProvider {
  readonly mode = adMode
  private initialized = false
  private initializing: Promise<void> | undefined
  private rewarded: any
  private interstitial: any
  private rewardedReady = false
  private interstitialReady = false
  private rewardedLoading = false
  private interstitialLoading = false
  private clearRewardedLoadListeners: (() => void) | undefined
  private clearInterstitialLoadListeners: (() => void) | undefined

  async initialize() {
    if (this.initialized || adMode === 'mock') return
    if (!this.initializing) {
      this.initializing = (async () => {
        const configured = adMode === 'google_test'
          || (adMode === 'production' && productionRewardedUnitId && productionInterstitialUnitId)
        if (!configured) return
        try {
          if (!googleAds) throw new Error('Google Mobile Ads native module is not installed in this binary')
          log('initialize:start', { mode: adMode })
          await googleAds.default().initialize()
          this.initialized = true
          log('initialize:complete', { mode: adMode })
        } catch (error) {
          warn('initialize:error', error)
          this.initializing = undefined
          throw error
        }
      })()
    }
    return this.initializing
  }

  async preloadRewarded(_context?: RewardedContext) {
    try { await this.initialize() } catch { return }
    const unitId = rewardedUnit()
    if (!this.initialized || !unitId || this.rewardedReady || this.rewardedLoading) return

    this.rewardedLoading = true
    this.clearRewardedLoadListeners?.()
    const ad = googleAds.RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true })
    this.rewarded = ad
    const offLoaded = ad.addAdEventListener(googleAds.RewardedAdEventType.LOADED, () => {
      this.rewardedLoading = false
      this.rewardedReady = true
      log('rewarded:loaded')
    })
    const offError = ad.addAdEventListener(googleAds.AdEventType.ERROR, (error: unknown) => {
      this.rewardedLoading = false
      this.rewardedReady = false
      if (this.rewarded === ad) this.rewarded = undefined
      warn('rewarded:load-error', error)
    })
    this.clearRewardedLoadListeners = () => { offLoaded(); offError() }
    log('rewarded:load-start')
    ad.load()
  }

  async preloadInterstitial() {
    try { await this.initialize() } catch { return }
    const unitId = interstitialUnit()
    if (!this.initialized || !unitId || this.interstitialReady || this.interstitialLoading) return

    this.interstitialLoading = true
    this.clearInterstitialLoadListeners?.()
    const ad = googleAds.InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true })
    this.interstitial = ad
    const offLoaded = ad.addAdEventListener(googleAds.AdEventType.LOADED, () => {
      this.interstitialLoading = false
      this.interstitialReady = true
      log('interstitial:loaded')
    })
    const offError = ad.addAdEventListener(googleAds.AdEventType.ERROR, (error: unknown) => {
      this.interstitialLoading = false
      this.interstitialReady = false
      if (this.interstitial === ad) this.interstitial = undefined
      warn('interstitial:load-error', error)
    })
    this.clearInterstitialLoadListeners = () => { offLoaded(); offError() }
    log('interstitial:load-start')
    ad.load()
  }

  async showRewarded(context: RewardedContext): Promise<AdResult> {
    const ad = this.rewarded
    if (!ad || !this.rewardedReady) {
      log('rewarded:not-ready', { context })
      void this.preloadRewarded(context)
      return { shown: false, earned: false, reason: 'not_ready' }
    }

    this.clearRewardedLoadListeners?.()
    this.clearRewardedLoadListeners = undefined
    this.rewarded = undefined
    this.rewardedReady = false
    log('rewarded:show', { context })

    return new Promise(resolve => {
      let earned = false
      let done = false
      const finish = (result: AdResult) => {
        if (done) return
        done = true
        offOpened(); offEarned(); offClosed(); offError()
        void this.preloadRewarded(context)
        resolve(result)
      }
      const offOpened = ad.addAdEventListener(googleAds.AdEventType.OPENED, () => log('rewarded:opened', { context }))
      const offEarned = ad.addAdEventListener(googleAds.RewardedAdEventType.EARNED_REWARD, (reward: unknown) => {
        earned = true
        log('rewarded:earned', { context, reward })
      })
      const offClosed = ad.addAdEventListener(googleAds.AdEventType.CLOSED, () => {
        log('rewarded:closed', { context, earned })
        finish({ shown: true, earned, reason: earned ? undefined : 'closed_without_reward' })
      })
      const offError = ad.addAdEventListener(googleAds.AdEventType.ERROR, (error: unknown) => {
        warn('rewarded:show-error', error)
        finish({ shown: true, earned: false, reason: 'show_failed' })
      })
      ad.show().catch((error: unknown) => {
        warn('rewarded:show-error', error)
        finish({ shown: false, earned: false, reason: 'show_failed' })
      })
    })
  }

  async showInterstitial(): Promise<AdResult> {
    const ad = this.interstitial
    if (!ad || !this.interstitialReady) {
      log('interstitial:not-ready')
      void this.preloadInterstitial()
      return { shown: false, earned: false, reason: 'not_ready' }
    }

    this.clearInterstitialLoadListeners?.()
    this.clearInterstitialLoadListeners = undefined
    this.interstitial = undefined
    this.interstitialReady = false
    log('interstitial:show')

    return new Promise(resolve => {
      let done = false
      const finish = (result: AdResult) => {
        if (done) return
        done = true
        offOpened(); offClosed(); offError()
        void this.preloadInterstitial()
        resolve(result)
      }
      const offOpened = ad.addAdEventListener(googleAds.AdEventType.OPENED, () => log('interstitial:opened'))
      const offClosed = ad.addAdEventListener(googleAds.AdEventType.CLOSED, () => {
        log('interstitial:closed')
        finish({ shown: true, earned: false })
      })
      const offError = ad.addAdEventListener(googleAds.AdEventType.ERROR, (error: unknown) => {
        warn('interstitial:show-error', error)
        finish({ shown: true, earned: false, reason: 'show_failed' })
      })
      ad.show().catch((error: unknown) => {
        warn('interstitial:show-error', error)
        finish({ shown: false, earned: false, reason: 'show_failed' })
      })
    })
  }
}

export const adProvider: ClientAdProvider = new GoogleMobileAdsProvider()
