import { createDeck, type Card } from './deck'
import { compareHands, evaluateBestFive, evaluateSoloG2BestFive } from './handEvaluator'
import type { PileIndex } from './unifiedTierRules'
export type ThreePiles = { pile1: Card[]; pile2: Card[]; pile3: Card[] }
export const physicalCardKey = (card: Card) => `${card.rank}:${card.suit}`
export function assertCardZones(zones: Record<string, readonly Card[]>, expected = createDeck()): true {
  const physical = Object.values(zones).flat()
  const canonical = new Map(expected.map(card => [physicalCardKey(card), card.value]))
  if (physical.length !== expected.length || new Set(physical.map(physicalCardKey)).size !== expected.length ||
      physical.some(card => canonical.get(physicalCardKey(card)) !== card.value)) throw new Error('Card conservation failed: duplicate, missing or invalid physical card')
  return true
}
export function evaluateSharedPile(arrangement: ThreePiles, community: ThreePiles, pile: PileIndex, bonus?: Card) {
  const cards = arrangement[`pile${pile}`]
  const center = community[`pile${pile}`]
  if (cards.length !== (pile === 3 ? 5 : 3) || center.length !== 2) throw new Error('Invalid 3/3/5 pile or community size')
  if (bonus && pile !== 2) throw new Error('Auction bonus is G2 only')
  return pile === 2 ? evaluateSoloG2BestFive(cards, center, bonus) : evaluateBestFive([...cards, ...center])
}
export function isSharedArrangementFoul(arrangement: ThreePiles, community: ThreePiles): boolean {
  const hands = ([1, 2, 3] as const).map(pile => evaluateSharedPile(arrangement, community, pile))
  return compareHands(hands[0], hands[1]) >= 0 || compareHands(hands[1], hands[2]) >= 0
}
