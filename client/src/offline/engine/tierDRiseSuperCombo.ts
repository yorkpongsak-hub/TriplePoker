import type { Mission, MissionRank } from './leagueGameplay'

export type TierDRiseSuperComboDifficulty = 'MEDIUM' | 'HARD' | 'VERY_HARD'
export type TierDRiseSuperComboId =
  | 'SC-03' | 'SC-05' | 'SC-06' | 'SC-07' | 'SC-08' | 'SC-09'
  | 'SC-10' | 'SC-11' | 'SC-12' | 'SC-14'
  | 'VH-01' | 'VH-02' | 'VH-03' | 'ULTIMATE'

export type TierDRiseSuperComboDefinition = {
  id: TierDRiseSuperComboId
  difficulty: TierDRiseSuperComboDifficulty
  ranks: readonly [MissionRank, MissionRank, MissionRank]
  ultimate?: true
}

const definition = (
  id: TierDRiseSuperComboId,
  difficulty: TierDRiseSuperComboDifficulty,
  ranks: TierDRiseSuperComboDefinition['ranks'],
  ultimate?: true,
): TierDRiseSuperComboDefinition => ({ id, difficulty, ranks, ...(ultimate ? { ultimate } : {}) })

/** Canonical Lv.1000+ Rise pool. Entries within each difficulty are equiprobable. */
export const TIER_D_RISE_SUPER_COMBO_POOLS: Readonly<Record<TierDRiseSuperComboDifficulty, readonly TierDRiseSuperComboDefinition[]>> = Object.freeze({
  MEDIUM: Object.freeze([
    definition('SC-05', 'MEDIUM', ['high_card', 'two_pair', 'three_of_a_kind']),
    definition('SC-06', 'MEDIUM', ['high_card', 'two_pair', 'straight']),
    definition('SC-10', 'MEDIUM', ['one_pair', 'two_pair', 'three_of_a_kind']),
    definition('SC-11', 'MEDIUM', ['one_pair', 'two_pair', 'straight']),
  ]),
  HARD: Object.freeze([
    definition('SC-03', 'HARD', ['high_card', 'one_pair', 'straight']),
    definition('SC-07', 'HARD', ['high_card', 'two_pair', 'flush']),
    definition('SC-08', 'HARD', ['high_card', 'three_of_a_kind', 'straight']),
    definition('SC-09', 'HARD', ['high_card', 'three_of_a_kind', 'flush']),
    definition('SC-12', 'HARD', ['one_pair', 'two_pair', 'flush']),
  ]),
  VERY_HARD: Object.freeze([
    definition('SC-14', 'VERY_HARD', ['one_pair', 'three_of_a_kind', 'flush']),
    definition('VH-01', 'VERY_HARD', ['two_pair', 'three_of_a_kind', 'straight']),
    definition('VH-02', 'VERY_HARD', ['two_pair', 'three_of_a_kind', 'flush']),
    definition('VH-03', 'VERY_HARD', ['one_pair', 'straight', 'four_of_a_kind']),
    definition('ULTIMATE', 'VERY_HARD', ['three_of_a_kind', 'straight', 'four_of_a_kind'], true),
  ]),
})

export const TIER_D_RISE_DIFFICULTY_WEIGHTS = Object.freeze([
  { fromLevel: 1000, medium: .30, hard: .50, veryHard: .20 },
  { fromLevel: 1200, medium: .28, hard: .50, veryHard: .22 },
  { fromLevel: 1400, medium: .26, hard: .50, veryHard: .24 },
  { fromLevel: 1600, medium: .24, hard: .50, veryHard: .26 },
  { fromLevel: 1800, medium: .22, hard: .50, veryHard: .28 },
  { fromLevel: 2000, medium: .20, hard: .50, veryHard: .30 },
] as const)

export type TierDRiseSuperComboSelection = {
  id: TierDRiseSuperComboId
  difficulty: TierDRiseSuperComboDifficulty
  missions: Mission[]
}

export function tierDRiseDifficultyWeights(level: number) {
  if (level < 1000) throw new Error('Rise Super Combo selection starts at Lv.1000')
  return [...TIER_D_RISE_DIFFICULTY_WEIGHTS].reverse().find(row => level >= row.fromLevel)!
}

export function selectTierDRiseSuperCombo(level: number, random: () => number = Math.random): TierDRiseSuperComboSelection {
  const weights = tierDRiseDifficultyWeights(level)
  const roll = random()
  const difficulty: TierDRiseSuperComboDifficulty = roll < weights.medium
    ? 'MEDIUM'
    : roll < weights.medium + weights.hard ? 'HARD' : 'VERY_HARD'
  const pool = TIER_D_RISE_SUPER_COMBO_POOLS[difficulty]
  const selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  return {
    id: selected.id,
    difficulty,
    missions: selected.ranks.map((rank, index) => ({
      pile: (index + 1) as 1 | 2 | 3,
      rank,
      ...(selected.ultimate ? { superComboChallenge: true } : {}),
    })),
  }
}
