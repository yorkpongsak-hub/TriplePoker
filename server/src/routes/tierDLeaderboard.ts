import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { getTierDLeaderboard } from '../game/tierDLeaderboardService'
import { getTierDLeagueAwards } from '../game/tierDRewardService'

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
}
