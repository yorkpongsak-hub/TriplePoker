// ประเมิน Hand Rank โป๊กเกอร์มาตรฐาน (5 ใบ)
import { Card } from './deck'

export type HandRank =
  | 'royal_flush'
  | 'straight_flush'
  | 'four_of_a_kind'
  | 'full_house'
  | 'flush'
  | 'straight'
  | 'three_of_a_kind'
  | 'two_pair'
  | 'one_pair'
  | 'high_card'

export interface HandResult {
  rank: HandRank
  score: number       // ใช้เปรียบเทียบ hand เดียวกัน
  rankIndex: number   // 9=royal_flush, 0=high_card
}

const HAND_RANK_INDEX: Record<HandRank, number> = {
  royal_flush: 9,
  straight_flush: 8,
  four_of_a_kind: 7,
  full_house: 6,
  flush: 5,
  straight: 4,
  three_of_a_kind: 3,
  two_pair: 2,
  one_pair: 1,
  high_card: 0,
}

// ประเมิน hand จาก 5 ใบ
export function evaluateHand(cards: Card[]): HandResult {
  const values = cards.map(c => c.value).sort((a, b) => b - a)
  const suits = cards.map(c => c.suit)
  const isFlush = suits.every(s => s === suits[0])
  const isStraight = checkStraight(values)

  // นับจำนวนไพ่ที่ค่าเหมือนกัน
  const counts = countValues(values)
  const countValues2 = Object.values(counts).sort((a, b) => b - a)

  let rank: HandRank
  const sortedUniq = [...new Set(values)].sort((a, b) => b - a)
  const isRoyal = isFlush && isStraight &&
    sortedUniq.includes(14) && sortedUniq.includes(13) &&
    sortedUniq.includes(12) && sortedUniq.includes(11) && sortedUniq.includes(10)
  if (isRoyal) {
    rank = 'royal_flush'
  } else if (isFlush && isStraight) {
    rank = 'straight_flush'
  } else if (countValues2[0] === 4) {
    rank = 'four_of_a_kind'
  } else if (countValues2[0] === 3 && countValues2[1] === 2) {
    rank = 'full_house'
  } else if (isFlush) {
    rank = 'flush'
  } else if (isStraight) {
    rank = 'straight'
  } else if (countValues2[0] === 3) {
    rank = 'three_of_a_kind'
  } else if (countValues2[0] === 2 && countValues2[1] === 2) {
    rank = 'two_pair'
  } else if (countValues2[0] === 2) {
    rank = 'one_pair'
  } else {
    rank = 'high_card'
  }

  return {
    rank,
    rankIndex: HAND_RANK_INDEX[rank],
    score: calculateScore(rank, values),
  }
}

// เช็ค Straight
function checkStraight(values: number[]): boolean {
  const uniq = [...new Set(values)].sort((a, b) => b - a)
  // sliding window 5 ใบ
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) return true
  }
  // Ace-low: A-2-3-4-5
  if (uniq.includes(14) && uniq.includes(2) && uniq.includes(3) && uniq.includes(4) && uniq.includes(5)) return true
  return false
}

// นับจำนวนไพ่ที่ค่าเหมือนกัน
function countValues(values: number[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1
  }
  return counts
}

// คำนวณ score สำหรับเปรียบเทียบ
function calculateScore(rank: HandRank, values: number[]): number {
  // จัดลำดับ values ให้ถูกต้องตาม rank
  // ไพ่ที่มีความถี่สูงกว่าต้องมาก่อน (pair, trips, quads) แล้วค่อย kicker
  const counts: Record<number, number> = {}
  for (const v of values) counts[v] = (counts[v] || 0) + 1

  const sorted = [...values].sort((a, b) => {
    const freqDiff = (counts[b] || 0) - (counts[a] || 0)
    if (freqDiff !== 0) return freqDiff  // เรียงตาม frequency ก่อน
    return b - a  // frequency เท่ากัน → เรียงตาม value
  })

  return HAND_RANK_INDEX[rank] * 100000000000 + sorted.reduce((acc, v, i) => acc + v * Math.pow(100, 4 - i), 0)
}

// เปรียบเทียบ 2 hand — บวก=hand1 ชนะ, ลบ=hand2 ชนะ, 0=เสมอ
export function compareHands(hand1: HandResult, hand2: HandResult): number {
  // เปรียบ rankIndex ก่อน (9=royal_flush, 0=high_card)
  if (hand1.rankIndex !== hand2.rankIndex) {
    return hand1.rankIndex - hand2.rankIndex
  }
  // rank เท่ากัน → เปรียบ score (ที่รวม kicker แล้ว)
  return hand1.score - hand2.score
}

export function handRankLabel(hand: HandResult): string {
  const labels: Record<string, string> = {
    royal_flush:    'Royal Flush',
    straight_flush: 'Straight Flush',
    four_of_a_kind: 'Four of a Kind',
    full_house:     'Full House',
    flush:          'Flush',
    straight:       'Straight',
    three_of_a_kind:'Three of a Kind',
    two_pair:       'Two Pair',
    one_pair:       'One Pair',
    high_card:      'High Card',
  }
  return labels[hand.rank] ?? hand.rank
}
