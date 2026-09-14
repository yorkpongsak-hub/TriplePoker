export type TierDRewardItem = 'shuffle' | 'swap' | 'double_pile' | 'freeze' | 'undo'
export type TierDRewardMode = 'claim' | 'ad' | 'no_ads'
export const TIER_D_REWARD_ITEMS: readonly TierDRewardItem[] = ['shuffle', 'swap', 'double_pile', 'freeze', 'undo']

/** Achievement data (medals, trophies, rank, League Points) never passes through this multiplier. */
export function tierDRewardQuantity(mode: TierDRewardMode, adCompleted: boolean): number {
  if (mode === 'no_ads') return 2
  if (mode === 'ad' && adCompleted) return 2
  return 1
}
