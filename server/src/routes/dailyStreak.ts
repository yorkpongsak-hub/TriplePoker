import type { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { DAILY_STREAK_MULTIPLIERS, membershipFromVipStatus, needsDailyStreakRewardedAd } from '../game/adPolicy'
import { getBangkokDateString } from '../game/matchStatsService'
import { gameConfig } from '../config/gameConfig'
import { markRewardedAdCompleted } from '../game/adPolicyService'
import { adProvider } from '../game/adProvider'

async function authenticatedUser(request: any) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return undefined
  const { data, error } = await supabase.auth.getUser(token)
  return error ? undefined : data.user?.id
}

export async function dailyStreakRoutes(app: FastifyInstance) {
  app.get('/daily-streak', async (request, reply) => {
    const userId = await authenticatedUser(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabaseAdmin.from('users').select('vip_status,streak_count,last_played_date,streak_protections_used').eq('user_id', userId).maybeSingle()
    if (error || !data) return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    const today = getBangkokDateString(new Date())
    const membership = membershipFromVipStatus(data.vip_status)
    const eligible = data.last_played_date === today && data.streak_count >= 1 && data.streak_count <= 8
    const { data: claimed } = await supabaseAdmin.from('daily_streak_reward_claims').select('cycle_day').eq('user_id', userId).eq('claim_day', today).maybeSingle()
    return reply.send({ cycleDay: data.streak_count, multiplier: DAILY_STREAK_MULTIPLIERS[Math.max(0, data.streak_count - 1)] ?? 1,
      eligible: eligible && !claimed, requiresRewardedAd: needsDailyStreakRewardedAd(membership), membership,
      dailyBaseToken: gameConfig.dailyEconomy.playStreak.dailyBaseToken, protectionsUsed: data.streak_protections_used ?? 0 })
  })

  app.post<{ Body: { devMock?: boolean; googleTestEarned?: boolean } }>('/daily-streak/claim', async (request, reply) => {
    const userId = await authenticatedUser(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data: user } = await supabaseAdmin.from('users').select('vip_status').eq('user_id', userId).maybeSingle()
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' })
    const membership = membershipFromVipStatus(user.vip_status)
    const { data: streakBeforeClaim } = await supabaseAdmin.from('users').select('streak_count').eq('user_id',userId).maybeSingle()
    const adVerified = membership === 'FREE' && await adProvider.verifyRewardedCompletion({ devMock: request.body?.devMock, googleTestEarned: request.body?.googleTestEarned })
    if (membership === 'FREE' && !adVerified) return reply.status(503).send({ error: 'AD_PROVIDER_UNAVAILABLE' })
    try {
      if (adVerified) await markRewardedAdCompleted(userId)
      const { data, error } = await supabaseAdmin.rpc('claim_unified_daily_streak_reward', {
        p_user_id: userId, p_daily_base_token: gameConfig.dailyEconomy.playStreak.dailyBaseToken, p_ad_verified: adVerified,
      })
      if (error) {
        const message = error.message.includes('REWARDED_AD_REQUIRED') ? 'REWARDED_AD_REQUIRED' : error.message.includes('NOT_ELIGIBLE') ? 'DAILY_STREAK_NOT_ELIGIBLE' : 'DAILY_STREAK_CLAIM_FAILED'
        return reply.status(409).send({ error: message })
      }
      if (membership !== 'FREE' && streakBeforeClaim?.streak_count === 8) await supabaseAdmin.rpc('grant_second_deal_for_daily_cycle',{p_user_id:userId})
      return reply.send({ ...data, secondDealAwarded: membership !== 'FREE' && streakBeforeClaim?.streak_count === 8 })
    } catch { return reply.status(500).send({ error: 'DAILY_STREAK_CLAIM_FAILED' }) }
  })

  app.get('/inventory/social-items', async (request, reply) => {
    const userId = await authenticatedUser(request); if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })
    const { data, error } = await supabaseAdmin.from('social_item_inventory').select('item_key,quantity').eq('user_id', userId)
    if (error) return reply.status(500).send({ error: 'INVENTORY_UNAVAILABLE' })
    const inventory = { heart: 0, rose: 0 }
    for (const row of data ?? []) inventory[row.item_key as 'heart' | 'rose'] = row.quantity
    return reply.send({ inventory })
  })
}
