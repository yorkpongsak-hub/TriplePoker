import { resolveBlindAuction, resolveFaceUpAuction, ArenaBid } from '../auction/arenaAuction'
import { ArenaCard, ArenaDeal, ArenaRandom, createArenaDeck, dealArenaCards, shuffleArenaDeck } from '../cards/arenaDeck'
import { arenaPhaseTimeoutMs, tierSConfig } from '../config/tierSConfig'
import { ArenaMatchPhase, JokerDeclaration } from '../contracts/arenaContracts'
import { autoLockJoker, declareJoker } from '../joker/jokerRules'
import { ArenaMatchComposition } from '../matchmaking/arenaMatchmaking'
import { GFRound, GFPlayer, recordGFAction, soleRemainingPlayer, startPile2GF, startPile3Round1, startPile3Round2 } from '../gf/arenaGFRules'

export type ArenaMatchAction =
  | { type: 'BUY_IN_RESERVED'; actionId: string; actorId: string }
  | { type: 'ARRANGE_1'; actionId: string; actorId: string; arrangementHash: string }
  | { type: 'FACE_UP_BID'; actionId: string; actorId: string; amountCrest: 0 | 3 | 6 | 9 | 12 }
  | { type: 'BLIND_BID'; actionId: string; actorId: string; amountCrest: 0 | 3 | 6 | 9 | 12; cardIndex: 0 | 1 }
  | { type: 'FINAL_ARRANGE'; actionId: string; actorId: string; arrangementHash: string }
  | { type: 'JOKER_DECLARE'; actionId: string; actorId: string; mode: 'WILD' | 'ANTE_X2'; targetPile: 1 | 2 | 3; availableCrest: number }
  | { type: 'DISCARD'; actionId: string; actorId: string; cardId: string }
  | { type: 'FINAL_LOCK'; actionId: string; actorId: string; arrangementHash: string }
  | { type: 'GF_ACTION'; actionId: string; actorId: string; decision: 'CALL' | 'FOLD' }

export interface ArenaMatchEvent {
  sequence: number
  at: number
  kind: 'PHASE_CHANGED' | 'ACTION_ACCEPTED' | 'DEFAULT_ACTION' | 'GAME_DEALT'
  phase: ArenaMatchPhase
  actorId?: string
  actionId?: string
  detail?: Record<string, unknown>
}

export interface ArenaMatchSnapshot {
  matchId: string
  phase: ArenaMatchPhase
  gameNumber: 0 | 1 | 2 | 3
  version: number
  deadlineAt: number | null
  actorIds: string[]
  pendingActorIds: string[]
  completed: boolean
}

export interface ArenaMatchSnapshotDetail {
  faceUpWinnerId: string | null
  jokerOwnerId: string | null
  jokerDeclaration: JokerDeclaration | null
  auctionWinnerIds: string[]
  gfRound: GFRound | null
  actedActorIds: string[]
}

type DecisionPhase = keyof typeof arenaPhaseTimeoutMs

const AUTOMATIC_PHASES = new Set<ArenaMatchPhase>([
  'GAME_START', 'DEAL', 'REVEAL_PILE3_COMMUNITY_CARD_2', 'RESOLVE_PILE_1',
  'RESOLVE_PILE_2', 'RESOLVE_PILE_3', 'CHECK_SWEEP_JACKPOT', 'GAME_SETTLEMENT',
  'NEXT_GAME_OR_MATCH_END', 'MATCH_SETTLEMENT', 'BATTLE_REWARDS_SINK_IF_REMAINING',
])

function seatActor(composition: ArenaMatchComposition, index: number): string {
  const seat = composition.seats[index]
  return seat.controller === 'HUMAN' ? seat.playerId : `ai:${seat.aiId}:seat${seat.seat}`
}

function legalJokerLocation(deal: ArenaDeal): boolean {
  if (deal.players.flat().some(card => card.kind === 'JOKER')) return true
  if (deal.auction.faceUp.kind === 'JOKER' || deal.auction.blind.some(card => card.kind === 'JOKER')) return true
  return deal.community.pile3[1]?.kind === 'JOKER'
}

export class ArenaMatchEngine {
  private phase: ArenaMatchPhase = 'MATCH_BUY_IN_RESERVE'
  private gameNumber: 0 | 1 | 2 | 3 = 0
  private version = 1
  private deadlineAt: number | null = null
  private events: ArenaMatchEvent[] = []
  private processedActionIds = new Map<string, string>()
  private phaseActions = new Map<string, ArenaMatchAction>()
  private deal: ArenaDeal | null = null
  private faceUpWinnerId: string | null = null
  private jokerOwnerId: string | null = null
  private jokerDeclaration: JokerDeclaration | null = null
  private auctionWinnerIds = new Set<string>()
  private gfRound: GFRound | null = null
  private finalLockHashes = new Map<string, string>()
  readonly actorIds: string[]
  readonly humanActorIds: string[]

  constructor(
    readonly matchId: string,
    readonly composition: ArenaMatchComposition,
    private readonly random: ArenaRandom = Math.random,
    startedAt = Date.now(),
  ) {
    if (!matchId.trim()) throw new Error('ARENA_MATCH_ID_REQUIRED')
    this.actorIds = composition.seats.map((_, index) => seatActor(composition, index))
    this.humanActorIds = composition.seats
      .map((seat, index) => seat.controller === 'HUMAN' ? this.actorIds[index] : null)
      .filter((id): id is string => id !== null)
    this.setDeadline(startedAt)
    this.log(startedAt, 'PHASE_CHANGED')
  }

  snapshot(): ArenaMatchSnapshot {
    return {
      matchId: this.matchId,
      phase: this.phase,
      gameNumber: this.gameNumber,
      version: this.version,
      deadlineAt: this.deadlineAt,
      actorIds: [...this.actorIds],
      pendingActorIds: this.pendingActors(),
      completed: this.phase === 'MATCH_RESULT',
    }
  }

  eventLog(): readonly ArenaMatchEvent[] { return this.events.map(event => ({ ...event, detail: event.detail ? { ...event.detail } : undefined })) }
  currentDeal(): ArenaDeal | null { return this.deal }

  snapshotDetail(): ArenaMatchSnapshotDetail {
    return {
      faceUpWinnerId: this.faceUpWinnerId,
      jokerOwnerId: this.jokerOwnerId,
      jokerDeclaration: this.jokerDeclaration,
      auctionWinnerIds: [...this.auctionWinnerIds],
      gfRound: this.gfRound,
      actedActorIds: [...this.phaseActions.keys()],
    }
  }

  submit(action: ArenaMatchAction, now = Date.now()): { accepted: boolean; duplicate: boolean; snapshot: ArenaMatchSnapshot } {
    const fingerprint = JSON.stringify(action)
    const previous = this.processedActionIds.get(action.actionId)
    if (previous) {
      if (previous !== fingerprint) throw new Error('ARENA_ACTION_ID_CONFLICT')
      return { accepted: true, duplicate: true, snapshot: this.snapshot() }
    }
    this.assertActionAllowed(action)
    this.applyAction(action, now)
    this.processedActionIds.set(action.actionId, fingerprint)
    this.log(now, 'ACTION_ACCEPTED', action.actorId, action.actionId, { type: action.type })
    this.progressAfterDecision(now)
    return { accepted: true, duplicate: false, snapshot: this.snapshot() }
  }

  tick(now: number): ArenaMatchSnapshot {
    if (this.phase === 'MATCH_RESULT') return this.snapshot()
    if (this.deadlineAt !== null && now >= this.deadlineAt) this.applyDefaults(now)
    this.runAutomatic(now)
    return this.snapshot()
  }

  private assertActionAllowed(action: ArenaMatchAction): void {
    if (!this.actorIds.includes(action.actorId)) throw new Error('ARENA_ACTOR_NOT_IN_MATCH')
    const expected: Partial<Record<ArenaMatchAction['type'], ArenaMatchPhase>> = {
      BUY_IN_RESERVED: 'MATCH_BUY_IN_RESERVE', ARRANGE_1: 'ARRANGE_1', FACE_UP_BID: 'AUCTION_FACE_UP',
      BLIND_BID: 'AUCTION_BLIND', FINAL_ARRANGE: 'FINAL_ARRANGE', JOKER_DECLARE: 'JOKER_DECLARE',
      DISCARD: 'DISCARD', FINAL_LOCK: 'FINAL_LOCK',
    }
    if (action.type === 'GF_ACTION') {
      if (!['GF_PILE_2', 'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2'].includes(this.phase)) throw new Error('ARENA_ACTION_WRONG_PHASE')
      const next = this.gfRound?.turnOrder.find(id => !this.gfRound!.calledPlayerIds.includes(id) && !this.gfRound!.foldedPlayerIds.includes(id))
      if (next !== action.actorId) throw new Error('ARENA_GF_NOT_ACTOR_TURN')
      return
    }
    if (expected[action.type] !== this.phase) throw new Error('ARENA_ACTION_WRONG_PHASE')
    if (action.type === 'BUY_IN_RESERVED' && !this.humanActorIds.includes(action.actorId)) throw new Error('ARENA_AI_HAS_NO_BUY_IN')
    if (action.type === 'JOKER_DECLARE' && action.actorId !== this.jokerOwnerId) throw new Error('ARENA_ACTOR_DOES_NOT_OWN_JOKER')
    if (this.phaseActions.has(action.actorId)) throw new Error('ARENA_ACTOR_ALREADY_ACTED')
  }

  private applyAction(action: ArenaMatchAction, now: number): void {
    if (action.type === 'GF_ACTION') {
      this.gfRound = recordGFAction(this.gfRound!, action.actorId, action.decision)
      return
    }
    if (action.type === 'JOKER_DECLARE') {
      this.jokerDeclaration = declareJoker({
        mode: action.mode, targetPile: action.targetPile, declaredAt: new Date(now).toISOString(),
        availableCrest: action.availableCrest, requiredMatchedAnteCrest: action.targetPile === 3 ? 6 : 3,
      })
    }
    if (action.type === 'FINAL_LOCK') this.finalLockHashes.set(action.actorId, action.arrangementHash)
    this.phaseActions.set(action.actorId, action)
  }

  private progressAfterDecision(now: number): void {
    if (this.phase === 'MATCH_BUY_IN_RESERVE' && this.humanActorIds.every(id => this.phaseActions.has(id))) return this.transition('GAME_START', now)
    if (this.phase === 'ARRANGE_1' && this.allActorsActed()) return this.transition('AUCTION_FACE_UP', now)
    if (this.phase === 'AUCTION_FACE_UP' && this.allActorsActed()) {
      const bids = [...this.phaseActions.values()].map(action => ({ playerId: action.actorId, amountCrest: (action as Extract<ArenaMatchAction, { type: 'FACE_UP_BID' }>).amountCrest })) as ArenaBid[]
      this.faceUpWinnerId = resolveFaceUpAuction(this.deal!.auction.faceUp, bids, this.actorIds, this.random).winnerId
      if (this.faceUpWinnerId) this.auctionWinnerIds.add(this.faceUpWinnerId)
      if (this.deal!.auction.faceUp.kind === 'JOKER') this.jokerOwnerId = this.faceUpWinnerId
      return this.transition('AUCTION_BLIND', now)
    }
    if (this.phase === 'AUCTION_BLIND' && this.pendingActors().length === 0) {
      const bids = [...this.phaseActions.values()].map(action => {
        const bid = action as Extract<ArenaMatchAction, { type: 'BLIND_BID' }>
        return { playerId: bid.actorId, amountCrest: bid.amountCrest, cardIndex: bid.cardIndex }
      })
      const results = resolveBlindAuction(this.deal!.auction.blind, bids, this.actorIds, this.faceUpWinnerId, this.random)
      results.forEach((result, index) => {
        if (result.winnerId) this.auctionWinnerIds.add(result.winnerId)
        if (this.deal!.auction.blind[index].kind === 'JOKER') this.jokerOwnerId = result.winnerId
      })
      return this.transition('REVEAL_PILE3_COMMUNITY_CARD_2', now)
    }
    if (this.phase === 'FINAL_ARRANGE' && this.allActorsActed()) {
      if (!this.jokerOwnerId && this.deal!.community.pile3[1].kind !== 'JOKER') return this.enterDiscard(now)
      if (this.deal!.community.pile3[1].kind === 'JOKER') {
        this.jokerDeclaration = { mode: 'WILD', targetPile: 3, forcedWild: true, declaredAt: new Date(now).toISOString() }
        return this.enterDiscard(now)
      }
      return this.transition('JOKER_DECLARE', now)
    }
    if (this.phase === 'JOKER_DECLARE' && this.jokerDeclaration) return this.enterDiscard(now)
    if (this.phase === 'DISCARD' && this.pendingActors().length === 0) return this.transition('FINAL_LOCK', now)
    if (this.phase === 'FINAL_LOCK' && this.allActorsActed()) return this.transition('RESOLVE_PILE_1', now)
    if (this.gfRound) {
      const sole = soleRemainingPlayer(this.gfRound)
      if (sole) {
        if (!this.gfRound.calledPlayerIds.includes(sole)) this.gfRound = { ...this.gfRound, calledPlayerIds: [...this.gfRound.calledPlayerIds, sole] }
        if (this.phase === 'GF_PILE_2') return this.transition('RESOLVE_PILE_2', now)
        return this.transition('RESOLVE_PILE_3', now)
      }
    }
    if (this.gfRound && this.gfRound.turnOrder.every(id => this.gfRound!.calledPlayerIds.includes(id) || this.gfRound!.foldedPlayerIds.includes(id))) {
      if (this.phase === 'GF_PILE_2') return this.transition('RESOLVE_PILE_2', now)
      if (this.phase === 'GF_PILE_3_ROUND_1') return this.startGFPile3Round2(now)
      if (this.phase === 'GF_PILE_3_ROUND_2') return this.transition('RESOLVE_PILE_3', now)
    }
    if (this.gfRound && ['GF_PILE_2', 'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2'].includes(this.phase)) this.setDeadline(now)
    this.runAutomatic(now)
  }

  private runAutomatic(now: number): void {
    let guard = 0
    while (AUTOMATIC_PHASES.has(this.phase)) {
      if (++guard > 30) throw new Error('ARENA_AUTOMATIC_PHASE_LOOP')
      switch (this.phase) {
        case 'GAME_START': this.startGame(now); break
        case 'DEAL': this.dealGame(now); break
        case 'REVEAL_PILE3_COMMUNITY_CARD_2': this.transition('FINAL_ARRANGE', now); break
        case 'RESOLVE_PILE_1': this.startGFPile2(now); break
        case 'RESOLVE_PILE_2': this.startGFPile3Round1(now); break
        case 'RESOLVE_PILE_3': this.transition('CHECK_SWEEP_JACKPOT', now); break
        case 'CHECK_SWEEP_JACKPOT': this.transition('GAME_SETTLEMENT', now); break
        case 'GAME_SETTLEMENT': this.transition('NEXT_GAME_OR_MATCH_END', now); break
        case 'NEXT_GAME_OR_MATCH_END': this.transition(this.gameNumber < tierSConfig.matchGames ? 'GAME_START' : 'MATCH_SETTLEMENT', now); break
        case 'MATCH_SETTLEMENT': this.transition('BATTLE_REWARDS_SINK_IF_REMAINING', now); break
        case 'BATTLE_REWARDS_SINK_IF_REMAINING': this.transition('MATCH_RESULT', now); break
      }
    }
  }

  private startGame(now: number): void {
    this.gameNumber = (this.gameNumber + 1) as 1 | 2 | 3
    this.deal = null; this.faceUpWinnerId = null; this.jokerOwnerId = null; this.jokerDeclaration = null; this.gfRound = null; this.finalLockHashes.clear(); this.auctionWinnerIds.clear()
    this.transition('DEAL', now)
  }

  private dealGame(now: number): void {
    let dealt: ArenaDeal | null = null
    for (let attempts = 0; attempts < 100 && !dealt; attempts++) {
      const candidate = dealArenaCards(shuffleArenaDeck(createArenaDeck(), this.random))
      if (legalJokerLocation(candidate)) dealt = candidate
    }
    if (!dealt) throw new Error('ARENA_COULD_NOT_DEAL_LEGAL_JOKER_LOCATION')
    this.deal = dealt
    dealt.players.forEach((hand, index) => { if (hand.some(card => card.kind === 'JOKER')) this.jokerOwnerId = this.actorIds[index] })
    this.log(now, 'GAME_DEALT', undefined, undefined, { gameNumber: this.gameNumber })
    this.transition('ARRANGE_1', now)
  }

  private startGFPile2(now: number): void {
    this.gfRound = startPile2GF(this.gfPlayers())
    this.transition('GF_PILE_2', now, false)
  }

  private enterDiscard(now: number): void {
    this.transition('DISCARD', now)
    if (this.auctionWinnerIds.size === 0) this.transition('FINAL_LOCK', now)
  }

  private startGFPile3Round1(now: number): void {
    const lastCaller = this.gfRound?.calledPlayerIds.at(-1) ?? this.actorIds[0]
    this.gfRound = startPile3Round1(this.gfPlayers(), lastCaller)
    this.transition('GF_PILE_3_ROUND_1', now, false)
  }

  private startGFPile3Round2(now: number): void {
    if (!this.gfRound!.calledPlayerIds.length) return this.transition('RESOLVE_PILE_3', now)
    this.gfRound = startPile3Round2(this.gfPlayers(), this.gfRound!)
    this.transition('GF_PILE_3_ROUND_2', now, false)
  }

  private gfPlayers(): GFPlayer[] {
    return this.composition.seats.map((seat, index) => ({
      playerId: this.actorIds[index], seat: seat.seat,
      isBoss: seat.seat === 3,
      joinedAt: index,
    }))
  }

  private applyDefaults(now: number): void {
    for (const actorId of this.pendingActors()) {
      let action: ArenaMatchAction | null = null
      const actionId = `default:${this.gameNumber}:${this.phase}:${actorId}`
      switch (this.phase) {
        case 'MATCH_BUY_IN_RESERVE': throw new Error('ARENA_BUY_IN_RESERVATION_TIMEOUT')
        case 'ARRANGE_1': action = { type: 'ARRANGE_1', actionId, actorId, arrangementHash: 'latest-valid' }; break
        case 'AUCTION_FACE_UP': action = { type: 'FACE_UP_BID', actionId, actorId, amountCrest: 0 }; break
        case 'AUCTION_BLIND': action = { type: 'BLIND_BID', actionId, actorId, amountCrest: 0, cardIndex: 0 }; break
        case 'FINAL_ARRANGE': action = { type: 'FINAL_ARRANGE', actionId, actorId, arrangementHash: 'latest-valid' }; break
        case 'JOKER_DECLARE':
          this.jokerDeclaration = autoLockJoker(new Date(now).toISOString())
          this.log(now, 'DEFAULT_ACTION', actorId, actionId, { type: 'JOKER_AUTO_WILD_PILE_3' })
          break
        case 'DISCARD': action = { type: 'DISCARD', actionId, actorId, cardId: 'server-default-discard' }; break
        case 'FINAL_LOCK': action = { type: 'FINAL_LOCK', actionId, actorId, arrangementHash: 'latest-valid' }; break
        case 'GF_PILE_2': case 'GF_PILE_3_ROUND_1': case 'GF_PILE_3_ROUND_2': action = { type: 'GF_ACTION', actionId, actorId, decision: 'FOLD' }; break
      }
      if (action) {
        this.applyAction(action, now)
        this.processedActionIds.set(action.actionId, JSON.stringify(action))
        this.log(now, 'DEFAULT_ACTION', actorId, action.actionId, { type: action.type })
      }
    }
    this.progressAfterDecision(now)
  }

  private pendingActors(): string[] {
    if (this.phase === 'MATCH_BUY_IN_RESERVE') return this.humanActorIds.filter(id => !this.phaseActions.has(id))
    if (this.phase === 'AUCTION_BLIND') return this.actorIds.filter(id => id !== this.faceUpWinnerId && !this.phaseActions.has(id))
    if (this.phase === 'JOKER_DECLARE') return this.jokerDeclaration || !this.jokerOwnerId ? [] : [this.jokerOwnerId]
    if (this.gfRound) return this.gfRound.turnOrder.filter(id => !this.gfRound!.calledPlayerIds.includes(id) && !this.gfRound!.foldedPlayerIds.includes(id)).slice(0, 1)
    if (this.phase === 'DISCARD') return [...this.auctionWinnerIds].filter(id => !this.phaseActions.has(id))
    if (['ARRANGE_1', 'AUCTION_FACE_UP', 'FINAL_ARRANGE', 'FINAL_LOCK'].includes(this.phase)) return this.actorIds.filter(id => !this.phaseActions.has(id))
    return []
  }

  private allActorsActed(): boolean { return this.actorIds.every(id => this.phaseActions.has(id)) }

  private transition(next: ArenaMatchPhase, now: number, clearActions = true): void {
    this.phase = next
    this.version++
    if (clearActions) this.phaseActions.clear()
    this.setDeadline(now)
    this.log(now, 'PHASE_CHANGED')
    this.runAutomatic(now)
  }

  private setDeadline(now: number): void {
    const duration = arenaPhaseTimeoutMs[this.phase as DecisionPhase]
    this.deadlineAt = duration ? now + duration : null
  }

  private log(at: number, kind: ArenaMatchEvent['kind'], actorId?: string, actionId?: string, detail?: Record<string, unknown>): void {
    this.events.push({ sequence: this.events.length + 1, at, kind, phase: this.phase, actorId, actionId, detail })
  }
}
