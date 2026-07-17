/**
 * foulChecker.test.ts
 * Unit tests สำหรับ Foul Detection
 * ครอบคลุม: Card Count, Pile Ranking, Tie, FoulCheckResult Structure
 *
 * หมายเหตุ: foulChecker ใช้ pile3.slice(0,3) + community.row3 ในการประเมิน
 *
 * TriplePoker — The Sage Unicorn Studio Co., Ltd.
 * Sprint 3 | May 2026
 */

import { Card } from '../../src/game/deck'
import {
  checkFoul,
  PlayerArrangement,
  CommunityCards,
  FoulCheckResult,
} from '../../src/game/foulChecker'

// ─── Helper: สร้าง Card object สั้นๆ ───────────────────────────────────────
const c = (value: number, suit: string): Card => ({ value, suit } as Card)

const S = 'spades'
const H = 'hearts'
const D = 'diamonds'
const C = 'clubs'

// ─── กลุ่ม: Card Count Validation (กฎ 3-3-5) ────────────────────────────────
describe('checkFoul — Card Count (กฎ 3-3-5)', () => {

  // pile1 + row1 = High Card
  // pile2 + row2 = One Pair (33)
  // pile3.slice(0,3) + row3 = Two Pair (77+88)  ← ใช้แค่ 3 ใบแรกของ pile3
  test('Pile 3-3-5 ถูกต้อง → isFoul = false', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],
      pile2: [c(3, S), c(3, H), c(6, D)],
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],   // Pile1 + row1 = High Card
      row2: [c(10, C), c(12, S)],   // Pile2 + row2 = One Pair (33)
      row3: [c(8, C), c(2, H)],     // Pile3[0..2] + row3 = Two Pair (77+88)
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(false)
  })

  // Pile 1 มีไพ่น้อยเกินไป → Foul
  test('Pile 1 มี 2 ใบ (แทน 3) → Foul', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H)],                                 // ❌ 2 ใบ
      pile2: [c(3, S), c(3, H), c(6, D)],
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],
      row2: [c(10, C), c(12, S)],
      row3: [c(8, C), c(2, H)],
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.foulPile).toBe(1)
  })

  // Pile 2 มีไพ่เกิน → Foul
  test('Pile 2 มี 4 ใบ (แทน 3) → Foul', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],
      pile2: [c(3, S), c(3, H), c(6, D), c(14, C)],             // ❌ 4 ใบ
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],
      row2: [c(10, C), c(12, S)],
      row3: [c(8, C), c(2, H)],
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.foulPile).toBe(2)
  })

  // Pile 3 มีไพ่น้อยกว่า 3 ใบ → Foul
  // Patch (2026-07-16): เดิม test นี้เช็คว่า pile3=4 ใบต้อง Foul (สมมติฐานเก่า
  // ที่ยอมรับแค่ 5 หรือ 3 ใบเท่านั้น) — ตาม CLAUDE.md บั๊ก #9 ที่แก้ไปแล้ว
  // pile3 มีได้ 3/5/6 ใบตามจริง (6 ใบกรณีชนะประมูล ก่อน Discard) กติกาจริงคือ
  // "น้อยกว่า 3 ใบ" เท่านั้นถึง Foul — เปลี่ยน test ให้ตรงกับกติกาปัจจุบัน
  test('Pile 3 มีน้อยกว่า 3 ใบ (2 ใบ) → Foul', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],
      pile2: [c(3, S), c(3, H), c(6, D)],
      pile3: [c(7, S), c(7, H)],                                // ❌ 2 ใบ (< 3)
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],
      row2: [c(10, C), c(12, S)],
      row3: [c(8, C), c(2, H)],
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.foulPile).toBe(3)
  })

})

// ─── กลุ่ม: Pile Ranking Validation ─────────────────────────────────────────
describe('checkFoul — Pile Ranking (Pile1 ≤ Pile2 ≤ Pile3)', () => {

  // Pile 1 (Flush) > Pile 2 (One Pair) → Foul
  test('Pile 1 (Flush) > Pile 2 (One Pair) → Foul', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(14, H), c(10, H), c(7, H)],    // + row1 = Flush ❌ (แรงเกิน)
      pile2: [c(3, S), c(3, H), c(6, D)],       // + row2 = One Pair (33)
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],  // Two Pair
    }
    const community: CommunityCards = {
      row1: [c(4, H), c(2, H)],     // Pile1 + row1 = Flush (all hearts) ❌
      row2: [c(10, C), c(12, S)],   // Pile2 + row2 = One Pair (33)
      row3: [c(8, C), c(2, H)],     // Pile3[0..2] + row3 = Two Pair (77+88)
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.foulPile).toBe(1)
  })

  // Pile 2 (Full House) > Pile 3 (Two Pair) → Foul
  test('Pile 2 (Full House) > Pile 3 (Two Pair) → Foul', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],       // + row1 = High Card
      pile2: [c(11, S), c(11, H), c(11, D)],     // + row2 = Full House ❌
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],  // Two Pair
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],   // Pile1 + row1 = High Card
      row2: [c(8, C), c(8, S)],     // Pile2 + row2 = Full House (JJJ+88) ❌
      row3: [c(8, H), c(2, C)],     // Pile3[0..2] + row3 = Two Pair (77+88)
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.foulPile).toBe(2)
  })

})

// ─── กลุ่ม: Tie (เสมอ) → ไม่ถือเป็น Foul ────────────────────────────────────
describe('checkFoul — Tie (เสมอ) → ผ่าน', () => {

  // Pile 1 = Pile 2 → ผ่าน
  test('Pile 1 = Pile 2 (One Pair 77) → isFoul = false', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(7, S), c(7, H), c(2, D)],    // + row1 = One Pair (77)
      pile2: [c(7, D), c(7, C), c(2, S)],    // + row2 = One Pair (77) ← เสมอ
      pile3: [c(11, S), c(11, H), c(11, D), c(4, C), c(5, S)],  // Three of a Kind
    }
    const community: CommunityCards = {
      row1: [c(9, C), c(3, S)],
      row2: [c(9, H), c(3, D)],
      row3: [c(2, C), c(3, C)],   // Pile3[0..2] + row3 = Three of a Kind (JJJ)
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(false)
  })

  // Pile 2 = Pile 3 → ผ่าน
  test('Pile 2 = Pile 3 (One Pair 33) → isFoul = false', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],    // High Card
      pile2: [c(3, S), c(3, H), c(6, D)],    // + row2 = One Pair (33)
      pile3: [c(3, D), c(3, C), c(6, S), c(4, C), c(5, S)],  // One Pair (33) ← เสมอ
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],   // Pile1 = High Card
      row2: [c(10, C), c(12, S)],   // Pile2 = One Pair (33)
      row3: [c(10, H), c(12, D)],   // Pile3[0..2] + row3 = One Pair (33) เสมอ
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(false)
  })

})

// ─── กลุ่ม: Post-Discard (Pile 3 เหลือ 3 ใบ) ────────────────────────────────
describe('checkFoul — Post-Discard (Pile 3 = 3 ใบ)', () => {

  test('Pile 3 เหลือ 3 ใบหลัง Discard → ผ่าน', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],    // High Card
      pile2: [c(3, S), c(3, H), c(6, D)],    // One Pair (33)
      pile3: [c(4, S), c(4, H), c(4, D)],    // ✅ 3 ใบ หลัง Discard
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],   // Pile1 = High Card
      row2: [c(10, C), c(12, S)],   // Pile2 = One Pair (33)
      row3: [c(9, C), c(9, H)],     // Pile3 + row3 = Full House (444+99)
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(false)
  })

})

// ─── กลุ่ม: FoulCheckResult Structure ───────────────────────────────────────
describe('checkFoul — FoulCheckResult Structure', () => {

  test('ผ่าน → isFoul=false, ไม่มี reason, ไม่มี foulPile', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(2, S), c(5, H), c(9, D)],
      pile2: [c(3, S), c(3, H), c(6, D)],
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],
    }
    const community: CommunityCards = {
      row1: [c(11, C), c(13, S)],
      row2: [c(10, C), c(12, S)],
      row3: [c(8, C), c(2, H)],
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(false)
    expect(result.reason).toBeUndefined()
    expect(result.foulPile).toBeUndefined()
  })

  test('Foul → isFoul=true พร้อม reason และ foulPile', () => {
    const arrangement: PlayerArrangement = {
      pile1: [c(14, H), c(10, H), c(7, H)],   // Flush ❌
      pile2: [c(3, S), c(3, H), c(6, D)],
      pile3: [c(7, S), c(7, H), c(8, D), c(4, C), c(5, S)],
    }
    const community: CommunityCards = {
      row1: [c(4, H), c(2, H)],
      row2: [c(10, C), c(12, S)],
      row3: [c(8, C), c(2, C)],
    }
    const result = checkFoul(arrangement, community)
    expect(result.isFoul).toBe(true)
    expect(result.reason).toBeTruthy()
    expect(result.foulPile).toBeDefined()
  })

})
