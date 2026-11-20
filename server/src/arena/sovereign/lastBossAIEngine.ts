import { ArenaArrangement, checkArenaFoul, evaluatePileBest } from '../arrangement/arenaArrangement'
import { ArenaCard, ArenaDeal, ArenaRandom, createArenaDeck } from '../cards/arenaDeck'
import { ArenaHandResult, compareArenaHands } from '../joker/wildHandEvaluator'

export interface LastBossPublicAction {
  playerId: string
  type: 'AUCTION_BID' | 'CALL' | 'FOLD' | 'REVEAL'
  amountCrest?: number
  revealedCards?: readonly ArenaCard[]
}

export interface LastBossArrangementDecision {
  arrangement: ArenaArrangement
  evaluatedPartitions: number
  score: number
  fallback: boolean
}

export interface LastBossBetDecision {
  action: 'CALL' | 'FOLD'
  estimatedEquity: number
  requiredEquity: number
  reasonCode: 'VALUE_CALL' | 'POT_ODDS_FOLD'
}

export interface LastBossBidDecision {
  bidCrest: number
  estimatedGain: number
  reasonCode: 'INELIGIBLE' | 'PASS' | 'DENIAL' | 'VALUE'
}

export interface LastBossAIOptions {
  random?: ArenaRandom
  monteCarloSamples?: number
  riskMargin?: number
}

interface OpponentTendency {
  actions: number
  bidCrest: number
  calls: number
  folds: number
  revealedStrength: number
}

const PILE1_WEIGHT = 0.92
const PILE2_WEIGHT = 1.02
const PILE3_WEIGHT = 1.22

function combinations<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  const selected: T[] = []
  const visit = (start: number): void => {
    if (selected.length === size) { out.push([...selected]); return }
    for (let index = start; index <= items.length - (size - selected.length); index++) {
      selected.push(items[index]); visit(index + 1); selected.pop()
    }
  }
  visit(0)
  return out
}

function without<T>(source: readonly T[], removed: readonly T[]): T[] {
  const remove = new Set(removed)
  return source.filter(item => !remove.has(item))
}

function handPower(hand: ArenaHandResult): number {
  // HandResult.score already preserves category and tie-break order. The small
  // natural bonus only separates an otherwise equal natural hand from a Joker hand.
  return hand.score + (hand.natural ? 0.001 : 0)
}

function assertUniqueCards(cards: readonly ArenaCard[]): void {
  if (new Set(cards.map(card => card.id)).size !== cards.length) throw new Error('LAST_BOSS_DUPLICATE_CARD')
}

/**
 * Server-authoritative Tier S+ decision engine. It consumes only the Boss hand,
 * public community cards and public actions. It never receives private human cards.
 */
export class LastBossAIEngine {
  private readonly random: ArenaRandom
  private readonly monteCarloSamples: number
  private readonly riskMargin: number
  private readonly tendencies = new Map<string, OpponentTendency>()
  private readonly handCache = new Map<string, ArenaHandResult>()

  constructor(options: LastBossAIOptions = {}) {
    this.random = options.random ?? Math.random
    this.monteCarloSamples = options.monteCarloSamples ?? 480
    this.riskMargin = options.riskMargin ?? 0.025
    if (!Number.isSafeInteger(this.monteCarloSamples) || this.monteCarloSamples < 32) {
      throw new Error('LAST_BOSS_MONTE_CARLO_SAMPLES_TOO_LOW')
    }
  }

  observe(actions: readonly LastBossPublicAction[]): void {
    for (const action of actions) {
      const row = this.tendencies.get(action.playerId) ?? { actions: 0, bidCrest: 0, calls: 0, folds: 0, revealedStrength: 0 }
      row.actions++
      if (action.type === 'AUCTION_BID') row.bidCrest += Math.max(0, action.amountCrest ?? 0)
      if (action.type === 'CALL') row.calls++
      if (action.type === 'FOLD') row.folds++
      if (action.type === 'REVEAL' && action.revealedCards && action.revealedCards.length >= 3) {
        row.revealedStrength += action.revealedCards.reduce((sum, card) => sum + (card.kind === 'JOKER' ? 15 : card.value), 0)
      }
      this.tendencies.set(action.playerId, row)
    }
  }

  /** Exhaustively checks all C(11,3) * C(8,3) = 9,240 legal 3-3-5 partitions. */
  arrange(cards: readonly ArenaCard[], community: ArenaDeal['community']): LastBossArrangementDecision {
    if (cards.length !== 11) throw new Error('LAST_BOSS_ARRANGEMENT_REQUIRES_11_CARDS')
    assertUniqueCards([...cards, ...community.pile1, ...community.pile2, ...community.pile3])

    const cardsById = new Map(cards.map(card => [card.id, card]))
    const evaluate = (pile: 1 | 2 | 3, pileCards: readonly ArenaCard[]): ArenaHandResult => {
      const board = pile === 1 ? community.pile1 : pile === 2 ? community.pile2 : community.pile3
      const key = `${pile}:${board.map(card => card.id).sort().join(',')}:${pileCards.map(card => card.id).sort().join(',')}`
      let result = this.handCache.get(key)
      if (!result) {
        result = evaluatePileBest(pileCards, board)
        this.handCache.set(key, result)
      }
      return result
    }

    let best: LastBossArrangementDecision | null = null
    let bestFoulFallback: LastBossArrangementDecision | null = null
    let evaluatedPartitions = 0

    for (const pile1 of combinations(cards, 3)) {
      const afterPile1 = without(cards, pile1)
      const hand1 = evaluate(1, pile1)
      for (const pile2 of combinations(afterPile1, 3)) {
        evaluatedPartitions++
        const pile3 = without(afterPile1, pile2)
        // Tier S+ Pile 3 chooses three of five private cards and must include
        // both community cards through evaluatePileBest.
        const hand2 = evaluate(2, pile2)
        const hand3 = evaluate(3, pile3)
        const arrangement: ArenaArrangement = {
          pile1: pile1.map(card => card.id), pile2: pile2.map(card => card.id), pile3: pile3.map(card => card.id),
        }
        const score = handPower(hand1) * PILE1_WEIGHT + handPower(hand2) * PILE2_WEIGHT + handPower(hand3) * PILE3_WEIGHT
        const decision = { arrangement, evaluatedPartitions, score, fallback: false }
        if (!bestFoulFallback || score > bestFoulFallback.score) bestFoulFallback = decision
        if (compareArenaHands(hand1, hand2) > 0 || compareArenaHands(hand2, hand3) > 0) continue
        if (!best || score > best.score) best = decision
      }
    }

    const selected = best ?? { ...bestFoulFallback!, fallback: true }
    selected.evaluatedPartitions = evaluatedPartitions
    if (!selected.fallback && checkArenaFoul(selected.arrangement, cardsById, community).fouled) {
      throw new Error('LAST_BOSS_SELECTED_FOUL_ARRANGEMENT')
    }
    return selected
  }

  chooseDiscard(cards: readonly ArenaCard[], community: ArenaDeal['community'], lockedDiscardIds: ReadonlySet<string> = new Set()): { cardId: string; decision: LastBossArrangementDecision } {
    if (cards.length !== 12) throw new Error('LAST_BOSS_DISCARD_REQUIRES_12_CARDS')
    const candidates = lockedDiscardIds.size ? cards.filter(card => lockedDiscardIds.has(card.id)) : cards
    if (!candidates.length) throw new Error('LAST_BOSS_LOCKED_DISCARD_NOT_HELD')
    let best: { cardId: string; decision: LastBossArrangementDecision } | null = null
    for (const discard of candidates) {
      const decision = this.arrange(cards.filter(card => card !== discard), community)
      if (!best || decision.score > best.decision.score) best = { cardId: discard.id, decision }
    }
    return best!
  }

  decideFaceUpBid(input: {
    hand: readonly ArenaCard[]
    community: ArenaDeal['community']
    auctionCard: ArenaCard
    bidOptionsCrest: readonly number[]
    availableCrest: number
    eligible?: boolean
  }): LastBossBidDecision {
    if (input.eligible === false) return { bidCrest: 0, estimatedGain: 0, reasonCode: 'INELIGIBLE' }
    const legal = input.bidOptionsCrest.filter(value => value >= 0 && value <= input.availableCrest).sort((a, b) => a - b)
    if (!legal.length) return { bidCrest: 0, estimatedGain: 0, reasonCode: 'PASS' }

    const base = this.arrange(input.hand, input.community)
    const upgraded = this.chooseDiscard([...input.hand, input.auctionCard], input.community)
    const estimatedGain = Math.max(0, upgraded.decision.score - base.score)
    const aggression = this.tableAggression()
    const normalized = Math.min(1, estimatedGain / 350 + aggression * 0.12)
    const index = Math.min(legal.length - 1, Math.floor(normalized * legal.length))
    const bidCrest = estimatedGain <= 0 ? legal[0] : legal[index]
    return { bidCrest, estimatedGain, reasonCode: estimatedGain > 0 ? 'VALUE' : aggression > 0.55 ? 'DENIAL' : 'PASS' }
  }

  decideCall(input: {
    bossPileCards: readonly ArenaCard[]
    communityCards: readonly ArenaCard[]
    publicKnownCards: readonly ArenaCard[]
    opponentIds: readonly string[]
    opponentRevealedCards?: Readonly<Record<string, readonly ArenaCard[]>>
    potCrest: number
    callCostCrest: number
  }): LastBossBetDecision {
    const equity = this.estimateShowdownEquity(input)
    const required = input.callCostCrest / Math.max(1, input.potCrest + input.callCostCrest)
    const action = equity + this.riskMargin >= required ? 'CALL' : 'FOLD'
    return { action, estimatedEquity: equity, requiredEquity: required, reasonCode: action === 'CALL' ? 'VALUE_CALL' : 'POT_ODDS_FOLD' }
  }

  estimateShowdownEquity(input: {
    bossPileCards: readonly ArenaCard[]
    communityCards: readonly ArenaCard[]
    publicKnownCards: readonly ArenaCard[]
    opponentIds: readonly string[]
    opponentRevealedCards?: Readonly<Record<string, readonly ArenaCard[]>>
  }): number {
    if (input.bossPileCards.length !== 3 && input.bossPileCards.length !== 5) throw new Error('LAST_BOSS_PILE_REQUIRES_3_OR_5_PRIVATE_CARDS')
    if (input.communityCards.length !== 2) throw new Error('LAST_BOSS_PILE_REQUIRES_2_COMMUNITY_CARDS')
    const known = new Set([...input.bossPileCards, ...input.communityCards, ...input.publicKnownCards].map(card => card.id))
    Object.values(input.opponentRevealedCards ?? {}).flat().forEach(card => known.add(card.id))
    const unseen = createArenaDeck().filter(card => !known.has(card.id))
    const bossHand = evaluatePileBest(input.bossPileCards, input.communityCards)
    const privateCount = input.bossPileCards.length
    let equity = 0

    for (let sample = 0; sample < this.monteCarloSamples; sample++) {
      const pool = [...unseen]
      let bestComparison = 1
      for (const opponentId of input.opponentIds) {
        const revealed = [...(input.opponentRevealedCards?.[opponentId] ?? [])]
        const needed = Math.max(0, privateCount - revealed.length)
        const drawn: ArenaCard[] = []
        for (let draw = 0; draw < needed && pool.length; draw++) {
          const index = Math.floor(this.random() * pool.length)
          drawn.push(pool[index]); pool.splice(index, 1)
        }
        if (revealed.length + drawn.length !== privateCount) continue
        const opponentHand = evaluatePileBest([...revealed, ...drawn], input.communityCards)
        bestComparison = Math.min(bestComparison, compareArenaHands(bossHand, opponentHand))
      }
      if (bestComparison > 0) equity += 1
      else if (bestComparison === 0) equity += 0.5
    }
    return equity / this.monteCarloSamples
  }

  private tableAggression(): number {
    const rows = [...this.tendencies.values()]
    if (!rows.length) return 0.5
    return Math.min(1, rows.reduce((sum, row) => sum + (row.bidCrest / Math.max(1, row.actions * 36)) + (row.calls / Math.max(1, row.actions)), 0) / rows.length)
  }
}
