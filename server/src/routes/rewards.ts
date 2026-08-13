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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export default async function rewardsRoutes(fastify: FastifyInstance) {
  // ── POST /rewards/watch-ad ──────────────────────────────────────────
  fastify.post('/rewards/watch-ad', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const cooldownKey = `ad_reward_cooldown:${userId}`
    const cooldownSeconds = gameConfig.dailyEconomy.adRewardCooldownHours * 3600
    const lockAcquired = await redis.set(cooldownKey, '1', { nx: true, ex: cooldownSeconds })
    if (lockAcquired !== 'OK') {
      const retryAfterSeconds = await redis.ttl(cooldownKey)
      return reply.status(429).send({ error: 'AD_COOLDOWN_ACTIVE', retryAfterSeconds })
    }

    const { min, max } = gameConfig.dailyEconomy.adRewardToken
    const tokensAwarded = randomInt(min, max)

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

    return reply.send({
      success: true,
      tokensAwarded,
      newTokenBalance: error || !data ? null : data.token_balance,
    })
  })
}
