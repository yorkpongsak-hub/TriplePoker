import type { ClientAdMode, RewardedContext } from './adConfig'

export type AdResult = { shown: boolean; earned: boolean; reason?: 'not_ready' | 'load_failed' | 'show_failed' | 'closed_without_reward' | 'unsupported' | 'disabled' }
export interface ClientAdProvider {
  readonly mode: ClientAdMode
  initialize(): Promise<void>
  preloadRewarded(context?: RewardedContext): Promise<void>
  preloadInterstitial(): Promise<void>
  showRewarded(context: RewardedContext): Promise<AdResult>
  showInterstitial(): Promise<AdResult>
}
