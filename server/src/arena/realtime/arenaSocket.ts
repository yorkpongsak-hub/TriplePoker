import { Server, Socket } from 'socket.io'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { awardPerformanceScore } from '../../game/psEngine'
import { recordMatchWin } from '../../game/matchWinsService'
import { resolveArenaBotPolicy } from '../ai/resolveArenaBotPolicy'
import { bestArenaArrangement } from '../arrangement/arenaArrangement'
import { buildArenaBotAction } from '../connection/arenaBotTakeover'
import { tierSEconomyConfig } from '../config/tierSConfig'
import { ArenaCrestLedger } from '../economy/arenaCrestLedger'
import { ArenaMatchAction } from '../match/arenaMatchEngine'
import { ArenaSettlementPersistence } from '../settlement/arenaSettlementPersistence'
import { projectArenaClientSnapshot, resolveArenaTableWinner } from './arenaProjection'
import { ArenaRuntime, ArenaRuntimeMatch } from './arenaRuntime'

interface ArenaIdentity { playerId: string; tokenBalance: number; tierUnlockedMax: string | null; displayName: string; avatar: string }
interface ArenaSocketData { identity: ArenaIdentity }

const runtime = new ArenaRuntime()
const socketsByPlayer = new Map<string, Socket>()
const identities = new Map<string, { displayName: string; avatar: string }>()
const crestLedger = new ArenaCrestLedger()
const settlementPersistence = new ArenaSettlementPersistence()
const finalizedMatchIds = new Set<string>()

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
// arrangement คำนวณจริงจากไพ่ที่ actor นั้นถืออยู่ ณ ขณะนั้น (ไม่ใช่ placeholder อีกต่อไป)
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
      const deal = match.engine.currentDeal()
      const heldIds = [...(match.engine.snapshotDetail().heldCardIds[botActorId] ?? [])]
      const arrangement = deal ? bestArenaArrangement(match.engine.heldCardsFor(botActorId), deal.community) : { pile1: [], pile2: [], pile3: [] }
      const discardCardId = heldIds.at(-1)
      const policy = resolveArenaBotPolicy(match.engine, match.composition, botActorId)
      const action = buildArenaBotAction(snapshot, botActorId, { arrangement, discardCardId }, policy)
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

// ยิง SettlementTransaction ที่เพิ่งเกิดขึ้นจริงเข้า Supabase (ทีละรายการ, idempotent ผ่าน commandId)
// ถ้าแมตช์จบแล้วให้ persist match log ครั้งเดียวแล้วเลิกติดตามใน runtime กัน ticker วนไปเรื่อยๆ ตลอดอายุ process
async function persistSettlement(match: ArenaRuntimeMatch): Promise<void> {
  const transactions = match.engine.drainSettlementTransactions()
  for (const transaction of transactions) {
    try {
      await settlementPersistence.persistTransaction(match.engine.matchId, transaction)
    } catch (error) {
      console.error('[Arena] settlement persist failed:', error)
    }
  }
  const snapshot = match.engine.snapshot()
  if (snapshot.completed && !finalizedMatchIds.has(match.engine.matchId)) {
    finalizedMatchIds.add(match.engine.matchId)
    try {
      await settlementPersistence.persistMatchLog(match.engine.matchId, match.engine.eventLog(), { breakdown: match.engine.settlementBreakdown() })
    } catch (error) {
      console.error('[Arena] match log persist failed:', error)
    }
    await persistMatchEndStats(match)
    runtime.completeMatch(match.engine.matchId)
  }
}

// Win history (match_wins) + Performance Score — เรียกครั้งเดียวต่อแมตช์ คู่กับ persistMatchLog ด้านบน
// resolveArenaTableWinner เทียบ endingCrest ของทุก actor หาผู้ชนะอันดับ 1 จริงของโต๊ะ (human หรือ AI ก็ได้)
async function persistMatchEndStats(match: ArenaRuntimeMatch): Promise<void> {
  const { winnerId, isHumanWinner, isRareBoss } = resolveArenaTableWinner(match.engine, match.composition)
  const breakdown = match.engine.settlementBreakdown()
  const humanNetDeltas = Object.fromEntries(
    breakdown.filter(entry => entry.persisted).map(entry => [entry.playerId, entry.netCrest]),
  )

  if (isHumanWinner) {
    const winnerBreakdown = breakdown.find(entry => entry.playerId === winnerId)
    if (winnerBreakdown) {
      try {
        await recordMatchWin({
          userId: winnerId, tier: 'grandmaster', mode: 'multiplayer',
          tokensWon: winnerBreakdown.netCrest,
          isTripleSweep: winnerBreakdown.sweepJackpot > 0,
          bestHand: null,
          opponents: match.composition.seats
            .filter((_, index) => match.engine.actorIds[index] !== winnerId)
            .map(seat => ({
              name: seat.controller === 'HUMAN' ? (identities.get(seat.playerId)?.displayName ?? 'Grandmaster') : seat.aiId.split('_').join(' '),
              isHuman: seat.controller === 'HUMAN',
            })),
        })
      } catch (error) {
        console.error('[Arena] match win record failed:', error)
      }
    }
  }

  try {
    await awardPerformanceScore({
      tier: 'grandmaster', finalWinnerId: isHumanWinner ? winnerId : null,
      isMonarchMatch: isRareBoss, humanNetDeltas,
    })
  } catch (error) {
    console.error('[Arena] PS award failed:', error)
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

  let tickInFlight = false
  const ticker = setInterval(() => {
    if (tickInFlight) return
    tickInFlight = true
    void (async () => {
      try {
        const now = Date.now()
        announceMatch(runtime.tickQueue(now))
        for (const match of runtime.activeMatches()) {
          try {
            match.connections.observe(now, match.engine.snapshot())
            const before = match.engine.snapshot().version
            match.engine.tick(now)
            driveBots(match, now)
            await persistSettlement(match)
            if (match.engine.snapshot().version !== before) emitProjectedSnapshots(match, now)
          } catch (error) {
            console.error('[Arena] tick failed:', error)
          }
        }
      } finally {
        tickInFlight = false
      }
    })()
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
    identities.set(identity.playerId, { displayName: identity.displayName, avatar: identity.avatar })

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

    socket.on('arena:action', async (action: ArenaMatchAction, acknowledge?: (result: unknown) => void) => {
      try {
        if (action.type === 'BUY_IN_RESERVED') {
          const balance = await crestLedger.getBalance(identity.playerId)
          if (balance.totalCrest < tierSEconomyConfig.requiredReservationCrest) throw new Error('ARENA_INSUFFICIENT_CREST_FOR_BUY_IN')
        }
        runtime.submit(identity.playerId, { ...action, actorId: identity.playerId })
        const match = runtime.matchForPlayer(identity.playerId)!
        const now = Date.now()
        driveBots(match, now)
        await persistSettlement(match)
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
