// vipGuard.ts
// Middleware ตรวจสอบสิทธิ์ VIP ก่อนอนุญาตซื้อ item บางหมวด / เปลี่ยน avatar preset
// หมวดที่ต้องการ VIP: Competitive Items, Bag Expansion, Cosmetic
// มาตรฐานเดียวทั้งระบบ: อ่าน vip_status ('none'|'vip'|'vip_pro') จาก users — ห้ามใช้ is_vip (คอลัมน์เก่า เลิกใช้แล้ว)

import { FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../config/supabase'

// หมวดสินค้าที่จำกัดเฉพาะ VIP (vip หรือ vip_pro ผ่านได้ทั้งคู่)
export const VIP_ONLY_CATEGORIES = [
  'competitive',
  'bag_expansion',
  'cosmetic',
] as const

export type VipOnlyCategory = typeof VIP_ONLY_CATEGORIES[number]
export type VipStatus = 'none' | 'vip' | 'vip_pro'

// ตรวจสอบว่า category นี้ต้องการ VIP หรือไม่
export function isVipOnlyCategory(category: string): category is VipOnlyCategory {
  return VIP_ONLY_CATEGORIES.includes(category as VipOnlyCategory)
}

// ดึง vip_status จริงของ user จาก DB ('none' ถ้าไม่พบแถว/error — fail-safe ปิดสิทธิ์ไว้ก่อน)
// แก้บั๊กเดิม: query ผิด PK (.eq('id', ...)) — ตาราง users ใช้ user_id เป็น PK (Known Bug #3 ใน CLAUDE.md)
export async function getUserVipTier(userId: string): Promise<VipStatus> {
  const { data, error } = await supabase
    .from('users')
    .select('vip_status')
    .eq('user_id', userId)
    .single()

  if (error || !data?.vip_status) return 'none'
  return data.vip_status as VipStatus
}

// Boolean เดิมไว้ backward-compat กับจุดเรียกที่มีอยู่ (vipGuard middleware, assertVip) — true เมื่อ vip หรือ vip_pro
export async function getUserVipStatus(userId: string): Promise<boolean> {
  const tier = await getUserVipTier(userId)
  return tier !== 'none'
}

// Fastify middleware — ใช้กับ route ที่ต้องการ VIP check
// ดึง category จาก request body แล้วเช็ค vip_status
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

// เช็ค VIP PRO โดยเฉพาะ (vip ธรรมดาไม่ผ่าน) — ใช้กับของ Pro-exclusive เช่น Avatar Preset tier 'vip_pro'
// แยกจาก assertVip เพราะ Pro-exclusive ไม่ใช่ "หมวดสินค้า" แบบ VIP_ONLY_CATEGORIES เดิม
export async function assertVipPro(userId: string): Promise<void> {
  const tier = await getUserVipTier(userId)
  if (tier !== 'vip_pro') {
    const err = new Error('VIP_PRO_REQUIRED') as any
    err.statusCode = 403
    err.code = 'VIP_PRO_REQUIRED'
    err.upgrade_url = '/shop/vip'
    throw err
  }
}
