// routes/badges.ts
// Badge Shop endpoints — GET /badges/status (locked/unlocked/owned ต่อ badge) + POST /badges/buy
// Auth pattern เดียวกับ routes/crownVault.ts (Bearer token → supabase.auth.getUser)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../config/supabase'
import { getBadgeStatusList, buyBadge, setEquippedBadge } from '../game/badgeUnlockService'

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

interface BuyBadgeBody {
  badgeKey: string
}

interface EquipBadgeBody {
  badgeKey: string | null
}

export default async function badgeRoutes(fastify: FastifyInstance) {
  // ── GET /badges/status ────────────────────────────────────────────
  fastify.get('/badges/status', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const badges = await getBadgeStatusList(userId)
    if (!badges) return reply.status(404).send({ error: 'USER_NOT_FOUND' })

    return reply.send({ success: true, badges })
  })

  // ── POST /badges/buy ──────────────────────────────────────────────
  fastify.post<{ Body: BuyBadgeBody }>('/badges/buy', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const { badgeKey } = request.body
    if (!badgeKey) return reply.status(400).send({ error: 'badgeKey is required' })

    const result = await buyBadge(userId, badgeKey)

    if (!result.success) {
      const statusCode = result.error === 'INSUFFICIENT_TOKENS' ? 402
        : result.error === 'NOT_UNLOCKED' ? 403
        : result.error === 'ALREADY_OWNED' ? 409
        : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })

  // ── POST /badges/equip ────────────────────────────────────────────
  // badgeKey: null = ถอด equip ปัจจุบันออก (ไม่ equip อะไร)
  fastify.post<{ Body: EquipBadgeBody }>('/badges/equip', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const badgeKey = request.body?.badgeKey ?? null
    const result = await setEquippedBadge(userId, badgeKey)

    if (!result.success) {
      const statusCode = result.error === 'NOT_OWNED' ? 403 : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })
}
