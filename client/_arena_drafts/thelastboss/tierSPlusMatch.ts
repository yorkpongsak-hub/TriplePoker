import {
  AuctionWin,
  CardKey,
  ObservableState,
  Pile2Action,
  Pile3Action,
  PileBattleState,
  PileKey,
  PileResult,
  PlayerArrangement,
  PlayerId,
  StartRoundPayload,
  TierSPlusPhase,
  TierSPlusPlayerState,
  TierSPlusProofState,
  TierSPlusRoundState,
} from './tierSPlusTypes'

const AUCTION1_BID_LEVELS = [1, 2, 3, 5]
const AUCTION2_BID_LEVELS = [2, 3, 4, 5]
const PLAYER_COUNT = 4
const HAND_SIZE = 11
const PILE_SIZE = 3
const PILE1_ANTE = 2
const PILE2_ANTE = 2
const PILE2_CALL = 1
const PILE3_ANTE = 4
const PILE3_CALL = 1
const PILE3_RAISE = 1
const SWEEP_BONUS_PER_LOSER = 2

interface SocketLike {
  id: string
  emit: (event: string, payload: any) => void
}

interface IoLike {
  to: (roomId: string) => { emit: (event: string, payload: any) => void }
}

interface ServerLike {
  io: IoLike
  getSocketByPlayerId: (playerId: string) => SocketLike | null
}

interface JoinablePlayer {
  id: string
  name: string
  tokens: number
  isBoss?: boolean
  seatIndex: number
}

interface PendingBid {
  playerId: PlayerId
  bid: number
  at: number
}

export class TierSPlusMatch {
  private state: TierSPlusRoundState
  private server: ServerLike
  private pendingAuction1Bids: PendingBid[] = []
  private pendingAuction2Bids: PendingBid[] = []
  private actionLog: ObservableState['visibleActions'] = []

  constructor(server: ServerLike, roomId: string, players: JoinablePlayer[], roundNumber = 1) {
    if (players.length !== PLAYER_COUNT) {
      throw new Error(`Tier S+ requires exactly ${PLAYER_COUNT} players`)
    }

    const builtPlayers: TierSPlusPlayerState[] = players.map(p => ({
      id: p.id,
      name: p.name,
      isBoss: !!p.isBoss,
      tokens: p.tokens,
      seatIndex: p.seatIndex,
      hand: [],
      wonAuction1: false,
      wonAuction2Cards: [],
      arrangements: {},
      folded: { pile2: false, pile3: false },
    }))

    const boss = builtPlayers.find(p => p.isBoss)
    if (!boss) throw new Error('Tier S+ requires one boss player')

    this.state = {
      roomId,
      roundNumber,
      phase: 'waiting',
      players: builtPlayers,
      bossPlayerId: boss.id,
      community: {
        pile1: ['?', '?'],
        pile2: ['?', '?'],
        pile3Open: '?',
      },
      auction1Card: '?',
      auction2Cards: ['?', '?'],
      jokerSlot: 'A',
      finalHiddenSet: ['?', '?', '?'],
      pileResults: {},
      pendingContinueFrom: [],
    }

    this.server = server
  }

  startRound(dealer: {
    dealRound: () => {
      hands: Record<PlayerId, CardKey[]>
      community: { pile1: [CardKey, CardKey]; pile2: [CardKey, CardKey]; pile3Open: CardKey; pile3Hidden: CardKey }
      auction1Card: CardKey
      auction2Cards: [CardKey, CardKey]
      jokerSlot: 'A' | 'B' | 'C'
      finalHiddenSet: [CardKey, CardKey, CardKey]
    }
  }) {
    const dealt = dealer.dealRound()

    this.state.phase = 'dealing'
    this.state.community = {
      pile1: dealt.community.pile1,
      pile2: dealt.community.pile2,
      pile3Open: dealt.community.pile3Open,
    }
    this.state.auction1Card = dealt.auction1Card
    this.state.auction2Cards = dealt.auction2Cards
    this.state.jokerSlot = dealt.jokerSlot
    this.state.finalHiddenSet = dealt.finalHiddenSet
    this.state.proof = {
      jokerSlot: dealt.jokerSlot,
      auction2Card1: dealt.auction2Cards[0],
      auction2Card2: dealt.auction2Cards[1],
      pile3Hidden: dealt.community.pile3Hidden,
    }

    for (const player of this.state.players) {
      player.hand = [...dealt.hands[player.id]]
      player.wonAuction1 = false
      player.wonAuction2Cards = []
      player.arrangements = {}
      player.folded = { pile2: false, pile3: false }
    }

    this.broadcastRoundStart()
    this.startAuction1()
  }

  private broadcastRoundStart() {
    for (const player of this.state.players) {
      const payload: StartRoundPayload = {
        roundNumber: this.state.roundNumber,
        timerSec: 15,
        cards: [...player.hand],
        community: {
          pile1: this.state.community.pile1,
          pile2: this.state.community.pile2,
          pile3Open: this.state.community.pile3Open,
        },
        auction1Card: this.state.auction1Card,
        auction1BidLevels: AUCTION1_BID_LEVELS,
        auction2BidLevels: AUCTION2_BID_LEVELS,
        tokenBalance: this.getTokenBalance(),
        aiNames: this.state.players
          .filter(p => p.id !== player.id)
          .map(p => ({ id: p.id, name: p.name })),
      }
      this.emitToPlayer(player.id, 'tier_s_plus_round_start', payload)
    }
  }

  private startAuction1() {
    this.state.phase = 'auction1'
    this.pendingAuction1Bids = []
    this.broadcast('auction1_start', {
      card: this.state.auction1Card,
      bidLevels: AUCTION1_BID_LEVELS,
      decisionTimeSec: 5,
    })
  }

  submitAuction1Bid(playerId: PlayerId, level: number) {
    if (this.state.phase !== 'auction1') return
    if (!AUCTION1_BID_LEVELS.includes(level)) return
    this.pendingAuction1Bids.push({ playerId, bid: level, at: Date.now() })
  }

  finalizeAuction1() {
    const win = this.pickAuctionWinner(this.pendingAuction1Bids)
    if (win?.winnerId) {
      const player = this.mustPlayer(win.winnerId)
      player.wonAuction1 = true
      player.hand.push(this.state.auction1Card)
      player.tokens -= win.bid || 0
    }

    for (const player of this.state.players) {
      const payload = {
        winnerId: win?.winnerId,
        bid: win?.bid,
        tokenBalance: this.getTokenBalance(),
        arrangementTimeSec: 15,
        myUpdatedHand: [...player.hand],
      }
      this.emitToPlayer(player.id, 'auction1_result', payload)
    }

    this.state.phase = 'arrangement_pile1'
    this.broadcast('pile1_arrangement_start', { decisionTimeSec: 15 })
  }

  submitPile1Arrangement(playerId: PlayerId, pile1: CardKey[]) {
    if (this.state.phase !== 'arrangement_pile1') return
    if (!this.validatePickedCards(playerId, pile1, PILE_SIZE)) return
    const player = this.mustPlayer(playerId)
    player.arrangements.pile1 = pile1 as [CardKey, CardKey, CardKey]
  }

  finalizePile1(evaluator: { evaluateFiveCardHand: (cards: CardKey[]) => any; compareHands: (a: any, b: any) => number }) {
    const entries = this.state.players.map(player => {
      const cards = player.arrangements.pile1 || this.autoPick(player.hand, [])
      player.arrangements.pile1 = cards as [CardKey, CardKey, CardKey]
      player.tokens -= PILE1_ANTE
      return {
        playerId: player.id,
        cards,
        folded: false,
        handScore: evaluator.evaluateFiveCardHand([...this.state.community.pile1, ...cards]),
      }
    })

    const winnerIds = this.findWinnerIds(entries, evaluator)
    const result: PileResult = {
      pile: 'pile1',
      pot: PLAYER_COUNT * PILE1_ANTE,
      communityCards: [...this.state.community.pile1],
      entries,
      winnerIds,
    }
    this.state.pileResults.pile1 = result

    if (winnerIds.length > 0) {
      const share = Math.floor(result.pot / winnerIds.length)
      winnerIds.forEach(id => this.mustPlayer(id).tokens += share)
    }

    this.state.phase = 'pile1_result'
    this.broadcast('pile1_result', {
      result,
      tokenBalance: this.getTokenBalance(),
    })
  }

  startAuction2(cardIndex: 0 | 1) {
    this.state.phase = cardIndex === 0 ? 'auction2_card1' : 'auction2_card2'
    this.pendingAuction2Bids = []
    this.broadcast('auction2_start', {
      cardIndex,
      bidLevels: AUCTION2_BID_LEVELS,
      decisionTimeSec: 5,
    })
  }

  submitAuction2Bid(playerId: PlayerId, cardIndex: 0 | 1, level: number) {
    if (!['auction2_card1', 'auction2_card2'].includes(this.state.phase)) return
    const player = this.mustPlayer(playerId)
    if (player.wonAuction1) return
    if ((this.state.phase === 'auction2_card1' && cardIndex !== 0) || (this.state.phase === 'auction2_card2' && cardIndex !== 1)) return
    if (!AUCTION2_BID_LEVELS.includes(level)) return
    this.pendingAuction2Bids.push({ playerId, bid: level, at: Date.now() })
  }

  finalizeAuction2(cardIndex: 0 | 1) {
    const win = this.pickAuctionWinner(this.pendingAuction2Bids)
    const awardedCard = this.state.auction2Cards[cardIndex]

    if (win?.winnerId) {
      const player = this.mustPlayer(win.winnerId)
      player.wonAuction2Cards.push(awardedCard)
      player.hand.push(awardedCard)
      player.tokens -= win.bid || 0
      this.emitToPlayer(win.winnerId, 'auction2_private_card', {
        cardIndex,
        card: awardedCard,
      })
    }

    for (const player of this.state.players) {
      this.emitToPlayer(player.id, 'auction2_result', {
        winnerId: win?.winnerId,
        bid: win?.bid,
        cardIndex,
        tokenBalance: this.getTokenBalance(),
        myUpdatedHand: [...player.hand],
      })
    }
  }

  revealPile3Hidden() {
    this.state.phase = 'reveal_pile3_hidden'
    const card = this.state.proof?.pile3Hidden || this.state.finalHiddenSet[2]
    this.state.community.pile3Hidden = card
    this.broadcast('pile3_hidden_revealed', { card })
  }

  startFinalArrangement() {
    this.state.phase = 'final_arrangement'
    for (const player of this.state.players) {
      const used = new Set(player.arrangements.pile1 || [])
      const remaining = player.hand.filter(card => !used.has(card))
      this.emitToPlayer(player.id, 'final_arrangement_start', {
        cards: remaining,
        decisionTimeSec: 20,
      })
    }
  }

  submitFinalArrangement(playerId: PlayerId, pile2: CardKey[], pile3: CardKey[]) {
    if (this.state.phase !== 'final_arrangement') return
    const player = this.mustPlayer(playerId)
    const pile1 = player.arrangements.pile1 || []
    const combined = [...pile2, ...pile3]
    const handWithoutPile1 = player.hand.filter(c => !pile1.includes(c))
    if (pile2.length !== PILE_SIZE || pile3.length !== PILE_SIZE) return
    if (!this.sameMultiset(combined, handWithoutPile1)) return
    player.arrangements.pile2 = pile2 as [CardKey, CardKey, CardKey]
    player.arrangements.pile3 = pile3 as [CardKey, CardKey, CardKey]
  }

  startPile2Betting() {
    this.state.phase = 'pile2_betting'
    const survivors = this.state.players.map(p => p.id)
    this.state.players.forEach(p => {
      p.folded.pile2 = false
      p.tokens -= PILE2_ANTE
    })
    this.state.pileBattle = {
      pile: 'pile2',
      round: 1,
      survivors,
      folded: [],
      currentBet: PILE2_CALL,
      pot: PLAYER_COUNT * PILE2_ANTE,
      revealedByPlayer: {},
      actedThisRound: [],
      actingPlayerId: survivors[0],
    }
    this.broadcast('pile2_betting_start', this.state.pileBattle)
    this.emitCurrentTurn()
  }

  handlePile2Action(playerId: PlayerId, action: Pile2Action) {
    const battle = this.state.pileBattle
    if (!battle || this.state.phase !== 'pile2_betting' || battle.pile !== 'pile2') return
    if (battle.actingPlayerId !== playerId) return

    if (action === 'fold') {
      this.mustPlayer(playerId).folded.pile2 = true
      battle.folded.push(playerId)
      battle.survivors = battle.survivors.filter(id => id !== playerId)
    } else {
      this.mustPlayer(playerId).tokens -= PILE2_CALL
      battle.pot += PILE2_CALL
      this.revealNextPileCard(playerId, 'pile2')
    }

    battle.actedThisRound.push(playerId)
    this.advanceBettingRound('pile2')
    this.broadcast('pile2_action_result', {
      playerId,
      action,
      pileBattle: battle,
      tokenBalance: this.getTokenBalance(),
    })
  }

  finalizePile2(evaluator: { evaluateFiveCardHand: (cards: CardKey[]) => any; compareHands: (a: any, b: any) => number }) {
    const battle = this.state.pileBattle
    if (!battle) return
    const active = this.state.players.filter(p => !p.folded.pile2)
    const entries = this.state.players.map(player => ({
      playerId: player.id,
      cards: player.arrangements.pile2 || this.autoPick(player.hand, player.arrangements.pile1 || []),
      folded: player.folded.pile2,
      handScore: player.folded.pile2 ? undefined : evaluator.evaluateFiveCardHand([...this.state.community.pile2, ...(player.arrangements.pile2 || [])]),
    }))

    const liveEntries = entries.filter(e => !e.folded)
    const winnerIds = liveEntries.length ? this.findWinnerIds(liveEntries, evaluator) : []
    const result: PileResult = {
      pile: 'pile2',
      pot: battle.pot,
      communityCards: [...this.state.community.pile2],
      entries,
      winnerIds,
    }
    this.state.pileResults.pile2 = result

    if (winnerIds.length > 0) {
      const share = Math.floor(battle.pot / winnerIds.length)
      winnerIds.forEach(id => this.mustPlayer(id).tokens += share)
    }

    this.state.phase = 'pile2_result'
    this.broadcast('pile2_result', {
      result,
      tokenBalance: this.getTokenBalance(),
      activePlayers: active.map(p => p.id),
    })
  }

  startPile3Betting() {
    this.state.phase = 'pile3_betting'
    const survivors = this.state.players.map(p => p.id)
    this.state.players.forEach(p => {
      p.folded.pile3 = false
      p.tokens -= PILE3_ANTE
    })
    this.state.pileBattle = {
      pile: 'pile3',
      round: 1,
      survivors,
      folded: [],
      currentBet: PILE3_CALL,
      pot: PLAYER_COUNT * PILE3_ANTE,
      revealedByPlayer: {},
      actedThisRound: [],
      actingPlayerId: survivors[0],
    }
    this.broadcast('pile3_betting_start', this.state.pileBattle)
    this.emitCurrentTurn()
  }

  handlePile3Action(playerId: PlayerId, action: Pile3Action) {
    const battle = this.state.pileBattle
    if (!battle || this.state.phase !== 'pile3_betting' || battle.pile !== 'pile3') return
    if (battle.actingPlayerId !== playerId) return

    if (action === 'fold') {
      this.mustPlayer(playerId).folded.pile3 = true
      battle.folded.push(playerId)
      battle.survivors = battle.survivors.filter(id => id !== playerId)
    } else if (action === 'raise') {
      this.mustPlayer(playerId).tokens -= PILE3_CALL + PILE3_RAISE
      battle.pot += PILE3_CALL + PILE3_RAISE
      battle.currentBet += PILE3_RAISE
      this.revealNextPileCard(playerId, 'pile3')
    } else {
      this.mustPlayer(playerId).tokens -= battle.currentBet
      battle.pot += battle.currentBet
      this.revealNextPileCard(playerId, 'pile3')
    }

    battle.actedThisRound.push(playerId)
    this.advanceBettingRound('pile3')
    this.broadcast('pile3_action_result', {
      playerId,
      action,
      pileBattle: battle,
      tokenBalance: this.getTokenBalance(),
    })
  }

  finalizePile3(evaluator: { evaluateFiveCardHand: (cards: CardKey[]) => any; compareHands: (a: any, b: any) => number }) {
    const battle = this.state.pileBattle
    if (!battle) return
    const entries = this.state.players.map(player => ({
      playerId: player.id,
      cards: player.arrangements.pile3 || this.autoPick(player.hand, [...(player.arrangements.pile1 || []), ...(player.arrangements.pile2 || [])]),
      folded: player.folded.pile3,
      handScore: player.folded.pile3 ? undefined : evaluator.evaluateFiveCardHand([this.state.community.pile3Open, this.state.community.pile3Hidden!, ...(player.arrangements.pile3 || [])]),
    }))

    const liveEntries = entries.filter(e => !e.folded)
    const winnerIds = liveEntries.length ? this.findWinnerIds(liveEntries, evaluator) : []
    const result: PileResult = {
      pile: 'pile3',
      pot: battle.pot,
      communityCards: [this.state.community.pile3Open, this.state.community.pile3Hidden!],
      entries,
      winnerIds,
    }
    this.state.pileResults.pile3 = result

    if (winnerIds.length > 0) {
      const share = Math.floor(battle.pot / winnerIds.length)
      winnerIds.forEach(id => this.mustPlayer(id).tokens += share)
    }

    this.applySweepBonusIfAny()

    this.state.phase = 'pile3_result'
    this.broadcast('pile3_result', {
      result,
      tokenBalance: this.getTokenBalance(),
      bonusSweepWinnerId: this.state.bonusSweepWinnerId,
    })
  }

  revealProof() {
    this.state.phase = 'proof_reveal'
    const proof: TierSPlusProofState = this.state.proof!
    this.broadcast('proof_card_reveal', proof)
  }

  emitRoundResult() {
    this.state.phase = 'round_result'
    this.broadcast('round_result', {
      pileResults: this.state.pileResults,
      bonusSweepWinnerId: this.state.bonusSweepWinnerId,
      tokenBalance: this.getTokenBalance(),
    })
  }

  toObservableState(playerId: PlayerId): ObservableState {
    const player = this.mustPlayer(playerId)
    return {
      selfPlayerId: playerId,
      selfHand: [...player.hand],
      visibleCommunity: {
        pile1: [...this.state.community.pile1],
        pile2: [...this.state.community.pile2],
        pile3Open: [this.state.community.pile3Open],
        pile3HiddenRevealed: this.state.community.pile3Hidden,
      },
      visibleActions: [...this.actionLog],
      revealedCardsByPlayer: this.state.pileBattle?.revealedByPlayer || {},
      tokenBalance: this.getTokenBalance(),
      currentPhase: this.state.phase,
      jokerBelief: this.buildJokerBelief(),
    }
  }

  private buildJokerBelief() {
    if (this.state.community.pile3Hidden) {
      if (this.state.community.pile3Hidden.toLowerCase() === 'joker') return { A: 0, B: 0, C: 1 }
      return { A: 0.5, B: 0.5, C: 0 }
    }
    return { A: 1 / 3, B: 1 / 3, C: 1 / 3 }
  }

  private applySweepBonusIfAny() {
    const wins: Record<PlayerId, number> = {}
    for (const pile of ['pile1', 'pile2', 'pile3'] as PileKey[]) {
      const result = this.state.pileResults[pile]
      if (!result) continue
      if (result.winnerIds.length !== 1) continue
      const id = result.winnerIds[0]
      wins[id] = (wins[id] || 0) + 1
    }

    const sweepWinner = Object.entries(wins).find(([, count]) => count === 3)?.[0]
    if (!sweepWinner) return

    this.state.bonusSweepWinnerId = sweepWinner
    for (const player of this.state.players) {
      if (player.id === sweepWinner) continue
      player.tokens -= SWEEP_BONUS_PER_LOSER
      this.mustPlayer(sweepWinner).tokens += SWEEP_BONUS_PER_LOSER
    }
  }

  private emitCurrentTurn() {
    const battle = this.state.pileBattle
    if (!battle?.actingPlayerId) return
    const event = battle.pile === 'pile2' ? 'pile2_turn' : 'pile3_turn'
    this.broadcast(event, {
      playerId: battle.actingPlayerId,
      round: battle.round,
      pot: battle.pot,
      currentBet: battle.currentBet,
      revealedByPlayer: battle.revealedByPlayer,
      timeLimitSec: 10,
    })
  }

  private advanceBettingRound(pile: 'pile2' | 'pile3') {
    const battle = this.state.pileBattle
    if (!battle) return

    if (battle.survivors.length <= 1) {
      battle.actingPlayerId = undefined
      return
    }

    const allActed = battle.survivors.every(id => battle.actedThisRound.includes(id))
    if (allActed) {
      if (battle.round === 2) {
        battle.actingPlayerId = undefined
        return
      }
      battle.round = 2
      battle.actedThisRound = []
    }

    const order = this.state.players.map(p => p.id).filter(id => battle.survivors.includes(id))
    const currentIndex = battle.actingPlayerId ? order.indexOf(battle.actingPlayerId) : -1
    let nextIndex = currentIndex
    do {
      nextIndex = (nextIndex + 1) % order.length
      if (!battle.actedThisRound.includes(order[nextIndex])) break
    } while (nextIndex !== currentIndex)

    battle.actingPlayerId = order[nextIndex]
    if (battle.actingPlayerId) this.emitCurrentTurn()
  }

  private revealNextPileCard(playerId: PlayerId, pile: 'pile2' | 'pile3') {
    const battle = this.state.pileBattle
    if (!battle) return
    const arranged = this.mustPlayer(playerId).arrangements[pile] || []
    const shown = battle.revealedByPlayer[playerId] || []
    const nextCard = arranged[shown.length]
    if (!nextCard) return
    battle.revealedByPlayer[playerId] = [...shown, nextCard]
    this.actionLog.push({ type: 'reveal', playerId, value: nextCard, pile, round: battle.round })
  }

  private pickAuctionWinner(bids: PendingBid[]): AuctionWin | undefined {
    if (!bids.length) return undefined
    const sorted = [...bids].sort((a, b) => {
      if (b.bid !== a.bid) return b.bid - a.bid
      return a.at - b.at
    })
    return {
      winnerId: sorted[0].playerId,
      bid: sorted[0].bid,
      at: sorted[0].at,
    }
  }

  private findWinnerIds(entries: Array<{ playerId: PlayerId; handScore: any }>, evaluator: { compareHands: (a: any, b: any) => number }) {
    if (!entries.length) return []
    let best = entries[0]
    let winners = [entries[0].playerId]
    for (let i = 1; i < entries.length; i++) {
      const cmp = evaluator.compareHands(entries[i].handScore, best.handScore)
      if (cmp > 0) {
        best = entries[i]
        winners = [entries[i].playerId]
      } else if (cmp === 0) {
        winners.push(entries[i].playerId)
      }
    }
    return winners
  }

  private validatePickedCards(playerId: PlayerId, cards: CardKey[], exactLen: number) {
    if (cards.length !== exactLen) return false
    const player = this.mustPlayer(playerId)
    const handCount = new Map<string, number>()
    player.hand.forEach(card => handCount.set(card, (handCount.get(card) || 0) + 1))
    for (const card of cards) {
      const left = handCount.get(card) || 0
      if (left <= 0) return false
      handCount.set(card, left - 1)
    }
    return true
  }

  private sameMultiset(a: CardKey[], b: CardKey[]) {
    if (a.length !== b.length) return false
    const count = new Map<string, number>()
    a.forEach(card => count.set(card, (count.get(card) || 0) + 1))
    for (const card of b) {
      const left = count.get(card) || 0
      if (left <= 0) return false
      count.set(card, left - 1)
    }
    return [...count.values()].every(v => v === 0)
  }

  private autoPick(hand: CardKey[], excluded: CardKey[]) {
    const excludedCount = new Map<string, number>()
    excluded.forEach(card => excludedCount.set(card, (excludedCount.get(card) || 0) + 1))
    const remaining: CardKey[] = []
    for (const card of hand) {
      const left = excludedCount.get(card) || 0
      if (left > 0) {
        excludedCount.set(card, left - 1)
      } else {
        remaining.push(card)
      }
    }
    return remaining.slice(0, PILE_SIZE)
  }

  private getTokenBalance() {
    return Object.fromEntries(this.state.players.map(p => [p.id, p.tokens]))
  }

  private emitToPlayer(playerId: PlayerId, event: string, payload: any) {
    const socket = this.server.getSocketByPlayerId(playerId)
    socket?.emit(event, payload)
  }

  private broadcast(event: string, payload: any) {
    this.server.io.to(this.state.roomId).emit(event, payload)
  }

  private mustPlayer(playerId: PlayerId) {
    const player = this.state.players.find(p => p.id === playerId)
    if (!player) throw new Error(`Unknown player: ${playerId}`)
    return player
  }
}
