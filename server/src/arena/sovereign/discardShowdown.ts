import { Card, Suit } from '../../game/deck'

export type PokDengCategory = 'POK_9' | 'POK_8' | 'THREE_OF_KIND' | 'STRAIGHT_FLUSH' | 'STRAIGHT' | 'THREE_FACE' | 'POINTS'

export interface DiscardShowdownHand {
  participantId: string
  isLastBoss: boolean
  seat: 1 | 2 | 3 | 4
  cards: readonly Card[]
}

export interface EvaluatedDiscardHand extends DiscardShowdownHand {
  category: PokDengCategory
  points: number
  deng: number
  rankVector: readonly number[]
  suitVector: readonly number[]
}

const CATEGORY_SCORE: Record<PokDengCategory, number> = {
  POK_9: 7, POK_8: 6, THREE_OF_KIND: 5, STRAIGHT_FLUSH: 4, STRAIGHT: 3, THREE_FACE: 2, POINTS: 1,
}
const SUIT_SCORE: Record<Suit, number> = { spades: 4, hearts: 3, diamonds: 2, clubs: 1 }

function pointValue(card: Card): number {
  if (card.rank === 'A') return 1
  return card.value >= 10 ? 0 : card.value
}

function isStraight(cards: readonly Card[]): boolean {
  if (cards.length !== 3) return false
  const values = [...cards].map(card => card.value).sort((a, b) => a - b)
  const key = values.join(',')
  return key === '2,3,14' || key === '12,13,14' || (values[1] === values[0] + 1 && values[2] === values[1] + 1)
}

export function evaluateDiscardShowdownHand(hand: DiscardShowdownHand): EvaluatedDiscardHand {
  if (hand.cards.length !== 2 && hand.cards.length !== 3) throw new Error('DISCARD_SHOWDOWN_REQUIRES_TWO_OR_THREE_CARDS')
  const points = hand.cards.reduce((sum, card) => sum + pointValue(card), 0) % 10
  const sameSuit = hand.cards.every(card => card.suit === hand.cards[0].suit)
  const sameRank = hand.cards.every(card => card.rank === hand.cards[0].rank)
  const deng = sameSuit || sameRank ? hand.cards.length : 1
  const straight = isStraight(hand.cards)
  const threeFace = hand.cards.length === 3 && new Set(hand.cards.map(card => card.rank)).size === 3
    && hand.cards.every(card => card.rank === 'J' || card.rank === 'Q' || card.rank === 'K')

  let category: PokDengCategory = 'POINTS'
  if (hand.cards.length === 2 && points === 9) category = 'POK_9'
  else if (hand.cards.length === 2 && points === 8) category = 'POK_8'
  else if (hand.cards.length === 3 && sameRank) category = 'THREE_OF_KIND'
  else if (straight && sameSuit) category = 'STRAIGHT_FLUSH'
  else if (straight) category = 'STRAIGHT'
  else if (threeFace) category = 'THREE_FACE'

  return {
    ...hand,
    category,
    points,
    deng,
    rankVector: [...hand.cards].map(card => card.value).sort((a, b) => b - a),
    suitVector: [...hand.cards].map(card => SUIT_SCORE[card.suit]).sort((a, b) => b - a),
  }
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function compareDiscardShowdownHands(left: EvaluatedDiscardHand, right: EvaluatedDiscardHand): number {
  const categoryDifference = CATEGORY_SCORE[right.category] - CATEGORY_SCORE[left.category]
  if (categoryDifference !== 0) return categoryDifference
  if (left.category === 'POINTS' && left.points !== right.points) return right.points - left.points
  if (left.deng !== right.deng) return right.deng - left.deng
  return compareVectors(left.rankVector, right.rankVector) || compareVectors(left.suitVector, right.suitVector)
}

export function resolveDiscardShowdown(hands: readonly DiscardShowdownHand[]): EvaluatedDiscardHand {
  if (hands.length < 2) throw new Error('DISCARD_SHOWDOWN_REQUIRES_TIE')
  const ordered = hands.map(evaluateDiscardShowdownHand).sort((left, right) => (
    compareDiscardShowdownHands(left, right)
    || (left.isLastBoss ? -1 : 0) - (right.isLastBoss ? -1 : 0)
    || left.seat - right.seat
  ))
  return ordered[0]
}
