import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { getTierDLeaderboard } from '../game/tierDLeaderboardService'
import { getTierDLeagueAwards } from '../game/tierDRewardService'
import { getTierDRecords, getTierDShowcase, type TierDRecordBoard, type TierDRecordLeague } from '../game/tierDRecordsService'

export default async function tierDLeaderboardRoutes(app: FastifyInstance) {
  app.get('/tier-d/leaderboard', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    // The response intentionally exposes only enabled/disabled, never eligible population.
    return getTierDLeaderboard(data.user.id)
  })
  app.get('/tier-d/awards', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    return { awards: await getTierDLeagueAwards(data.user.id) }
  })
  app.get('/tier-d/records', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const query = request.query as { board?: string; league?: string }
    const board = query.board === 'streak' ? 'streak' : 'pb' as TierDRecordBoard
    const allowedLeagues = new Set(['all','bronze','silver','gold','platinum','diamond','elite','master','grandmaster','legend','mythic'])
    const league = (allowedLeagues.has(query.league ?? 'all') ? query.league ?? 'all' : 'all') as TierDRecordLeague
    return getTierDRecords(board, league)
  })
  app.get('/tier-d/showcase/:userId', async (request, reply) => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { userId } = request.params as { userId: string }
    return getTierDShowcase(userId)
  })
}
