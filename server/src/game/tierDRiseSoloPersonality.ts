import type { Card } from './deck'

export type TierDRiseSoloPersonality = 'reaper' | 'crag' | 'cypher'

export interface TierDRiseSoloPersonalityConfig {
  displayName: string
  aiPersonality: 'reaper' | 'crag' | 'cipher'
  pileWeights: readonly [number, number, number]
  ceilingWeight: number
  weakPileWeight: number
  balanceWeight: number
  comboWeight: number
  /** Fraction of score-ranked candidates retained at Lv.1000 and at full ramp. */
  candidateFraction: { start: number; floor: number }
}

/**
 * Tuning for Rise Solo only. Keeping every personality number here makes
 * play-test changes independent from the shared evaluator and other modes.
 */
export const TIER_D_RISE_SOLO_PERSONALITIES: Readonly<Record<TierDRiseSoloPersonality, TierDRiseSoloPersonalityConfig>> = {
  reaper: {
    displayName: 'Reaper', aiPersonality: 'reaper', pileWeights: [.84, .96, 1.34],
    ceilingWeight: 2.4, weakPileWeight: 0, balanceWeight: -.12, comboWeight: 1.35,
    candidateFraction: { start: .20, floor: .12 },
  },
  crag: {
    displayName: 'Crag', aiPersonality: 'crag', pileWeights: [1.12, 1.08, 1.02],
    ceilingWeight: .25, weakPileWeight: 2.2, balanceWeight: .72, comboWeight: .82,
    candidateFraction: { start: .20, floor: .12 },
  },
  cypher: {
    displayName: 'Cypher', aiPersonality: 'cipher', pileWeights: [1, 1, 1],
    ceilingWeight: .8, weakPileWeight: .65, balanceWeight: .2, comboWeight: 1,
    candidateFraction: { start: .20, floor: .12 },
  },
}

export const TIER_D_RISE_SOLO_SEAT_PERSONALITIES: readonly TierDRiseSoloPersonality[] = ['reaper', 'crag', 'cypher']

export interface TierDRiseVisibleContext {
  community: { pile1: readonly Card[]; pile2: readonly Card[]; pile3: readonly Card[] }
  /** Only supply this after the auction card has actually been revealed to this AI. */
  visibleAuctionCard?: Card
}

/** Higher endless Levels improve selection precision without approaching perfect play. */
export function tierDRiseCandidateFraction(level: number, personality: TierDRiseSoloPersonality): number {
  const range = TIER_D_RISE_SOLO_PERSONALITIES[personality].candidateFraction
  const progress = Math.min(1, Math.max(0, (level - 1000) / 500))
  return range.start + (range.floor - range.start) * progress
}

/** Cypher reacts only to cards currently public/visible to that seat. */
export function tierDRiseVisiblePileWeights(personality: TierDRiseSoloPersonality, context: TierDRiseVisibleContext): readonly [number, number, number] {
  const base = [...TIER_D_RISE_SOLO_PERSONALITIES[personality].pileWeights] as [number, number, number]
  if (personality !== 'cypher') return base
  const opportunity = ([context.community.pile1, context.community.pile2, context.community.pile3] as const).map(cards => {
    const pair = cards.length >= 2 && cards[0].value === cards[1].value ? .18 : 0
    const suited = cards.length >= 2 && cards[0].suit === cards[1].suit ? .12 : 0
    const connected = cards.length >= 2 && Math.abs(cards[0].value - cards[1].value) <= 2 ? .08 : 0
    return pair + suited + connected + cards.reduce((sum, card) => sum + card.value, 0) / 280
  })
  const auction = context.visibleAuctionCard
  if (auction) opportunity[1] += .08 + auction.value / 100
  const average = opportunity.reduce((sum, value) => sum + value, 0) / 3
  return base.map((weight, index) => weight + opportunity[index] - average) as [number, number, number]
}
