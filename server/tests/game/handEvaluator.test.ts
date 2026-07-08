/**
 * handEvaluator.test.ts
 * Unit tests สำหรับ Hand Rank Evaluation
 * ครอบคลุม: 10 Hand Ranks, Community Card Combination, Tie-breaking
 *
 * TriplePoker — The Sage Unicorn Studio Co., Ltd.
 * Sprint 3 | May 2026
 */

import { Card } from '../../src/game/deck'
import { evaluateHand, compareHands } from '../../src/game/handEvaluator'

// ─── Helper: สร้าง Card object สั้นๆ ───────────────────────────────────────
const c = (value: number, suit: string): Card => ({ value, suit } as Card)

const S = 'spades'
const H = 'hearts'
const D = 'diamonds'
const C = 'clubs'

// ─── กลุ่ม: Hand Rank 10 ระดับ ───────────────────────────────────────────────
describe('evaluateHand — Hand Rank 10 ระดับ', () => {

  test('Royal Flush', () => {
    const hand: Card[] = [c(14, S), c(13, S), c(12, S), c(11, S), c(10, S)]
    expect(evaluateHand(hand).rank).toBe('royal_flush')
  })

  test('Straight Flush', () => {
    const hand: Card[] = [c(9, H), c(8, H), c(7, H), c(6, H), c(5, H)]
    expect(evaluateHand(hand).rank).toBe('straight_flush')
  })

  test('Four of a Kind', () => {
    const hand: Card[] = [c(8, S), c(8, H), c(8, D), c(8, C), c(2, S)]
    expect(evaluateHand(hand).rank).toBe('four_of_a_kind')
  })

  test('Full House', () => {
    const hand: Card[] = [c(7, S), c(7, H), c(7, D), c(3, C), c(3, S)]
    expect(evaluateHand(hand).rank).toBe('full_house')
  })

  test('Flush', () => {
    const hand: Card[] = [c(14, C), c(10, C), c(7, C), c(4, C), c(2, C)]
    expect(evaluateHand(hand).rank).toBe('flush')
  })

  test('Straight', () => {
    const hand: Card[] = [c(10, S), c(9, H), c(8, D), c(7, C), c(6, S)]
    expect(evaluateHand(hand).rank).toBe('straight')
  })

  test('Three of a Kind', () => {
    const hand: Card[] = [c(6, S), c(6, H), c(6, D), c(9, C), c(2, S)]
    expect(evaluateHand(hand).rank).toBe('three_of_a_kind')
  })

  test('Two Pair', () => {
    const hand: Card[] = [c(11, S), c(11, H), c(5, D), c(5, C), c(9, S)]
    expect(evaluateHand(hand).rank).toBe('two_pair')
  })

  test('One Pair', () => {
    const hand: Card[] = [c(13, S), c(13, H), c(10, D), c(7, C), c(2, S)]
    expect(evaluateHand(hand).rank).toBe('one_pair')
  })

  test('High Card', () => {
    const hand: Card[] = [c(14, S), c(10, H), c(7, D), c(4, C), c(2, S)]
    expect(evaluateHand(hand).rank).toBe('high_card')
  })

})

// ─── กลุ่ม: ป้องกัน False Positive ─────────────────────────────────────────
describe('evaluateHand — ป้องกัน False Positive', () => {

  test('Flush ≠ Straight Flush เมื่อไม่เรียง', () => {
    const hand: Card[] = [c(14, H), c(10, H), c(7, H), c(4, H), c(2, H)]
    expect(evaluateHand(hand).rank).toBe('flush')
    expect(evaluateHand(hand).rank).not.toBe('straight_flush')
  })

  test('Straight ≠ Flush เมื่อต่างดอก', () => {
    const hand: Card[] = [c(9, S), c(8, H), c(7, D), c(6, C), c(5, S)]
    expect(evaluateHand(hand).rank).toBe('straight')
    expect(evaluateHand(hand).rank).not.toBe('flush')
  })

  test('Full House ≠ Three of a Kind', () => {
    const hand: Card[] = [c(4, S), c(4, H), c(4, D), c(9, C), c(9, S)]
    expect(evaluateHand(hand).rank).toBe('full_house')
    expect(evaluateHand(hand).rank).not.toBe('three_of_a_kind')
  })

})

// ─── กลุ่ม: Community Cards Combination ─────────────────────────────────────
describe('evaluateHand — รวม Community Cards (3 + 2 = 5 ใบ)', () => {

  test('Pile 3 ใบ + Community 2 ใบ → Full House', () => {
    // K♠ K♥ 7♦ + K♣ 7♠ = Full House (KKK + 77)
    const combined: Card[] = [c(13, S), c(13, H), c(7, D), c(13, C), c(7, S)]
    expect(evaluateHand(combined).rank).toBe('full_house')
  })

  test('Pile 3 ใบ + Community 2 ใบ → Flush', () => {
    // A♣ 5♣ 3♣ + 9♣ 2♣ = Flush
    const combined: Card[] = [c(14, C), c(5, C), c(3, C), c(9, C), c(2, C)]
    expect(evaluateHand(combined).rank).toBe('flush')
  })

  test('Community ช่วยให้ได้ Straight', () => {
    // 6♠ 7♥ 8♦ + 9♣ 10♠ = Straight
    const combined: Card[] = [c(6, S), c(7, H), c(8, D), c(9, C), c(10, S)]
    expect(evaluateHand(combined).rank).toBe('straight')
  })

  test('Community ไม่ช่วย → High Card', () => {
    // 2♠ 5♥ 9♦ + J♣ K♠ = High Card
    const combined: Card[] = [c(2, S), c(5, H), c(9, D), c(11, C), c(13, S)]
    expect(evaluateHand(combined).rank).toBe('high_card')
  })

})

// ─── กลุ่ม: Tie-breaking ────────────────────────────────────────────────────
describe('compareHands — Tie-breaking', () => {

  test('One Pair: Pair A > Pair K', () => {
    const pairAces = evaluateHand([c(14, S), c(14, H), c(9, D), c(6, C), c(2, S)])
    const pairKings = evaluateHand([c(13, S), c(13, H), c(9, D), c(6, C), c(2, S)])
    expect(compareHands(pairAces, pairKings)).toBeGreaterThan(0)
  })

  test('One Pair: Pair K + Kicker A > Pair K + Kicker Q', () => {
    const pairKickA = evaluateHand([c(13, S), c(13, H), c(14, D), c(6, C), c(2, S)])
    const pairKickQ = evaluateHand([c(13, D), c(13, C), c(12, D), c(6, S), c(2, H)])
    expect(compareHands(pairKickA, pairKickQ)).toBeGreaterThan(0)
  })

  test('High Card: A-high > K-high', () => {
    const aceHigh = evaluateHand([c(14, S), c(9, H), c(7, D), c(4, C), c(2, S)])
    const kingHigh = evaluateHand([c(13, S), c(9, H), c(7, D), c(4, C), c(2, S)])
    expect(compareHands(aceHigh, kingHigh)).toBeGreaterThan(0)
  })

  test('Two Pair: A+K > A+Q', () => {
    const twoPairAK = evaluateHand([c(14, S), c(14, H), c(13, D), c(13, C), c(2, S)])
    const twoPairAQ = evaluateHand([c(14, D), c(14, C), c(12, S), c(12, H), c(2, D)])
    expect(compareHands(twoPairAK, twoPairAQ)).toBeGreaterThan(0)
  })

  test('Four of a Kind: Aces > Kings', () => {
    const fourAces = evaluateHand([c(14, S), c(14, H), c(14, D), c(14, C), c(2, S)])
    const fourKings = evaluateHand([c(13, S), c(13, H), c(13, D), c(13, C), c(2, S)])
    expect(compareHands(fourAces, fourKings)).toBeGreaterThan(0)
  })

  test('มือเท่ากันสมบูรณ์ → 0 (Tie)', () => {
    const hand1 = evaluateHand([c(10, S), c(10, H), c(9, D), c(6, C), c(2, S)])
    const hand2 = evaluateHand([c(10, D), c(10, C), c(9, S), c(6, H), c(2, D)])
    expect(compareHands(hand1, hand2)).toBe(0)
  })

  test('Straight Flush > Four of a Kind', () => {
    const sf = evaluateHand([c(9, S), c(8, S), c(7, S), c(6, S), c(5, S)])
    const foak = evaluateHand([c(14, S), c(14, H), c(14, D), c(14, C), c(2, H)])
    expect(compareHands(sf, foak)).toBeGreaterThan(0)
  })

})
