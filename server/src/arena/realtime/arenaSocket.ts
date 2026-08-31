import { Server, Socket } from 'socket.io'
import { GAME_RESUME_EVENT, GAME_RESUME_RESULT_EVENT, isGameResumeRequest } from '../../sockets/gameResumeProtocol'
import { supabase, supabaseAdmin } from '../../config/supabase'
import { awardPerformanceScore } from '../../game/psEngine'
import { recordMatchWin } from '../../game/matchWinsService'
import { resolveArenaBotPolicy } from '../ai/resolveArenaBotPolicy'
import { bestArenaArrangement } from '../arrangement/arenaArrangement'
import { arenaCardKey } from '../cards/arenaDeck'
import { buildArenaBotAction, takeoverArrangement } from '../connection/arenaBotTakeover'
import { arenaPhaseTimeoutMs, tierSConfig, tierSEconomyConfig } from '../config/tierSConfig'
import { ArenaCrestLedger } from '../economy/arenaCrestLedger'
import { ArenaMatchAction } from '../match/arenaMatchEngine'
import { ArenaSettlementPersistence } from '../settlement/arenaSettlementPersistence'
import { projectArenaClientSnapshot, resolveArenaTableWinner } from './arenaProjection'
import { ArenaRuntime, ArenaRuntimeMatch } from './arenaRuntime'

interface ArenaIdentity { playerId: string; tokenBalance: number; tierUnlockedMax: string | null; displayName: string; avatar: string; isVip: boolean }
interface ArenaSocketData { identity: ArenaIdentity }

const runtime = new ArenaRuntime()
const socketsByPlayer = new Map<string, Socket>()
const identities = new Map<string, { displayName: string; avatar: string; isVip: boolean }>()
const crestLedger = new ArenaCrestLedger()
const settlementPersistence = new ArenaSettlementPersistence()
const finalizedMatchIds = new Set<string>()

async function authenticate(token: unknown): Promise<ArenaIdentity> {
  if (typeof token !== 'string' || !token) throw new Error('ARENA_AUTH_REQUIRED')
  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  if (authError || !auth.user) throw new Error('ARENA_AUTH_INVALID')
  const { data, error } = await supabaseAdmin.from('users').select('token_balance, tier_unlocked_max, display_name, avatar_url, vip_status').eq('user_id', auth.user.id).single()
  if (error || !data) throw new Error('ARENA_PROFILE_NOT_FOUND')
  return {
    playerId: auth.user.id, tokenBalance: data.token_balance ?? 0, tierUnlockedMax: data.tier_unlocked_max ?? null,
    displayName: data.display_name ?? 'Grandmaster', avatar: data.avatar_url ?? '',
    isVip: (data.vip_status ?? 'none') !== 'none',
  }
}

function roomName(matchId: string): string { return `arena:${matchId}` }

// สุ่มค่าคงที่ต่อ "ตา" นั้นๆ ล้วนๆ (deterministic ต่อ input เดิม ไม่ใช่ Math.random() ที่เปลี่ยนทุก tick) ให้
// AI ระหว่าง GF_PILE_2/3 "คิดนาน" ใกล้เคียง Mastermind's grand_finale_turn (สุ่ม 7-10s จากงบ ~10s) — สเกลตามงบ
// 15s ของ Arena ไม่ต้องใช้ crypto hash จริง แค่ให้กระจายพอดูเป็นธรรมชาติและเสถียรตลอดตานั้น (คำนวณซ้ำทุก tick
// จาก input เดิมต้องได้ค่าเดิมเสมอ ไม่งั้นเงื่อนไข now - turnStartedAt < thinkMs จะแกว่ง)
function stableRangeMs(seed: string, min: number, max: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return min + (hash % (max - min))
}

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
    if (['GF_PILE_2', 'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2'].includes(snapshot.phase)) {
      const duration = arenaPhaseTimeoutMs[snapshot.phase as 'GF_PILE_2' | 'GF_PILE_3_ROUND_1' | 'GF_PILE_3_ROUND_2']
      const turnStartedAt = (snapshot.deadlineAt ?? now + duration) - duration
      // Expose each AI/Boss as CURRENT before it acts, like Mastermind's grand_finale_turn + thinking delay
      // (มติลุงเยาะ: เดิม fix 1500ms สั้นเกิน ดูเหมือนบอทตอบทันที ไม่มีเวลาให้ผู้เล่นเห็น countdown เลย —
      // ขยับให้ใกล้เคียงสัดส่วนของ Mastermind (สุ่ม 7-10s จากงบ ~10s) สเกลตามงบ 15s ของ Arena)
      const thinkMs = stableRangeMs(`${match.engine.matchId}:${snapshot.phase}:${botActorId}:${turnStartedAt}`, 8_000, 12_000)
      if (now - turnStartedAt < thinkMs) return
    }
    try {
      const deal = match.engine.currentDeal()
      const detail = match.engine.snapshotDetail()
      const seat = actorSeat.get(botActorId)!
      const heldCards = match.engine.heldCardsFor(botActorId)
      const arrangement = deal
        ? seat.controller === 'HUMAN'
          ? takeoverArrangement(heldCards.map(arenaCardKey), detail.lastArrangements[botActorId])
          : bestArenaArrangement(heldCards, deal.community)
        : { pile1: [], pile2: [], pile3: [] }
      // DISCARD is positional in Tier S: only the final card of the latest
      // server-accepted pile 3 may be discarded. This also picks JOKER after
      // ANTE_X2 has moved it into the immutable discard slot.
      const savedPile3 = detail.lastArrangements[botActorId]?.pile3
      const discardCardId = savedPile3?.[savedPile3.length - 1]
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

// Central Economy Ledger Phase 7 Round 6 (มติลุงเยาะ 2026-08-13): ไม่ persist ทีละ SettlementTransaction
// เข้า arena_apply_crest_batch (RPC เดิม) ต่อ action อีกต่อไป — ธุรกรรมเดี่ยวไม่ balance ในตัวเอง เงินไป
// ค้าง pot ที่ Ledger ใหม่ไม่รู้จัก ยังคง drain ทิ้งกัน queue โตไม่จำกัด แค่ไม่ยิงเข้า RPC เดิมแล้ว — settle
// จริงครั้งเดียวตอนจบแมตช์ผ่าน persistMatchSettlementViaLedger() แทน (ดูเหตุผลเต็มที่ฟังก์ชันนั้น)
async function persistSettlement(match: ArenaRuntimeMatch): Promise<void> {
  match.engine.drainSettlementTransactions()
  const snapshot = match.engine.snapshot()
  if (snapshot.completed && !finalizedMatchIds.has(match.engine.matchId)) {
    finalizedMatchIds.add(match.engine.matchId)
    try {
      await settlementPersistence.persistMatchLog(match.engine.matchId, match.engine.eventLog(), { breakdown: match.engine.settlementBreakdown() })
    } catch (error) {
      console.error('[Arena] match log persist failed:', error)
    }
    try {
      const aiIdByActorId: Record<string, string> = {}
      match.composition.seats.forEach((seat, i) => {
        if (seat.controller !== 'HUMAN') aiIdByActorId[match.engine.actorIds[i]] = seat.aiId
      })
      await settlementPersistence.persistMatchSettlementViaLedger(
        match.engine.matchId, match.engine.settlementBreakdown(), match.engine.settlementTotals().crownSinkCrest, aiIdByActorId,
      )
    } catch (error) {
      console.error('[Arena] ledger settlement failed:', error)
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
      legendaryBossDefeated: isHumanWinner && isRareBoss, humanNetDeltas,
    })
  } catch (error) {
    console.error('[Arena] PS award failed:', error)
  }
}

export function registerArenaSocket(io: Server): void {
  const arena = io.of('/arena')
  const emitQueueRoster = () => {
    const seatOrder = [1, 2, 4] as const
    const roster = runtime.waitingHumanIds().map((playerId, index) => ({
      seat: seatOrder[index], playerId,
      displayName: identities.get(playerId)?.displayName ?? 'Grandmaster',
      avatar: identities.get(playerId)?.avatar ?? '',
    }))
    for (const playerId of runtime.waitingHumanIds()) socketsByPlayer.get(playerId)?.emit('arena:queue:roster', roster)
  }
  const announceMatch = async (composition: ReturnType<ArenaRuntime['tickQueue']>) => {
    if (!composition) return
    const humanSeats = composition.seats.filter(seat => seat.controller === 'HUMAN')
    const match = humanSeats.length ? runtime.matchForPlayer(humanSeats[0].playerId) : null
    if (!match) return

    // Reservation is server-authoritative. Previously the client had to echo
    // BUY_IN_RESERVED after arena:matched; losing that event during navigation
    // left the match stuck until ARENA_BUY_IN_RESERVATION_TIMEOUT.
    try {
      const balances = await Promise.all(humanSeats.map(async seat => ({
        seat,
        balance: await crestLedger.getBalance(seat.playerId),
      })))
      const insufficient = balances.find(entry => entry.balance.totalCrest < tierSEconomyConfig.requiredReservationCrest)
      if (insufficient) {
        for (const { seat } of balances) {
          socketsByPlayer.get(seat.playerId)?.emit('arena:match:cancelled', {
            reason: 'BUY_IN_BALANCE_CHANGED',
            playerId: insufficient.seat.playerId,
          })
        }
        runtime.completeMatch(match.engine.matchId)
        return
      }
      const now = Date.now()
      for (const { seat } of balances) {
        match.engine.submit({
          type: 'BUY_IN_RESERVED', actorId: seat.playerId,
          actionId: `server:reserve:${match.engine.matchId}:${seat.playerId}`,
        }, now)
      }
    } catch (error) {
      console.error('[Arena] server buy-in reservation failed:', error)
      for (const seat of humanSeats) socketsByPlayer.get(seat.playerId)?.emit('arena:match:cancelled', { reason: 'BUY_IN_RESERVATION_FAILED' })
      runtime.completeMatch(match.engine.matchId)
      return
    }

    for (const seat of composition.seats) {
      if (seat.controller !== 'HUMAN') continue
      const playerSocket = socketsByPlayer.get(seat.playerId)
      if (!playerSocket) continue
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
        await announceMatch(runtime.tickQueue(now))
        for (const match of runtime.activeMatches()) {
          try {
            match.connections.observe(now, match.engine.snapshot())
            const before = match.engine.snapshot().version
            match.engine.tick(now)
            driveBots(match, now)
            await persistSettlement(match)
            if (match.engine.snapshot().version !== before) emitProjectedSnapshots(match, now)
          } catch (error) {
            if (error instanceof Error && error.message === 'ARENA_BUY_IN_RESERVATION_TIMEOUT') {
              for (const seat of match.composition.seats) {
                if (seat.controller === 'HUMAN') socketsByPlayer.get(seat.playerId)?.emit('arena:match:cancelled', { reason: error.message })
              }
              runtime.completeMatch(match.engine.matchId)
              continue
            }
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
    socket.on(GAME_RESUME_EVENT, (request: unknown) => {
      if (!isGameResumeRequest(request) || request.matchType !== 'ARENA') return
      if (request.userId !== identity.playerId) {
        socket.emit(GAME_RESUME_RESULT_EVENT, { ok: false, status: 'UNAUTHORIZED', roomId: request.roomId, matchType: request.matchType }); return
      }
      const match = runtime.matchForPlayer(identity.playerId)
      if (!match || match.engine.matchId !== request.roomId) {
        socket.emit(GAME_RESUME_RESULT_EVENT, { ok: false, status: 'MATCH_NOT_FOUND', roomId: request.roomId, matchType: request.matchType }); return
      }
      runtime.reconnect(identity.playerId)
      socket.join(roomName(match.engine.matchId))
      const snapshot = projectArenaClientSnapshot(match.engine, match.composition, match.connections, identity.playerId, Date.now(), identities)
      socket.emit('arena:snapshot', snapshot)
      socket.emit(GAME_RESUME_RESULT_EVENT, { ok: true, status: 'RESUMED', roomId: request.roomId, matchType: request.matchType, serverVersion: match.engine.snapshot().version })
    })
    socketsByPlayer.set(identity.playerId, socket)
    identities.set(identity.playerId, { displayName: identity.displayName, avatar: identity.avatar, isVip: identity.isVip })

    const existing = runtime.matchForPlayer(identity.playerId)
    if (existing) {
      runtime.reconnect(identity.playerId)
      socket.join(roomName(existing.engine.matchId))
      socket.emit('arena:matched', { matchId: existing.engine.matchId, composition: existing.composition, resumed: true })
      socket.emit('arena:snapshot', projectArenaClientSnapshot(existing.engine, existing.composition, existing.connections, identity.playerId, Date.now(), identities))
    }

    socket.on('arena:queue:join', async () => {
      try {
        // The client uses the same connect path for first entry and reconnect.
        // Make this idempotent so a resumed MATCHED state is not overwritten
        // by an ALREADY_JOINED error.
        const activeMatch = runtime.matchForPlayer(identity.playerId)
        if (activeMatch) {
          socket.emit('arena:queue:status', { ok: true, status: 'MATCHED', resumed: true })
          socket.emit('arena:snapshot', projectArenaClientSnapshot(activeMatch.engine, activeMatch.composition, activeMatch.connections, identity.playerId, Date.now(), identities))
          return
        }
        // Check the authoritative Crown/Crest ledger before the player enters
        // matchmaking. BUY_IN_RESERVED repeats this check to close the race
        // where the balance changes while the player is waiting in queue.
        const balance = await crestLedger.getBalance(identity.playerId)
        if (balance.totalCrest < tierSEconomyConfig.requiredReservationCrest) {
          socket.emit('arena:queue:status', {
            ok: false, status: 'INSUFFICIENT_CROWN',
            requiredCrest: tierSEconomyConfig.requiredReservationCrest,
            requiredCrown: Math.ceil(tierSEconomyConfig.requiredReservationCrest / tierSConfig.crestPerCrown),
            balanceCrest: balance.totalCrest,
          })
          return
        }
        const result = runtime.join({ playerId: identity.playerId, tokenBalance: identity.tokenBalance, tierUnlockedMax: identity.tierUnlockedMax, joinedAt: Date.now() })
        socket.emit('arena:queue:status', result)
        if (result.ok && result.status === 'WAITING') emitQueueRoster()
      } catch (error) {
        socket.emit('arena:queue:status', { ok: false, status: 'CROWN_BALANCE_CHECK_FAILED' })
      }
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
      // An old socket may close after its replacement is already connected.
      // It must not disconnect the newly active seat.
      if (socketsByPlayer.get(identity.playerId) !== socket) return
      runtime.disconnect(identity.playerId)
      socketsByPlayer.delete(identity.playerId)
      identities.delete(identity.playerId)
    })
  })
}
