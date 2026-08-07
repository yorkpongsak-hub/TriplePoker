import { Server, Socket } from 'socket.io'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { buildArenaBotAction } from '../connection/arenaBotTakeover'
import { ArenaMatchAction } from '../match/arenaMatchEngine'
import { projectArenaClientSnapshot } from './arenaProjection'
import { ArenaRuntime, ArenaRuntimeMatch } from './arenaRuntime'

interface ArenaIdentity { playerId: string; tokenBalance: number; tierUnlockedMax: string | null; displayName: string; avatar: string }
interface ArenaSocketData { identity: ArenaIdentity }

const runtime = new ArenaRuntime()
const socketsByPlayer = new Map<string, Socket>()
const identities = new Map<string, { displayName: string }>()

async function authenticate(token: unknown): Promise<ArenaIdentity> {
  if (typeof token !== 'string' || !token) throw new Error('ARENA_AUTH_REQUIRED')
  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  if (authError || !auth.user) throw new Error('ARENA_AUTH_INVALID')
  const { data, error } = await supabaseAdmin.from('users').select('token_balance, tier_unlocked_max, display_name, avatar_url').eq('user_id', auth.user.id).single()
  if (error || !data) throw new Error('ARENA_PROFILE_NOT_FOUND')
  return { playerId: auth.user.id, tokenBalance: data.token_balance ?? 0, tierUnlockedMax: data.tier_unlocked_max ?? null, displayName: data.display_name ?? 'Grandmaster', avatar: data.avatar_url ?? '' }
}

function roomName(matchId: string): string { return `arena:${matchId}` }

// บอท/AI ที่ pending ต้องตอบสนองทันที ไม่ใช่รอ applyDefaults() จนหมดเวลา phase timeout
export function driveBots(match: ArenaRuntimeMatch, now: number): void {
  const actorSeat = new Map(match.composition.seats.map((seat, index) => [match.engine.actorIds[index], seat] as const))
  for (let guard = 0; guard < 20; guard++) {
    const snapshot = match.engine.snapshot()
    if (snapshot.completed) return
    const botActorId = snapshot.pendingActorIds.find(actorId => {
      const seat = actorSeat.get(actorId)
      if (!seat) return false
      return seat.controller === 'AI' || match.connections.controllerFor(actorId) === 'BOT'
    })
    if (!botActorId) return
    try {
      const action = buildArenaBotAction(snapshot, botActorId, { latestArrangementHash: 'latest-valid', discardCardId: 'server-default-discard' }, {})
      match.engine.submit(action, now)
      if (actorSeat.get(botActorId)?.controller === 'HUMAN') match.connections.recordBotAction(botActorId, snapshot, action.actionId)
    } catch (error) {
      console.error('[Arena] bot action failed:', error)
      return
    }
  }
}

function emitProjectedSnapshots(match: ArenaRuntimeMatch, now: number): void {
  for (const seat of match.composition.seats) {
    if (seat.controller !== 'HUMAN') continue
    const socket = socketsByPlayer.get(seat.playerId)
    if (!socket) continue
    socket.emit('arena:snapshot', projectArenaClientSnapshot(match.engine, match.composition, match.connections, seat.playerId, now, identities))
  }
}

export function registerArenaSocket(io: Server): void {
  const arena = io.of('/arena')
  const announceMatch = (composition: ReturnType<ArenaRuntime['tickQueue']>) => {
    if (!composition) return
    for (const seat of composition.seats) {
      if (seat.controller !== 'HUMAN') continue
      const playerSocket = socketsByPlayer.get(seat.playerId)
      const match = runtime.matchForPlayer(seat.playerId)
      if (!playerSocket || !match) continue
      playerSocket.join(roomName(match.engine.matchId))
      playerSocket.emit('arena:matched', { matchId: match.engine.matchId, composition })
      playerSocket.emit('arena:snapshot', projectArenaClientSnapshot(match.engine, match.composition, match.connections, seat.playerId, Date.now(), identities))
    }
  }

  const ticker = setInterval(() => {
    const now = Date.now()
    announceMatch(runtime.tickQueue(now))
    for (const match of runtime.activeMatches()) {
      try {
        match.connections.observe(now, match.engine.snapshot())
        const before = match.engine.snapshot().version
        match.engine.tick(now)
        driveBots(match, now)
        if (match.engine.snapshot().version !== before) emitProjectedSnapshots(match, now)
      } catch (error) {
        console.error('[Arena] tick failed:', error)
      }
    }
  }, 1_000)
  ticker.unref()
  arena.use(async (socket: Socket<any, any, any, ArenaSocketData>, next) => {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.ARENA_ENABLED !== 'true') throw new Error('ARENA_DISABLED')
      socket.data.identity = await authenticate(socket.handshake.auth?.token); next()
    }
    catch (error) { next(error instanceof Error ? error : new Error('ARENA_AUTH_FAILED')) }
  })

  arena.on('connection', (socket: Socket<any, any, any, ArenaSocketData>) => {
    const identity = socket.data.identity
    socketsByPlayer.set(identity.playerId, socket)
    identities.set(identity.playerId, { displayName: identity.displayName })

    const existing = runtime.matchForPlayer(identity.playerId)
    if (existing) {
      runtime.reconnect(identity.playerId)
      socket.join(roomName(existing.engine.matchId))
      socket.emit('arena:matched', { matchId: existing.engine.matchId, composition: existing.composition, resumed: true })
      socket.emit('arena:snapshot', projectArenaClientSnapshot(existing.engine, existing.composition, existing.connections, identity.playerId, Date.now(), identities))
    }

    socket.on('arena:queue:join', () => {
      const result = runtime.join({ playerId: identity.playerId, tokenBalance: identity.tokenBalance, tierUnlockedMax: identity.tierUnlockedMax, joinedAt: Date.now() })
      socket.emit('arena:queue:status', result)
      if (result.ok && result.status === 'MATCHED') announceMatch(result.match)
    })

    socket.on('arena:snapshot:request', () => {
      const match = runtime.matchForPlayer(identity.playerId)
      if (match) socket.emit('arena:snapshot', projectArenaClientSnapshot(match.engine, match.composition, match.connections, identity.playerId, Date.now(), identities))
    })

    socket.on('arena:action', (action: ArenaMatchAction, acknowledge?: (result: unknown) => void) => {
      try {
        runtime.submit(identity.playerId, { ...action, actorId: identity.playerId })
        const match = runtime.matchForPlayer(identity.playerId)!
        const now = Date.now()
        driveBots(match, now)
        emitProjectedSnapshots(match, now)
        acknowledge?.({ ok: true, version: match.engine.snapshot().version })
      } catch (error) {
        acknowledge?.({ ok: false, error: error instanceof Error ? error.message : 'ARENA_ACTION_FAILED' })
      }
    })

    socket.on('disconnect', () => {
      runtime.disconnect(identity.playerId)
      if (socketsByPlayer.get(identity.playerId) === socket) socketsByPlayer.delete(identity.playerId)
      identities.delete(identity.playerId)
    })
  })
}
