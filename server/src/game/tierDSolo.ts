import { AI_CONFIGS, type AIConfig } from './aiEngine'
import { createDeck, shuffleDeck, type Card } from './deck'
import { compareHands, evaluateBestFive, evaluateSoloG2BestFive, type BestFiveResult } from './handEvaluator'

export const TIER_D = 'D' as const
export const TIER_D_GAME_POINTS = { 1: 2, 2: 3, 3: 4 } as const
/** Awarded once when the same seat wins G1, G2 and G3 in one match. */
export const TIER_D_TRIPLE_SWEEP_BONUS = 5

export type TierDGameNumber = 1 | 2 | 3
export type TierDSeat = { id: string; isBot: boolean; bot?: AIConfig; difficulty: TierDDifficulty }
export type TierDDifficulty = { band: 'rookie' | 'steady' | 'skilled' | 'elite' | 'master' | 'endless'; skill: number }

/** Display-only Solo roster. Names are selected server-side for each Level. */
export const TIER_D_ENGLISH_BOT_NAMES = [
  'Avery', 'Blake', 'Cameron', 'Dylan', 'Ellis', 'Finley', 'Harper', 'Jordan',
  'Logan', 'Morgan', 'Parker', 'Quinn', 'Riley', 'Rowan', 'Sawyer', 'Taylor',
  'Casey', 'Emerson', 'Hayden', 'Jamie', 'Kai', 'Lennon', 'Micah', 'Noel',
] as const

export interface TierDGameState {
  game: TierDGameNumber
  hands: Record<string, Card[]>
  communityCards: Card[]
  auctionCards: Record<string, Card | undefined>
  resolved: boolean
}

export interface TierDLevelState {
  tier: typeof TIER_D
  level: number
  seats: TierDSeat[]
  scores: Record<string, number>
  games: TierDGameState[]
  gameResults: TierDGameResolution[]
  /** All eleven cards are dealt before arranging, exactly as on the canonical table. */
  dealtHands: Record<string, Card[]>
  arrangements: Record<string, TierDArrangement | undefined>
  communityPiles: TierDCommunityPiles
  /** Undealt cards remain authoritative so a Swap can draw a real card. */
  drawPile: Card[]
}

export type TierDArrangement = { pile1: Card[]; pile2: Card[]; pile3: Card[] }
export type TierDCommunityPiles = { pile1: Card[]; pile2: Card[]; pile3: Card[] }

export interface TierDGameResolution {
  game: TierDGameNumber
  points: number
  winnerId: string | null
  tiedSeatIds: string[]
  hands: Record<string, BestFiveResult>
  bonusPoints?: number
}

export interface TierDLevelResolution {
  gameResults: TierDGameResolution[]
  scores: Record<string, number>
  winnerId: string | null
  tiedSeatIds: string[]
  playerWon: boolean
}

export function tierDBotCount(level: number): number {
  assertLevel(level)
  if (level <= 100) return 1
  if (level <= 400) return 2
  return 3
}

/** Configurable level bands; AI consumers can use `skill` as their policy weight. */
export function tierDDifficulty(level: number): TierDDifficulty {
  assertLevel(level)
  // One fifty-level League maps to one visible skill step. The opponent never
  // sees the player's cards; it only gains better arrangement selection.
  const leagueSkill = Math.min(10, Math.floor((level - 1) / 50) + 1)
  if (leagueSkill === 1) return { band: 'rookie', skill: 1 }
  if (leagueSkill === 2) return { band: 'steady', skill: 2 }
  if (leagueSkill === 3) return { band: 'skilled', skill: 3 }
  if (leagueSkill === 4) return { band: 'elite', skill: 4 }
  if (leagueSkill === 5) return { band: 'master', skill: 5 }
  return { band: 'endless', skill: leagueSkill + Math.floor(Math.max(0, level - 501) / 100) }
}

/** Starts a Tier D level with one human and the level-appropriate number of AI seats. */
export function createTierDLevel(level: number, humanId: string, random: () => number = Math.random): TierDLevelState {
  const difficulty = tierDDifficulty(level)
  const bots = tierDBotCount(level)
  const seats: TierDSeat[] = [{ id: humanId, isBot: false, difficulty }]
  const availableNames = [...TIER_D_ENGLISH_BOT_NAMES]
  for (let index = 0; index < bots; index++) {
    // The personality remains from the established AI architecture; only its
    // display identity is a fresh English Solo opponent name. Splicing makes
    // duplicate names impossible when future configs add more bot seats.
    const base = AI_CONFIGS[(level + index) % AI_CONFIGS.length]
    const nameIndex = Math.floor(random() * availableNames.length)
    const name = availableNames.splice(nameIndex, 1)[0] ?? `Opponent ${index + 1}`
    const bot: AIConfig = { ...base, id: `${base.id}_tier_d_${level}_${index + 1}`, name }
    seats.push({ id: `tier-d-bot-${index + 1}`, isBot: true, bot, difficulty })
  }
  const scores = Object.fromEntries(seats.map(seat => [seat.id, 0])) as Record<string, number>
  // 4 seats × 11 cards + 6 community cards is still a single standard deck.
  const deck = shuffleWith(deckCopy(), random)
  let cursor = 0
  const dealtHands: Record<string, Card[]> = {}
  for (const seat of seats) { dealtHands[seat.id] = deck.slice(cursor, cursor + 11); cursor += 11 }
  const communityPiles = { pile1: deck.slice(cursor, cursor + 2), pile2: deck.slice(cursor + 2, cursor + 4), pile3: deck.slice(cursor + 4, cursor + 6) }
  cursor += 6
  const arrangements: Record<string, TierDArrangement | undefined> = {}
  // Bots arrange immediately. Human cards are intentionally left uncommitted until READY.
  for (const seat of seats) if (seat.isBot) arrangements[seat.id] = arrangeTierDBot(dealtHands[seat.id], communityPiles, seat.difficulty.skill, random)
  const games: TierDGameState[] = [1, 2, 3].map(game => ({
    game: game as TierDGameNumber,
    hands: Object.fromEntries(seats.map(seat => [seat.id, cardsForGame(arrangements[seat.id] ?? defaultTierDArrangement(dealtHands[seat.id]), game as TierDGameNumber)])),
    communityCards: communityPiles[`pile${game}` as keyof TierDCommunityPiles], auctionCards: {}, resolved: false,
  }))
  return { tier: TIER_D, level, seats, scores, games, gameResults: [], dealtHands, arrangements, communityPiles, drawPile: deck.slice(cursor) }
}

/** Exchange a chosen dealt card with one real card from the remaining deck. */
export function swapTierDHandCard(level: TierDLevelState, seatId: string, cardIndex: number): void {
  if (level.gameResults.length > 0 || level.arrangements[seatId]) throw new Error('Swap is available only before READY')
  const hand = level.dealtHands[seatId]
  if (!hand || cardIndex < 0 || cardIndex >= hand.length || level.drawPile.length === 0) throw new Error('Choose one card from your hand to swap')
  const drawn = level.drawPile.shift()!
  const replaced = hand[cardIndex]
  hand[cardIndex] = drawn
  level.drawPile.push(replaced)
}

/** Validate and commit an eleven-card Tier D arrangement. No Tier C foul rule applies. */
export function submitTierDArrangement(level: TierDLevelState, seatId: string, arrangement: TierDArrangement): void {
  const dealt = level.dealtHands[seatId]
  if (!dealt) throw new Error('Unknown Tier D seat')
  if (level.gameResults.length > 0) throw new Error('Tier D arrangement is locked after the first reveal')
  if (arrangement.pile1.length !== 3 || arrangement.pile2.length !== 3 || arrangement.pile3.length !== 5) throw new Error('Tier D piles must contain 3, 3 and 5 cards')
  const expected = dealt.map(cardIdentity).sort().join('|')
  const received = [...arrangement.pile1, ...arrangement.pile2, ...arrangement.pile3].map(cardIdentity).sort().join('|')
  if (expected !== received) throw new Error('Tier D arrangement must use each dealt card exactly once')
  // READY deliberately does not pre-block an out-of-order arrangement. Players
  // own this strategic mistake (and may use an Undo item while arranging); the
  // live game proceeds rather than trapping them behind a validation dialog.
  level.arrangements[seatId] = { pile1: [...arrangement.pile1], pile2: [...arrangement.pile2], pile3: [...arrangement.pile3] }
  for (const game of level.games) game.hands[seatId] = cardsForGame(level.arrangements[seatId]!, game.game)
}

/** One fresh deal per G keeps every 1–4 seat game inside a standard 52-card deck. */
export function dealTierDGame(game: TierDGameNumber, seats: readonly TierDSeat[], random: () => number = Math.random): TierDGameState {
  const deck = shuffleWith(deckCopy(), random)
  const hands: Record<string, Card[]> = {}
  let cursor = 0
  for (const seat of seats) {
    hands[seat.id] = deck.slice(cursor, cursor + 5)
    cursor += 5
  }
  return { game, hands, communityCards: deck.slice(cursor, cursor + 2), auctionCards: {}, resolved: false }
}

/** Auction ownership is per G and strictly capped at one card per player. */
export function assignTierDAuctionCard(game: TierDGameState, seatId: string, card: Card): void {
  if (!(seatId in game.hands)) throw new Error('Unknown Tier D seat')
  if (game.game !== 2) throw new Error('Auction Card applies to G2 only')
  if (game.resolved) throw new Error('Cannot assign an Auction Card after resolution')
  if (game.auctionCards[seatId]) throw new Error('A Tier D player may own only one Auction Card per game')
  game.auctionCards[seatId] = card
}

export function resolveTierDGame(level: TierDLevelState, gameNumber: TierDGameNumber): TierDGameResolution {
  const game = level.games[gameNumber - 1]
  if (game.resolved) throw new Error('Tier D game already resolved')
  const eligible = level.seats
  const hands: Record<string, BestFiveResult> = {}
  for (const seat of eligible) {
    hands[seat.id] = game.game === 2
      ? evaluateSoloG2BestFive(game.hands[seat.id], game.communityCards, game.auctionCards[seat.id])
      : evaluateBestFive([...game.hands[seat.id], ...game.communityCards])
  }
  const best = eligible.reduce<BestFiveResult | undefined>((current, seat) => {
    const hand = hands[seat.id]
    return !current || compareHands(hand, current) > 0 ? hand : current
  }, undefined)
  const tiedSeatIds = best ? eligible.filter(seat => compareHands(hands[seat.id], best) === 0).map(seat => seat.id) : []
  // Exact poker ties award no pile points. This is deterministic and avoids an arbitrary seat-order winner.
  const winnerId = tiedSeatIds.length === 1 ? tiedSeatIds[0] : null
  const points = winnerId ? TIER_D_GAME_POINTS[gameNumber] : 0
  if (winnerId) level.scores[winnerId] += points
  game.resolved = true
  const resolution: TierDGameResolution = { game: gameNumber, points, winnerId, tiedSeatIds, hands }
  level.gameResults.push(resolution)
  if (gameNumber === 3 && winnerId && level.gameResults.length === 3 && level.gameResults.every(result => result.winnerId === winnerId)) {
    level.scores[winnerId] += TIER_D_TRIPLE_SWEEP_BONUS
    resolution.bonusPoints = TIER_D_TRIPLE_SWEEP_BONUS
  }
  return resolution
}

export function resolveTierDLevel(level: TierDLevelState, humanId: string): TierDLevelResolution {
  if (level.games.some(game => !game.resolved)) throw new Error('Resolve all Tier D games before resolving the level')
  const topScore = Math.max(...Object.values(level.scores))
  const tiedSeatIds = level.seats.filter(seat => level.scores[seat.id] === topScore).map(seat => seat.id)
  const winnerId = tiedSeatIds.length === 1 ? tiedSeatIds[0] : null
  return { gameResults: [...level.gameResults], scores: { ...level.scores }, winnerId, tiedSeatIds, playerWon: winnerId === humanId }
}

export type TierDProgress = { level: number; currentWinStreak: number; bestWinStreak: number }

/** Pure, item-agnostic progression. A win advances exactly one level; a loss never does. */
export function applyTierDLevelOutcome(progress: TierDProgress, won: boolean): TierDProgress {
  if (!Number.isInteger(progress.level) || progress.level < 1) throw new Error('Tier D level must be a positive integer')
  if (won) {
    const currentWinStreak = progress.currentWinStreak + 1
    return { level: progress.level + 1, currentWinStreak, bestWinStreak: Math.max(progress.bestWinStreak, currentWinStreak) }
  }
  return { ...progress, currentWinStreak: 0 }
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) throw new Error('Tier D level must be a positive integer')
}
function deckCopy(): Card[] { return createDeck() }
function cardIdentity(card: Card) { return `${card.rank}-${card.suit}` }
function defaultTierDArrangement(cards: Card[]): TierDArrangement {
  return { pile1: cards.slice(0, 3), pile2: cards.slice(3, 6), pile3: cards.slice(6, 11) }
}

/**
 * Tier D AI sees its own 11 cards plus the three public community piles only.
 * It enumerates legal G1/G2/G3 layouts, then skill chooses how near the best
 * scoring legal plan it can reliably recognise. This changes decision quality,
 * never card dealing, hidden information, or the core ordering rule.
 */
export function arrangeTierDBot(cards: Card[], community: TierDCommunityPiles, skill: number, random: () => number = Math.random): TierDArrangement {
  type Candidate = { arrangement: TierDArrangement; total: number }
  const candidates: Candidate[] = []
  forEachCombination(cards, 3, pile1 => {
    const afterP1 = withoutCards(cards, pile1)
    forEachCombination(afterP1, 3, pile2 => {
      const pile3 = withoutCards(afterP1, pile2)
      const h1 = evaluateBestFive([...pile1, ...community.pile1])
      const h2 = evaluateBestFive([...pile2, ...community.pile2])
      const h3 = evaluateBestFive([...pile3, ...community.pile3])
      if (compareHands(h1, h2) > 0 || compareHands(h2, h3) > 0) return
      // Keep later piles valuable, while reserving meaningful G1/G2 strength.
      candidates.push({ arrangement: { pile1, pile2, pile3 }, total: h1.score * 2 + h2.score * 3 + h3.score * 4 })
    })
  })
  if (!candidates.length) return defaultTierDArrangement(cards)
  candidates.sort((a, b) => b.total - a.total)
  const recognition: Record<number, number> = { 1: .45, 2: .25, 3: .1, 4: .035, 5: .012, 6: .006, 7: .003, 8: .0015, 9: .0007, 10: .00025 }
  const window = Math.max(1, Math.ceil(candidates.length * (recognition[Math.min(10, Math.max(1, Math.floor(skill)))] ?? .0001)))
  return candidates[Math.min(window - 1, Math.floor(random() * window))].arrangement
}

function forEachCombination(cards: readonly Card[], size: number, visit: (selection: Card[]) => void): void {
  const choose = (start: number, selected: Card[]) => {
    if (selected.length === size) { visit(selected); return }
    for (let index = start; index <= cards.length - (size - selected.length); index++) choose(index + 1, [...selected, cards[index]])
  }
  choose(0, [])
}
function withoutCards(source: readonly Card[], removed: readonly Card[]): Card[] {
  const identities = new Set(removed.map(cardIdentity))
  return source.filter(card => !identities.has(cardIdentity(card)))
}
function cardsForGame(arrangement: TierDArrangement, game: TierDGameNumber): Card[] {
  return game === 1 ? arrangement.pile1 : game === 2 ? arrangement.pile2 : arrangement.pile3
}
function shuffleWith(deck: Card[], random: () => number): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] }
  return shuffled
}
