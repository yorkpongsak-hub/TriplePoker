import { gameConfig } from '../../config/gameConfig'
import { ArenaHandResult } from '../joker/wildHandEvaluator'

export type ArenaPersonality = 'reaper' | 'cortex' | 'crag' | 'cipher'

// ตรงกับ tierSEconomyConfig.auctionBidOptionsCrest ตัดตัว 0 ออก (0 = ไม่ประมูลรอบนี้ แยกจัดการโดย willBid)
const NONZERO_BID_LEVELS = [3, 6, 9, 12] as const

// พอร์ตจาก server/src/game/gameLoop.ts:876-940 (Four Gods willBid%/level ตอน Blind/Face-up Auction ของ High Noble)
// แปล level index (0-3) ของ bidLevels 4 ระดับเดิม มาเป็นค่า Crest ตรงตัวของ Arena
export function arenaAuctionBid(personality: ArenaPersonality, random: () => number = Math.random): 0 | 3 | 6 | 9 | 12 {
  const levels = NONZERO_BID_LEVELS
  switch (personality) {
    case 'reaper': // ดุที่สุด — ประมูลแทบทุกครั้งด้วยราคาสูงสุด
      return random() < 0.9 ? levels[levels.length - 1] : 0
    case 'crag': { // ป้องกันแน่น — ประมูลบ่อย ราคาระดับกลาง-สูง
      if (random() >= 0.75) return 0
      const level = Math.min(levels.length - 1, Math.floor(levels.length * 0.6) + Math.floor(random() * 2))
      return levels[level]
    }
    case 'cortex': { // คำนวณ EV เย็นชา — bid แค่พอประมาณ
      if (random() >= 0.6) return 0
      const level = Math.floor(random() * Math.ceil(levels.length / 2))
      return levels[level]
    }
    case 'cipher': // คาดเดาไม่ได้ — สุดขั้ว (ต่ำสุดหรือสูงสุด)
    default:
      if (random() >= 0.7) return 0
      return random() < 0.5 ? levels[0] : levels[levels.length - 1]
  }
}

// พอร์ตจาก gameLoop.ts:1646-1650 — rankIndex ของ evaluateArenaHand แปลงเป็น winrate เบื้องต้น
export function estimateArenaWinrate(hand: ArenaHandResult): number {
  if (hand.rankIndex >= 3) return 0.99
  if (hand.rankIndex === 2) return 0.90
  if (hand.rankIndex === 1) return 0.80
  return 0.40
}

// พอร์ตจาก gameLoop.ts:1656-1668 (bias ของแต่ละบุคลิกทับ winrate พื้นฐาน)
export function arenaGfDecision(personality: ArenaPersonality, winrate: number, random: () => number = Math.random): 'CALL' | 'FOLD' {
  switch (personality) {
    case 'reaper': // ดุที่สุด — bias +0.20 ให้ Call ง่ายขึ้น
      return random() < Math.min(0.99, winrate + 0.20) ? 'CALL' : 'FOLD'
    case 'crag': // ป้องกันแน่น — bias -0.15 ให้ Fold ง่ายขึ้น
      return random() < Math.max(0.05, winrate - 0.15) ? 'CALL' : 'FOLD'
    case 'cortex': // คำนวณเย็นชา — deterministic ไม่มี randomness
      return winrate >= 0.5 ? 'CALL' : 'FOLD'
    case 'cipher': // คาดเดาไม่ได้ — 30% เมิน winrate สุ่มล้วน ที่เหลือใช้ winrate ตรงๆ
    default:
      if (random() < 0.3) return random() < 0.5 ? 'CALL' : 'FOLD'
      return random() < winrate ? 'CALL' : 'FOLD'
  }
}

// ไม่มีต้นแบบจาก Tier ล่าง (ไม่มี Joker) — ออกแบบใหม่ตามบุคลิกเดิม: reaper บุก เลือก ANTE_X2 ถ้าจ่ายไหว,
// crag ระวังตัวเสมอเลือก WILD ปลอดภัย, cortex เลือก ANTE_X2 เฉพาะตอน EV คุ้ม (winrate เป้าหมาย >= 0.6),
// cipher สุ่ม 50/50 — targetPile ล็อกที่ 3 เสมอ ตรงกับ UI ของผู้เล่นจริงเองที่มีแค่ปุ่ม "…P3" เท่านั้น
export function arenaJokerDecision(
  personality: ArenaPersonality,
  availableCrest: number,
  requiredCrest: number,
  targetPileWinrate: number,
  random: () => number = Math.random,
): { mode: 'WILD' | 'ANTE_X2'; targetPile: 1 | 2 | 3 } {
  const canAffordX2 = availableCrest >= requiredCrest
  const targetPile = 3 as const
  switch (personality) {
    case 'reaper': return { mode: canAffordX2 ? 'ANTE_X2' : 'WILD', targetPile }
    case 'crag': return { mode: 'WILD', targetPile }
    case 'cortex': return { mode: canAffordX2 && targetPileWinrate >= 0.6 ? 'ANTE_X2' : 'WILD', targetPile }
    case 'cipher':
    default: return { mode: canAffordX2 && random() < 0.5 ? 'ANTE_X2' : 'WILD', targetPile }
  }
}

// พอร์ตจาก server/src/game/monarchEngine.ts:313-319 — ใช้ gameConfig.monarchConfig.handStrengthQuartile
// ตัวเดียวกับของเดิม (single source of truth ไม่ duplicate ตัวเลข) mapping เดียวกันเป๊ะ
export function lockArenaBossPersonality(strength: number): ArenaPersonality {
  const q = gameConfig.monarchConfig.handStrengthQuartile
  if (strength >= q.veryStrong) return 'cortex'
  if (strength >= q.medium) return 'reaper'
  if (strength >= q.mediumWeak) return 'crag'
  return 'cipher'
}
