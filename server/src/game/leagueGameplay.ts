import type { HandRank } from './handEvaluator'
import { getCurrentLeague, TIER_D_PILE_BASE_SCORES, type LeagueId } from './tierDLeague'

export type Pile = 1 | 2 | 3
export type MissionRank = Extract<HandRank, 'high_card' | 'one_pair' | 'two_pair' | 'three_of_a_kind' | 'straight' | 'flush'>
export type Mission = { pile: Pile; rank: MissionRank; negative?: boolean; penalty?: number }
export type OpenChallenge = { revealedPiles: Pile[] }

const rankValue: Record<MissionRank, number> = { high_card: 0, one_pair: 1, two_pair: 2, three_of_a_kind: 3, straight: 4, flush: 5 }
const missionBonus: Record<MissionRank, number> = { high_card: 1, one_pair: 2, two_pair: 3, three_of_a_kind: 4, straight: 6, flush: 8 }
const pools: Record<Pile, readonly MissionRank[]> = { 1: ['high_card', 'one_pair'], 2: ['one_pair', 'two_pair', 'three_of_a_kind'], 3: ['two_pair', 'three_of_a_kind', 'straight', 'flush'] }
const missionWeights: Record<LeagueId, readonly number[]> = {
  bronze: [0, 0, 0], silver: [.80, .15, .05], gold: [.65, .25, .10], platinum: [.50, .35, .15], diamond: [.40, .40, .20], elite: [.30, .45, .25], master: [.20, .45, .35], grandmaster: [.15, .40, .45], legend: [.10, .30, .60], mythic: [.05, .20, .75],
}
const negativeChance: Record<LeagueId, number> = { bronze: 0, silver: .03, gold: .05, platinum: .08, diamond: .12, elite: .16, master: .20, grandmaster: .25, legend: .30, mythic: 1 / 3 }
const openChance: Record<LeagueId, number> = { bronze: 0, silver: .03, gold: .05, platinum: .08, diamond: .10, elite: .12, master: .15, grandmaster: .18, legend: .20, mythic: .25 }

export function generateMissions(level: number, random: () => number = Math.random): Mission[] {
  const league = getCurrentLeague(level)
  if (league.id === 'bronze') return []
  const count = weightedIndex(missionWeights[league.id], random) + 1
  const pileSets: Record<number, Pile[][]> = { 1: [[1], [2], [3]], 2: [[1, 2], [1, 3], [2, 3]], 3: [[1, 2, 3]] }
  const selected = pileSets[count][Math.floor(random() * pileSets[count].length)]
  const missions = chooseOrderedMissions(selected, random)
  if (count === 3 && random() < negativeChance[league.id]) {
    const index = Math.floor(random() * missions.length)
    missions[index] = { ...missions[index], negative: true, penalty: -(5 + Math.floor(random() * 6)) }
  }
  return missions
}

/** Random reveal information for Silver+; undefined means a normal hidden round. */
export function generateOpenChallenge(level: number, random: () => number = Math.random): OpenChallenge | undefined {
  // Open Challenge is an endgame-only pass condition; it must never block Lv. 1–1000.
  if (level <= 1000) return undefined
  const league = getCurrentLeague(level)
  if (random() >= openChance[league.id]) return undefined
  const roll = random(); const count = roll < .40 ? 1 : roll < .75 ? 2 : 3
  if (count === 3) return { revealedPiles: [1, 2, 3] }
  const choices: Pile[][] = count === 1 ? [[1], [2], [3]] : [[1, 2], [1, 3], [2, 3]]
  return { revealedPiles: choices[Math.floor(random() * choices.length)] }
}

export function missionResult(mission: Mission, hand: HandRank): { complete: boolean; score: number; penalty: number } {
  const handValue = handRankValue(hand)
  const targetValue = rankValue[mission.rank]
  // Straight and Flush are the two endgame objectives: a stronger hand may still
  // complete them. Earlier objectives teach precise strength allocation, so they
  // require the requested rank exactly.
  const higherRankAllowed = mission.rank === 'straight' || mission.rank === 'flush'
  const complete = mission.negative ? handValue >= targetValue : handValue === targetValue || (higherRankAllowed && handValue > targetValue)
  if (mission.negative) return { complete, score: 0, penalty: complete ? 0 : mission.penalty! }
  if (!complete) return { complete, score: 0, penalty: 0 }
  const full = missionBonus[mission.rank]
  return { complete, score: handValue === targetValue ? full : Math.ceil(full / 2), penalty: 0 }
}

export function handMultiplier(level: number, hand: HandRank): number {
  if (getCurrentLeague(level).id === 'bronze') return 1
  return ['flush', 'full_house'].includes(hand) ? 1.5 : ['four_of_a_kind', 'straight_flush', 'royal_flush'].includes(hand) ? 2 : 1
}
export function pileWinScore(level: number, pile: Pile, hand: HandRank, doubled = false): number { return Math.ceil(TIER_D_PILE_BASE_SCORES[pile] * handMultiplier(level, hand) * (doubled ? 2 : 1)) }
export function comboBonus(missions: readonly Mission[], completed: readonly boolean[], random: () => number = Math.random): number {
  if (missions.length === 2 && completed.every(Boolean)) return 5 + Math.floor(random() * 3)
  if (missions.length === 3 && completed.every(Boolean)) return 10 + Math.floor(random() * 6)
  return 0
}

function chooseOrderedMissions(selected: readonly Pile[], random: () => number): Mission[] {
  const visit = (index: number, previous: number, current: Mission[]): Mission[] | undefined => {
    if (index === selected.length) return current
    const pile = selected[index]; const choices = pools[pile].filter(rank => rankValue[rank] > previous)
    for (const rank of shuffle(choices, random)) { const found = visit(index + 1, rankValue[rank], [...current, { pile, rank }]); if (found) return found }
  }
  return visit(0, -1, []) ?? []
}
function weightedIndex(weights: readonly number[], random: () => number): number { let value = random(); for (let index = 0; index < weights.length; index++) { value -= weights[index]; if (value < 0) return index } return weights.length - 1 }
function shuffle<T>(values: readonly T[], random: () => number): T[] { const copy = [...values]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }
function handRankValue(rank: HandRank): number { return ({ high_card: 0, one_pair: 1, two_pair: 2, three_of_a_kind: 3, straight: 4, flush: 5, full_house: 6, four_of_a_kind: 7, straight_flush: 8, royal_flush: 9 })[rank] }
