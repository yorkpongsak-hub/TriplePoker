import { Server, Socket } from 'socket.io'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { ArenaMatchAction } from '../match/arenaMatchEngine'
import { ArenaRuntime } from './arenaRuntime'

interface ArenaIdentity { playerId: string; tokenBalance: number; tierUnlockedMax: string | null; displayName: string; avatar: string }
interface ArenaSocketData { identity: ArenaIdentity }

const runtime = new ArenaRuntime()

async function authenticate(token: unknown): Promise<ArenaIdentity> {
  if (typeof token !== 'string' || !token) throw new Error('ARENA_AUTH_REQUIRED')
  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  if (authError || !auth.user) throw new Error('ARENA_AUTH_INVALID')
  const { data, error } = await supabaseAdmin.from('users').select('token_balance, tier_unlocked_max, display_name, avatar_url').eq('user_id', auth.user.id).single()
  if (error || !data) throw new Error('ARENA_PROFILE_NOT_FOUND')
  return { playerId: auth.user.id, tokenBalance: data.token_balance ?? 0, tierUnlockedMax: data.tier_unlocked_max ?? null, displayName: data.display_name ?? 'Grandmaster', avatar: data.avatar_url ?? '' }
}

function roomName(matchId: string): string { return `arena:${matchId}` }

export function registerArenaSocket(io: Server): void {
  const arena = io.of('/arena')
  const announceMatch = (composition: ReturnType<ArenaRuntime['tickQueue']>) => {
    if (!composition) return
    for (const seat of composition.seats) {
      if (seat.controller !== 'HUMAN') continue
      const playerSocket = [...arena.sockets.values()].find(candidate => candidate.data.identity?.playerId === seat.playerId)
      const match = runtime.matchForPlayer(seat.playerId)
      if (!playerSocket || !match) continue
      playerSocket.join(roomName(match.engine.matchId))
      playerSocket.emit('arena:matched', { matchId: match.engine.matchId, composition })
      playerSocket.emit('arena:snapshot', match.engine.snapshot())
    }
  }

  const ticker = setInterval(() => {
    const now = Date.now()
    announceMatch(runtime.tickQueue(now))
    for (const match of runtime.activeMatches()) {
      try {
        match.connections.observe(now, match.engine.snapshot())
        const before = match.engine.snapshot().version
        const snapshot = match.engine.tick(now)
        if (snapshot.version !== before) arena.to(roomName(match.engine.matchId)).emit('arena:snapshot', snapshot)
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
    const existing = runtime.matchForPlayer(identity.playerId)
    if (existing) {
      runtime.reconnect(identity.playerId)
      socket.join(roomName(existing.engine.matchId))
      socket.emit('arena:matched', { matchId: existing.engine.matchId, composition: existing.composition, resumed: true })
      socket.emit('arena:snapshot', existing.engine.snapshot())
    }

    socket.on('arena:queue:join', () => {
      const result = runtime.join({ playerId: identity.playerId, tokenBalance: identity.tokenBalance, tierUnlockedMax: identity.tierUnlockedMax, joinedAt: Date.now() })
      socket.emit('arena:queue:status', result)
      if (result.ok && result.status === 'MATCHED') announceMatch(result.match)
    })

    socket.on('arena:snapshot:request', () => {
      const match = runtime.matchForPlayer(identity.playerId)
      if (match) socket.emit('arena:snapshot', match.engine.snapshot())
    })

    socket.on('arena:action', (action: ArenaMatchAction, acknowledge?: (result: unknown) => void) => {
      try {
        const snapshot = runtime.submit(identity.playerId, { ...action, actorId: identity.playerId })
        const match = runtime.matchForPlayer(identity.playerId)!
        arena.to(roomName(match.engine.matchId)).emit('arena:snapshot', snapshot)
        acknowledge?.({ ok: true, version: snapshot.version })
      } catch (error) {
        acknowledge?.({ ok: false, error: error instanceof Error ? error.message : 'ARENA_ACTION_FAILED' })
      }
    })

    socket.on('disconnect', () => runtime.disconnect(identity.playerId))
  })
}
