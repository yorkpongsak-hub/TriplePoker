import { Card, Rank, Suit } from '../../game/deck'

export type ArenaStandardCard = Card & { kind: 'STANDARD'; id: string }
export type ArenaJokerCard = { kind: 'JOKER'; id: 'JOKER' }
export type ArenaCard = ArenaStandardCard | ArenaJokerCard
export type ArenaRandom = () => number

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
}

export interface ArenaDeal {
  players: [ArenaCard[], ArenaCard[], ArenaCard[], ArenaCard[]]
  community: { pile1: ArenaCard[]; pile2: ArenaCard[]; pile3: ArenaCard[] }
  auction: { faceUp: ArenaCard; blind: [ArenaCard, ArenaCard] }
}

export function createArenaDeck(): ArenaCard[] {
  const cards: ArenaCard[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ kind: 'STANDARD', id: `${rank}_${suit}`, suit, rank, value: VALUES[rank] })
    }
  }
  cards.push({ kind: 'JOKER', id: 'JOKER' })
  return cards
}

export function shuffleArenaDeck(deck: readonly ArenaCard[], random: ArenaRandom = Math.random): ArenaCard[] {
  if (deck.length !== 53 || deck.filter(card => card.kind === 'JOKER').length !== 1) {
    throw new Error('ARENA_DECK_MUST_CONTAIN_52_STANDARD_CARDS_AND_ONE_JOKER')
  }
  const shuffled = deck.filter((card): card is ArenaStandardCard => card.kind === 'STANDARD')
  for (let i = shuffled.length - 1; i > 0; i--) {
    const roll = random()
    if (roll < 0 || roll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
    const j = Math.floor(roll * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Joker is never mixed into the 52-card deal. Take the final two shuffled
  // standard cards and shuffle only those three cards into the two blind
  // auction slots and Pile 3's hidden second community slot.
  const hiddenFinal: ArenaCard[] = [shuffled[50], shuffled[51], deck.find(card => card.kind === 'JOKER')!]
  for (let i = hiddenFinal.length - 1; i > 0; i--) {
    const roll = random()
    if (roll < 0 || roll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
    const j = Math.floor(roll * (i + 1))
    ;[hiddenFinal[i], hiddenFinal[j]] = [hiddenFinal[j], hiddenFinal[i]]
  }

  // Preserve dealArenaCards' established positional contract:
  // 0..48 hands/open community, 49 hidden P3, 50 face-up auction, 51..52 blind.
  return [...shuffled.slice(0, 49), hiddenFinal[0], shuffled[49], hiddenFinal[1], hiddenFinal[2]]
}

export function dealArenaCards(deck: readonly ArenaCard[]): ArenaDeal {
  if (deck.length !== 53 || new Set(deck.map(card => card.id)).size !== 53) {
    throw new Error('ARENA_DECK_MUST_CONTAIN_53_UNIQUE_CARDS')
  }
  let index = 0
  const players = [0, 1, 2, 3].map(() => {
    const hand = deck.slice(index, index + 11)
    index += 11
    return hand
  }) as [ArenaCard[], ArenaCard[], ArenaCard[], ArenaCard[]]
  const community = {
    pile1: deck.slice(index, index + 2),
    pile2: deck.slice(index + 2, index + 4),
    pile3: deck.slice(index + 4, index + 6),
  }
  index += 6
  const auction = {
    faceUp: deck[index],
    blind: [deck[index + 1], deck[index + 2]] as [ArenaCard, ArenaCard],
  }
  return { players, community, auction }
}

export function arenaCardKey(card: ArenaCard): string {
  return card.kind === 'JOKER' ? 'JOKER' : `${card.rank.toLowerCase()}${card.suit[0]}`
}

export function createSeededRandom(seed: number): ArenaRandom {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}
