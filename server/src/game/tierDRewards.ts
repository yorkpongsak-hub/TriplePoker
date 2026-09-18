export type TierDRewardItem = 'shuffle' | 'swap' | 'double_pile' | 'freeze' | 'auto_sort' | 'undo'
export type TierDRewardMode = 'claim' | 'ad' | 'no_ads'
export const TIER_D_REWARD_ITEMS: readonly TierDRewardItem[] = ['shuffle', 'swap', 'double_pile', 'freeze', 'auto_sort', 'undo']
export type TierDLevelRewardPlan = { baseItemTypes: number; baseQuantityPerType: 1 | '1-2'; adBonusQuantity: 1 | 2 }

export type LevelRewardSchedule = { kind: 'none' | 'random' | 'milestone'; quantity: number }
/** Deterministic from injected RNG; each xx1–xx9 window can contain at most three slots. */
export function levelRewardSchedule(level: number, random = Math.random): LevelRewardSchedule {
  if (!Number.isInteger(level) || level < 1) throw new Error('Invalid level')
  if (level % 10 === 0) return { kind: 'milestone', quantity: 1 }
  const position = ((level - 1) % 10) + 1
  // A stable random permutation of the nine positions yields exactly three, unpredictable reward positions.
  const block = Math.floor((level - 1) / 10); const seed = random() + block * 0.61803398875
  const pick = Math.floor((seed - Math.floor(seed)) * 9) + 1
  const pick2 = ((pick + 2 + Math.floor(random() * 6)) % 9) + 1
  const pick3 = ((pick2 + 2 + Math.floor(random() * 6)) % 9) + 1
  return [pick, pick2, pick3].includes(position) ? { kind: 'random', quantity: 1 } : { kind: 'none', quantity: 0 }
}

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
