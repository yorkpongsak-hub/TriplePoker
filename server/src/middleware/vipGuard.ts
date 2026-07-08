// vipGuard.ts
// Middleware ตรวจสอบสิทธิ์ VIP ก่อนอนุญาตซื้อ item บางหมวด
// หมวดที่ต้องการ VIP: Competitive Items, Bag Expansion, Cosmetic
// Sprint 7: RevenueCat webhook จะมา set is_vip = true ใน DB

import { FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../config/supabase'

// หมวดสินค้าที่จำกัดเฉพาะ VIP
export const VIP_ONLY_CATEGORIES = [
  'competitive',
  'bag_expansion',
  'cosmetic',
] as const

export type VipOnlyCategory = typeof VIP_ONLY_CATEGORIES[number]

// ตรวจสอบว่า category นี้ต้องการ VIP หรือไม่
export function isVipOnlyCategory(category: string): category is VipOnlyCategory {
  return VIP_ONLY_CATEGORIES.includes(category as VipOnlyCategory)
}

// ดึง VIP status ของ user จาก DB (Sprint 7: RevenueCat จะมา populate)
export async function getUserVipStatus(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_vip')
    .eq('id', userId)
    .single()

  if (error || !data) return false
  return data.is_vip === true
}

// Fastify middleware — ใช้กับ route ที่ต้องการ VIP check
// ดึง category จาก request body แล้วเช็ค is_vip
export async function vipGuard(
  request: FastifyRequest<{ Body: { category?: string; item_category?: string } }>,
  reply: FastifyReply
): Promise<void> {
  const userId = (request as any).userId as string | undefined

  if (!userId) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'User not authenticated' })
  }

  // ดึง category จาก body (รองรับทั้ง category และ item_category)
  const category = request.body?.category ?? request.body?.item_category

  if (!category) {
    // ไม่มี category ใน body → ไม่ต้อง guard ผ่านได้เลย
    return
  }

  // ไม่ใช่ VIP-only category → ผ่านได้เลย
  if (!isVipOnlyCategory(category)) {
    return
  }

  // ตรวจสอบ VIP status จาก DB
  const isVip = await getUserVipStatus(userId)

  if (!isVip) {
    return reply.status(403).send({
      error: 'VIP_REQUIRED',
      item_category: category,
      upgrade_url: '/shop/vip',
      message: `This item category (${category}) requires VIP membership`,
    })
  }

  // VIP confirmed → ผ่าน
}

// Helper function สำหรับเช็ค VIP โดยตรง (ไม่ใช่ middleware)
// ใช้ใน shopAPI.ts เมื่อต้องการ check inline
export async function assertVip(userId: string, category: string): Promise<void> {
  if (!isVipOnlyCategory(category)) return

  const isVip = await getUserVipStatus(userId)
  if (!isVip) {
    const err = new Error(`VIP_REQUIRED: ${category}`) as any
    err.statusCode = 403
    err.code = 'VIP_REQUIRED'
    err.item_category = category
    err.upgrade_url = '/shop/vip'
    throw err
  }
}
