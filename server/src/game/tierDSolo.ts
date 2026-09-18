import { AI_CONFIGS, type AIConfig } from './aiEngine'
import { assertCardZones, evaluateSharedPile, isSharedArrangementFoul } from './sharedCardRules'
import { createDeck, shuffleDeck, type Card } from './deck'
import { compareHands, evaluateBestFive, evaluateSoloG2BestFive, type BestFiveResult } from './handEvaluator'
import { TIER_D_PILE_BASE_SCORES, getCurrentLeague, tierDBotCountForLevel, type LeagueId } from './tierDLeague'
import { comboBonus, generateMissions, generateOpenChallenge, missionResult, pileWinScore, type Mission, type OpenChallenge } from './leagueGameplay'

export const TIER_D = 'D' as const
export const TIER_D_GAME_POINTS = TIER_D_PILE_BASE_SCORES
/** Awarded once when the same seat wins G1, G2 and G3 in one match. */
export const TIER_D_TRIPLE_SWEEP_BONUS = 5

/** Legacy name: this is a PILE index, not a Game or Match index. */
export type TierDGameNumber = 1 | 2 | 3
export type TierDSeat = { id: string; isBot: boolean; bot?: AIConfig; difficulty: TierDDifficulty }
export type TierDDifficulty = { band: 'rookie' | 'steady' | 'skilled' | 'elite' | 'master' | 'endless'; skill: number }

/**
 * Deliberately forgiving Solo AI ceiling. Higher Leagues remain harder through
 * more opponents, shorter timers and a narrower (but still human-like) choice
 * window instead of endlessly increasing perfect arrangement recognition.
 */
export const TIER_D_AI_SKILL_BY_LEAGUE: Readonly<Record<LeagueId, number>> = {
  bronze: 1,
  silver: 1,
  gold: 1,
  platinum: 2,
  diamond: 2,
  elite: 3,
  master: 3,
  grandmaster: 4,
  legend: 4,
  mythic: 5,
}

export const TIER_D_AI_CANDIDATE_FRACTION_BY_LEAGUE: Readonly<Record<LeagueId, number>> = {
  bronze: .90,
  silver: .85,
  gold: .80,
  platinum: .75,
  diamond: .70,
  elite: .65,
  master: .50,
  grandmaster: .40,
  legend: .30,
  mythic: .20,
}

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
  /** A player may reveal any physical layout; an out-of-order G1/G2/G3 layout is a foul. */
  fouled: Record<string, boolean>
  communityPiles: TierDCommunityPiles
  /** Shared and visible from deal time; never changes for this Match. */
  comboBotId?: string
  comboBonuses?: Record<string, number>
  missions: Mission[]
  openChallenge?: OpenChallenge
  /** Bronze only: piles exposed before arrangement for the approved tutorial curve. */
  guidedRevealPiles: TierDGameNumber[]
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
  missionScores: Record<string, number>
  missionPenalties: Record<string, number>
  fouled: Record<string, boolean>
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
  return tierDBotCountForLevel(level)
}

/** League-capped level bands; AI strength never grows beyond Mythic skill 5. */
export function tierDDifficulty(level: number): TierDDifficulty {
  assertLevel(level)
  const skill = TIER_D_AI_SKILL_BY_LEAGUE[getCurrentLeague(level).id]
  const band: TierDDifficulty['band'] = skill === 1 ? 'rookie'
    : skill === 2 ? 'steady'
      : skill === 3 ? 'skilled'
        : skill === 4 ? 'elite'
          : 'master'
  return { band, skill }
}

/** League-specific share of score-ranked valid arrangements used as the random pool. */
export function tierDAiCandidateFraction(level: number): number {
  assertLevel(level)
  return TIER_D_AI_CANDIDATE_FRACTION_BY_LEAGUE[getCurrentLeague(level).id]
}

/** Platinum's opening ten Levels teach multi-opponent Missions to the Player first. */
export function tierDAiMissionsEnabled(level: number): boolean { return level >= 161 }

/** Starts a Tier D level with one human and the level-appropriate number of AI seats. */
export function createTierDLevel(level: number, humanId: string, random: () => number = Math.random, lockedRules?: { comboBotId?: string; missions?: Mission[]; openChallenge?: OpenChallenge; guidedRevealPiles?: TierDGameNumber[] }): TierDLevelState {
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
  const aiSeats = seats.filter(seat => seat.isBot)
  const comboBotId = bots >= 2 && level >= 201 ? (aiSeats.some(seat => seat.id === lockedRules?.comboBotId) ? lockedRules!.comboBotId : aiSeats[Math.floor(random() * aiSeats.length)].id) : undefined
  const scores = Object.fromEntries(seats.map(seat => [seat.id, 0])) as Record<string, number>
  const missions = lockedRules?.missions ?? generateMissions(level, random)
  const openChallenge = level > 1000 && lockedRules && 'openChallenge' in lockedRules ? lockedRules.openChallenge : generateOpenChallenge(level, random)
  const guidedRevealPiles: TierDGameNumber[] = lockedRules?.guidedRevealPiles ?? (level <= 20 ? [1, 2, 3] : level <= 40 ? [1, 2] : level <= 50 ? [1] : [])
  // 4 seats × 11 cards + 6 community cards is still a single standard deck.
  const deck = shuffleWith(deckCopy(), random)
  let cursor = 0
  const dealtHands: Record<string, Card[]> = {}
  for (const seat of seats) { dealtHands[seat.id] = deck.slice(cursor, cursor + 11); cursor += 11 }
  const communityPiles = { pile1: deck.slice(cursor, cursor + 2), pile2: deck.slice(cursor + 2, cursor + 4), pile3: deck.slice(cursor + 4, cursor + 6) }
  cursor += 6
  const arrangements: Record<string, TierDArrangement | undefined> = {}
  // Bots arrange immediately. Human cards are intentionally left uncommitted until READY.
  for (const seat of seats) if (seat.isBot) {
    const missionAware = tierDAiMissionsEnabled(level) && (!comboBotId || seat.id === comboBotId)
    arrangements[seat.id] = arrangeTierDBot(dealtHands[seat.id], communityPiles, seat.difficulty.skill, random, missionAware ? missions : [], seat.id === comboBotId, tierDAiCandidateFraction(level))
  }
  const games: TierDGameState[] = [1, 2, 3].map(game => ({
    game: game as TierDGameNumber,
    hands: Object.fromEntries(seats.map(seat => [seat.id, cardsForGame(arrangements[seat.id] ?? defaultTierDArrangement(dealtHands[seat.id]), game as TierDGameNumber)])),
    communityCards: communityPiles[`pile${game}` as keyof TierDCommunityPiles], auctionCards: {}, resolved: false,
  }))
  const fouled = Object.fromEntries(seats.map(seat => [seat.id, false])) as Record<string, boolean>
  const state: TierDLevelState = { tier: TIER_D, level, seats, scores, games, gameResults: [], dealtHands, arrangements, fouled, communityPiles, missions, comboBotId, openChallenge, guidedRevealPiles, drawPile: deck.slice(cursor) }
  assertTierDCardConservation(state)
  return state
}

/** Physical-card invariant. Game hands/arrangements are views over these cards, not extra cards. */
export function assertTierDCardConservation(level: TierDLevelState): true {
  const physical=[...Object.values(level.dealtHands).flat(),...level.communityPiles.pile1,...level.communityPiles.pile2,...level.communityPiles.pile3,...level.drawPile]
  if(physical.length!==52)throw new Error(`Tier D card conservation failed: expected 52 physical cards, received ${physical.length}`)
  const identities=physical.map(cardIdentity)
  if(new Set(identities).size!==52)throw new Error('Tier D card conservation failed: duplicate or missing card identity')
  assertCardZones({ hands: Object.values(level.dealtHands).flat(), community: Object.values(level.communityPiles).flat(), deck: level.drawPile })
  for (const [seat, arrangement] of Object.entries(level.arrangements)) if (arrangement) {
    const cards = Object.values(arrangement).flat().map(cardIdentity).sort().join('|')
    if (cards !== level.dealtHands[seat].map(cardIdentity).sort().join('|')) throw new Error('Arrangement ownership does not match dealt hand')
  }
  return true
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
  assertTierDCardConservation(level)
}

/** Validate and commit the physical layout. An invalid G1 < G2 < G3 order is revealed as a foul, never rearranged. */
export function submitTierDArrangement(level: TierDLevelState, seatId: string, arrangement: TierDArrangement): void {
  const dealt = level.dealtHands[seatId]
  if (!dealt) throw new Error('Unknown Tier D seat')
  if (level.gameResults.length > 0) throw new Error('Tier D arrangement is locked after the first reveal')
  if (arrangement.pile1.length !== 3 || arrangement.pile2.length !== 3 || arrangement.pile3.length !== 5) throw new Error('Tier D piles must contain 3, 3 and 5 cards')
  const expected = dealt.map(cardIdentity).sort().join('|')
  const received = [...arrangement.pile1, ...arrangement.pile2, ...arrangement.pile3].map(cardIdentity).sort().join('|')
  if (expected !== received) throw new Error('Tier D arrangement must use each dealt card exactly once')
  level.fouled[seatId] = isSharedArrangementFoul(arrangement, level.communityPiles)
  level.arrangements[seatId] = { pile1: [...arrangement.pile1], pile2: [...arrangement.pile2], pile3: [...arrangement.pile3] }
  for (const game of level.games) game.hands[seatId] = cardsForGame(level.arrangements[seatId]!, game.game)
  assertTierDCardConservation(level)
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

export function resolveTierDGame(level: TierDLevelState, gameNumber: TierDGameNumber, options?: { doubledSeatId?: string; doubledPile?: TierDGameNumber }): TierDGameResolution {
  const game = level.games[gameNumber - 1]
  if (game.resolved) throw new Error('Tier D game already resolved')
  const eligible = level.seats.filter(seat => !level.fouled[seat.id])
  const hands: Record<string, BestFiveResult> = {}
  for (const seat of level.seats) {
    hands[seat.id] = game.game === 2
      ? evaluateSoloG2BestFive(game.hands[seat.id], game.communityCards, game.auctionCards[seat.id])
      : evaluateBestFive([...game.hands[seat.id], ...game.communityCards])
  }
  const best = eligible.reduce<BestFiveResult | undefined>((current, seat) => {
    const hand = hands[seat.id]
    return !current || compareHands(hand, current) > 0 ? hand : current
  }, undefined)
  const tiedSeatIds = best ? eligible.filter(seat => compareHands(hands[seat.id], best) === 0).map(seat => seat.id) : []
  // Canon exception: a Player tie beats every AI tied for the best hand.
  // AI-only ties remain ties and award no pile.
  const human = eligible.find(seat => !seat.isBot)
  const winnerId = human && tiedSeatIds.includes(human.id) ? human.id : tiedSeatIds.length === 1 ? tiedSeatIds[0] : null
  const doubled = !!winnerId && options?.doubledSeatId === winnerId && options.doubledPile === gameNumber
  const points = winnerId ? pileWinScore(level.level, gameNumber, hands[winnerId].rank, doubled) : 0
  if (winnerId) level.scores[winnerId] += points
  const mission = level.missions.find(entry => entry.pile === gameNumber)
  const missionScores = Object.fromEntries(eligible.map(seat => [seat.id, 0])) as Record<string, number>
  const missionPenalties = Object.fromEntries(eligible.map(seat => [seat.id, 0])) as Record<string, number>
  if (mission) for (const seat of eligible.filter(seat => !seat.isBot || tierDAiMissionsEnabled(level.level))) {
    const result = missionResult(mission, hands[seat.id].rank)
    missionScores[seat.id] = result.score; missionPenalties[seat.id] = result.penalty
    level.scores[seat.id] += result.score + result.penalty
  }
  game.resolved = true
  const resolution: TierDGameResolution = { game: gameNumber, points, winnerId, tiedSeatIds, hands, missionScores, missionPenalties, fouled: { ...level.fouled } }
  level.gameResults.push(resolution)
  if (gameNumber === 3 && winnerId && level.gameResults.length === 3 && level.gameResults.every(result => result.winnerId === winnerId)) {
    level.scores[winnerId] += TIER_D_TRIPLE_SWEEP_BONUS
    resolution.bonusPoints = TIER_D_TRIPLE_SWEEP_BONUS
  }
  assertTierDCardConservation(level)
  return resolution
}

/** Roll Combo/Super Combo only after G3 is committed, never on provisional reveal. */
export function commitTierDCombo(level: TierDLevelState, random: () => number = Math.random, committedThrough = 3): Record<string, number> {
  if (committedThrough === 3 && level.gameResults.length !== 3) throw new Error('Commit all three piles before Combo resolution')
  if (level.comboBonuses) return level.comboBonuses
  const bonuses = Object.fromEntries(level.seats.map(seat => [seat.id, 0])) as Record<string, number>
  if (level.missions.length < 2 || level.missions.some(mission => mission.pile > committedThrough || !level.gameResults.some(result => result.game === mission.pile))) return bonuses
  for (const seat of level.seats) {
    if (level.fouled[seat.id]) continue
    if (seat.isBot && !tierDAiMissionsEnabled(level.level)) continue
    const complete = level.missions.map(missionEntry => {
      const result = level.gameResults.find(gameResult => gameResult.game === missionEntry.pile)!
      return missionResult(missionEntry, result.hands[seat.id].rank).complete
    })
    const bonus = comboBonus(level.missions, complete, random)
    bonuses[seat.id] = bonus
    level.scores[seat.id] += bonus
  }
  level.comboBonuses = bonuses
  return bonuses
}

/** Undo cancels the current provisional result without generating reverse VFX. */
export function rollbackTierDGame(level: TierDLevelState, gameNumber: TierDGameNumber, scoreSnapshot: Record<string, number>): void {
  const latest = level.gameResults[level.gameResults.length - 1]
  if (!latest || latest.game !== gameNumber) throw new Error('Only the current provisional pile can be undone')
  level.scores = { ...scoreSnapshot }
  level.gameResults.pop()
  level.games[gameNumber - 1].resolved = false
  assertTierDCardConservation(level)
}

/** Resubmit after Undo while preserving every already committed earlier pile. */
export function submitTierDUndoArrangement(level: TierDLevelState, seatId: string, arrangement: TierDArrangement, unlockedFrom: TierDGameNumber): void {
  const previous = level.arrangements[seatId]
  if (!previous) throw new Error('No arrangement is available to Undo')
  for (let pile = 1 as TierDGameNumber; pile < unlockedFrom; pile = (pile + 1) as TierDGameNumber) {
    const key = `pile${pile}` as keyof TierDArrangement
    if (previous[key].map(cardIdentity).join('|') !== arrangement[key].map(cardIdentity).join('|')) throw new Error(`G${pile} is already committed`)
  }
  const committedResults = level.gameResults
  level.gameResults = []
  try { submitTierDArrangement(level, seatId, arrangement) }
  finally { level.gameResults = committedResults }
}

export function resolveTierDLevel(level: TierDLevelState, humanId: string): TierDLevelResolution {
  if (level.games.some(game => !game.resolved)) throw new Error('Resolve all Tier D games before resolving the level')
  const topScore = Math.max(...Object.values(level.scores))
  const tiedSeatIds = level.seats.filter(seat => level.scores[seat.id] === topScore).map(seat => seat.id)
  const winnerId = tiedSeatIds.includes(humanId) ? humanId : tiedSeatIds.length === 1 ? tiedSeatIds[0] : null
  return { gameResults: [...level.gameResults], scores: { ...level.scores }, winnerId, tiedSeatIds, playerWon: tiedSeatIds.includes(humanId) }
}

/** Open Challenge is a Level-pass gate: every Open Match must be swept. */
export function openChallengeMatchPassed(level: TierDLevelState, humanId: string): boolean {
  return level.level <= 1000 || !level.openChallenge || level.gameResults.length === 3 && level.gameResults.every(result => result.winnerId === humanId)
}

export type TierDProgress = { level: number; currentWinStreak: number; bestWinStreak: number }

/** Pure, item-agnostic progression. A win advances exactly one level; a loss never does. */
export function applyTierDLevelOutcome(progress: TierDProgress, won: boolean): TierDProgress {
  if (!Number.isInteger(progress.level) || progress.level < 1) throw new Error('Tier D level must be a positive integer')
  // Bronze is the guided teaching league: its visible AI cards must not earn streak credit.
  if (progress.level < 51) return { level: won ? progress.level + 1 : progress.level, currentWinStreak: 0, bestWinStreak: progress.bestWinStreak }
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
export function defaultTierDArrangement(cards: Card[]): TierDArrangement {
  return { pile1: cards.slice(0, 3), pile2: cards.slice(3, 6), pile3: cards.slice(6, 11) }
}
function evaluatePile(arrangement: TierDArrangement, community: TierDCommunityPiles, game: TierDGameNumber): BestFiveResult {
  return evaluateSharedPile(arrangement, community, game)
}

/** Random traversal stops at the first legal layout, without scoring/optimizing it. */
export function automaticTierDArrangement(cards: Card[], community: TierDCommunityPiles, random: () => number = Math.random): TierDArrangement {
  return firstValidTierDArrangement(shuffleWith([...cards], random), community)
}

/**
 * Tier D AI sees its own 11 cards plus the three public community piles only.
 * It enumerates legal G1/G2/G3 layouts, then skill chooses how near the best
 * scoring legal plan it can reliably recognise. This changes decision quality,
 * never card dealing, hidden information, or the core ordering rule.
 */
export function arrangeTierDBot(cards: Card[], community: TierDCommunityPiles, skill: number, random: () => number = Math.random, missions: readonly Mission[] = [], comboFocus = false, candidateFraction = .90): TierDArrangement {
  type Candidate = { arrangement: TierDArrangement; total: number }
  const candidates: Candidate[] = []
  forEachCombination(cards, 3, pile1 => {
    const afterP1 = withoutCards(cards, pile1)
    forEachCombination(afterP1, 3, pile2 => {
      const pile3 = withoutCards(afterP1, pile2)
      const h1 = evaluateBestFive([...pile1, ...community.pile1])
      const h2 = evaluateBestFive([...pile2, ...community.pile2])
      const h3 = evaluateBestFive([...pile3, ...community.pile3])
      if (compareHands(h1, h2) >= 0 || compareHands(h2, h3) >= 0) return
      const arrangement = { pile1, pile2, pile3 }
      candidates.push({ arrangement, total: tierDBotHandsUtility([h1,h2,h3], skill, missions, comboFocus) })
    })
  })
  if (!candidates.length) return defaultTierDArrangement(cards)
  candidates.sort((a, b) => b.total - a.total)
  const boundedFraction = Math.min(1, Math.max(.01, candidateFraction))
  const window = Math.max(1, Math.ceil(candidates.length * boundedFraction))
  return candidates[Math.min(window - 1, Math.floor(random() * window))].arrangement
}

/** Score only information legally available to the AI when it locks its layout. */
export function tierDBotArrangementUtility(arrangement: TierDArrangement, community: TierDCommunityPiles, skill: number, missions: readonly Mission[] = [], comboFocus = false): number {
  const hands=([1,2,3] as TierDGameNumber[]).map(game=>evaluatePile(arrangement,community,game))
  return tierDBotHandsUtility(hands,skill,missions,comboFocus)
}

function tierDBotHandsUtility(hands: BestFiveResult[], skill: number, missions: readonly Mission[], comboFocus = false): number {
  const base=[TIER_D_GAME_POINTS[1],TIER_D_GAME_POINTS[2],TIER_D_GAME_POINTS[3]]
  const strength=hands.reduce((sum,hand,index)=>sum+base[index]*(hand.rankIndex+1+(hand.score%100000000000)/100000000000),0)
  if((skill<4&&!comboFocus)||missions.length===0)return strength
  const outcomes=missions.map(mission=>missionResult(mission,hands[mission.pile-1].rank))
  const missionValue=outcomes.reduce((sum,result)=>sum+result.score+result.penalty,0)
  const allComplete=outcomes.every(result=>result.complete)
  const comboExpected=allComplete?(missions.length===2?6:missions.length===3?12.5:0):0
  // Even the specialist treats Combo as a preference, not an optimizer. Normal
  // opponents only model Combo EV at the Mythic ceiling.
  const strategyWeight=comboFocus?1.5:skill>=5?0.75:0.5
  return strength+strategyWeight*(missionValue+(comboFocus||skill>=5?comboExpected:0))
}

/** Timeout fallback: first legal layout in deal order, with no score objective. */
export function firstValidTierDArrangement(cards: Card[], community: TierDCommunityPiles): TierDArrangement {
  let found: TierDArrangement | undefined
  forEachCombination(cards, 3, pile1 => {
    if (found) return
    const afterP1 = withoutCards(cards, pile1)
    forEachCombination(afterP1, 3, pile2 => {
      if (found) return
      const pile3 = withoutCards(afterP1, pile2)
      const candidate = { pile1, pile2, pile3 }
      const h1 = evaluatePile(candidate, community, 1)
      const h2 = evaluatePile(candidate, community, 2)
      const h3 = evaluatePile(candidate, community, 3)
      if (compareHands(h1, h2) < 0 && compareHands(h2, h3) < 0) found = candidate
    })
  })
  if (!found) throw new Error('No valid G1 < G2 < G3 arrangement exists for this deal')
  return found
}

/**
 * Inventory Auto Sort's canonical selector.  It shares Tier D's existing
 * Best-5/7 evaluator and legal G1 < G2 < G3 rule; it never scores a match or
 * presses Reveal.  `undefined` means no legal rearrangement can be made.
 */
export function strongestTierDArrangement(cards: Card[], community: TierDCommunityPiles): TierDArrangement | undefined {
  let strongest: TierDArrangement | undefined
  let strongestValue = -Infinity
  forEachCombination(cards, 3, pile1 => {
    const afterP1 = withoutCards(cards, pile1)
    forEachCombination(afterP1, 3, pile2 => {
      const pile3 = withoutCards(afterP1, pile2)
      const candidate = { pile1, pile2, pile3 }
      const hands = ([1, 2, 3] as TierDGameNumber[]).map(game => evaluatePile(candidate, community, game))
      if (compareHands(hands[0], hands[1]) >= 0 || compareHands(hands[1], hands[2]) >= 0) return
      // Preserve the normal pile-value emphasis while using the evaluator's
      // full tie-breaking score to select a deterministic strongest legal plan.
      const value = hands.reduce((total, hand, index) => total + TIER_D_GAME_POINTS[index + 1 as TierDGameNumber] * (hand.rankIndex * 1_000_000_000_000 + hand.score), 0)
      if (value > strongestValue) { strongest = candidate; strongestValue = value }
    })
  })
  return strongest
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
