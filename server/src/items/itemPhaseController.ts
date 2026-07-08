// itemPhaseController.ts
// จัดการสถานะ Enable / Disable / Lock ของ Competitive Items ตาม Game Phase และ Tier
// ข้อมูลอ้างอิงจาก Retention Spec v1.5 §6.2 — HUD Enable/Disable ตาม Phase

// ประเภทของ Game Phase ทั้งหมด
export type GamePhase =
  | 'deal'          // ตอนแจกไพ่ (15 วินาที)
  | 'arrangement'   // ระหว่างจัดกอง
  | 'pile_1_2'      // กอง 1-2 ระหว่างเล่น
  | 'auction'       // Auction Phase (Pro+ เท่านั้น)
  | 'pile_3'        // กอง 3 หลังจัดแล้ว ก่อน Showdown
  | 'showdown'      // Showdown / Grand Finale
  | 'end'           // End of Match

// Tier ของโต๊ะ
export type TableTier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'

// สถานะของ item บน HUD
export type ItemHudState = 'enabled' | 'disabled' | 'locked' | 'empty'

// รายชื่อ Competitive Items ทั้งหมด
export type CompetitiveItemKey =
  | 'vision'          // Oracle's Vision
  | 'auction_veil'    // Shadow Bid
  | 'chrono_shard'    // Time Crystal
  | 'free_sort'       // Free Sort
  | 'alliance_of_fate'
  | 'streak_shield'   // Eternal Streak
  | 'swap'            // The Alchemist's Swap
  | 'auction_peek'    // Thief's Glance
  | 'recall'          // Memory Sigil
  | 'super_vision'    // Eye of the Demon

// ตาราง Enable/Disable ตาม Phase (อ้างอิง Retention Spec §6.2)
// key = phase, value = set ของ item ที่ Enable ใน phase นั้น
const PHASE_ENABLED_MAP: Record<GamePhase, Set<CompetitiveItemKey>> = {
  deal: new Set(['swap', 'chrono_shard']),
  arrangement: new Set(['chrono_shard', 'free_sort']),
  pile_1_2: new Set(['vision', 'chrono_shard', 'auction_veil']),
  auction: new Set(['auction_peek', 'auction_veil', 'chrono_shard']),
  pile_3: new Set(['alliance_of_fate', 'chrono_shard']),
  showdown: new Set(['chrono_shard']),
  end: new Set(),
}

// item ที่ต้องการ Auction Phase → auto-disable เมื่อ Tier = Beginner
const AUCTION_REQUIRED_ITEMS: Set<CompetitiveItemKey> = new Set([
  'auction_veil',
  'auction_peek',
])

// ผลลัพธ์สถานะ item แต่ละตัว
export interface ItemPhaseResult {
  item: CompetitiveItemKey
  state: ItemHudState
  reason?: string // อธิบายเหตุผลที่ disable/lock
}

// สถานะ lock ระดับเกม (Eye of Demon ↔ Thief's Glance)
export interface GameLockState {
  lockedItems: Set<CompetitiveItemKey>
}

// ข้อมูล inventory ของ user สำหรับ item นี้
export interface UserItemInventory {
  item: CompetitiveItemKey
  stock: number       // จำนวนคงเหลือใน inventory
  is_locked: boolean  // locked จาก Loot Box (Free member ยังไม่ VIP)
  usedThisGame: boolean   // ใช้ไปแล้วในเกมนี้ (สำหรับ limit 1/เกม)
  usedThisRound: boolean  // ใช้ไปแล้วในรอบนี้ (สำหรับ limit 1/รอบ)
  lastUsedDate?: string   // ISO date string (สำหรับ limit 1/วัน เช่น Eye of Demon)
}

// คำนวณสถานะของ item เดียวใน phase และ tier ปัจจุบัน
export function getItemHudState(
  item: CompetitiveItemKey,
  phase: GamePhase,
  tier: TableTier,
  inventory: UserItemInventory,
  gameLock: GameLockState,
  today: string // ISO date string YYYY-MM-DD
): ItemPhaseResult {
  // 1. ตรวจสอบ is_locked (Loot Box lock — รอ VIP)
  if (inventory.is_locked) {
    return { item, state: 'locked', reason: 'Upgrade to VIP to use this item' }
  }

  // 2. ตรวจสอบ game lock (Eye of Demon ↔ Thief's Glance)
  if (gameLock.lockedItems.has(item)) {
    return { item, state: 'locked', reason: 'Locked this game' }
  }

  // 3. ตรวจสอบ stock
  if (inventory.stock <= 0) {
    return { item, state: 'empty', reason: 'Stock is 0' }
  }

  // 4. ตรวจสอบ limit 1/เกม
  if (inventory.usedThisGame && isLimitPerGame(item)) {
    return { item, state: 'disabled', reason: 'Already used this game' }
  }

  // 5. ตรวจสอบ limit 1/รอบ
  if (inventory.usedThisRound && isLimitPerRound(item)) {
    return { item, state: 'disabled', reason: 'Already used this round' }
  }

  // 6. ตรวจสอบ limit 1/วัน (Eye of Demon)
  if (item === 'super_vision' && inventory.lastUsedDate === today) {
    return { item, state: 'disabled', reason: 'Already used today' }
  }

  // 7. ตรวจสอบ Beginner Tier → auto-disable Auction-related items
  if (tier === 'initiate' && AUCTION_REQUIRED_ITEMS.has(item)) {
    return { item, state: 'disabled', reason: 'Not available in Beginner tier' }
  }

  // 8. ตรวจสอบ phase
  const enabledInPhase = PHASE_ENABLED_MAP[phase]
  if (!enabledInPhase.has(item)) {
    return { item, state: 'disabled', reason: `Not available in ${phase} phase` }
  }

  // ผ่านทุกเงื่อนไข → enabled
  return { item, state: 'enabled' }
}

// คำนวณสถานะของ item ทั้งหมด 10 ตัวพร้อมกัน
export function getAllItemHudStates(
  phase: GamePhase,
  tier: TableTier,
  inventories: UserItemInventory[],
  gameLock: GameLockState,
  today: string
): ItemPhaseResult[] {
  const inventoryMap = new Map(inventories.map(inv => [inv.item, inv]))

  const allItems: CompetitiveItemKey[] = [
    'vision', 'auction_veil', 'chrono_shard', 'free_sort',
    'alliance_of_fate', 'streak_shield', 'swap',
    'auction_peek', 'recall', 'super_vision',
  ]

  return allItems.map(item => {
    const inv = inventoryMap.get(item) ?? {
      item,
      stock: 0,
      is_locked: false,
      usedThisGame: false,
      usedThisRound: false,
    }
    return getItemHudState(item, phase, tier, inv, gameLock, today)
  })
}

// สร้าง GameLockState เริ่มต้น (ไม่มีอะไร lock)
export function createGameLockState(): GameLockState {
  return { lockedItems: new Set() }
}

// Apply lock เมื่อ Eye of Demon หรือ Thief's Glance ถูกใช้
// ทั้งคู่ lock ซึ่งกันและกัน
export function applyMutualLock(
  usedItem: 'super_vision' | 'auction_peek',
  gameLock: GameLockState
): GameLockState {
  const newLocked = new Set(gameLock.lockedItems)
  if (usedItem === 'super_vision') {
    newLocked.add('auction_peek')
  } else {
    newLocked.add('super_vision')
  }
  return { lockedItems: newLocked }
}

// ตรวจสอบว่า item นี้มี limit 1/เกม หรือไม่
function isLimitPerGame(item: CompetitiveItemKey): boolean {
  const limitPerGame: Set<CompetitiveItemKey> = new Set([
    'alliance_of_fate',
    'swap',
    'auction_peek',
    'recall',
    'super_vision',
    'chrono_shard',
  ])
  return limitPerGame.has(item)
}

// ตรวจสอบว่า item นี้มี limit 1/รอบ หรือไม่
function isLimitPerRound(item: CompetitiveItemKey): boolean {
  const limitPerRound: Set<CompetitiveItemKey> = new Set([
    'vision',
    'auction_veil',
  ])
  return limitPerRound.has(item)
}

// คำนวณราคา Free Sort ตาม Tier
export function getFreeSortPrice(tier: TableTier): number {
  switch (tier) {
    case 'initiate':  return 15
    case 'mastermind':       return 40
    case 'highNoble':
    case 'last_boss': return 80
  }
}
