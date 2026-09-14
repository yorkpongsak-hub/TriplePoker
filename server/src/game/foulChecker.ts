// ตรวจสอบ Foul ตาม spec
import { Card } from './deck'
import { evaluateBestFive, evaluateHand, compareHands } from './handEvaluator'

export interface PlayerArrangement {
  pile1: Card[]   // 3 ใบ
  pile2: Card[]   // 3 ใบ
  pile3: Card[]   // 5 ใบ (ก่อน Discard)
}

export interface CommunityCards {
  row1: Card[]    // 2 ใบ Community สำหรับ Pile 1
  row2: Card[]    // 2 ใบ Community สำหรับ Pile 2
  row3: Card[]    // 2 ใบ Community สำหรับ Pile 3
}

export interface FoulCheckResult {
  isFoul: boolean
  reason?: string
  foulPile?: 1 | 2 | 3
}

// ตรวจ Foul หลัก
export function checkFoul(
  arrangement: PlayerArrangement,
  community: CommunityCards
): FoulCheckResult {

  // ตรวจจำนวนใบ
  if (arrangement.pile1.length !== 3) {
    return { isFoul: true, reason: 'Pile 1 must have 3 cards', foulPile: 1 }
  }
  if (arrangement.pile2.length !== 3) {
    return { isFoul: true, reason: 'Pile 2 must have 3 cards', foulPile: 2 }
  }
  // Patch (บั๊กแก้) High Noble: pile3 อาจมี 5 หรือ 6 ใบ (ก่อน Discard ขึ้นกับว่าได้ไพ่ประมูลหรือไม่) หรือ 3 ใบ (หลัง Discard)
  // เดิม hardcode รับแค่ 5 หรือ 3 ทำให้ AI ที่ชนะประมูล (pile3=6) โดน mark ฟาวล์ผิดทุกครั้ง
  if (arrangement.pile3.length < 3) {
    return { isFoul: true, reason: 'Pile 3 must have at least 3 cards', foulPile: 3 }
  }

  // รวม Community Cards ก่อนประเมิน
  const hand1 = evaluateHand([...arrangement.pile1, ...community.row1])
  const hand2 = evaluateHand([...arrangement.pile2, ...community.row2])
  const hand3 = evaluateHand([...arrangement.pile3.slice(0, 3), ...community.row3])

  // ตรวจ Pile Ranking: pile1 <= pile2 <= pile3
  if (compareHands(hand1, hand2) > 0) {
    return { isFoul: true, reason: 'Pile 1 cannot be stronger than Pile 2', foulPile: 1 }
  }
  if (compareHands(hand2, hand3) > 0) {
    return { isFoul: true, reason: 'Pile 2 cannot be stronger than Pile 3', foulPile: 2 }
  }

  return { isFoul: false }
}

/** Tier C keeps all 3-3-5 arranged cards; G3 is evaluated as Best 5 of 7. */
export function checkTierCFoul(arrangement: PlayerArrangement, community: CommunityCards): FoulCheckResult {
  if (arrangement.pile1.length !== 3) return { isFoul: true, reason: 'Pile 1 must have 3 cards', foulPile: 1 }
  if (arrangement.pile2.length !== 3) return { isFoul: true, reason: 'Pile 2 must have 3 cards', foulPile: 2 }
  if (arrangement.pile3.length !== 5) return { isFoul: true, reason: 'Pile 3 must have 5 cards', foulPile: 3 }
  if (community.row1.length !== 2 || community.row2.length !== 2 || community.row3.length !== 2) {
    return { isFoul: true, reason: 'Each community row must have 2 cards' }
  }
  const hand1=evaluateHand([...arrangement.pile1,...community.row1])
  const hand2=evaluateHand([...arrangement.pile2,...community.row2])
  const hand3=evaluateBestFive([...arrangement.pile3,...community.row3])
  if(compareHands(hand1,hand2)>0)return {isFoul:true,reason:'Pile 1 cannot be stronger than Pile 2',foulPile:1}
  if(compareHands(hand2,hand3)>0)return {isFoul:true,reason:'Pile 2 cannot be stronger than Pile 3',foulPile:2}
  return {isFoul:false}
}
