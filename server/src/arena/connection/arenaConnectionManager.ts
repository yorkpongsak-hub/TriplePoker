import { ArenaMatchPhase } from '../contracts/arenaContracts'
import { ArenaMatchSnapshot } from '../match/arenaMatchEngine'

export type ArenaController = 'HUMAN' | 'BOT'
export type ArenaConnectionView = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED_GRACE' | 'BOT_ACTIVE' | 'BOT_UNTIL_NEXT_GAME' | 'BOT_FOR_MATCH'

interface BotCommit {
  gameNumber: number
  phase: ArenaMatchPhase
  actionId: string
}

interface PlayerConnectionState {
  playerId: string
  socketConnected: boolean
  disconnectedAt: number | null
  disconnectedGame: number
  disconnectedPhase: ArenaMatchPhase | null
  controller: ArenaController
  botActivatedAt: number | null
  botCommit: BotCommit | null
  resumePolicy: 'NONE' | 'NEXT_PHASE' | 'NEXT_GAME' | 'MATCH_END'
  resumeFromGame: number
  resumeFromPhase: ArenaMatchPhase | null
}

export class ArenaConnectionManager {
  private states = new Map<string, PlayerConnectionState>()

  constructor(humanPlayerIds: readonly string[]) {
    if (!humanPlayerIds.length || new Set(humanPlayerIds).size !== humanPlayerIds.length) throw new Error('ARENA_CONNECTION_PLAYERS_INVALID')
    humanPlayerIds.forEach(playerId => this.states.set(playerId, {
      playerId, socketConnected: true, disconnectedAt: null, disconnectedGame: 0,
      disconnectedPhase: null, controller: 'HUMAN', botActivatedAt: null,
      botCommit: null, resumePolicy: 'NONE', resumeFromGame: 0, resumeFromPhase: null,
    }))
  }

  disconnect(playerId: string, now: number, snapshot: ArenaMatchSnapshot): void {
    const state = this.get(playerId)
    if (!state.socketConnected) return
    state.socketConnected = false
    state.disconnectedAt = now
    state.disconnectedGame = snapshot.gameNumber
    state.disconnectedPhase = snapshot.phase
    state.controller = 'HUMAN'
    state.botActivatedAt = null
    state.botCommit = null
    state.resumePolicy = 'NONE'
  }

  reconnect(playerId: string, now: number, snapshot: ArenaMatchSnapshot): ArenaConnectionView {
    const state = this.get(playerId)
    state.socketConnected = true
    if (state.disconnectedAt === null) return this.view(playerId, now)
    const elapsed = now - state.disconnectedAt

    if (state.resumePolicy === 'MATCH_END' || snapshot.gameNumber > state.disconnectedGame) {
      state.controller = 'BOT'
      state.resumePolicy = 'MATCH_END'
      return 'BOT_FOR_MATCH'
    }
    if (elapsed >= 30_000) {
      state.controller = 'BOT'
      state.resumePolicy = 'NEXT_GAME'
      state.resumeFromGame = snapshot.gameNumber
      return 'BOT_UNTIL_NEXT_GAME'
    }
    const committedHere = state.botCommit?.gameNumber === snapshot.gameNumber && state.botCommit.phase === snapshot.phase
    if (committedHere) {
      state.controller = 'BOT'
      state.resumePolicy = 'NEXT_PHASE'
      state.resumeFromGame = snapshot.gameNumber
      state.resumeFromPhase = snapshot.phase
      return 'BOT_ACTIVE'
    }
    this.restoreHuman(state)
    return 'CONNECTED'
  }

  observe(now: number, snapshot: ArenaMatchSnapshot): void {
    for (const state of this.states.values()) {
      if (!state.socketConnected && state.disconnectedAt !== null) {
        if (snapshot.gameNumber > state.disconnectedGame) {
          state.controller = 'BOT'
          state.resumePolicy = 'MATCH_END'
        } else if (now - state.disconnectedAt >= 8_000 && state.controller !== 'BOT') {
          state.controller = 'BOT'
          state.botActivatedAt = now
        }
      }

      if (!state.socketConnected) continue
      if (state.resumePolicy === 'NEXT_PHASE') {
        const phaseAdvanced = snapshot.gameNumber !== state.resumeFromGame || snapshot.phase !== state.resumeFromPhase
        if (phaseAdvanced) this.restoreHuman(state)
      } else if (state.resumePolicy === 'NEXT_GAME' && snapshot.gameNumber > state.resumeFromGame) {
        this.restoreHuman(state)
      } else if (state.resumePolicy === 'MATCH_END' && snapshot.completed) {
        this.restoreHuman(state)
      }
    }
  }

  recordBotAction(playerId: string, snapshot: ArenaMatchSnapshot, actionId: string): void {
    const state = this.get(playerId)
    if (state.controller !== 'BOT') throw new Error('ARENA_BOT_NOT_IN_CONTROL')
    if (state.botCommit && state.botCommit.gameNumber === snapshot.gameNumber && state.botCommit.phase === snapshot.phase) {
      if (state.botCommit.actionId !== actionId) throw new Error('ARENA_BOT_ACTION_ALREADY_COMMITTED')
      return
    }
    state.botCommit = { gameNumber: snapshot.gameNumber, phase: snapshot.phase, actionId }
  }

  controllerFor(playerId: string): ArenaController { return this.get(playerId).controller }

  botControlledPendingActors(snapshot: ArenaMatchSnapshot): string[] {
    return snapshot.pendingActorIds.filter(playerId => this.states.get(playerId)?.controller === 'BOT')
  }

  view(playerId: string, now: number): ArenaConnectionView {
    const state = this.get(playerId)
    if (state.resumePolicy === 'MATCH_END') return 'BOT_FOR_MATCH'
    if (state.resumePolicy === 'NEXT_GAME') return 'BOT_UNTIL_NEXT_GAME'
    if (state.controller === 'BOT') return 'BOT_ACTIVE'
    if (state.socketConnected || state.disconnectedAt === null) return 'CONNECTED'
    return now - state.disconnectedAt <= 3_000 ? 'RECONNECTING' : 'DISCONNECTED_GRACE'
  }

  private restoreHuman(state: PlayerConnectionState): void {
    state.controller = 'HUMAN'
    state.disconnectedAt = null
    state.disconnectedPhase = null
    state.botActivatedAt = null
    state.botCommit = null
    state.resumePolicy = 'NONE'
    state.resumeFromGame = 0
    state.resumeFromPhase = null
  }

  private get(playerId: string): PlayerConnectionState {
    const state = this.states.get(playerId)
    if (!state) throw new Error('ARENA_CONNECTION_PLAYER_NOT_FOUND')
    return state
  }
}
