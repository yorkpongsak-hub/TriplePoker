// ============================================================
// monarchAI.ts — Monarch Adaptive Personality Lock (Monarch_Spec_v1_3 §1)
// ล็อคบุคลิกตาม Hand Strength ทันทีที่แจกไพ่เสร็จ (Round 1 เท่านั้น) แล้วคงไว้ทั้งแมตช์
// ไม่มี logic การตัดสินใจเอง — delegate ทุกอย่าง (arrangement/auction/grand finale) ไปยัง
// personality logic ของจตุรเทพที่มีอยู่แล้วใน aiEngine.ts ผ่าน AIPersonality ปกติ
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Card } from './deck'
import { CommunityCards } from './foulChecker'
import { evaluateHand } from './handEvaluator'
import { aiDecideArrangement, AIPersonality, AIConfig } from './aiEngine'
import { gameConfig } from '../config/gameConfig'

// ใช้ personality 'cortex' (balanced weight w1:2 w2:3 w3:4) เป็น probe กลางๆ เพื่อวัดฝีมือไพ่จริง
// ไม่ผูกกับ personality ใดโดยเฉพาะ — ผลลัพธ์ arrangement จาก probe นี้ถูกทิ้ง ใช้แค่วัด strength
const PROBE_CONFIG: AIConfig = { id: 'MONARCH_PROBE', name: 'Monarch', emoji: '👑', personality: 'cortex' }

// ประเมินความแข็งของไพ่ Monarch เป็นค่า 0-1 จากผลรวม rankIndex (0-9 ต่อกอง) ของ 3 กอง หาร 27
export function evaluateMonarchHandStrength(cards: Card[], community: CommunityCards): number {
  const arr = aiDecideArrangement(PROBE_CONFIG, cards, community, 1, 'highNoble', 0)
  const h1 = evaluateHand([...arr.pile1, ...community.row1])
  const h2 = evaluateHand([...arr.pile2, ...community.row2])
  const h3 = evaluateHand([...arr.pile3.slice(0, 3), ...community.row3])
  return (h1.rankIndex + h2.rankIndex + h3.rankIndex) / 27
}

// ล็อคบุคลิกของ Monarch ตาม hand strength — เรียกครั้งเดียวตอน Round 1 แจกไพ่เสร็จเท่านั้น
// แข็งมาก → cortex | แข็งปานกลาง → reaper | ปานกลางค่อนอ่อน → crag | อ่อน → cipher
export function lockMonarchPersonality(cards: Card[], community: CommunityCards): AIPersonality {
  const strength = evaluateMonarchHandStrength(cards, community)
  const q = gameConfig.monarchConfig.handStrengthQuartile
  if (strength >= q.veryStrong) return 'cortex'
  if (strength >= q.medium) return 'reaper'
  if (strength >= q.mediumWeak) return 'crag'
  return 'cipher'
}
