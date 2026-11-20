// routes/rewards.ts
// Ad-Watch Bonus — Central Economy Ledger Phase 7 Round 8 (2026-08-13)
// Backend-ready + a temporary test button on the client (มติลุงเยาะ 2026-08-13) — no real AdMob SDK
// integration yet (needs an AdMob account/app ID/ad-unit-IDs only ลุงเยาะ can provide, plus native
// build config), that's a separate future round. Today, a claim = an immediate grant, gated only by
// the Redis cooldown below — the client stands in for "the ad finished playing."
// Auth pattern เดียวกับ routes/crownVault.ts / routes/auth.ts (Bearer token → supabase.auth.getUser)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { redis } from '../config/redis'
import { economyService } from '../economy/economyService'
import { markRewardedAdCompleted } from '../game/adPolicyService'
import { membershipFromVipStatus, canRequestRewardedAd } from '../game/adPolicy'
import { adProvider } from '../game/adProvider'

async function requireUserId(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' })
    return null
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    reply.status(401).send({ error: 'Invalid token' })
    return null
  }

  return data.user.id
}

export default async function rewardsRoutes(fastify: FastifyInstance) {
  fastify.get('/rewards/token-rescue-status', async (request, reply) => {
    const userId = await requireUserId(request, reply); if (!userId) return
    const cooldownKey = `ad_reward_cooldown:${userId}`
    const [ttl, profile] = await Promise.all([
      redis.ttl(cooldownKey),
      supabaseAdmin.from('users').select('vip_status').eq('user_id', userId).maybeSingle(),
    ])
    const membership=membershipFromVipStatus(profile.data?.vip_status)
    if (!canRequestRewardedAd(membership,'TOKEN_RESCUE')) return reply.send({ eligible:false, reason:'PRO_PLUS_NOT_AD_ELIGIBLE' })
    return reply.send({ eligible: ttl <= 0 && await adProvider.forcedInterstitialAvailable(), retryAfterSeconds: Math.max(0,ttl) })
  })
  // ── POST /rewards/watch-ad ──────────────────────────────────────────
  fastify.post<{ Body: { devMock?: boolean; googleTestEarned?: boolean } }>('/rewards/watch-ad', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return
    const { data: profile } = await supabaseAdmin.from('users').select('vip_status').eq('user_id', userId).maybeSingle()
    if (!canRequestRewardedAd(membershipFromVipStatus(profile?.vip_status),'TOKEN_RESCUE')) return reply.status(403).send({ error:'PRO_PLUS_NOT_AD_ELIGIBLE' })
    if (!await adProvider.verifyRewardedCompletion({ devMock: request.body?.devMock, googleTestEarned: request.body?.googleTestEarned })) return reply.status(503).send({ error:'AD_PROVIDER_UNAVAILABLE' })

    const cooldownKey = `ad_reward_cooldown:${userId}`
    const cooldownSeconds = gameConfig.dailyEconomy.adRewardCooldownHours * 3600
    const lockAcquired = await redis.set(cooldownKey, '1', { nx: true, ex: cooldownSeconds })
    if (lockAcquired !== 'OK') {
      const retryAfterSeconds = await redis.ttl(cooldownKey)
      return reply.status(429).send({ error: 'AD_COOLDOWN_ACTIVE', retryAfterSeconds })
    }

    // Rescue covers no more than Match 1 G1+G2; it deliberately excludes G3,
    // future Matches and side bets.
    const tokensAwarded = gameConfig.tokenPot.tiers.initiate.pile1 + gameConfig.tokenPot.tiers.initiate.pile2

    try {
      await economyService.mint({
        idempotencyKey: `AD_REWARD:${userId}:${Date.now()}`,
        to: { accountType: 'PLAYER', accountId: userId },
        currency: 'TOKEN',
        amount: tokensAwarded,
        reason: 'AD_REWARD',
        actor: 'ad_reward_system',
      })
    } catch (err: any) {
      await redis.del(cooldownKey) // ไม่ได้เงินจริง — คืน cooldown ให้ลองใหม่ได้
      return reply.status(500).send({ error: 'AD_REWARD_MINT_FAILED', message: err.message })
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('token_balance')
      .eq('user_id', userId)
      .single()

    await markRewardedAdCompleted(userId).catch(() => undefined)
    return reply.send({
      success: true,
      tokensAwarded,
      newTokenBalance: error || !data ? null : data.token_balance,
    })
  })
}
