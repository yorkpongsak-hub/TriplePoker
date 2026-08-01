// routes/crownVault.ts
// The Crown Vault — Ascendant Pass / Arena Pass / Token→Crown Exchange endpoints
// แยกไฟล์จาก routes/shop.ts เดิมโดยตั้งใจ (shop.ts ยังไม่ถูก register เลย — ปุ่มซื้ออื่นๆ ยังเป็น
// "Coming Soon" รอ RevenueCat อยู่ กันไม่ให้ register ไฟล์นี้ไปพลอย activate endpoint เก่าที่ยังไม่พร้อม)
// Auth pattern เดียวกับ routes/auth.ts / routes/profile.ts (Bearer token → supabase.auth.getUser)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { checkAscendantEligibility } from '../game/ascendantGate'
import {
  getAscendantStatus,
  buyAscendantPass,
  checkArenaPassEligibility,
  buyArenaPass,
  exchangeTokenToCrown,
} from '../game/crownVaultService'

interface ExchangeBody {
  crownAmount: number
}

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

export default async function crownVaultRoutes(fastify: FastifyInstance) {
  // ── GET /crown-vault/status ─────────────────────────────────────────
  // สถานะรวมของ Crown Vault ให้ client render ทีเดียว (ทำ on-demand ascendant window check ในตัว)
  fastify.get('/crown-vault/status', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('token_balance, crown_balance, crown_package_balance, arena_unlocked')
        .eq('user_id', userId)
        .single()

      if (error || !data) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

      const [ascendantStatus, ascendantEligibility, arenaPassEligibility] = await Promise.all([
        getAscendantStatus(userId),
        checkAscendantEligibility(userId),
        checkArenaPassEligibility(userId),
      ])

      return reply.send({
        success: true,
        tokenBalance: data.token_balance,
        crownBalance: data.crown_balance,
        crownPackageBalance: data.crown_package_balance,
        arenaUnlocked: false,
        ascendantStatus,
        ascendantEligible: ascendantEligibility.eligible,
        ascendantEligibilityReason: ascendantEligibility.reason,
        arenaPassEligible: false,
        config: {
          tokenToCrownRate: gameConfig.crownVaultConfig.tokenToCrownRate,
          ascendantPassPriceCrown: gameConfig.crownVaultConfig.ascendantPassPriceCrown,
          arenaPassPriceCrown: gameConfig.crownVaultConfig.arenaPassPriceCrown,
        },
      })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // ── POST /crown-vault/exchange ──────────────────────────────────────
  // Token → Crown Exchange (1 Crown = 5,000 Token, ปลดล็อกที่ HighNoble)
  fastify.post<{ Body: ExchangeBody }>('/crown-vault/exchange', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const { crownAmount } = request.body ?? {}
    if (!crownAmount || crownAmount <= 0) {
      return reply.status(400).send({ error: 'crownAmount ต้องเป็นเลขบวก' })
    }

    const result = await exchangeTokenToCrown(userId, crownAmount)
    if (!result.success) {
      const statusCode = result.error === 'TIER_REQUIRED' ? 403
        : result.error === 'INSUFFICIENT_TOKENS' ? 402
        : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })

  // ── POST /crown-vault/buy-ascendant-pass ────────────────────────────
  // Opt-in Start จริง — ซื้อ Pass = เริ่ม window (หรือ Instant Pass ถ้า token >= 1M อยู่แล้ว)
  fastify.post('/crown-vault/buy-ascendant-pass', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const result = await buyAscendantPass(userId)
    if (!result.success) {
      const statusCode = result.error === 'NOT_ELIGIBLE' ? 403
        : result.error === 'INSUFFICIENT_CROWN' ? 402
        : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })

  // ── POST /crown-vault/buy-arena-pass ────────────────────────────────
  // ด่านสุดท้ายบังคับทั้ง 2 เส้นทาง (ผ่าน Ascendant หรือ ไต่ทางสำรอง 1M+180วัน)
  fastify.post('/crown-vault/buy-arena-pass', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const result = await buyArenaPass(userId)
    if (!result.success) {
      const statusCode = result.error === 'NOT_ELIGIBLE' ? 403
        : result.error === 'ALREADY_UNLOCKED' ? 409
        : result.error === 'INSUFFICIENT_CROWN' ? 402
        : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })
}
