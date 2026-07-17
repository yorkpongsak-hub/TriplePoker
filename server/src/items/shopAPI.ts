// shopAPI.ts
// Shop API — ซื้อสินค้า / เปิด Loot Box / ดู inventory
// ใช้ vipGuard.ts ตรวจสิทธิ์ก่อน allow purchase
// ใช้ lootBox.ts สำหรับ randomization
// Patch (2026-07-17): ลบการอ้างอิง "Retention Spec v1.5 §5.0" ออก — ค้นทั้ง docs/ แล้วไม่พบ
// ไฟล์เอกสารนี้อยู่จริง ราคา/กติกา VIP Purchase ด้านล่างคือ canon ปัจจุบันโดยตรง

import { supabase } from '../config/supabase'
import { assertVip, isVipOnlyCategory, getUserVipStatus } from '../middleware/vipGuard'
import {
  openLootBox,
  getLootBoxOdds,
  isValidLootBoxType,
  LOOT_BOX_PRICES,
  LootBoxType,
  LootBoxResult,
} from './lootBox'
import { CompetitiveItemKey } from './itemPhaseController'

// ราคา Competitive Items
const COMPETITIVE_ITEM_PRICES: Record<CompetitiveItemKey, number | ((tier: string) => number)> = {
  vision:           300,
  auction_veil:     200,
  chrono_shard:     250,
  free_sort:        (tier: string) => tier === 'initiate' ? 15 : tier === 'mastermind' ? 40 : 80,
  alliance_of_fate: 400,
  streak_shield:    350,
  swap:             600,
  auction_peek:     700,
  recall:           800,
  super_vision:     2000,
}

// ราคา Fun Items
const FUN_ITEM_PRICES: Record<string, number> = {
  jesters_wink:    50,
  hourglass_shatter: 70,
  fortunes_spin:   80,
  serpents_bluff:  90,
  aegis_of_will:   80,
}

// ราคา Positive Gestures
const GESTURE_PRICES: Record<string, number> = {
  heartbeat:   10,
  rose_toss:   20,
  blown_kiss:  30,
}

// ราคา Bag Expansion
const BAG_EXPANSION_PRICES: Record<string, number> = {
  expanded_satchel: 300,  // 3 วัน
  travelers_pack:   600,  // 7 วัน
  war_chest:        1200, // 15 วัน
}

// Stock สูงสุดต่อ item (ก่อน Bag Expansion)
const DEFAULT_MAX_STOCK = 5
const BAG_EXPANSION_MAX_STOCK = 8

// ผลลัพธ์การซื้อ
export interface PurchaseResult {
  success: boolean
  itemKey?: string
  newStock?: number
  tokenSpent?: number
  newBalance?: number
  isLocked?: boolean // สำหรับ Competitive item ที่ Free member ได้จาก Loot Box
  error?: string
}

// ผลลัพธ์การเปิด Loot Box
export interface OpenLootBoxResult {
  success: boolean
  lootBoxType?: LootBoxType
  items?: { item: CompetitiveItemKey; isLocked: boolean }[]
  tokenSpent?: number
  newBalance?: number
  error?: string
}

// ดึง token balance ของ user
// แก้บั๊กเดิม: query ผิด PK (.eq('id', ...)) — ตาราง users ใช้ user_id เป็น PK (Known Bug #3 ใน CLAUDE.md)
async function getUserTokenBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('token_balance')
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new Error('User not found')
  return data.token_balance
}

// ดึง VIP status และ token balance พร้อมกัน — reuse getUserVipStatus (vipGuard.ts, มาตรฐาน vip_status
// เดียวกันทั้งระบบ) แทนที่จะ query is_vip แยกเองที่นี่ (คอลัมน์เก่า เลิกใช้แล้ว — ดู vipGuard.ts)
async function getUserInfo(userId: string): Promise<{ tokenBalance: number; isVip: boolean }> {
  const [tokenBalance, isVip] = await Promise.all([
    getUserTokenBalance(userId),
    getUserVipStatus(userId),
  ])
  return { tokenBalance, isVip }
}

// ดึง stock ปัจจุบันของ item ใน inventory
async function getItemStock(userId: string, itemKey: string): Promise<number> {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('quantity')
    .eq('user_id', userId)
    .eq('item_key', itemKey)
    .single()

  if (error || !data) return 0
  return data.quantity ?? 0
}

// ตรวจสอบว่า user มี Bag Expansion active หรือไม่
async function hasBagExpansion(userId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('user_inventory')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('item_key', 'bag_expansion')
    .gte('expires_at', now)
    .single()

  return !error && !!data
}

// หักเงิน Token และบันทึกธุรกรรม
async function deductTokens(
  userId: string,
  amount: number,
  reason: string
): Promise<number> {
  const { data, error } = await supabase.rpc('deduct_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  })

  if (error) throw new Error(`Token deduction failed: ${error.message}`)
  return data as number // new balance
}

// เพิ่ม item เข้า inventory
async function addToInventory(
  userId: string,
  itemKey: string,
  quantity: number,
  isLocked: boolean = false,
  expiresAt?: string
): Promise<number> {
  // ตรวจสอบ stock ปัจจุบัน
  const maxStock = (await hasBagExpansion(userId))
    ? BAG_EXPANSION_MAX_STOCK
    : DEFAULT_MAX_STOCK

  const currentStock = await getItemStock(userId, itemKey)

  if (currentStock + quantity > maxStock) {
    throw new Error(`Stock limit exceeded (max ${maxStock})`)
  }

  // Upsert inventory
  const { data, error } = await supabase
    .from('user_inventory')
    .upsert(
      {
        user_id: userId,
        item_key: itemKey,
        quantity: currentStock + quantity,
        is_locked: isLocked,
        expires_at: expiresAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,item_key' }
    )
    .select('quantity')
    .single()

  if (error) throw new Error(`Inventory update failed: ${error.message}`)
  return data?.quantity ?? currentStock + quantity
}

// ซื้อ Competitive Item (VIP Only)
export async function buyCompetitiveItem(
  userId: string,
  itemKey: CompetitiveItemKey,
  tableTier: string = 'mastermind'
): Promise<PurchaseResult> {
  try {
    // VIP check
    await assertVip(userId, 'competitive')

    // คำนวณราคา
    const priceEntry = COMPETITIVE_ITEM_PRICES[itemKey]
    const price = typeof priceEntry === 'function'
      ? priceEntry(tableTier)
      : priceEntry

    // ตรวจสอบ balance
    const balance = await getUserTokenBalance(userId)
    if (balance < price) {
      return { success: false, error: 'Insufficient tokens' }
    }

    // เพิ่ม stock และหักเงิน
    const newStock = await addToInventory(userId, itemKey, 1)
    const newBalance = await deductTokens(userId, price, `buy_competitive:${itemKey}`)

    return { success: true, itemKey, newStock, tokenSpent: price, newBalance }

  } catch (err: any) {
    if (err.code === 'VIP_REQUIRED') {
      return {
        success: false,
        error: 'VIP_REQUIRED',
        ...(err.item_category ? { itemKey: err.item_category } : {}),
      }
    }
    return { success: false, error: err.message }
  }
}

// ซื้อ Fun Item (Free & VIP)
export async function buyFunItem(
  userId: string,
  itemKey: string
): Promise<PurchaseResult> {
  try {
    const price = FUN_ITEM_PRICES[itemKey]
    if (!price) return { success: false, error: `Unknown fun item: ${itemKey}` }

    const balance = await getUserTokenBalance(userId)
    if (balance < price) return { success: false, error: 'Insufficient tokens' }

    const newStock = await addToInventory(userId, itemKey, 1)
    const newBalance = await deductTokens(userId, price, `buy_fun:${itemKey}`)

    return { success: true, itemKey, newStock, tokenSpent: price, newBalance }

  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ซื้อ Gesture (Free & VIP)
export async function buyGesture(
  userId: string,
  gestureKey: string
): Promise<PurchaseResult> {
  try {
    const price = GESTURE_PRICES[gestureKey]
    if (!price) return { success: false, error: `Unknown gesture: ${gestureKey}` }

    const balance = await getUserTokenBalance(userId)
    if (balance < price) return { success: false, error: 'Insufficient tokens' }

    const newStock = await addToInventory(userId, gestureKey, 1)
    const newBalance = await deductTokens(userId, price, `buy_gesture:${gestureKey}`)

    return { success: true, itemKey: gestureKey, newStock, tokenSpent: price, newBalance }

  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ซื้อ Bag Expansion (VIP Only)
export async function buyBagExpansion(
  userId: string,
  expansionKey: string
): Promise<PurchaseResult> {
  try {
    await assertVip(userId, 'bag_expansion')

    const price = BAG_EXPANSION_PRICES[expansionKey]
    if (!price) return { success: false, error: `Unknown bag expansion: ${expansionKey}` }

    const durationDays: Record<string, number> = {
      expanded_satchel: 3,
      travelers_pack:   7,
      war_chest:        15,
    }

    const balance = await getUserTokenBalance(userId)
    if (balance < price) return { success: false, error: 'Insufficient tokens' }

    const expiresAt = new Date(Date.now() + durationDays[expansionKey] * 86400000).toISOString()
    const newStock = await addToInventory(userId, 'bag_expansion', 1, false, expiresAt)
    const newBalance = await deductTokens(userId, price, `buy_bag_expansion:${expansionKey}`)

    return { success: true, itemKey: expansionKey, newStock, tokenSpent: price, newBalance }

  } catch (err: any) {
    if (err.code === 'VIP_REQUIRED') {
      return { success: false, error: 'VIP_REQUIRED' }
    }
    return { success: false, error: err.message }
  }
}

// เปิด Loot Box (Free & VIP — แต่ Free ได้ Competitive แล้ว lock)
export async function openLootBoxPurchase(
  userId: string,
  lootBoxType: string
): Promise<OpenLootBoxResult> {
  try {
    if (!isValidLootBoxType(lootBoxType)) {
      return { success: false, error: `Unknown loot box type: ${lootBoxType}` }
    }

    const price = LOOT_BOX_PRICES[lootBoxType as LootBoxType]
    const { tokenBalance, isVip } = await getUserInfo(userId)

    if (tokenBalance < price) return { success: false, error: 'Insufficient tokens' }

    // สุ่ม item
    const result: LootBoxResult = openLootBox(lootBoxType as LootBoxType, isVip)

    // บันทึกทุก item เข้า inventory
    const itemResults: { item: CompetitiveItemKey; isLocked: boolean }[] = []

    for (const item of result.items) {
      const isLocked = result.lockedItems.includes(item)
      try {
        await addToInventory(userId, item, 1, isLocked)
        itemResults.push({ item, isLocked })
      } catch (e: any) {
        // ถ้า stock เต็ม → บันทึกว่าได้แต่ไม่ใส่ inventory
        itemResults.push({ item, isLocked })
      }
    }

    const newBalance = await deductTokens(userId, price, `open_loot_box:${lootBoxType}`)

    return {
      success: true,
      lootBoxType: lootBoxType as LootBoxType,
      items: itemResults,
      tokenSpent: price,
      newBalance,
    }

  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ดึง inventory ทั้งหมดของ user
export async function getUserInventory(userId: string) {
  const { data, error } = await supabase
    .from('user_inventory')
    .select('item_key, quantity, is_locked, expires_at, updated_at')
    .eq('user_id', userId)
    .order('item_key')

  if (error) throw new Error(`Failed to fetch inventory: ${error.message}`)
  return data ?? []
}

// ดึง % โอกาสของ Loot Box สำหรับแสดงก่อนซื้อ
export function getLootBoxOddsInfo(lootBoxType: string) {
  if (!isValidLootBoxType(lootBoxType)) {
    throw new Error(`Unknown loot box type: ${lootBoxType}`)
  }
  return getLootBoxOdds(lootBoxType as LootBoxType)
}
