// ============================================================
// merchService.ts — Merch Shop business logic (มติลุงเยาะ 2026-08-04)
// สินค้าจริง (เสื้อ/ถ้วย/เหรียญรางวัล) จ่ายด้วย Earned Crown เท่านั้น gate ตาม Tier ที่ปลดล็อกแล้ว
// จัดส่งในประเทศไทยเท่านั้น ไม่มี admin panel — ลุงเยาะอัปเดต status ผ่าน Supabase Table Editor เอง
//
// ใช้โดย server/src/routes/merch.ts เท่านั้น
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { TIER_ORDER, TierOrderKey } from './progressionGate'
import { deductCrown } from '../items/shopAPI'

export interface MerchCatalogEntry {
  key: string
  type: 'medal' | 'trophy' | 'shirt'
  name: string
  tier: string
  priceCrown: number
  locked: boolean
}

// รายการ catalog + locked flag ตาม tier_unlocked_max ปัจจุบันของ user (Tier ไหนปลดแล้วซื้อของ Tier นั้นได้)
export async function getMerchCatalogForUser(userId: string): Promise<MerchCatalogEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('tier_unlocked_max')
    .eq('user_id', userId)
    .single()

  const currentMax = (error || !data) ? null : (data.tier_unlocked_max as TierOrderKey | null)
  const currentIdx = currentMax ? TIER_ORDER.indexOf(currentMax) : -1 // -1 = ยังไม่ปลด Tier ไหนเลย (pattern เดียวกับ crownVaultService.ts)

  return gameConfig.merchConfig.catalog.map(item => ({
    ...item,
    locked: TIER_ORDER.indexOf(item.tier as TierOrderKey) > currentIdx,
  }))
}

export interface ShippingInfo {
  recipientName: string
  phone: string
  addressLine: string
  subdistrict: string
  district: string
  province: string
  postalCode: string
}

export type PlaceMerchOrderError =
  | 'ITEM_NOT_FOUND'
  | 'TIER_REQUIRED'
  | 'INSUFFICIENT_CROWN'
  | 'INVALID_SHIPPING_INFO'
  | 'USER_NOT_FOUND'

export interface PlaceMerchOrderResult {
  success: boolean
  orderId?: string
  newCrownBalance?: number
  error?: PlaceMerchOrderError
  errorDetail?: string
}

const REQUIRED_SHIPPING_FIELDS: (keyof ShippingInfo)[] = [
  'recipientName', 'phone', 'addressLine', 'subdistrict', 'district', 'province', 'postalCode',
]

export async function placeMerchOrder(
  userId: string,
  itemKey: string,
  shipping: ShippingInfo
): Promise<PlaceMerchOrderResult> {
  const item = gameConfig.merchConfig.catalog.find(i => i.key === itemKey)
  if (!item) return { success: false, error: 'ITEM_NOT_FOUND' }

  for (const field of REQUIRED_SHIPPING_FIELDS) {
    if (!shipping[field] || !shipping[field].trim()) {
      return { success: false, error: 'INVALID_SHIPPING_INFO', errorDetail: `Missing ${field}` }
    }
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('tier_unlocked_max')
    .eq('user_id', userId)
    .single()

  if (userError || !userRow) return { success: false, error: 'USER_NOT_FOUND' }

  const currentMax = userRow.tier_unlocked_max as TierOrderKey | null
  const currentIdx = currentMax ? TIER_ORDER.indexOf(currentMax) : -1
  const requiredIdx = TIER_ORDER.indexOf(item.tier as TierOrderKey)
  if (requiredIdx > currentIdx) return { success: false, error: 'TIER_REQUIRED' }

  let newCrownBalance: number
  try {
    newCrownBalance = await deductCrown(userId, item.priceCrown)
  } catch (err: any) {
    return { success: false, error: 'INSUFFICIENT_CROWN', errorDetail: err.message }
  }

  const { data: orderRow, error: insertError } = await supabaseAdmin
    .from('merch_orders')
    .insert({
      user_id: userId,
      item_key: item.key,
      item_type: item.type,
      item_name: item.name,
      tier: item.tier,
      price_crown: item.priceCrown,
      recipient_name: shipping.recipientName,
      phone: shipping.phone,
      address_line: shipping.addressLine,
      subdistrict: shipping.subdistrict,
      district: shipping.district,
      province: shipping.province,
      postal_code: shipping.postalCode,
    })
    .select('id')
    .single()

  if (insertError || !orderRow) {
    // เงินถูกหักไปแล้วแต่บันทึกออเดอร์ไม่สำเร็จ — คืน Crown กลับให้ user กันเงินหายฟรี
    console.error('[MERCH] Order insert failed after crown deduction for', userId, insertError)
    await supabaseAdmin.rpc('credit_user_crown', { p_user_id: userId, p_amount: item.priceCrown })
    return { success: false, error: 'USER_NOT_FOUND', errorDetail: insertError?.message }
  }

  return { success: true, orderId: orderRow.id, newCrownBalance }
}

export interface MerchOrderRecord {
  id: string
  itemKey: string
  itemType: string
  itemName: string
  tier: string
  priceCrown: number
  status: string
  createdAt: string
}

export async function getMerchOrders(userId: string): Promise<MerchOrderRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('merch_orders')
    .select('id, item_key, item_type, item_name, tier, price_crown, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    itemKey: row.item_key,
    itemType: row.item_type,
    itemName: row.item_name,
    tier: row.tier,
    priceCrown: row.price_crown,
    status: row.status,
    createdAt: row.created_at,
  }))
}
