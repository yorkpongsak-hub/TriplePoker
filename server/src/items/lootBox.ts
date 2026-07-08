// lootBox.ts
// Loot Box Randomization Engine
// รองรับ 3 ประเภท: Mystery Pouch / Tactician's Chest / Grand Vault
// Free member ที่ได้ Competitive Item → insert inventory ด้วย is_locked = true
// ต้องแสดง % โอกาสทุกรายการก่อนให้ผู้เล่นซื้อ (Transparency Rule)

import { CompetitiveItemKey } from './itemPhaseController'

// ประเภท Loot Box
export type LootBoxType = 'mystery_pouch' | 'tacticians_chest' | 'grand_vault'

// ราคา Loot Box แต่ละประเภท
export const LOOT_BOX_PRICES: Record<LootBoxType, number> = {
  mystery_pouch:    500,
  tacticians_chest: 1200,
  grand_vault:      2500,
}

// จำนวน item ที่ได้จาก Loot Box แต่ละประเภท
export const LOOT_BOX_ITEM_COUNT: Record<LootBoxType, number> = {
  mystery_pouch:    2,
  tacticians_chest: 3,
  grand_vault:      5,
}

// โครงสร้างตาราง drop rate
export interface DropEntry {
  item: CompetitiveItemKey
  weight: number // น้ำหนักสำหรับการสุ่ม (ไม่ต้องรวม = 100)
}

// ตาราง drop rate ของ Mystery Pouch (สุ่ม 2 ชิ้น)
export const MYSTERY_POUCH_TABLE: DropEntry[] = [
  { item: 'chrono_shard',    weight: 30 },
  { item: 'auction_veil',    weight: 30 },
  { item: 'vision',          weight: 25 },
  { item: 'free_sort',       weight: 10 },
  { item: 'streak_shield',   weight: 5  },
]

// ตาราง drop rate ของ Tactician's Chest (สุ่ม 3 ชิ้น ยกเว้น Eye of Demon)
export const TACTICIANS_CHEST_TABLE: DropEntry[] = [
  { item: 'chrono_shard',    weight: 20 },
  { item: 'auction_veil',    weight: 20 },
  { item: 'vision',          weight: 15 },
  { item: 'alliance_of_fate',weight: 15 },
  { item: 'swap',            weight: 10 },
  { item: 'recall',          weight: 10 },
  { item: 'auction_peek',    weight: 7  },
  { item: 'streak_shield',   weight: 3  },
]

// ตาราง drop rate ของ Grand Vault (สุ่ม 5 ชิ้น)
// ชิ้นที่ 1-4 ใช้ TACTICIANS_CHEST_TABLE
// ชิ้นที่ 5: 20% Eye of Demon / 80% สุ่มตาม TACTICIANS_CHEST_TABLE
const GRAND_VAULT_SPECIAL_EYE_CHANCE = 0.20

// ผลลัพธ์การเปิด Loot Box
export interface LootBoxResult {
  lootBoxType: LootBoxType
  items: CompetitiveItemKey[]
  lockedItems: CompetitiveItemKey[] // items ที่จะ lock สำหรับ Free member
}

// ข้อมูล % โอกาสสำหรับแสดงให้ผู้เล่นก่อนซื้อ
export interface LootBoxOddsDisplay {
  lootBoxType: LootBoxType
  price: number
  itemCount: number
  odds: { item: CompetitiveItemKey; percent: number }[]
  note?: string
}

// สุ่ม item 1 ชิ้นจาก drop table
function rollFromTable(table: DropEntry[]): CompetitiveItemKey {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * totalWeight

  for (const entry of table) {
    roll -= entry.weight
    if (roll <= 0) return entry.item
  }

  // fallback กรณี floating point
  return table[table.length - 1].item
}

// สุ่ม N ชิ้นจาก drop table (อนุญาตให้ซ้ำได้ — ผู้เล่นสะสมได้หลายชิ้น)
function rollMultiple(table: DropEntry[], count: number): CompetitiveItemKey[] {
  const results: CompetitiveItemKey[] = []
  for (let i = 0; i < count; i++) {
    results.push(rollFromTable(table))
  }
  return results
}

// เปิด Loot Box และคืนผลลัพธ์
export function openLootBox(
  lootBoxType: LootBoxType,
  isVip: boolean
): LootBoxResult {
  let items: CompetitiveItemKey[] = []

  switch (lootBoxType) {
    case 'mystery_pouch': {
      items = rollMultiple(MYSTERY_POUCH_TABLE, 2)
      break
    }

    case 'tacticians_chest': {
      items = rollMultiple(TACTICIANS_CHEST_TABLE, 3)
      break
    }

    case 'grand_vault': {
      // ชิ้นที่ 1-4 ใช้ TACTICIANS_CHEST_TABLE
      const first4 = rollMultiple(TACTICIANS_CHEST_TABLE, 4)

      // ชิ้นที่ 5: 20% Eye of Demon / 80% สุ่มตาม TACTICIANS_CHEST_TABLE
      const fifthItem: CompetitiveItemKey =
        Math.random() < GRAND_VAULT_SPECIAL_EYE_CHANCE
          ? 'super_vision'
          : rollFromTable(TACTICIANS_CHEST_TABLE)

      items = [...first4, fifthItem]
      break
    }
  }

  // ถ้าเป็น Free member → Competitive items ทั้งหมดที่ได้จะเป็น locked
  const lockedItems: CompetitiveItemKey[] = isVip ? [] : [...items]

  return { lootBoxType, items, lockedItems }
}

// คำนวณ % โอกาสจาก drop table สำหรับแสดงให้ผู้เล่นก่อนซื้อ
function calcOdds(table: DropEntry[]): { item: CompetitiveItemKey; percent: number }[] {
  const totalWeight = table.reduce((sum, e) => sum + e.weight, 0)
  return table.map(entry => ({
    item: entry.item,
    percent: Math.round((entry.weight / totalWeight) * 100 * 10) / 10, // ทศนิยม 1 ตำแหน่ง
  }))
}

// ดึงข้อมูล % โอกาสสำหรับแสดงก่อนซื้อ (Transparency Rule)
export function getLootBoxOdds(lootBoxType: LootBoxType): LootBoxOddsDisplay {
  switch (lootBoxType) {
    case 'mystery_pouch':
      return {
        lootBoxType,
        price: LOOT_BOX_PRICES.mystery_pouch,
        itemCount: LOOT_BOX_ITEM_COUNT.mystery_pouch,
        odds: calcOdds(MYSTERY_POUCH_TABLE),
      }

    case 'tacticians_chest':
      return {
        lootBoxType,
        price: LOOT_BOX_PRICES.tacticians_chest,
        itemCount: LOOT_BOX_ITEM_COUNT.tacticians_chest,
        odds: calcOdds(TACTICIANS_CHEST_TABLE),
      }

    case 'grand_vault':
      return {
        lootBoxType,
        price: LOOT_BOX_PRICES.grand_vault,
        itemCount: LOOT_BOX_ITEM_COUNT.grand_vault,
        odds: [
          ...calcOdds(TACTICIANS_CHEST_TABLE).map(o => ({
            ...o,
            // ชิ้นที่ 1-4 odds ปกติ / ชิ้นที่ 5 มีโอกาส Eye of Demon
            percent: o.percent,
          })),
          {
            item: 'super_vision' as CompetitiveItemKey,
            percent: GRAND_VAULT_SPECIAL_EYE_CHANCE * 100, // 20%
          },
        ],
        note: 'Slot 5: 20% chance for Eye of the Demon',
      }
  }
}

// ตรวจสอบว่า Loot Box type ถูกต้อง
export function isValidLootBoxType(value: string): value is LootBoxType {
  return ['mystery_pouch', 'tacticians_chest', 'grand_vault'].includes(value)
}
