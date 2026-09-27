import { FOUR_GODS, type AIConfig } from './aiEngine'
import type { Card } from './deck'
import type { TierDArrangement, TierDCommunityPiles, TierDLevelState } from './tierDSolo'
import { evaluateBestFive, evaluateSoloG2BestFive } from './handEvaluator'
import { isSharedArrangementFoul } from './sharedCardRules'

export const TIER_D_DUEL_MIN_LEVEL = 1000
export const TIER_D_DUEL_ECONOMY = Object.freeze({ buyIn: 1_000, stakes: [200, 300, 500] as const, exchangeFees: [50, 100] as const })

export type TierDDuelPhase = 'DUEL' | 'REVEAL' | 'SWAP' | 'REARRANGE' | 'COMPLETE' | 'FAILED'
export type TierDDuelOpponent = { id: string; name: string; emoji: string; aiConfigId: string }
export type TierDDuelSettlement = { stake: number; playerStake: number; opponentStake: number; pot: number; playerScore: number; opponentScore: number; grossPayout: number; opponentGrossPayout: number; playerTokens: number; opponentTokens: number; playerNet: number }
export type TierDDuelResult = { opponentId: string; playerScore: number; opponentScore: number; won: boolean; settlement: TierDDuelSettlement }
export type TierDDuelExchange = { duel: 1 | 2; actorId: string; sourceId: string; fee: number; player: boolean }
export type TierDDuelState = {
  order: TierDDuelOpponent[]
  current: 0 | 1 | 2
  phase: TierDDuelPhase
  results: TierDDuelResult[]
  exchangeFee: number
  exchangeFees: { player: number; ai: Record<string, number> }
  exchanges: TierDDuelExchange[]
  buyIn: number
  totalPot: number
  rankingScore?: number
  accumulatedDuels?: number
  finalProfit?: number
}

const RISE_ROSTER: AIConfig[] = [
  FOUR_GODS.find(ai => ai.personality === 'reaper')!,
  FOUR_GODS.find(ai => ai.personality === 'crag')!,
  FOUR_GODS.find(ai => ai.personality === 'cipher')!,
]
const MONARCH: AIConfig = { id: 'MONARCH', name: 'Monarch', emoji: '👑', personality: 'cortex' }
const SOREN: AIConfig = { id: 'SOREN', name: 'Soren Veyl', emoji: '🜂', personality: 'cipher' }

export function tierDDuelActive(level: number): boolean { return level >= TIER_D_DUEL_MIN_LEVEL }
export function tierDMatchesPerLevel(level: number): 1 | 3 { return tierDDuelActive(level) ? 1 : 3 }
export function tierDDuelBuyIn(level: number): number { return tierDDuelActive(level) ? TIER_D_DUEL_ECONOMY.buyIn : 0 }
export function tierDDuelStake(duel: 0 | 1 | 2): number { return TIER_D_DUEL_ECONOMY.stakes[duel] }
export function tierDDuelExchangeFee(completedDuel: 0 | 1): number { return TIER_D_DUEL_ECONOMY.exchangeFees[completedDuel] }

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
  return { order: orderTierDDuelOpponents(level, opponents, strengths, random), current: 0, phase: 'DUEL', results: [], exchangeFee: 0, exchangeFees: { player: 0, ai: {} }, exchanges: [], buyIn, totalPot: buyIn * 2, rankingScore: 0, accumulatedDuels: 0 }
}

/** The human advances on a tied or higher Duel score, matching the canonical
 * player-favoured tie rule used by Tier D. */
export function tierDDuelWon(playerScore: number, opponentScore: number): boolean { return playerScore >= opponentScore }

export function settleTierDDuel(stake: number, playerScore: number, opponentScore: number): TierDDuelSettlement {
  const player = Math.max(0, playerScore); const opponent = Math.max(0, opponentScore); const total = player + opponent
  const pot = stake * 2
  const grossPayout = total > 0 ? Math.floor(pot * player / total) : stake
  const opponentGrossPayout = pot - grossPayout
  return { stake, playerStake:stake, opponentStake:stake, pot, playerScore, opponentScore, grossPayout, opponentGrossPayout, playerTokens:grossPayout, opponentTokens:opponentGrossPayout, playerNet:grossPayout-stake }
}

export function tierDDuelRankingScore(duel: TierDDuelState): number {
  return Number.isFinite(duel.rankingScore) ? duel.rankingScore! : duel.results.reduce((sum,result)=>sum+result.playerScore,0)
}

/** Records one completed Duel exactly once, including after snapshot restoration. */
export function recordTierDDuelResult(duel: TierDDuelState, result: TierDDuelResult): boolean {
  if(duel.results[duel.current])return false
  const previousScore=tierDDuelRankingScore(duel)
  duel.results.push(result)
  duel.rankingScore=previousScore+result.playerScore
  duel.accumulatedDuels=duel.results.length
  return true
}

export function tierDDuelFinalProfit(duel: TierDDuelState): number {
  return duel.results.reduce((sum, result) => sum + result.settlement.playerNet, 0)
}

/** Only the defeated AI's G1 and G2 are offered to the player after a won Duel. */
export function tierDDuelExchangeableOpponentPiles(level: TierDLevelState, opponentId: string): Pick<TierDArrangement, 'pile1' | 'pile2'> | undefined {
  const arrangement = level.arrangements[opponentId]
  return arrangement ? { pile1: [...arrangement.pile1], pile2: [...arrangement.pile2] } : undefined
}

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

/** Next opponent may buy one card only from the fully revealed defeated hand. */
export function chooseTierDAiExchange(level: TierDLevelState, aiId: string, revealedId: string, fee: number, stake: number): { aiCardIndex: number; revealedCardIndex: number; expectedBenefit: number } | undefined {
  const arrangement = level.arrangements[aiId]; const aiCards = level.dealtHands[aiId]; const revealed = level.dealtHands[revealedId]
  if (!arrangement || !aiCards || !revealed) return undefined
  const baseline = tierDInitialHandStrength(arrangement, level.communityPiles)
  let best: { aiCardIndex: number; revealedCardIndex: number; strength: number } | undefined
  for (let aiCardIndex = 0; aiCardIndex < aiCards.length; aiCardIndex++) for (let revealedCardIndex = 0; revealedCardIndex < revealed.length; revealedCardIndex++) {
    const outgoing = cardIdentity(aiCards[aiCardIndex]); const candidate: TierDArrangement = { pile1: [...arrangement.pile1], pile2: [...arrangement.pile2], pile3: [...arrangement.pile3] }
    for (const pile of [candidate.pile1, candidate.pile2, candidate.pile3]) { const index = pile.findIndex(card => cardIdentity(card) === outgoing); if (index >= 0) { pile[index] = revealed[revealedCardIndex]; break } }
    if (isSharedArrangementFoul(candidate, level.communityPiles)) continue
    const strength = tierDInitialHandStrength(candidate, level.communityPiles)
    if (!best || strength > best.strength) best = { aiCardIndex, revealedCardIndex, strength }
  }
  if (!best || best.strength <= baseline) return undefined
  const expectedBenefit = Math.floor(stake * (best.strength - baseline) / Math.max(1, Math.abs(baseline)))
  return expectedBenefit > fee ? { aiCardIndex: best.aiCardIndex, revealedCardIndex: best.revealedCardIndex, expectedBenefit } : undefined
}

export function hiddenTierDDuelView(level: TierDLevelState, viewerId: string): Record<string, Card[]> {
  return Object.fromEntries(Object.entries(level.dealtHands).map(([id, cards]) => [id, id === viewerId ? [...cards] : []]))
}

function cardIdentity(card: Card): string { return `${card.rank}:${card.suit}` }
