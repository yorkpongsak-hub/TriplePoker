import { randomUUID } from 'node:crypto'
import { ArenaConnectionManager } from '../connection/arenaConnectionManager'
import { ArenaMatchAction, ArenaMatchEngine, ArenaMatchSnapshot } from '../match/arenaMatchEngine'
import { ArenaHuman, ArenaMatchComposition, ArenaMatchmakingQueue, JoinArenaQueueResult } from '../matchmaking/arenaMatchmaking'

export interface ArenaRuntimeMatch {
  engine: ArenaMatchEngine
  connections: ArenaConnectionManager
  composition: ArenaMatchComposition
}

export class ArenaRuntime {
  // สุ่มครั้งเดียวตอน process ขึ้น กัน matchId ชนกันข้าม server restart (queueSequence รีเซ็ตเป็น 1
  // ทุกครั้งที่ process ใหม่ แต่ arena_settlement_transactions ใน Supabase เก็บ transaction_key เดิมไว้ถาวร
  // — ถ้า matchId ซ้ำของเก่า commandId ที่ derive จากมัน เช่น g1:payout:pile1 จะชนกับแมตช์เก่าที่เนื้อหาต่างกันจริง
  // ทำให้ arena_apply_crest_batch RPC โยน IDEMPOTENCY_KEY_CONFLICT)
  private readonly instanceId = randomUUID()
  private queueSequence = 1
  private queue: ArenaMatchmakingQueue
  private matches = new Map<string, ArenaRuntimeMatch>()
  private playerMatch = new Map<string, string>()

  constructor(private readonly random: () => number = Math.random, now = Date.now()) {
    this.queue = this.newQueue(now)
  }

  join(player: ArenaHuman, now = Date.now()): JoinArenaQueueResult {
    if (this.playerMatch.has(player.playerId)) return { ok: false, reason: 'ALREADY_JOINED' }
    return this.queue.join(player, now)
  }

  tickQueue(now = Date.now()): ArenaMatchComposition | null {
    const composition = this.queue.tryFinalize(now)
    if (composition && !this.matches.has(this.matchIdFor(composition.queueId))) this.startMatch(composition, now)
    return composition
  }

  matchForPlayer(playerId: string): ArenaRuntimeMatch | null {
    const matchId = this.playerMatch.get(playerId)
    return matchId ? this.matches.get(matchId) ?? null : null
  }

  activeMatches(): ArenaRuntimeMatch[] { return [...this.matches.values()] }

  waitingHumanIds(): string[] { return this.queue.snapshot().humanIds }

  // เรียกหลัง MATCH_RESULT ถูก persist เรียบร้อยแล้ว — เอาออกจากการติดตามไม่ให้ ticker วนไปเรื่อยๆ ตลอดอายุ process
  completeMatch(matchId: string): void {
    const match = this.matches.get(matchId)
    if (!match) return
    for (const seat of match.composition.seats) {
      if (seat.controller === 'HUMAN' && this.playerMatch.get(seat.playerId) === matchId) this.playerMatch.delete(seat.playerId)
    }
    this.matches.delete(matchId)
  }

  submit(playerId: string, action: ArenaMatchAction, now = Date.now()): ArenaMatchSnapshot {
    const match = this.matchForPlayer(playerId)
    if (!match) throw new Error('ARENA_PLAYER_NOT_IN_MATCH')
    if (action.actorId !== playerId) throw new Error('ARENA_ACTION_ACTOR_MISMATCH')
    if (match.connections.controllerFor(playerId) !== 'HUMAN') throw new Error('ARENA_PLAYER_BOT_CONTROLLED')
    return match.engine.submit(action, now).snapshot
  }

  disconnect(playerId: string, now = Date.now()): void {
    const match = this.matchForPlayer(playerId)
    if (match) match.connections.disconnect(playerId, now, match.engine.snapshot())
  }

  reconnect(playerId: string, now = Date.now()): void {
    const match = this.matchForPlayer(playerId)
    if (match) match.connections.reconnect(playerId, now, match.engine.snapshot())
  }

  private startMatch(composition: ArenaMatchComposition, now: number): ArenaRuntimeMatch {
    const matchId = this.matchIdFor(composition.queueId)
    const humans = composition.seats.filter(seat => seat.controller === 'HUMAN').map(seat => seat.playerId)
    const runtimeMatch = {
      engine: new ArenaMatchEngine(matchId, composition, this.random, now),
      connections: new ArenaConnectionManager(humans),
      composition,
    }
    this.matches.set(matchId, runtimeMatch)
    humans.forEach(playerId => this.playerMatch.set(playerId, matchId))
    this.queue = this.newQueue(now)
    return runtimeMatch
  }

  private newQueue(now: number): ArenaMatchmakingQueue {
    return new ArenaMatchmakingQueue(`arena-q-${this.queueSequence++}`, now, this.random)
  }

  private matchIdFor(queueId: string): string {
    return `arena-m-${this.instanceId}-${queueId}`
  }
}
