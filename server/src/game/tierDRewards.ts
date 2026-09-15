export type TierDRewardItem = 'shuffle' | 'swap' | 'double_pile' | 'freeze' | 'auto_sort' | 'undo'
export type TierDRewardMode = 'claim' | 'ad' | 'no_ads'
export const TIER_D_REWARD_ITEMS: readonly TierDRewardItem[] = ['shuffle', 'swap', 'double_pile', 'freeze', 'auto_sort', 'undo']
export type TierDLevelRewardPlan = { baseItemTypes: number; baseQuantityPerType: 1 | '1-2'; adBonusQuantity: 1 | 2 }

/** Per-Level clear rewards are deliberately League-based, not client-selected. */
export function tierDLevelRewardPlan(level: number): TierDLevelRewardPlan {
  if (level <= 150) return { baseItemTypes: 1, baseQuantityPerType: 1, adBonusQuantity: 1 }
  if (level <= 350) return { baseItemTypes: 2, baseQuantityPerType: 1, adBonusQuantity: 1 }
  if (level <= 1000) return { baseItemTypes: 2, baseQuantityPerType: '1-2', adBonusQuantity: 2 }
  return { baseItemTypes: 3, baseQuantityPerType: 1, adBonusQuantity: 2 }
}
/** Achievement data (medals, trophies, rank, League Points) never passes through this multiplier. */
export function tierDRewardQuantity(mode: TierDRewardMode, adCompleted: boolean): number {
  if (mode === 'no_ads') return 2
  if (mode === 'ad' && adCompleted) return 2
  return 1
}
