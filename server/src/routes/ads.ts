import type { FastifyInstance } from 'fastify'
import { considerForcedInterstitial, markForcedInterstitialCompleted, markRewardedAdCompleted } from '../game/adPolicyService'
import type { NaturalBreak } from '../game/adPolicy'
import { supabase } from '../config/supabase'

const BREAKS: NaturalBreak[] = ['TIER_D_LEVEL_COMPLETE', 'TIER_D_RETRY', 'TIER_D_EXIT_TO_LOBBY', 'TIER_D_TOP20_CONTINUE', 'CLASSIC_GAME_SETTLED', 'CLASSIC_POST_SETTLEMENT_EXIT']
const CLASSIC_TIERS = ['C', 'B', 'A', 'A_PLUS'] as const
async function userIdFrom(request: any) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return undefined
  const { data, error } = await supabase.auth.getUser(token)
  return error ? undefined : data.user?.id
}
export async function adRoutes(app: FastifyInstance) {
  app.post<{ Body: { naturalBreak?: NaturalBreak; tier?: typeof CLASSIC_TIERS[number]; outcome?: 'WIN'|'LOSS'; exitReason?: 'CONTINUE'|'BACK_TO_LOBBY' } }>('/ads/natural-break', async (request, reply) => {
    const userId = await userIdFrom(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const naturalBreak = request.body?.naturalBreak
    if (!naturalBreak || !BREAKS.includes(naturalBreak)) return reply.status(400).send({ error: 'INVALID_NATURAL_BREAK' })
    if (naturalBreak === 'CLASSIC_POST_SETTLEMENT_EXIT' && (!CLASSIC_TIERS.includes(request.body?.tier as typeof CLASSIC_TIERS[number]) || request.body?.outcome !== 'LOSS' || request.body?.exitReason !== 'BACK_TO_LOBBY')) return reply.status(400).send({ error: 'INVALID_CLASSIC_EXIT_CONTEXT' })
    try { return reply.send({ showForcedInterstitial: await considerForcedInterstitial(userId, naturalBreak) }) }
    catch { return reply.send({ showForcedInterstitial: false }) }
  })
  app.post('/ads/forced-complete', async (request, reply) => { const userId = await userIdFrom(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' }); await markForcedInterstitialCompleted(userId); return reply.send({ ok: true }) })
  app.post('/ads/rewarded-complete', async (request, reply) => { const userId = await userIdFrom(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' }); await markRewardedAdCompleted(userId); return reply.send({ ok: true }) })
}
