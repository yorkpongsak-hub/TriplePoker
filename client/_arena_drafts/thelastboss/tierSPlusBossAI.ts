import { ObservableState, CardKey, Pile2Action, Pile3Action, PlayerId, TierSPlusPhase } from './tierSPlusTypes'

type JokerBelief = { A: number; B: number; C: number }

type AuctionDecision = {
  bid: number
  reason?: string
}

type ArrangementDecision = {
  pile1?: [CardKey, CardKey, CardKey]
  pile2?: [CardKey, CardKey, CardKey]
  pile3?: [CardKey, CardKey, CardKey]
}

type BettingDecision<T extends string> = {
  action: T
  reason?: string
}

type VisibleAction = ObservableState['visibleActions'][number]

type EvaluatedHand = {
  category: string
  rankValue: number
  tiebreak: number[]
  usedJoker: boolean
  bestFive: CardKey[]
}

type BossAIDependencies = {
  evaluateFiveCardHand: (cards: CardKey[]) => EvaluatedHand
  compareHands: (a: EvaluatedHand, b: EvaluatedHand) => number
}

const AUCTION1_LEVELS = [1, 2, 3, 5]
const AUCTION2_LEVELS = [2, 3, 4, 5]
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a']
const RANK_SCORE: Record<string, number> = Object.fromEntries(RANK_ORDER.map((r, i) => [r, i + 2]))
const SUITS = ['s', 'h', 'd', 'c']
const FULL_DECK: CardKey[] = (() => {
  const out: CardKey[] = []
  for (const r of RANK_ORDER) {
    for (const s of SUITS) out.push(`${r}${s}`)
  }
  out.push('joker')
  return out
})()

export class TierSPlusBossAI {
  private deps: BossAIDependencies
  private selfPlayerId: PlayerId
  private personality: {
    bluffBias: number
    foldDiscipline: number
    auctionAggression: number
    riskTolerance: number
  }
  private opponentStats = new Map<PlayerId, {
    auctionAggression: number
    foldRate: number
    raiseRate: number
    revealStrengthSignal: number
    observations: number
  }>()

  constructor(selfPlayerId: PlayerId, deps: BossAIDependencies, personality?: Partial<TierSPlusBossAI['personality']>) {
    this.selfPlayerId = selfPlayerId
    this.deps = deps
    this.personality = {
      bluffBias: personality?.bluffBias ?? 0.08,
      foldDiscipline: personality?.foldDiscipline ?? 0.16,
      auctionAggression: personality?.auctionAggression ?? 0.12,
      riskTolerance: personality?.riskTolerance ?? 0.55,
    }
  }

  decideAuction1Bid(state: ObservableState, auction1Card: CardKey): AuctionDecision {
    this.ingestVisibleActions(state.visibleActions)
    const hand = [...state.selfHand]
    const currentBest = this.findBestThreeCardPlan(hand, state.visibleCommunity.pile1)
    const improvedBest = this.findBestThreeCardPlan([...hand, auction1Card], state.visibleCommunity.pile1)

    const currentScore = this.scoreEvaluatedHand(currentBest.fullHand)
    const improvedScore = this.scoreEvaluatedHand(improvedBest.fullHand)
    const gain = improvedScore - currentScore
    const flexibility = this.estimateFutureFlexibility([...hand, auction1Card]) - this.estimateFutureFlexibility(hand)
    const totalValue = gain + flexibility + this.personality.auctionAggression * 8

    if (totalValue >= 34) return { bid: 5, reason: 'major upgrade' }
    if (totalValue >= 24) return { bid: 3, reason: 'clear upgrade' }
    if (totalValue >= 14) return { bid: 2, reason: 'moderate upgrade' }
    if (totalValue >= 8) return { bid: 1, reason: 'small upgrade' }
    return { bid: 1, reason: 'blocking or low-cost speculation' }
  }

  decideAuction2Bid(state: ObservableState, cardIndex: 0 | 1, canBid = true): AuctionDecision {
    this.ingestVisibleActions(state.visibleActions)
    if (!canBid) return { bid: 0, reason: 'ineligible' }

    const belief = state.jokerBelief
    const pJoker = cardIndex === 0 ? belief.A : belief.B
    const hand = [...state.selfHand]

    const pile2Potential = this.findBestThreeCardPlan(hand, state.visibleCommunity.pile2)
    const pile3Community = [state.visibleCommunity.pile3Open[0], state.visibleCommunity.pile3HiddenRevealed || 'unknown_hidden']
    const pile3Potential = this.scoreThreeCardPotentialForUnknown(hand, pile3Community)

    const jokerImpact = this.estimateJokerImpact(hand, state)
    const hiddenCardValue = pile2Potential.score * 0.18 + pile3Potential * 0.24 + pJoker * jokerImpact
    const adjusted = hiddenCardValue + this.personality.auctionAggression * 3

    if (adjusted >= 42) return { bid: 5, reason: 'high hidden upside' }
    if (adjusted >= 31) return { bid: 4, reason: 'strong hidden upside' }
    if (adjusted >= 22) return { bid: 3, reason: 'good hidden upside' }
    if (adjusted >= 14) return { bid: 2, reason: 'speculative upside' }
    return { bid: 2, reason: 'minimum viable pressure' }
  }

  decidePile1Arrangement(state: ObservableState): ArrangementDecision {
    this.ingestVisibleActions(state.visibleActions)
    const hand = [...state.selfHand]
    const best = this.findBestThreeCardPlan(hand, state.visibleCommunity.pile1)
    return { pile1: best.playerCards as [CardKey, CardKey, CardKey] }
  }

  decideFinalArrangement(
    state: ObservableState,
    remainingCards: CardKey[],
    pile3HiddenIfKnown?: CardKey,
  ): ArrangementDecision {
    this.ingestVisibleActions(state.visibleActions)
    const community2 = [...state.visibleCommunity.pile2]
    const community3 = [state.visibleCommunity.pile3Open[0], pile3HiddenIfKnown || state.visibleCommunity.pile3HiddenRevealed || 'unknown_hidden']

    const splits = this.enumerateThreeThreeSplits(remainingCards)
    let bestPlan: { p2: CardKey[]; p3: CardKey[]; score: number } | null = null

    for (const split of splits) {
      const p2Eval = this.safeEvaluateCommunityCombo(split.left, community2)
      const p3Eval = this.safeEvaluateCommunityCombo(split.right, community3)
      const p2Score = p2Eval ? this.scoreEvaluatedHand(p2Eval) : this.scoreThreeCardPotentialForUnknown(split.left, community2)
      const p3Score = p3Eval ? this.scoreEvaluatedHand(p3Eval) : this.scoreThreeCardPotentialForUnknown(split.right, community3)
      const pressureBonus = this.hasJoker(split.right) ? 6 : 0
      const total = p2Score * 0.95 + p3Score * 1.2 + pressureBonus

      if (!bestPlan || total > bestPlan.score) {
        bestPlan = { p2: split.left, p3: split.right, score: total }
      }
    }

    if (!bestPlan) {
      return {
        pile2: remainingCards.slice(0, 3) as [CardKey, CardKey, CardKey],
        pile3: remainingCards.slice(3, 6) as [CardKey, CardKey, CardKey],
      }
    }

    return {
      pile2: bestPlan.p2 as [CardKey, CardKey, CardKey],
      pile3: bestPlan.p3 as [CardKey, CardKey, CardKey],
    }
  }

  decidePile2Action(state: ObservableState, ctx: {
    myPileCards: CardKey[]
    pot: number
    callCost: number
    revealedByPlayer: Record<PlayerId, CardKey[]>
    alivePlayers: PlayerId[]
    round: 1 | 2
  }): BettingDecision<Pile2Action> {
    this.ingestVisibleActions(state.visibleActions)
    const winProb = this.estimatePile2WinProbability(state, ctx)
    const threshold = this.computeCallThreshold(ctx.pot, ctx.callCost, ctx.alivePlayers.length, false)

    if (winProb + this.personality.riskTolerance * 0.08 >= threshold) {
      return { action: 'call', reason: 'equity above threshold' }
    }
    return { action: 'fold', reason: 'equity below threshold' }
  }

  decidePile3Action(state: ObservableState, ctx: {
    myPileCards: CardKey[]
    pot: number
    callCost: number
    raiseExtra: number
    currentBet: number
    revealedByPlayer: Record<PlayerId, CardKey[]>
    alivePlayers: PlayerId[]
    round: 1 | 2
  }): BettingDecision<Pile3Action> {
    this.ingestVisibleActions(state.visibleActions)
    const winProb = this.estimatePile3WinProbability(state, ctx)
    const callThreshold = this.computeCallThreshold(ctx.pot, ctx.callCost, ctx.alivePlayers.length, true)
    const bluffWindow = this.estimateFoldEquityWindow(ctx.revealedByPlayer, ctx.alivePlayers)

    const shouldRaise =
      winProb > Math.max(0.58, callThreshold + 0.12) ||
      (winProb > 0.34 && bluffWindow + this.personality.bluffBias > 0.52)

    if (shouldRaise) {
      return { action: 'raise', reason: 'pressure + value line' }
    }
    if (winProb + this.personality.riskTolerance * 0.08 >= callThreshold) {
      return { action: 'call', reason: 'profitable continue' }
    }
    return { action: 'fold', reason: 'negative expectation' }
  }

  private estimatePile2WinProbability(state: ObservableState, ctx: {
    myPileCards: CardKey[]
    revealedByPlayer: Record<PlayerId, CardKey[]>
    alivePlayers: PlayerId[]
    round: 1 | 2
  }) {
    const myHand = this.deps.evaluateFiveCardHand([...state.visibleCommunity.pile2, ...ctx.myPileCards])
    const myScore = this.scoreEvaluatedHand(myHand)

    let totalThreat = 0
    let opponents = 0
    for (const playerId of ctx.alivePlayers) {
      if (playerId === this.selfPlayerId) continue
      opponents += 1
      const shown = ctx.revealedByPlayer[playerId] || []
      const shownStrength = this.scoreVisibleCards(shown)
      const tendency = this.getOpponentTendency(playerId)
      totalThreat += shownStrength * 0.018 + tendency.raiseRate * 0.08 + tendency.auctionAggression * 0.04
    }

    const base = this.normalizeScore(myScore)
    const uncertaintyPenalty = 0.08 * Math.max(0, 2 - ctx.round)
    return this.clamp01(base - totalThreat / Math.max(1, opponents) - uncertaintyPenalty + this.personality.foldDiscipline * 0.04)
  }

  private estimatePile3WinProbability(state: ObservableState, ctx: {
    myPileCards: CardKey[]
    revealedByPlayer: Record<PlayerId, CardKey[]>
    alivePlayers: PlayerId[]
    round: 1 | 2
  }) {
    const community = [state.visibleCommunity.pile3Open[0], state.visibleCommunity.pile3HiddenRevealed || 'unknown_hidden']
    const evalKnown = this.safeEvaluateCommunityCombo(ctx.myPileCards, community)
    const baseScore = evalKnown
      ? this.normalizeScore(this.scoreEvaluatedHand(evalKnown))
      : this.normalizePotential(this.scoreThreeCardPotentialForUnknown(ctx.myPileCards, community))

    let tablePressure = 0
    let opponents = 0
    for (const playerId of ctx.alivePlayers) {
      if (playerId === this.selfPlayerId) continue
      opponents += 1
      const shown = ctx.revealedByPlayer[playerId] || []
      const shownStrength = this.scoreVisibleCards(shown)
      const tendency = this.getOpponentTendency(playerId)
      tablePressure += shownStrength * 0.02 + tendency.raiseRate * 0.1 + tendency.revealStrengthSignal * 0.06
    }

    const jokerLeverage = this.hasJoker(ctx.myPileCards) ? 0.09 : 0
    const hiddenJokerFactor = state.jokerBelief.C > 0 && !state.visibleCommunity.pile3HiddenRevealed ? state.jokerBelief.C * 0.08 : 0
    return this.clamp01(baseScore - tablePressure / Math.max(1, opponents) + jokerLeverage + hiddenJokerFactor)
  }

  private computeCallThreshold(pot: number, callCost: number, playersAlive: number, volatile: boolean) {
    const potOdds = callCost / Math.max(1, pot + callCost)
    const crowdPenalty = Math.max(0, playersAlive - 2) * 0.05
    const volatility = volatile ? 0.05 : 0.02
    return this.clamp01(potOdds + crowdPenalty + volatility - this.personality.foldDiscipline * 0.06)
  }

  private estimateFoldEquityWindow(revealedByPlayer: Record<PlayerId, CardKey[]>, alivePlayers: PlayerId[]) {
    let weakness = 0
    let count = 0
    for (const playerId of alivePlayers) {
      if (playerId === this.selfPlayerId) continue
      count += 1
      const shown = revealedByPlayer[playerId] || []
      const shownStrength = this.scoreVisibleCards(shown)
      const tendency = this.getOpponentTendency(playerId)
      weakness += (1 - this.normalizePotential(shownStrength)) * 0.6 + tendency.foldRate * 0.4
    }
    if (!count) return 0
    return this.clamp01(weakness / count)
  }

  private estimateJokerImpact(hand: CardKey[], state: ObservableState) {
    if (this.hasJoker(hand)) return 30
    const pile2Now = this.findBestThreeCardPlan(hand, state.visibleCommunity.pile2).score
    const pile3Now = this.scoreThreeCardPotentialForUnknown(hand, [state.visibleCommunity.pile3Open[0], state.visibleCommunity.pile3HiddenRevealed || 'unknown_hidden'])
    return Math.max(12, pile2Now * 0.22 + pile3Now * 0.28 + 10)
  }

  private findBestThreeCardPlan(hand: CardKey[], community: CardKey[]) {
    const combos = this.choose(hand, 3)
    let best: { playerCards: CardKey[]; fullHand: EvaluatedHand; score: number } | null = null
    for (const combo of combos) {
      const fullHand = this.deps.evaluateFiveCardHand([...community, ...combo])
      const score = this.scoreEvaluatedHand(fullHand)
      if (!best || score > best.score) best = { playerCards: combo, fullHand, score }
    }
    if (!best) {
      const fallback = hand.slice(0, 3)
      const fullHand = this.deps.evaluateFiveCardHand([...community, ...fallback])
      return { playerCards: fallback, fullHand, score: this.scoreEvaluatedHand(fullHand) }
    }
    return best
  }

  private scoreThreeCardPotentialForUnknown(playerCards: CardKey[], community: CardKey[]) {
    const visible = [...community, ...playerCards].filter(c => c !== 'unknown_hidden')
    const ranks = visible.map(c => this.getRankValue(c)).filter(Boolean) as number[]
    const rankCounts = new Map<number, number>()
    ranks.forEach(r => rankCounts.set(r, (rankCounts.get(r) || 0) + 1))
    const counts = [...rankCounts.values()].sort((a, b) => b - a)
    const sameSuit = this.flushPotential(visible)
    const straightPotential = this.straightPotential(ranks)
    const jokerBonus = this.hasJoker(visible) ? 20 : 0

    let score = 8 + jokerBonus
    if (counts[0] === 4) score += 45
    else if (counts[0] === 3 && counts[1] === 1) score += 32
    else if (counts[0] === 3) score += 24
    else if (counts[0] === 2 && counts[1] === 2) score += 22
    else if (counts[0] === 2) score += 12
    score += sameSuit * 7
    score += straightPotential * 6
    score += this.highCardPotential(ranks) * 2
    return score
  }

  private safeEvaluateCommunityCombo(playerCards: CardKey[], community: CardKey[]) {
    if (community.includes('unknown_hidden')) return null
    return this.deps.evaluateFiveCardHand([...community, ...playerCards])
  }

  private enumerateThreeThreeSplits(cards: CardKey[]) {
    const leftCombos = this.choose(cards, 3)
    const out: Array<{ left: CardKey[]; right: CardKey[] }> = []
    const seen = new Set<string>()
    for (const left of leftCombos) {
      const remaining = this.removeMultiset(cards, left)
      if (remaining.length !== 3) continue
      const key = [...left].sort().join('|') + '::' + [...remaining].sort().join('|')
      const reverse = [...remaining].sort().join('|') + '::' + [...left].sort().join('|')
      if (seen.has(key) || seen.has(reverse)) continue
      seen.add(key)
      out.push({ left, right: remaining })
    }
    return out
  }

  private estimateFutureFlexibility(hand: CardKey[]) {
    const rankCounts = new Map<number, number>()
    let joker = 0
    for (const c of hand) {
      if (this.isJoker(c)) {
        joker += 1
        continue
      }
      const rv = this.getRankValue(c)
      rankCounts.set(rv, (rankCounts.get(rv) || 0) + 1)
    }
    const pairCount = [...rankCounts.values()].filter(v => v >= 2).length
    const tripleCount = [...rankCounts.values()].filter(v => v >= 3).length
    return pairCount * 6 + tripleCount * 9 + joker * 16 + this.flushPotential(hand) * 3 + this.straightPotential(hand.map(c => this.getRankValue(c)).filter(Boolean) as number[]) * 3
  }

  private ingestVisibleActions(actions: VisibleAction[]) {
    for (const action of actions) {
      if (action.playerId === this.selfPlayerId) continue
      const current = this.opponentStats.get(action.playerId) || {
        auctionAggression: 0,
        foldRate: 0,
        raiseRate: 0,
        revealStrengthSignal: 0,
        observations: 0,
      }

      current.observations += 1
      if (action.type.includes('auction')) current.auctionAggression += Number(action.value || 0) / 5
      if (action.type === 'fold') current.foldRate += 1
      if (action.type === 'raise') current.raiseRate += 1
      if (action.type === 'reveal' && typeof action.value === 'string') {
        current.revealStrengthSignal += this.scoreVisibleCards([action.value]) / 100
      }
      this.opponentStats.set(action.playerId, current)
    }
  }

  private getOpponentTendency(playerId: PlayerId) {
    const s = this.opponentStats.get(playerId)
    if (!s || s.observations === 0) {
      return { auctionAggression: 0.5, foldRate: 0.3, raiseRate: 0.25, revealStrengthSignal: 0.45 }
    }
    return {
      auctionAggression: s.auctionAggression / s.observations,
      foldRate: s.foldRate / s.observations,
      raiseRate: s.raiseRate / s.observations,
      revealStrengthSignal: s.revealStrengthSignal / s.observations,
    }
  }

  private scoreEvaluatedHand(hand: EvaluatedHand) {
    const tie = hand.tiebreak.reduce((acc, v, i) => acc + v / Math.pow(10, i + 1), 0)
    return hand.rankValue * 100 + tie + (hand.usedJoker ? 1.5 : 0)
  }

  private scoreVisibleCards(cards: CardKey[]) {
    if (!cards.length) return 0
    const ranks = cards.map(c => this.getRankValue(c)).filter(Boolean) as number[]
    const top = ranks.sort((a, b) => b - a)
    const pairBonus = this.hasDuplicateRank(cards) ? 20 : 0
    const jokerBonus = this.hasJoker(cards) ? 30 : 0
    return top.reduce((acc, v, i) => acc + v / (i + 1), 0) + pairBonus + jokerBonus
  }

  private normalizeScore(score: number) {
    return this.clamp01(score / 950)
  }

  private normalizePotential(score: number) {
    return this.clamp01(score / 100)
  }

  private flushPotential(cards: CardKey[]) {
    const suitCounts = new Map<string, number>()
    for (const c of cards) {
      if (this.isJoker(c) || c === 'unknown_hidden') continue
      const suit = c.slice(-1)
      suitCounts.set(suit, (suitCounts.get(suit) || 0) + 1)
    }
    return Math.max(0, ...suitCounts.values(), 0)
  }

  private straightPotential(ranks: number[]) {
    const uniq = [...new Set(ranks)].sort((a, b) => a - b)
    if (!uniq.length) return 0
    let bestRun = 1
    let run = 1
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] === uniq[i - 1] + 1) {
        run += 1
        bestRun = Math.max(bestRun, run)
      } else {
        run = 1
      }
    }
    if (uniq.includes(14)) {
      const lowAce = [1, ...uniq.filter(v => v !== 14)]
      run = 1
      for (let i = 1; i < lowAce.length; i++) {
        if (lowAce[i] === lowAce[i - 1] + 1) run += 1
      }
      bestRun = Math.max(bestRun, run)
    }
    return bestRun
  }

  private highCardPotential(ranks: number[]) {
    return [...ranks].sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) / 6
  }

  private hasDuplicateRank(cards: CardKey[]) {
    const seen = new Set<number>()
    for (const c of cards) {
      if (this.isJoker(c)) return true
      const rv = this.getRankValue(c)
      if (seen.has(rv)) return true
      seen.add(rv)
    }
    return false
  }

  private hasJoker(cards: CardKey[]) {
    return cards.some(c => this.isJoker(c))
  }

  private isJoker(card: CardKey) {
    return card.toLowerCase() === 'joker'
  }

  private getRankValue(card: CardKey) {
    if (!card || card === 'unknown_hidden' || this.isJoker(card)) return 0
    const rank = card.slice(0, -1).toLowerCase()
    return RANK_SCORE[rank] || 0
  }

  private choose<T>(arr: T[], k: number): T[][] {
    const out: T[][] = []
    const path: T[] = []
    const dfs = (start: number) => {
      if (path.length === k) {
        out.push([...path])
        return
      }
      for (let i = start; i <= arr.length - (k - path.length); i++) {
        path.push(arr[i])
        dfs(i + 1)
        path.pop()
      }
    }
    dfs(0)
    return out
  }

  private removeMultiset(source: CardKey[], remove: CardKey[]) {
    const need = new Map<string, number>()
    remove.forEach(card => need.set(card, (need.get(card) || 0) + 1))
    const out: CardKey[] = []
    for (const card of source) {
      const left = need.get(card) || 0
      if (left > 0) need.set(card, left - 1)
      else out.push(card)
    }
    return out
  }

  private clamp01(v: number) {
    return Math.max(0, Math.min(1, v))
  }
}

export function buildTierSPlusBossAI(selfPlayerId: PlayerId, deps: BossAIDependencies) {
  return new TierSPlusBossAI(selfPlayerId, deps)
}
