import { FOUR_GODS, type AIConfig } from './aiEngine'
import type { Card } from './deck'
import type { TierDArrangement, TierDCommunityPiles, TierDLevelState } from './tierDSolo'
import { evaluateBestFive, evaluateSoloG2BestFive } from './handEvaluator'

export const TIER_D_DUEL_MIN_LEVEL = 1000
export const TIER_D_DUEL_PARTICIPANTS = 4

export type TierDDuelPhase = 'DUEL' | 'REVEAL' | 'SWAP' | 'REARRANGE' | 'COMPLETE' | 'FAILED'
export type TierDDuelOpponent = { id: string; name: string; emoji: string; aiConfigId: string }
export type TierDDuelResult = { opponentId: string; playerScore: number; opponentScore: number; won: boolean }
export type TierDDuelState = {
  order: TierDDuelOpponent[]
  current: 0 | 1 | 2
  phase: TierDDuelPhase
  results: TierDDuelResult[]
  swapScoreCost: number
  scoreSpent: number
  buyIn: number
  totalPot: number
}

const RISE_ROSTER: AIConfig[] = [
  FOUR_GODS.find(ai => ai.personality === 'reaper')!,
  FOUR_GODS.find(ai => ai.personality === 'crag')!,
  FOUR_GODS.find(ai => ai.personality === 'cipher')!,
]
const MONARCH: AIConfig = { id: 'MONARCH', name: 'Monarch', emoji: '👑', personality: 'cortex' }
const SOREN: AIConfig = { id: 'SOREN', name: 'Soren Veyl', emoji: '🜂', personality: 'cipher' }

/** Centralized Rise buy-in schedule. */
export const TIER_D_DUEL_BUY_INS = Object.freeze([
  { from: 1000, to: 1099, amount: 1_000 }, { from: 1100, to: 1199, amount: 3_500 },
  { from: 1200, to: 1299, amount: 6_000 }, { from: 1300, to: 1399, amount: 8_000 },
  { from: 1400, to: 1499, amount: 10_500 }, { from: 1500, to: 1599, amount: 13_000 },
  { from: 1600, to: 1699, amount: 15_500 }, { from: 1700, to: 1799, amount: 18_000 },
  { from: 1800, to: 1899, amount: 20_000 }, { from: 1900, to: 1999, amount: 22_500 },
  { from: 2000, to: Infinity, amount: 25_000 },
] as const)

export function tierDDuelActive(level: number): boolean { return level >= TIER_D_DUEL_MIN_LEVEL }
export function tierDMatchesPerLevel(level: number): 1 | 3 { return tierDDuelActive(level) ? 1 : 3 }
export function tierDDuelBuyIn(level: number): number {
  if (!tierDDuelActive(level)) return 0
  return TIER_D_DUEL_BUY_INS.find(band => level >= band.from && level <= band.to)!.amount
}

export function tierDDuelRoster(level: number, random: () => number = Math.random): AIConfig[] {
  if (level < 2000) return RISE_ROSTER.map(ai => ({ ...ai, name: ai.personality === 'crag' ? 'Crag' : ai.personality === 'cipher' ? 'Cypher' : ai.name }))
  const god = FOUR_GODS[Math.min(FOUR_GODS.length - 1, Math.floor(random() * FOUR_GODS.length))]
  return [{ ...MONARCH }, { ...SOREN }, { ...god }]
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] }
  return copy
}

export function tierDInitialHandStrength(arrangement: TierDArrangement, community: TierDCommunityPiles): number {
  const results = [
    evaluateBestFive([...arrangement.pile1, ...community.pile1]),
    evaluateSoloG2BestFive(arrangement.pile2, community.pile2),
    evaluateBestFive([...arrangement.pile3, ...community.pile3]),
  ]
  return results.reduce((total, result) => total + result.rankIndex * 1_000_000 + result.score, 0)
}

export function orderTierDDuelOpponents(level: number, opponents: readonly TierDDuelOpponent[], strengths: Readonly<Record<string, number>>, random: () => number = Math.random): TierDDuelOpponent[] {
  return level >= 2000
    ? shuffle(opponents, random)
    : [...opponents].sort((a, b) => (strengths[a.id] ?? 0) - (strengths[b.id] ?? 0) || a.id.localeCompare(b.id))
}

export function createTierDDuelState(level: number, opponents: readonly TierDDuelOpponent[], strengths: Readonly<Record<string, number>>, random: () => number = Math.random): TierDDuelState {
  const buyIn = tierDDuelBuyIn(level)
  return { order: orderTierDDuelOpponents(level, opponents, strengths, random), current: 0, phase: 'DUEL', results: [], swapScoreCost: 0, scoreSpent: 0, buyIn, totalPot: buyIn * TIER_D_DUEL_PARTICIPANTS }
}

export function tierDNextDuelG1Stake(level: number): number {
  // Canonical G1 wager is represented by the existing G1 base score.
  return level >= 1000 ? 4 : 0
}
export function tierDDuelWon(playerScore: number, opponentScore: number): boolean { return playerScore > opponentScore }

export function exchangeTierDDuelCard(level: TierDLevelState, playerId: string, opponentId: string, playerCardIndex: number, opponentCardIndex: number): void {
  const player = level.dealtHands[playerId]; const opponent = level.dealtHands[opponentId]
  if (!player || !opponent || !player[playerCardIndex] || !opponent[opponentCardIndex]) throw new Error('Choose one owned card from each hand')
  const playerCard = player[playerCardIndex]; player[playerCardIndex] = opponent[opponentCardIndex]; opponent[opponentCardIndex] = playerCard
  const playerArrangement = level.arrangements[playerId]
  if (playerArrangement) {
    const key = (card: Card) => `${card.rank}:${card.suit}`
    const outgoing = key(playerCard)
    for (const pile of [playerArrangement.pile1, playerArrangement.pile2, playerArrangement.pile3]) {
      const index = pile.findIndex(card => key(card) === outgoing)
      if (index >= 0) { pile[index] = player[playerCardIndex]; break }
    }
  }
  level.arrangements[opponentId] = undefined
  const identities = Object.values(level.dealtHands).flat().map(cardIdentity)
  if (new Set(identities).size !== identities.length) throw new Error('Duel swap duplicated a physical card')
}

export type TierDDuelPayout = { payouts: Record<string, number>; burned: number; pot: number }
export function calculateTierDDuelPayout(scores: Readonly<Record<string, number>>, pot: number): TierDDuelPayout {
  const positive = Object.entries(scores).map(([id, score]) => [id, Math.max(0, score)] as const)
  const total = positive.reduce((sum, [, score]) => sum + score, 0)
  const payouts = Object.fromEntries(positive.map(([id, score]) => [id, total > 0 ? Math.floor(pot * score / total) : 0]))
  const paid = Object.values(payouts).reduce((sum, amount) => sum + amount, 0)
  return { payouts, burned: pot - paid, pot }
}

export function hiddenTierDDuelView(level: TierDLevelState, viewerId: string): Record<string, Card[]> {
  return Object.fromEntries(Object.entries(level.dealtHands).map(([id, cards]) => [id, id === viewerId ? [...cards] : []]))
}

function cardIdentity(card: Card): string { return `${card.rank}:${card.suit}` }
