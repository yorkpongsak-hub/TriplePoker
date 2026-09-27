import { Server, Socket } from 'socket.io'
import { supabase, supabaseAdmin } from '../config/supabase'
import { getUserVipTier } from '../middleware/vipGuard'
import { buildCrewSessionView, createCrewInviteToken, CrewTableError, vipPrivateCrewRegistry, type CrewArrangement, type CrewSession } from '../game/vipPrivateCrew'
import { acceptVipCrewInvite, createVipCrewInvite, loadCrewSession, loadOrCreateVipCrew, persistCrewSession, removeVipCrewMemberStored } from '../game/vipPrivateCrewService'

type Profile = { playerId: string; displayName: string; vip: boolean }
const tracked = new Map<string, { sessionId: string; playerId: string }>()
const arrangementTimers = new Map<string, ReturnType<typeof setTimeout>>()
const revealTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function authenticate(userId: string, token?: string | null): Promise<Profile | null> {
  const { data, error } = await supabase.auth.getUser(token ?? '')
  if (error || data.user?.id !== userId) return null
  const { data: row, error: profileError } = await supabaseAdmin.from('users').select('display_name,vip_status').eq('user_id', userId).single()
  if (profileError || !row) return null
  return { playerId: userId, displayName: row.display_name ?? 'Player', vip: (row.vip_status ?? 'none') !== 'none' }
}

function errorCode(error: unknown): string { return error instanceof CrewTableError ? error.code : error instanceof Error ? error.message : 'SERVER_ERROR' }
function emitError(socket: Socket, error: unknown): void { socket.emit('crew:error', { code: errorCode(error) }) }
function emitSession(io: Server, session: CrewSession): void {
  for (const seat of session.seats) io.to(seat.playerId).emit('crew:session', buildCrewSessionView(session, seat.playerId))
}
async function persist(session: CrewSession): Promise<void> { await persistCrewSession(session).catch(error => console.error('[VIP_CREW] persist failed', error)) }

function resolveArrangement(session: CrewSession, playerId: string, payload: { g1: string[]; g2: string[]; g3: string[] }): CrewArrangement {
  const hand = session.currentMatch?.hands[playerId] ?? []
  const byKey = new Map(hand.map(card => [`${card.rank.toLowerCase()}${card.suit[0]}`, card]))
  const take = (keys: string[]) => keys.map(key => byKey.get(key)).filter((card): card is NonNullable<typeof card> => !!card)
  return { pile1: take(payload.g1), pile2: take(payload.g2), pile3: take(payload.g3) }
}

function startArrangementTimeout(io: Server, session: CrewSession): void {
  const old = arrangementTimers.get(session.sessionId); if (old) clearTimeout(old)
  const delay = Math.max(0, (session.currentMatch?.deadlineAt ?? Date.now()) - Date.now())
  arrangementTimers.set(session.sessionId, setTimeout(() => {
    const current = vipPrivateCrewRegistry.get(session.sessionId)
    if (!current || current.phase !== 'ARRANGING' || !current.currentMatch) return
    for (const seat of current.seats) if (!current.currentMatch.arrangements[seat.playerId]) {
      const hand = current.currentMatch.hands[seat.playerId]
      vipPrivateCrewRegistry.submitArrangement(current.sessionId, seat.playerId, { pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11) })
    }
    emitSession(io, current); void persist(current); startRevealTimeout(io, current)
  }, delay))
}

function startRevealTimeout(io: Server, session: CrewSession): void {
  const old = revealTimers.get(session.sessionId); if (old) clearTimeout(old)
  const revealAt = (session.currentMatch?.result?.completedAt ?? Date.now()) + 6_000
  revealTimers.set(session.sessionId, setTimeout(() => {
    const current = vipPrivateCrewRegistry.get(session.sessionId)
    if (!current || current.phase !== 'REVEALING') return
    vipPrivateCrewRegistry.finishReveal(current.sessionId); emitSession(io, current); void persist(current)
  }, Math.max(0, revealAt - Date.now())))
}

async function ensureLoaded(sessionId: string): Promise<CrewSession | null> {
  const existing = vipPrivateCrewRegistry.get(sessionId); if (existing) return existing
  const stored = await loadCrewSession(sessionId); if (stored) vipPrivateCrewRegistry.restore(stored)
  return stored
}

export function registerVipPrivateCrewSocket(io: Server, socket: Socket): void {
  socket.on('crew:get', async (data: { userId: string; accessToken?: string | null }) => {
    const profile = await authenticate(data.userId, data.accessToken); if (!profile) return emitError(socket, new Error('UNAUTHORIZED'))
    const crew = await loadOrCreateVipCrew(profile.playerId).catch(() => null)
    socket.emit('crew:state', crew)
  })

  socket.on('crew:create_invite', async (data: { userId: string; accessToken?: string | null }) => {
    try {
      const profile = await authenticate(data.userId, data.accessToken); if (!profile?.vip) throw new Error('VIP_REQUIRED')
      const token = createCrewInviteToken(); const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1_000
      await createVipCrewInvite(profile.playerId, token, expiresAt)
      socket.emit('crew:invite', { token, expiresAt, url: `triplepoker://game/vip-crew?invite=${encodeURIComponent(token)}` })
    } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:accept_invite', async (data: { userId: string; accessToken?: string | null; token: string }) => {
    try { const profile = await authenticate(data.userId, data.accessToken); if (!profile) throw new Error('UNAUTHORIZED'); const crew = await acceptVipCrewInvite(data.token, profile.playerId, profile.displayName); socket.emit('crew:invite_accepted', { ownerId: crew.ownerId }) } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:remove_member', async (data: { userId: string; accessToken?: string | null; playerId: string }) => {
    try { const profile = await authenticate(data.userId, data.accessToken); if (!profile?.vip) throw new Error('VIP_REQUIRED'); const crew = await removeVipCrewMemberStored(profile.playerId, data.playerId); socket.emit('crew:state', crew) } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:create_session', async (data: { userId: string; accessToken?: string | null; pin: string; points?: { g1: number; g2: number; g3: number }; comboEnabled?: boolean }) => {
    try {
      const profile = await authenticate(data.userId, data.accessToken); if (!profile?.vip || (await getUserVipTier(profile.playerId)) === 'none') throw new Error('VIP_REQUIRED')
      await loadOrCreateVipCrew(profile.playerId)
      const session = vipPrivateCrewRegistry.createSession({ ownerId: profile.playerId, ownerName: profile.displayName, pin: data.pin, points: data.points, comboEnabled: data.comboEnabled })
      socket.join(session.sessionId); socket.join(profile.playerId); tracked.set(socket.id, { sessionId: session.sessionId, playerId: profile.playerId })
      socket.emit('crew:session_created', { sessionId: session.sessionId }); emitSession(io, session); await persist(session)
    } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:join_session', async (data: { userId: string; accessToken?: string | null; sessionId: string; pin: string }) => {
    try {
      const profile = await authenticate(data.userId, data.accessToken); if (!profile) throw new Error('UNAUTHORIZED')
      const loaded = await ensureLoaded(data.sessionId); if (!loaded) throw new CrewTableError('SESSION_NOT_FOUND')
      const crew = await loadOrCreateVipCrew(loaded.ownerId)
      const session = vipPrivateCrewRegistry.join({ sessionId: data.sessionId, playerId: profile.playerId, displayName: profile.displayName, pin: data.pin, crew })
      socket.join(session.sessionId); socket.join(profile.playerId); tracked.set(socket.id, { sessionId: session.sessionId, playerId: profile.playerId })
      emitSession(io, session); await persist(session)
    } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:resume', async (data: { userId: string; accessToken?: string | null; sessionId: string }) => {
    try {
      const profile = await authenticate(data.userId, data.accessToken); const session = await ensureLoaded(data.sessionId)
      if (!profile || !session?.seats.some(seat => seat.playerId === profile.playerId)) throw new Error('NOT_A_MEMBER')
      vipPrivateCrewRegistry.markConnected(session.sessionId, profile.playerId, true); socket.join(session.sessionId); socket.join(profile.playerId); tracked.set(socket.id, { sessionId: session.sessionId, playerId: profile.playerId })
      if (session.phase === 'ARRANGING') startArrangementTimeout(io, session); if (session.phase === 'REVEALING') startRevealTimeout(io, session)
      emitSession(io, session); await persist(session)
    } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:deal', async (data: { userId: string; accessToken?: string | null; sessionId: string }) => {
    try { const profile = await authenticate(data.userId, data.accessToken); if (!profile) throw new Error('UNAUTHORIZED'); const session = vipPrivateCrewRegistry.deal(data.sessionId, profile.playerId); emitSession(io, session); startArrangementTimeout(io, session); await persist(session) } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:submit_arrangement', async (data: { userId: string; accessToken?: string | null; sessionId: string; arrangement: { g1: string[]; g2: string[]; g3: string[] } }) => {
    try {
      const profile = await authenticate(data.userId, data.accessToken); const session = vipPrivateCrewRegistry.get(data.sessionId); if (!profile || !session) throw new Error('UNAUTHORIZED')
      vipPrivateCrewRegistry.submitArrangement(data.sessionId, profile.playerId, resolveArrangement(session, profile.playerId, data.arrangement)); emitSession(io, session)
      if (session.phase === 'REVEALING') { const timer = arrangementTimers.get(session.sessionId); if (timer) clearTimeout(timer); startRevealTimeout(io, session) }
      await persist(session)
    } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:leave_seat', async (data: { userId: string; accessToken?: string | null; sessionId: string }) => {
    try { const profile = await authenticate(data.userId, data.accessToken); if (!profile) throw new Error('UNAUTHORIZED'); const session = vipPrivateCrewRegistry.leaveSeat(data.sessionId, profile.playerId); tracked.delete(socket.id); socket.leave(data.sessionId); emitSession(io, session); await persist(session) } catch (error) { emitError(socket, error) }
  })

  socket.on('crew:end_session', async (data: { userId: string; accessToken?: string | null; sessionId: string }) => {
    try { const profile = await authenticate(data.userId, data.accessToken); if (!profile) throw new Error('UNAUTHORIZED'); const session = vipPrivateCrewRegistry.endSession(data.sessionId, profile.playerId); emitSession(io, session); await persist(session) } catch (error) { emitError(socket, error) }
  })

  socket.on('disconnect', () => {
    const row = tracked.get(socket.id); if (!row) return; tracked.delete(socket.id)
    if ([...tracked.values()].some(other => other.sessionId === row.sessionId && other.playerId === row.playerId)) return
    try { const session = vipPrivateCrewRegistry.markConnected(row.sessionId, row.playerId, false); emitSession(io, session); void persist(session) } catch {}
  })
}
