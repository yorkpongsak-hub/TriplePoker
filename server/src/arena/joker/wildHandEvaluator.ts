import { Card, Rank, Suit } from '../../game/deck'
import { compareHands, evaluateHand, HandResult } from '../../game/handEvaluator'
import { ArenaCard, ArenaStandardCard } from '../cards/arenaDeck'

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const RANKS: Array<{ rank: Rank; value: number }> = [
  { rank: '2', value: 2 }, { rank: '3', value: 3 }, { rank: '4', value: 4 },
  { rank: '5', value: 5 }, { rank: '6', value: 6 }, { rank: '7', value: 7 },
  { rank: '8', value: 8 }, { rank: '9', value: 9 }, { rank: '10', value: 10 },
  { rank: 'J', value: 11 }, { rank: 'Q', value: 12 }, { rank: 'K', value: 13 },
  { rank: 'A', value: 14 },
]

export interface ArenaHandResult extends HandResult {
  natural: boolean
  jokerAs: { rank: Rank; suit: Suit } | null
  selectedCardIds: string[]
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === size) { result.push([...chosen]); return }
    for (let i = start; i <= items.length - (size - chosen.length); i++) {
      chosen.push(items[i]); visit(i + 1, chosen); chosen.pop()
    }
  }
  visit(0, [])
  return result
}

function standard(card: ArenaStandardCard): Card {
  return { rank: card.rank, suit: card.suit, value: card.value }
}

function better(candidate: ArenaHandResult, current: ArenaHandResult | null): boolean {
  if (!current) return true
  const comparison = compareHands(candidate, current)
  if (comparison !== 0) return comparison > 0
  return candidate.natural && !current.natural
}

export function evaluateArenaHand(cards: readonly ArenaCard[]): ArenaHandResult {
  if (cards.length < 5 || cards.length > 7) throw new Error('ARENA_HAND_REQUIRES_5_TO_7_CARDS')
  if (cards.filter(card => card.kind === 'JOKER').length > 1) throw new Error('ARENA_HAND_ALLOWS_ONE_JOKER')

  let best: ArenaHandResult | null = null
  for (const selected of combinations(cards, 5)) {
    const jokerIndex = selected.findIndex(card => card.kind === 'JOKER')
    if (jokerIndex < 0) {
      const result = evaluateHand((selected as ArenaStandardCard[]).map(standard))
      const candidate = { ...result, natural: true, jokerAs: null, selectedCardIds: selected.map(card => card.id) }
      if (better(candidate, best)) best = candidate
      continue
    }

    const fixed = selected.filter((card): card is ArenaStandardCard => card.kind === 'STANDARD')
    const rankCounts = new Map<Rank, number>()
    fixed.forEach(card => rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1))
    for (const { rank, value } of RANKS) {
      if ((rankCounts.get(rank) ?? 0) >= 4) continue
      for (const suit of SUITS) {
        const replacement: Card = { rank, suit, value }
        const result = evaluateHand([...fixed.map(standard), replacement])
        const candidate: ArenaHandResult = {
          ...result,
          natural: false,
          jokerAs: { rank, suit },
          selectedCardIds: selected.map(card => card.id),
        }
        if (better(candidate, best)) best = candidate
      }
    }
  }
  if (!best) throw new Error('ARENA_HAND_COULD_NOT_BE_EVALUATED')
  return best
}

export function compareArenaHands(first: ArenaHandResult, second: ArenaHandResult): number {
  const comparison = compareHands(first, second)
  if (comparison !== 0) return comparison
  if (first.natural !== second.natural) return first.natural ? 1 : -1
  return 0
}
