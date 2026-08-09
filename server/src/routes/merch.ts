// routes/merch.ts
// Merch Shop — สินค้าจริง (เสื้อ/ถ้วย/เหรียญรางวัล) จ่ายด้วย Earned Crown, gate ตาม Tier
// Auth pattern เดียวกับ routes/crownVault.ts (Bearer token → supabase.auth.getUser)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../config/supabase'
import { getMerchCatalogForUser, placeMerchOrder, getMerchOrders, ShippingInfo } from '../game/merchService'

interface OrderBody extends ShippingInfo {
  itemKey: string
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

export default async function merchRoutes(fastify: FastifyInstance) {
  // ── GET /merch/catalog ──────────────────────────────────────────────
  fastify.get('/merch/catalog', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    try {
      const catalog = await getMerchCatalogForUser(userId)
      return reply.send({ success: true, catalog })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // ── POST /merch/order ───────────────────────────────────────────────
  fastify.post<{ Body: OrderBody }>('/merch/order', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const { itemKey, ...shipping } = request.body ?? ({} as OrderBody)
    if (!itemKey) {
      return reply.status(400).send({ error: 'itemKey required' })
    }

    const result = await placeMerchOrder(userId, itemKey, shipping)
    if (!result.success) {
      const statusCode = result.error === 'TIER_REQUIRED' ? 403
        : result.error === 'INSUFFICIENT_CROWN' ? 402
        : result.error === 'INVALID_SHIPPING_INFO' ? 400
        : result.error === 'ITEM_NOT_FOUND' ? 404
        : 404
      return reply.status(statusCode).send(result)
    }

    return reply.send(result)
  })

  // ── GET /merch/orders ────────────────────────────────────────────────
  fastify.get('/merch/orders', async (request, reply) => {
    const userId = await requireUserId(request, reply)
    if (!userId) return

    const orders = await getMerchOrders(userId)
    return reply.send({ success: true, orders })
  })
}
