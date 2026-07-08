// routes/shop.ts
// Shop Routes — wire shopAPI.ts เข้า Fastify
// Endpoints: buy item / open loot box / get inventory / get loot box odds
// ใช้ vipGuard middleware สำหรับหมวด VIP-only

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { vipGuard } from '../middleware/vipGuard'
import {
  buyCompetitiveItem,
  buyFunItem,
  buyGesture,
  buyBagExpansion,
  openLootBoxPurchase,
  getUserInventory,
  getLootBoxOddsInfo,
} from '../items/shopAPI'
import { CompetitiveItemKey } from '../items/itemPhaseController'

// ประเภท Request bodies
interface BuyCompetitiveBody {
  item_key: string
  table_tier?: string
}

interface BuyFunBody {
  item_key: string
}

interface BuyGestureBody {
  gesture_key: string
}

interface BuyBagExpansionBody {
  expansion_key: string
}

interface OpenLootBoxBody {
  loot_box_type: string
}

export default async function shopRoutes(fastify: FastifyInstance) {
  // ── GET /shop/inventory ────────────────────────────────────────────
  // ดึง inventory ทั้งหมดของ user
  fastify.get('/shop/inventory', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const userId = (request as any).userId as string
    if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

    try {
      const inventory = await getUserInventory(userId)
      return reply.send({ success: true, inventory })
    } catch (err: any) {
      return reply.status(500).send({ error: err.message })
    }
  })

  // ── GET /shop/lootbox/odds/:type ───────────────────────────────────
  // ดึง % โอกาสของ Loot Box ก่อนซื้อ (Transparency Rule)
  fastify.get<{ Params: { type: string } }>(
    '/shop/lootbox/odds/:type',
    async (request, reply) => {
      try {
        const odds = getLootBoxOddsInfo(request.params.type)
        return reply.send({ success: true, ...odds })
      } catch (err: any) {
        return reply.status(400).send({ error: err.message })
      }
    }
  )

  // ── POST /shop/buy/competitive ─────────────────────────────────────
  // ซื้อ Competitive Item (VIP Only)
  fastify.post<{ Body: BuyCompetitiveBody }>(
    '/shop/buy/competitive',
    { preHandler: [vipGuard] },
    async (request, reply) => {
      const userId = (request as any).userId as string
      if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

      const { item_key, table_tier } = request.body

      if (!item_key) {
        return reply.status(400).send({ error: 'item_key is required' })
      }

      const result = await buyCompetitiveItem(
        userId,
        item_key as CompetitiveItemKey,
        table_tier
      )

      if (!result.success) {
        const statusCode = result.error === 'VIP_REQUIRED' ? 403
          : result.error === 'Insufficient tokens' ? 402
          : 400
        return reply.status(statusCode).send(result)
      }

      return reply.send(result)
    }
  )

  // ── POST /shop/buy/fun ─────────────────────────────────────────────
  // ซื้อ Fun Item (Free & VIP)
  fastify.post<{ Body: BuyFunBody }>(
    '/shop/buy/fun',
    async (request, reply) => {
      const userId = (request as any).userId as string
      if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

      const { item_key } = request.body
      if (!item_key) {
        return reply.status(400).send({ error: 'item_key is required' })
      }

      const result = await buyFunItem(userId, item_key)

      if (!result.success) {
        const statusCode = result.error === 'Insufficient tokens' ? 402 : 400
        return reply.status(statusCode).send(result)
      }

      return reply.send(result)
    }
  )

  // ── POST /shop/buy/gesture ─────────────────────────────────────────
  // ซื้อ Positive Gesture (Free & VIP)
  fastify.post<{ Body: BuyGestureBody }>(
    '/shop/buy/gesture',
    async (request, reply) => {
      const userId = (request as any).userId as string
      if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

      const { gesture_key } = request.body
      if (!gesture_key) {
        return reply.status(400).send({ error: 'gesture_key is required' })
      }

      const result = await buyGesture(userId, gesture_key)

      if (!result.success) {
        const statusCode = result.error === 'Insufficient tokens' ? 402 : 400
        return reply.status(statusCode).send(result)
      }

      return reply.send(result)
    }
  )

  // ── POST /shop/buy/bag-expansion ───────────────────────────────────
  // ซื้อ Bag Expansion (VIP Only)
  fastify.post<{ Body: BuyBagExpansionBody }>(
    '/shop/buy/bag-expansion',
    { preHandler: [vipGuard] },
    async (request, reply) => {
      const userId = (request as any).userId as string
      if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

      const { expansion_key } = request.body
      if (!expansion_key) {
        return reply.status(400).send({ error: 'expansion_key is required' })
      }

      const result = await buyBagExpansion(userId, expansion_key)

      if (!result.success) {
        const statusCode = result.error === 'VIP_REQUIRED' ? 403
          : result.error === 'Insufficient tokens' ? 402
          : 400
        return reply.status(statusCode).send(result)
      }

      return reply.send(result)
    }
  )

  // ── POST /shop/lootbox/open ────────────────────────────────────────
  // เปิด Loot Box (Free & VIP — Free ได้ Competitive แล้ว lock)
  fastify.post<{ Body: OpenLootBoxBody }>(
    '/shop/lootbox/open',
    async (request, reply) => {
      const userId = (request as any).userId as string
      if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' })

      const { loot_box_type } = request.body
      if (!loot_box_type) {
        return reply.status(400).send({ error: 'loot_box_type is required' })
      }

      const result = await openLootBoxPurchase(userId, loot_box_type)

      if (!result.success) {
        const statusCode = result.error === 'Insufficient tokens' ? 402 : 400
        return reply.status(statusCode).send(result)
      }

      return reply.send(result)
    }
  )

  // ── GET /shop/vip ──────────────────────────────────────────────────
  // ข้อมูล VIP upgrade (ใช้กับ upgrade_url ใน vipGuard error)
  fastify.get('/shop/vip', async (_request, reply) => {
    return reply.send({
      success: true,
      vip_benefits: [
        'Access to all 10 Competitive Items',
        'Bag Expansion (stock 5 → 8)',
        'Cosmetic items (Card Skin, Table Theme, Avatar Frame, etc.)',
        'Daily Login Bonus +300 tokens (no ad required)',
        'Monthly bonus: Swap x2 + Vision x2',
      ],
      plans: [
        { id: 'monthly', price_thb: 89, label: 'Monthly VIP' },
        { id: 'yearly',  price_thb: 790, label: 'Yearly VIP (save 26%)' },
      ],
    })
  })
}
