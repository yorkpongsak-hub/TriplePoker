export type TierDRewardItem = 'single_card_swap' | 'full_redraw' | 'bomb_defuser'
export type TierDRewardMode = 'claim' | 'ad' | 'no_ads'
export const TIER_D_REWARD_ITEMS: readonly TierDRewardItem[] = ['single_card_swap', 'full_redraw', 'bomb_defuser']

/** Achievement data (medals, trophies, rank, League Points) never passes through this multiplier. */
export function tierDRewardQuantity(mode: TierDRewardMode, adCompleted: boolean): number {
  if (mode === 'no_ads') return 2
  if (mode === 'ad' && adCompleted) return 2
  return 1
}
