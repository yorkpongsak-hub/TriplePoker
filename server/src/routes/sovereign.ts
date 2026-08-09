import { randomUUID } from 'crypto'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { sovereignConfig, sovereignEconomyConfig } from '../arena/config/sovereignConfig'
import { SovereignSpectatorCapacity } from '../arena/sovereign/sovereignPublicFeed'

const spectatorCapacityByMatch = new Map<string, SovereignSpectatorCapacity>()
const spectatorPresenceByMatch = new Map<string, Map<string, number>>()

function admitSpectator(matchId: string, userId: string, nowMs: number): boolean {
  const capacity = spectatorCapacityByMatch.get(matchId) ?? new SovereignSpectatorCapacity()
  const presence = spectatorPresenceByMatch.get(matchId) ?? new Map<string, number>()
  for (const [viewerId, lastSeen] of presence) {
    if (nowMs - lastSeen > sovereignConfig.spectatorReconnectGraceMs) { capacity.leave(viewerId); presence.delete(viewerId) }
  }
  const result = capacity.join(userId, nowMs)
  if (result.admitted) presence.set(userId, nowMs)
  spectatorCapacityByMatch.set(matchId, capacity); spectatorPresenceByMatch.set(matchId, presence)
  return result.admitted
}

async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (process.env.NODE_ENV === 'production' && process.env.SOVEREIGN_ENABLED !== 'true') {
    reply.status(503).send({ error: 'SOVEREIGN_DISABLED' }); return null
  }
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return null }
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) { reply.status(401).send({ error: 'INVALID_TOKEN' }); return null }
  return data.user.id
}

function fail(reply: FastifyReply, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  return reply.status(500).send({ error: message })
}

export default async function sovereignRoutes(fastify: FastifyInstance) {
  fastify.get('/sovereign/status', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    try {
      const now = new Date().toISOString()
      const { data: cycle, error: cycleError } = await supabaseAdmin.from('sovereign_cycles')
        .select('*').in('status', ['PUBLISHED', 'ACTIVE']).order('year_month', { ascending: false }).limit(1).maybeSingle()
      if (cycleError) throw cycleError

      const [{ data: rename }, { data: boss }, { data: membership }] = await Promise.all([
        supabaseAdmin.from('last_boss_mandatory_renames').select('id,former_name,required_at,status').eq('user_id', userId).eq('status', 'REQUIRED').maybeSingle(),
        supabaseAdmin.from('last_boss_reigns').select('id,reign_number,throne_name,started_at,aura_key,status').eq('status', 'ACTIVE').maybeSingle(),
        cycle ? supabaseAdmin.from('sovereign_pool_memberships').select('pool,eligibility_started_at,eligibility_expires_at').eq('cycle_id', cycle.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
      ])

      let matches: any[] = [], seat: any = null, standby: any = null, ranking: any = null
      if (cycle) {
        const [matchResult, seatResult, rankResult] = await Promise.all([
          supabaseAdmin.from('sovereign_matches').select('*').eq('cycle_id', cycle.id).order('scheduled_start_at'),
          supabaseAdmin.from('sovereign_seats').select('*').eq('cycle_id', cycle.id).or(`selected_user_id.eq.${userId},active_user_id.eq.${userId}`).maybeSingle(),
          supabaseAdmin.from('sovereign_ranking_snapshots').select('pool,rank,eligible_match_count,best_ten_score,all_eligible_match_score').eq('cycle_id', cycle.id).eq('user_id', userId).maybeSingle(),
        ])
        if (matchResult.error) throw matchResult.error
        matches = matchResult.data ?? []; seat = seatResult.data; ranking = rankResult.data
        if (matches.length) {
          const ids = matches.map(item => item.id)
          const standbyResult = await supabaseAdmin.from('sovereign_standby_entries').select('match_id,queue_sequence,status,grace_expires_at').eq('user_id', userId).in('match_id', ids).in('status', ['QUEUED','GRACE','CLAIMED','PROMOTED']).maybeSingle()
          standby = standbyResult.data
        }
      }

      return reply.send({
        serverNow: now, featureEnabled: sovereignConfig.featureEnabled || process.env.SOVEREIGN_ENABLED === 'true',
        cycle, matches, membership, ranking, seat, standby, mandatoryRename: rename,
        lastBoss: boss ? { ...boss, avatarKind: 'DARK_SILHOUETTE' } : null,
        config: { spectatorDelaySeconds: 30, spectatorCapacity: 100, requiredCrown: 30 },
      })
    } catch (error) { return fail(reply, error, 'SOVEREIGN_STATUS_FAILED') }
  })

  fastify.get<{ Querystring: { matchId?: string; after?: string } }>('/sovereign/public-feed', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const matchId = request.query.matchId
    const after = Number(request.query.after ?? 0)
    if (!matchId || !Number.isSafeInteger(after) || after < 0) return reply.status(400).send({ error: 'INVALID_FEED_CURSOR' })
    if (!admitSpectator(matchId, userId, Date.now())) return reply.status(429).send({ error: 'SPECTATOR_CAPACITY_REACHED', capacity: sovereignConfig.maxSpectatorsPerMatch })
    const { data, error } = await supabaseAdmin.from('sovereign_public_events')
      .select('id,match_id,sequence,event_type,public_payload_json,occurred_at,visible_at,schema_version')
      .eq('match_id', matchId).gt('sequence', after).lte('visible_at', new Date().toISOString()).order('sequence').limit(250)
    if (error) return fail(reply, error, 'PUBLIC_FEED_FAILED')
    return reply.send({ events: data ?? [], afterSequence: after })
  })

  fastify.get('/sovereign/archive', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const [{ data: cycles, error: cycleError }, { data: graveyard, error: reignError }] = await Promise.all([
      supabaseAdmin.from('sovereign_cycles').select('id,year_month,status,published_at,completed_at').in('status', ['COMPLETED','CANCELLED']).order('year_month', { ascending: false }).limit(24),
      supabaseAdmin.from('last_boss_reigns').select('id,reign_number,throne_name,status,started_at,ended_at,conqueror_name_at_victory,conqueror_new_name,aura_key').order('reign_number', { ascending: false }).limit(100),
    ])
    if (cycleError || reignError) return fail(reply, cycleError ?? reignError, 'SOVEREIGN_ARCHIVE_FAILED')
    return reply.send({ cycles: cycles ?? [], graveyard: graveyard ?? [] })
  })

  fastify.post<{ Body: { seatId?: string; decision?: 'CONFIRM' | 'DECLINE' } }>('/sovereign/confirmation', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const { seatId, decision } = request.body ?? {}
    if (!seatId || !decision) return reply.status(400).send({ error: 'INVALID_CONFIRMATION' })
    const { data: pendingSeat } = await supabaseAdmin.from('sovereign_seats').select('cycle_id').eq('id', seatId).eq('selected_user_id', userId).eq('confirmation_status', 'PENDING').maybeSingle()
    if (!pendingSeat) return reply.status(409).send({ error: 'CONFIRMATION_NOT_AVAILABLE' })
    const { data: cycle } = await supabaseAdmin.from('sovereign_cycles').select('confirmation_deadline_at').eq('id', pendingSeat.cycle_id).single()
    if (!cycle || Date.now() > Date.parse(cycle.confirmation_deadline_at)) return reply.status(409).send({ error: 'CONFIRMATION_CLOSED' })
    const status = decision === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED'
    const update: Record<string, unknown> = { confirmation_status: status, updated_at: new Date().toISOString() }
    if (decision === 'CONFIRM') update.confirmed_at = new Date().toISOString()
    const { data, error } = await supabaseAdmin.from('sovereign_seats').update(update).eq('id', seatId).eq('selected_user_id', userId).eq('confirmation_status', 'PENDING').select().maybeSingle()
    if (error) return fail(reply, error, 'CONFIRMATION_FAILED')
    if (!data) return reply.status(409).send({ error: 'CONFIRMATION_NOT_AVAILABLE' })
    return reply.send({ seat: data })
  })

  fastify.post<{ Body: { seatId?: string; matchId?: string; idempotencyKey?: string } }>('/sovereign/check-in', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const { seatId, matchId, idempotencyKey } = request.body ?? {}
    if (!seatId || !matchId) return reply.status(400).send({ error: 'INVALID_CHECK_IN' })
    const key = idempotencyKey || randomUUID()
    const { data: match } = await supabaseAdmin.from('sovereign_matches').select('scheduled_check_in_open_at,scheduled_check_in_close_at').eq('id', matchId).single()
    const now = Date.now()
    if (!match || now < Date.parse(match.scheduled_check_in_open_at) || now >= Date.parse(match.scheduled_check_in_close_at)) return reply.status(409).send({ error: 'CHECK_IN_CLOSED' })
    const { data: reservation, error: reserveError } = await supabaseAdmin.rpc('sovereign_reserve_crown', {
      p_match_id: matchId, p_user_id: userId, p_reason: 'CHECK_IN', p_total_crest: sovereignEconomyConfig.requiredReservationCrest, p_idempotency_key: key,
    })
    if (reserveError) return reply.status(409).send({ error: reserveError.message })
    const { data: seat, error: seatError } = await supabaseAdmin.from('sovereign_seats').update({ check_in_status: 'CHECKED_IN', checked_in_at: new Date().toISOString(), active_user_id: userId }).eq('id', seatId).eq('match_id', matchId).eq('selected_user_id', userId).eq('confirmation_status', 'CONFIRMED').select().maybeSingle()
    if (seatError || !seat) {
      const reserved = Array.isArray(reservation) ? reservation[0] : reservation
      if (reserved?.id) await supabaseAdmin.rpc('sovereign_release_crown_reservation', { p_reservation_id: reserved.id, p_idempotency_key: randomUUID() })
      return fail(reply, seatError, 'CHECK_IN_SEAT_FAILED')
    }
    return reply.send({ seat, reservation: Array.isArray(reservation) ? reservation[0] : reservation })
  })

  fastify.post<{ Body: { matchId?: string; idempotencyKey?: string } }>('/sovereign/standby', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const { matchId, idempotencyKey } = request.body ?? {}
    if (!matchId || !idempotencyKey) return reply.status(400).send({ error: 'INVALID_STANDBY_REQUEST' })
    const { data: match } = await supabaseAdmin.from('sovereign_matches').select('cycle_id,scheduled_standby_open_at,scheduled_check_in_close_at').eq('id', matchId).single()
    const now = Date.now()
    if (!match || now < Date.parse(match.scheduled_standby_open_at) || now >= Date.parse(match.scheduled_check_in_close_at)) return reply.status(409).send({ error: 'STANDBY_CLOSED' })
    const { data: membership } = await supabaseAdmin.from('sovereign_pool_memberships').select('id').eq('cycle_id', match.cycle_id).eq('user_id', userId).maybeSingle()
    if (!membership) return reply.status(403).send({ error: 'STANDBY_NOT_ELIGIBLE' })
    const { data: reservation, error: reserveError } = await supabaseAdmin.rpc('sovereign_reserve_crown', {
      p_match_id: matchId, p_user_id: userId, p_reason: 'STANDBY', p_total_crest: sovereignEconomyConfig.requiredReservationCrest, p_idempotency_key: idempotencyKey,
    })
    if (reserveError) return reply.status(409).send({ error: reserveError.message })
    const reserved = Array.isArray(reservation) ? reservation[0] : reservation
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: tail } = await supabaseAdmin.from('sovereign_standby_entries').select('queue_sequence').eq('match_id', matchId).order('queue_sequence', { ascending: false }).limit(1).maybeSingle()
      const { data: entry, error } = await supabaseAdmin.from('sovereign_standby_entries').insert({ match_id: matchId, user_id: userId, queue_sequence: Number(tail?.queue_sequence ?? 0) + 1, reservation_id: reserved.id }).select().maybeSingle()
      if (!error && entry) return reply.send({ standby: entry })
      if (!error || !String(error.message).toLowerCase().includes('duplicate')) {
        await supabaseAdmin.rpc('sovereign_release_crown_reservation', { p_reservation_id: reserved.id, p_idempotency_key: randomUUID() })
        return fail(reply, error, 'STANDBY_JOIN_FAILED')
      }
    }
    await supabaseAdmin.rpc('sovereign_release_crown_reservation', { p_reservation_id: reserved.id, p_idempotency_key: randomUUID() })
    return reply.status(409).send({ error: 'STANDBY_QUEUE_BUSY' })
  })

  fastify.post<{ Body: { newName?: string; idempotencyKey?: string } }>('/sovereign/mandatory-rename', async (request, reply) => {
    const userId = await requireUser(request, reply); if (!userId) return
    const { newName, idempotencyKey } = request.body ?? {}
    if (!newName || !idempotencyKey) return reply.status(400).send({ error: 'INVALID_RENAME_REQUEST' })
    const { data, error } = await supabaseAdmin.rpc('sovereign_complete_mandatory_rename', { p_user_id: userId, p_new_name: newName, p_idempotency_key: idempotencyKey })
    if (error) return reply.status(409).send({ error: error.message })
    return reply.send({ result: Array.isArray(data) ? data[0] : data })
  })
}
