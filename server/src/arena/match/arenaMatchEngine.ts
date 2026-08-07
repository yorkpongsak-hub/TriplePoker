import { resolveBlindAuction, resolveFaceUpAuction, ArenaBid } from '../auction/arenaAuction'
import { ArenaArrangement, bestArenaArrangement, checkArenaFoul, evaluatePileBest, validateArenaPartition } from '../arrangement/arenaArrangement'
import { ArenaPersonality, lockArenaBossPersonality } from '../ai/arenaBotPersonality'
import { recordHumanGfDecision, SorenMatchStats } from '../ai/arenaSorenPersonality'
import { arenaCardKey, ArenaCard, ArenaDeal, ArenaRandom, createArenaDeck, dealArenaCards, shuffleArenaDeck } from '../cards/arenaDeck'
import { arenaPhaseTimeoutMs, tierSConfig, tierSEconomyConfig } from '../config/tierSConfig'
import { ArenaMatchPhase, ArenaPile, JokerDeclaration } from '../contracts/arenaContracts'
import { autoLockJoker, declareJoker } from '../joker/jokerRules'
import { ArenaHandResult, compareArenaHands, evaluateArenaHand } from '../joker/wildHandEvaluator'
import { ArenaMatchComposition } from '../matchmaking/arenaMatchmaking'
import { GFRound, GFPlayer, recordGFAction, soleRemainingPlayer, startPile2GF, startPile3Round1, startPile3Round2 } from '../gf/arenaGFRules'
import { ArenaSettlementEngine, PlayerResultBreakdown, SettlementAccount, SettlementCommand, SettlementTransaction } from '../settlement/arenaSettlementEngine'

export type ArenaMatchAction =
  | { type: 'BUY_IN_RESERVED'; actionId: string; actorId: string }
  | { type: 'ARRANGE_1'; actionId: string; actorId: string; pile1: string[]; pile2: string[]; pile3: string[] }
  | { type: 'FACE_UP_BID'; actionId: string; actorId: string; amountCrest: 0 | 3 | 6 | 9 | 12 }
  | { type: 'BLIND_BID'; actionId: string; actorId: string; amountCrest: 0 | 3 | 6 | 9 | 12; cardIndex: 0 | 1 }
  | { type: 'FINAL_ARRANGE'; actionId: string; actorId: string; pile1: string[]; pile2: string[]; pile3: string[] }
  | { type: 'JOKER_DECLARE'; actionId: string; actorId: string; mode: 'WILD' | 'ANTE_X2'; targetPile: 1 | 2 | 3; availableCrest: number }
  | { type: 'DISCARD'; actionId: string; actorId: string; cardId: string }
  | { type: 'FINAL_LOCK'; actionId: string; actorId: string; pile1: string[]; pile2: string[]; pile3: string[] }
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
  heldCardIds: Record<string, string[]>
  lockedArrangements: Record<string, ArenaArrangement>
  fouled: Record<string, boolean>
  pile1WinnerId: string | null
  pile2WinnerId: string | null
  pile3WinnerId: string | null
}

type DecisionPhase = keyof typeof arenaPhaseTimeoutMs

const AUTOMATIC_PHASES = new Set<ArenaMatchPhase>([
  'GAME_START', 'DEAL', 'REVEAL_PILE3_COMMUNITY_CARD_2', 'RESOLVE_PILE_1',
  'RESOLVE_PILE_2', 'RESOLVE_PILE_3', 'CHECK_SWEEP_JACKPOT', 'GAME_SETTLEMENT',
  'NEXT_GAME_OR_MATCH_END', 'MATCH_SETTLEMENT', 'BATTLE_REWARDS_SINK_IF_REMAINING',
])

type ArrangementAction = Extract<ArenaMatchAction, { type: 'ARRANGE_1' | 'FINAL_ARRANGE' | 'FINAL_LOCK' }>

function isArrangementAction(action: ArenaMatchAction): action is ArrangementAction {
  return action.type === 'ARRANGE_1' || action.type === 'FINAL_ARRANGE' || action.type === 'FINAL_LOCK'
}

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
  private dealCardsById = new Map<string, ArenaCard>()
  private faceUpWinnerId: string | null = null
  private jokerOwnerId: string | null = null
  private jokerDeclaration: JokerDeclaration | null = null
  private auctionWinnerIds = new Set<string>()
  private gfRound: GFRound | null = null
  private heldCardIds = new Map<string, Set<string>>()
  private lastArrangement = new Map<string, ArenaArrangement>()
  private lockedArrangements = new Map<string, ArenaArrangement>()
  private fouled = new Map<string, boolean>()
  private pile1WinnerId: string | null = null
  private pile2WinnerId: string | null = null
  private pile3WinnerId: string | null = null
  private bossFeeCharged = false
  private lockedBossPersonality: ArenaPersonality | null = null
  private sorenStats: SorenMatchStats = { humanCalls: 0, humanFolds: 0 }
  private readonly settlement: ArenaSettlementEngine
  private pendingTransactions: SettlementTransaction[] = []
  readonly actorIds: string[]
  readonly humanActorIds: string[]

  constructor(
    readonly matchId: string,
    readonly composition: ArenaMatchComposition,
    private readonly random: ArenaRandom = Math.random,
    startedAt = Date.now(),
    startingBalances?: Readonly<Record<string, number | SettlementAccount>>,
  ) {
    if (!matchId.trim()) throw new Error('ARENA_MATCH_ID_REQUIRED')
    this.actorIds = composition.seats.map((_, index) => seatActor(composition, index))
    this.humanActorIds = composition.seats
      .map((seat, index) => seat.controller === 'HUMAN' ? this.actorIds[index] : null)
      .filter((id): id is string => id !== null)
    const balances: Record<string, number | SettlementAccount> = startingBalances ?? Object.fromEntries(
      this.actorIds.map(id => [id, this.humanActorIds.includes(id)
        ? { balanceCrest: tierSEconomyConfig.requiredReservationCrest, persisted: true }
        : { balanceCrest: 100_000, persisted: false }]),
    )
    this.settlement = new ArenaSettlementEngine(balances)
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
  cardById(id: string): ArenaCard | undefined { return this.dealCardsById.get(id) }
  heldCardsFor(actorId: string): ArenaCard[] { return [...(this.heldCardIds.get(actorId) ?? [])].map(cardId => this.dealCardsById.get(cardId)!) }

  // ล็อกครั้งเดียวตอนแจกไพ่เกม 1 ถ้า Boss คือ Monarch (ดู dealGame()) — คงเดิมตลอด 3 เกมของ Match
  resolvedBossPersonality(): ArenaPersonality | null { return this.lockedBossPersonality }
  sorenMatchStats(): SorenMatchStats { return this.sorenStats }

  // ใช้ arrangement ที่ล็อกแล้ว (FINAL_LOCK) ถ้ามี ไม่งั้น fallback ไปที่ arrangement ล่าสุดที่ส่ง (FINAL_ARRANGE)
  // เพราะ Joker declare เกิดก่อน FINAL_LOCK — ให้บอทประเมิน winrate ของกองเป้าหมายได้ทั้งสองจังหวะ
  // ใช้ evaluatePileBest (ไม่ใช่ evaluateArenaHand ตรงๆ) เพราะก่อน Discard pile3 อาจมี 6 ใบ + community 2 = 8
  // เกิน evaluateArenaHand รับได้ (5-7) จะ throw — evaluatePileBest มี fallback ลอง drop ทีละใบให้แล้ว
  pileHandFor(actorId: string, pile: 1 | 2 | 3): ArenaHandResult | null {
    const arrangement = this.lockedArrangements.get(actorId) ?? this.lastArrangement.get(actorId)
    if (!arrangement || !this.deal) return null
    const pileIds = pile === 1 ? arrangement.pile1 : pile === 2 ? arrangement.pile2 : arrangement.pile3
    const community = pile === 1 ? this.deal.community.pile1 : pile === 2 ? this.deal.community.pile2 : this.deal.community.pile3
    const cards = pileIds.map(id => this.dealCardsById.get(id)).filter((card): card is ArenaCard => !!card)
    if (cards.length !== pileIds.length) return null
    return evaluatePileBest(cards, community)
  }

  snapshotDetail(): ArenaMatchSnapshotDetail {
    return {
      faceUpWinnerId: this.faceUpWinnerId,
      jokerOwnerId: this.jokerOwnerId,
      jokerDeclaration: this.jokerDeclaration,
      auctionWinnerIds: [...this.auctionWinnerIds],
      gfRound: this.gfRound,
      actedActorIds: [...this.phaseActions.keys()],
      heldCardIds: Object.fromEntries([...this.heldCardIds.entries()].map(([actorId, ids]) => [actorId, [...ids]])),
      lockedArrangements: Object.fromEntries(this.lockedArrangements.entries()),
      fouled: Object.fromEntries(this.fouled.entries()),
      pile1WinnerId: this.pile1WinnerId,
      pile2WinnerId: this.pile2WinnerId,
      pile3WinnerId: this.pile3WinnerId,
    }
  }

  // ดึง SettlementTransaction ที่เพิ่งเกิดตั้งแต่ครั้งก่อนไปยิง persist ที่ arena/realtime layer (engine เองไม่มี I/O)
  drainSettlementTransactions(): SettlementTransaction[] {
    const drained = this.pendingTransactions
    this.pendingTransactions = []
    return drained
  }

  settlementBreakdown(): PlayerResultBreakdown[] { return this.settlement.resultBreakdown() }
  settlementTotals(): ReturnType<ArenaSettlementEngine['totals']> { return this.settlement.totals() }

  private execSettlement(command: SettlementCommand): void {
    const { duplicate, transaction } = this.settlement.execute(command)
    if (!duplicate) this.pendingTransactions.push(transaction)
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
    if (action.type === 'DISCARD' && !this.heldCardIds.get(action.actorId)?.has(action.cardId)) throw new Error('ARENA_DISCARD_CARD_NOT_HELD')
    if (isArrangementAction(action)) {
      const held = this.heldCardIds.get(action.actorId)
      const check = validateArenaPartition({ pile1: action.pile1, pile2: action.pile2, pile3: action.pile3 }, held ?? new Set())
      if (!check.ok) throw new Error(check.reason ?? 'ARENA_ARRANGEMENT_INVALID')
    }
    if (this.phaseActions.has(action.actorId)) throw new Error('ARENA_ACTOR_ALREADY_ACTED')
  }

  private applyAction(action: ArenaMatchAction, now: number): void {
    if (action.type === 'GF_ACTION') {
      this.gfRound = recordGFAction(this.gfRound!, action.actorId, action.decision)
      // เก็บสถิติ Call/Fold ของ Human ไว้ให้ Soren ปรับ bias ข้ามเกมในแมตช์เดียวกัน (ดู arenaSorenPersonality.ts)
      if (this.humanActorIds.includes(action.actorId)) this.sorenStats = recordHumanGfDecision(this.sorenStats, action.decision)
      if (action.decision === 'CALL') {
        const pile: 2 | 3 = this.phase === 'GF_PILE_2' ? 2 : 3
        this.execSettlement({
          type: 'CALL', commandId: action.actionId, game: this.gameNumber as 1 | 2 | 3,
          pile, playerId: action.actorId, amountCrest: tierSEconomyConfig.callCostCrest,
        })
      }
      return
    }
    if (action.type === 'JOKER_DECLARE') {
      this.jokerDeclaration = declareJoker({
        mode: action.mode, targetPile: action.targetPile, declaredAt: new Date(now).toISOString(),
        availableCrest: action.availableCrest, requiredMatchedAnteCrest: action.targetPile === 3 ? 6 : 3,
      })
      // Joker ที่ใช้เป็นตัวคูณ Ante แล้วต้องถูกบังคับทิ้งทันที (ไม่นับรวมในมือแล้ว)
      if (action.mode === 'ANTE_X2') {
        this.heldCardIds.get(action.actorId)?.delete('JOKER')
        // คู่แข่งทุกคนต้อง Match Ante เป็นสองเท่าใน Pile เป้าหมาย (ไม่ใช่แค่คนประกาศ)
        const extraCrest = tierSEconomyConfig.anteCrest[`pile${action.targetPile}` as 'pile1' | 'pile2' | 'pile3']
        this.execSettlement({
          type: 'ANTE', commandId: `${this.matchId}:g${this.gameNumber}:antex2:pile${action.targetPile}`,
          game: this.gameNumber as 1 | 2 | 3, pile: action.targetPile, playerIds: [...this.actorIds], baseCrest: 0, extraCrest,
        })
      }
    }
    if (action.type === 'DISCARD') {
      this.heldCardIds.get(action.actorId)?.delete(action.cardId)
      this.removeFromLastArrangement(action.actorId, action.cardId)
    }
    if (isArrangementAction(action)) {
      const arrangement: ArenaArrangement = { pile1: action.pile1, pile2: action.pile2, pile3: action.pile3 }
      this.lastArrangement.set(action.actorId, arrangement)
      if (action.type === 'FINAL_LOCK') {
        this.lockedArrangements.set(action.actorId, arrangement)
        const foul = checkArenaFoul(arrangement, this.dealCardsById, this.deal!.community)
        this.fouled.set(action.actorId, foul.fouled)
      }
    }
    this.phaseActions.set(action.actorId, action)
  }

  private removeFromLastArrangement(actorId: string, cardId: string): void {
    const arrangement = this.lastArrangement.get(actorId)
    if (!arrangement) return
    this.lastArrangement.set(actorId, {
      pile1: arrangement.pile1.filter(id => id !== cardId),
      pile2: arrangement.pile2.filter(id => id !== cardId),
      pile3: arrangement.pile3.filter(id => id !== cardId),
    })
  }

  private progressAfterDecision(now: number): void {
    if (this.phase === 'MATCH_BUY_IN_RESERVE' && this.humanActorIds.every(id => this.phaseActions.has(id))) return this.transition('GAME_START', now)
    if (this.phase === 'ARRANGE_1' && this.allActorsActed()) return this.transition('AUCTION_FACE_UP', now)
    if (this.phase === 'AUCTION_FACE_UP' && this.allActorsActed()) {
      const bids = [...this.phaseActions.values()].map(action => ({ playerId: action.actorId, amountCrest: (action as Extract<ArenaMatchAction, { type: 'FACE_UP_BID' }>).amountCrest })) as ArenaBid[]
      const faceUpResolution = resolveFaceUpAuction(this.deal!.auction.faceUp, bids, this.actorIds, this.random)
      this.faceUpWinnerId = faceUpResolution.winnerId
      if (this.faceUpWinnerId) this.awardAuctionCard(this.faceUpWinnerId, this.deal!.auction.faceUp, faceUpResolution.chargedCrest)
      return this.transition('AUCTION_BLIND', now)
    }
    if (this.phase === 'AUCTION_BLIND' && this.pendingActors().length === 0) {
      const bids = [...this.phaseActions.values()].map(action => {
        const bid = action as Extract<ArenaMatchAction, { type: 'BLIND_BID' }>
        return { playerId: bid.actorId, amountCrest: bid.amountCrest, cardIndex: bid.cardIndex }
      })
      const results = resolveBlindAuction(this.deal!.auction.blind, bids, this.actorIds, this.faceUpWinnerId, this.random)
      results.forEach((result, index) => {
        if (result.winnerId) this.awardAuctionCard(result.winnerId, this.deal!.auction.blind[index], result.chargedCrest)
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

  private awardAuctionCard(winnerId: string, card: ArenaCard, chargedCrest: number): void {
    this.auctionWinnerIds.add(winnerId)
    this.heldCardIds.get(winnerId)?.add(arenaCardKey(card))
    if (card.kind === 'JOKER') this.jokerOwnerId = winnerId
    if (chargedCrest > 0) {
      this.execSettlement({
        type: 'AUCTION', commandId: `${this.matchId}:g${this.gameNumber}:auction:${card.id}`,
        game: this.gameNumber as 1 | 2 | 3, winnerId, amountCrest: chargedCrest,
      })
    }
  }

  private runAutomatic(now: number): void {
    let guard = 0
    while (AUTOMATIC_PHASES.has(this.phase)) {
      if (++guard > 30) throw new Error('ARENA_AUTOMATIC_PHASE_LOOP')
      switch (this.phase) {
        case 'GAME_START': this.startGame(now); break
        case 'DEAL': this.dealGame(now); break
        case 'REVEAL_PILE3_COMMUNITY_CARD_2': this.transition('FINAL_ARRANGE', now); break
        case 'RESOLVE_PILE_1': this.pile1WinnerId = this.resolvePileWinner(1, this.actorIds); this.payoutPile(1, this.pile1WinnerId); this.startGFPile2(now); break
        case 'RESOLVE_PILE_2': this.pile2WinnerId = this.resolveGfPileWinner(2); this.payoutPile(2, this.pile2WinnerId); this.startGFPile3Round1(now); break
        case 'RESOLVE_PILE_3': this.pile3WinnerId = this.resolveGfPileWinner(3); this.payoutPile(3, this.pile3WinnerId); this.transition('CHECK_SWEEP_JACKPOT', now); break
        case 'CHECK_SWEEP_JACKPOT': this.checkSweepJackpot(); this.transition('GAME_SETTLEMENT', now); break
        case 'GAME_SETTLEMENT': this.transition('NEXT_GAME_OR_MATCH_END', now); break
        case 'NEXT_GAME_OR_MATCH_END': this.transition(this.gameNumber < tierSConfig.matchGames ? 'GAME_START' : 'MATCH_SETTLEMENT', now); break
        case 'MATCH_SETTLEMENT': this.execSettlement({ type: 'END_MATCH', commandId: `${this.matchId}:endmatch` }); this.transition('BATTLE_REWARDS_SINK_IF_REMAINING', now); break
        case 'BATTLE_REWARDS_SINK_IF_REMAINING': this.transition('MATCH_RESULT', now); break
      }
    }
  }

  // ไม่มี GF สำหรับ Pile 1 — เปิดไพ่และตัดสินผลตรงจาก arrangement ที่ FINAL_LOCK ของทุกที่นั่ง (ข้ามคนที่ Foul)
  // Pile 2/3 เรียกผ่าน resolveGfPileWinner: ถ้าเหลือผู้เล่นคนเดียวจาก GF ให้ชนะทันทีไม่ต้องเปิดไพ่ (รักษา Fog of War)
  private resolvePileWinner(pile: 1 | 2 | 3, eligibleActorIds: readonly string[], ignoreFoul = false): string | null {
    let bestActorId: string | null = null
    let best: ReturnType<typeof evaluateArenaHand> | null = null
    for (const actorId of eligibleActorIds) {
      if (!ignoreFoul && this.fouled.get(actorId)) continue
      const arrangement = this.lockedArrangements.get(actorId)
      if (!arrangement) continue
      const pileIds = pile === 1 ? arrangement.pile1 : pile === 2 ? arrangement.pile2 : arrangement.pile3
      const community = pile === 1 ? this.deal!.community.pile1 : pile === 2 ? this.deal!.community.pile2 : this.deal!.community.pile3
      const cards = pileIds.map(id => this.dealCardsById.get(id)!)
      const hand = evaluateArenaHand([...cards, ...community])
      if (!best || compareArenaHands(hand, best) > 0) { best = hand; bestActorId = actorId }
    }
    // Edge case หายาก: ทุกคนที่ยังไม่ Fold ในกองนี้ Foul พร้อมกัน — เลี่ยงปล่อย Pot ค้าง (ทำให้ END_MATCH พัง) ด้วยการเทียบมือจริงไม่สนใจ Foul
    if (!bestActorId && !ignoreFoul) return this.resolvePileWinner(pile, eligibleActorIds, true)
    return bestActorId
  }

  private resolveGfPileWinner(pile: 2 | 3): string | null {
    const round = this.gfRound
    if (!round) return null
    const contenders = round.turnOrder.filter(id => !round.foldedPlayerIds.includes(id))
    if (contenders.length <= 1) return contenders[0] ?? null
    return this.resolvePileWinner(pile, contenders)
  }

  // ถ้าไม่มีผู้ชนะ (ทุกคน Foul กองนี้พร้อมกัน) ปล่อย Pot ไว้ก่อน ไม่จ่าย — เคสหายากมาก ไม่ใช่จุดโฟกัสของรอบนี้
  private payoutPile(pile: ArenaPile, winnerId: string | null): void {
    if (!winnerId) return
    this.execSettlement({
      type: 'PILE_PAYOUT', commandId: `${this.matchId}:g${this.gameNumber}:payout:pile${pile}`,
      game: this.gameNumber as 1 | 2 | 3, pile, winnerId,
    })
  }

  private checkSweepJackpot(): void {
    const winnerId = this.pile1WinnerId
    if (!winnerId || winnerId !== this.pile2WinnerId || winnerId !== this.pile3WinnerId) return
    if (this.settlement.totals().battleRewardsCrest <= 0) return
    this.execSettlement({
      type: 'SWEEP_JACKPOT', commandId: `${this.matchId}:g${this.gameNumber}:sweep`,
      game: this.gameNumber as 1 | 2 | 3, winnerId,
    })
  }

  private startGame(now: number): void {
    this.gameNumber = (this.gameNumber + 1) as 1 | 2 | 3
    this.deal = null; this.dealCardsById.clear(); this.faceUpWinnerId = null; this.jokerOwnerId = null
    this.jokerDeclaration = null; this.gfRound = null; this.auctionWinnerIds.clear()
    this.heldCardIds.clear(); this.lastArrangement.clear(); this.lockedArrangements.clear(); this.fouled.clear()
    this.pile1WinnerId = null; this.pile2WinnerId = null; this.pile3WinnerId = null
    if (!this.bossFeeCharged) { this.chargeBossFee(); this.bossFeeCharged = true }
    this.transition('DEAL', now)
  }

  private chargeBossFee(): void {
    const bossSeat = this.composition.seats.find(seat => seat.seat === 3)
    if (!bossSeat) return
    const feeCrest = bossSeat.controller === 'HUMAN' ? tierSEconomyConfig.bossFeeCrest.humanBoss : tierSEconomyConfig.bossFeeCrest.aiBoss
    const bossActorId = bossSeat.controller === 'HUMAN' ? bossSeat.playerId : `ai:${bossSeat.aiId}:seat${bossSeat.seat}`
    const payerIds = this.humanActorIds.filter(id => id !== bossActorId)
    if (!payerIds.length) return
    this.execSettlement({ type: 'BOSS_FEE', commandId: `${this.matchId}:bossfee`, playerIds: payerIds, feeCrest })
  }

  // พอร์ตกลไก "ล็อกบุคลิกตามความแข็งไพ่ตอนแจกเกม 1" จาก server/src/game/monarchEngine.ts:307-319, 374-388
  // ล็อกครั้งเดียว คงเดิมตลอด 3 เกมของ Match (เดียวกับที่ Monarch ทำใน High Noble)
  private lockBossPersonalityIfMonarch(): void {
    const bossIndex = this.composition.seats.findIndex(seat => seat.seat === 3)
    const bossSeat = this.composition.seats[bossIndex]
    if (bossSeat?.controller !== 'AI' || bossSeat.aiId !== 'MONARCH') return
    const strength = this.computeHandStrength(this.actorIds[bossIndex])
    this.lockedBossPersonality = lockArenaBossPersonality(strength)
  }

  // Probe ด้วย bestArenaArrangement (unweighted greedy) แทน weight เฉพาะของ Cortex ใน monarchEngine.ts เดิม —
  // ไม่มี weight hook ใน bestArenaArrangement ของ Arena (ดูเหตุผลใน arenaArrangement.ts) ผลลัพธ์ใกล้เคียงพอสำหรับวัด strength หยาบๆ
  private computeHandStrength(actorId: string): number {
    const probe = bestArenaArrangement(this.heldCardsFor(actorId), this.deal!.community)
    const evalPile = (ids: string[], community: ArenaCard[]) => evaluateArenaHand([...ids.map(id => this.dealCardsById.get(id)!), ...community])
    const h1 = evalPile(probe.pile1, this.deal!.community.pile1)
    const h2 = evalPile(probe.pile2, this.deal!.community.pile2)
    const h3 = evalPile(probe.pile3, this.deal!.community.pile3)
    return (h1.rankIndex + h2.rankIndex + h3.rankIndex) / 27
  }

  private dealGame(now: number): void {
    let dealt: ArenaDeal | null = null
    for (let attempts = 0; attempts < 100 && !dealt; attempts++) {
      const candidate = dealArenaCards(shuffleArenaDeck(createArenaDeck(), this.random))
      if (legalJokerLocation(candidate)) dealt = candidate
    }
    if (!dealt) throw new Error('ARENA_COULD_NOT_DEAL_LEGAL_JOKER_LOCATION')
    this.deal = dealt
    // ใช้ arenaCardKey (short code เดียวกับที่ client เห็น) เป็น canonical id ตลอดทั้ง engine
    // แทน card.id ดิบ — client ไม่มีทาง reverse-map short code กลับเป็น card.id ได้ จึงต้องให้ทั้งสองฝั่งใช้ key เดียวกัน
    const allCards = [...dealt.players.flat(), ...dealt.community.pile1, ...dealt.community.pile2, ...dealt.community.pile3, dealt.auction.faceUp, ...dealt.auction.blind]
    allCards.forEach(card => this.dealCardsById.set(arenaCardKey(card), card))
    dealt.players.forEach((hand, index) => {
      this.heldCardIds.set(this.actorIds[index], new Set(hand.map(card => arenaCardKey(card))))
      if (hand.some(card => card.kind === 'JOKER')) this.jokerOwnerId = this.actorIds[index]
    })
    if (this.gameNumber === 1) this.lockBossPersonalityIfMonarch()
    this.log(now, 'GAME_DEALT', undefined, undefined, { gameNumber: this.gameNumber })
    this.chargeAnte(1, tierSEconomyConfig.anteCrest.pile1)
    this.chargeAnte(2, tierSEconomyConfig.anteCrest.pile2)
    this.chargeAnte(3, tierSEconomyConfig.anteCrest.pile3)
    this.transition('ARRANGE_1', now)
  }

  private chargeAnte(pile: ArenaPile, baseCrest: number): void {
    this.execSettlement({
      type: 'ANTE', commandId: `${this.matchId}:g${this.gameNumber}:ante:pile${pile}`,
      game: this.gameNumber as 1 | 2 | 3, pile, playerIds: [...this.actorIds], baseCrest, extraCrest: 0,
    })
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
        case 'ARRANGE_1': {
          const arrangement = bestArenaArrangement(this.heldCardsFor(actorId), this.deal!.community)
          action = { type: 'ARRANGE_1', actionId, actorId, ...arrangement }
          break
        }
        case 'FINAL_ARRANGE': {
          const arrangement = bestArenaArrangement(this.heldCardsFor(actorId), this.deal!.community)
          action = { type: 'FINAL_ARRANGE', actionId, actorId, ...arrangement }
          break
        }
        case 'AUCTION_FACE_UP': action = { type: 'FACE_UP_BID', actionId, actorId, amountCrest: 0 }; break
        case 'AUCTION_BLIND': action = { type: 'BLIND_BID', actionId, actorId, amountCrest: 0, cardIndex: 0 }; break
        case 'JOKER_DECLARE':
          this.jokerDeclaration = autoLockJoker(new Date(now).toISOString())
          this.log(now, 'DEFAULT_ACTION', actorId, actionId, { type: 'JOKER_AUTO_WILD_PILE_3' })
          break
        case 'DISCARD': {
          const heldFallback = [...(this.heldCardIds.get(actorId) ?? [])]
          const fallback = this.lastArrangement.get(actorId)?.pile3[0] ?? heldFallback[0]
          if (!fallback) throw new Error('ARENA_DISCARD_DEFAULT_NO_CARD_HELD')
          action = { type: 'DISCARD', actionId, actorId, cardId: fallback }
          break
        }
        case 'FINAL_LOCK': {
          const arrangement = this.lastArrangement.get(actorId) ?? bestArenaArrangement(this.heldCardsFor(actorId), this.deal!.community)
          action = { type: 'FINAL_LOCK', actionId, actorId, ...arrangement }
          break
        }
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
