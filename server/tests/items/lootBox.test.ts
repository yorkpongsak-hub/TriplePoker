// lootBox.test.ts
// Test suite สำหรับ Loot Box Randomization Engine
// ครอบคลุม: item count · is_locked สำหรับ Free member · VIP ไม่ lock · odds display · Grand Vault
// Target: 10 test cases

import {
  openLootBox,
  getLootBoxOdds,
  isValidLootBoxType,
  LOOT_BOX_PRICES,
  LOOT_BOX_ITEM_COUNT,
  MYSTERY_POUCH_TABLE,
  TACTICIANS_CHEST_TABLE,
  LootBoxType,
} from '../../src/items/lootBox'

// ────────────────────────────────────────────────────────────
// GROUP 1: openLootBox — Item Count (3 cases)
// ────────────────────────────────────────────────────────────

describe('lootBox — openLootBox item count', () => {

  // Case 1: Mystery Pouch คืน 2 items
  test('Case 1: Mystery Pouch returns exactly 2 items', () => {
    const result = openLootBox('mystery_pouch', true)
    expect(result.items).toHaveLength(2)
    expect(result.lootBoxType).toBe('mystery_pouch')
  })

  // Case 2: Tactician's Chest คืน 3 items
  test('Case 2: Tactician\'s Chest returns exactly 3 items', () => {
    const result = openLootBox('tacticians_chest', true)
    expect(result.items).toHaveLength(3)
  })

  // Case 3: Grand Vault คืน 5 items
  test('Case 3: Grand Vault returns exactly 5 items', () => {
    const result = openLootBox('grand_vault', true)
    expect(result.items).toHaveLength(5)
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 2: is_locked Logic — Free vs VIP (3 cases)
// ────────────────────────────────────────────────────────────

describe('lootBox — is_locked logic', () => {

  // Case 4: Free member → lockedItems = items ทั้งหมด (Competitive ทุกชิ้น)
  test('Case 4: Free member gets all items locked', () => {
    const result = openLootBox('mystery_pouch', false)
    expect(result.lockedItems).toHaveLength(result.items.length)
    result.items.forEach(item => {
      expect(result.lockedItems).toContain(item)
    })
  })

  // Case 5: VIP member → lockedItems = empty array
  test('Case 5: VIP member gets no locked items', () => {
    const result = openLootBox('mystery_pouch', true)
    expect(result.lockedItems).toHaveLength(0)
  })

  // Case 6: Grand Vault — Free member → locked ทั้ง 5 ชิ้น
  test('Case 6: Grand Vault Free member locks all 5 items', () => {
    const result = openLootBox('grand_vault', false)
    expect(result.lockedItems).toHaveLength(5)
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 3: Drop Table Validity (2 cases)
// ────────────────────────────────────────────────────────────

describe('lootBox — drop table validity', () => {

  // Case 7: Mystery Pouch drop table weight รวมต้องได้ 100
  test('Case 7: Mystery Pouch table weights sum to 100', () => {
    const total = MYSTERY_POUCH_TABLE.reduce((sum, e) => sum + e.weight, 0)
    expect(total).toBe(100)
  })

  // Case 8: Tactician's Chest drop table weight รวมต้องได้ 100
  test('Case 8: Tactician\'s Chest table weights sum to 100', () => {
    const total = TACTICIANS_CHEST_TABLE.reduce((sum, e) => sum + e.weight, 0)
    expect(total).toBe(100)
  })

})

// ────────────────────────────────────────────────────────────
// GROUP 4: getLootBoxOdds + Helpers (2 cases)
// ────────────────────────────────────────────────────────────

describe('lootBox — odds display และ helpers', () => {

  // Case 9: getLootBoxOdds คืน price, itemCount, odds array ถูกต้อง
  test('Case 9: getLootBoxOdds returns correct price and item count', () => {
    const types: LootBoxType[] = ['mystery_pouch', 'tacticians_chest', 'grand_vault']
    types.forEach(type => {
      const odds = getLootBoxOdds(type)
      expect(odds.price).toBe(LOOT_BOX_PRICES[type])
      expect(odds.itemCount).toBe(LOOT_BOX_ITEM_COUNT[type])
      expect(Array.isArray(odds.odds)).toBe(true)
      expect(odds.odds.length).toBeGreaterThan(0)
    })
  })

  // Case 10: isValidLootBoxType ตรวจสอบถูกต้อง
  test('Case 10: isValidLootBoxType validates correctly', () => {
    expect(isValidLootBoxType('mystery_pouch')).toBe(true)
    expect(isValidLootBoxType('tacticians_chest')).toBe(true)
    expect(isValidLootBoxType('grand_vault')).toBe(true)
    expect(isValidLootBoxType('unknown_box')).toBe(false)
    expect(isValidLootBoxType('')).toBe(false)
  })

})
