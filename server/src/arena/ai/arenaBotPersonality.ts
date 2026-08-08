import { gameConfig } from '../../config/gameConfig'
import { ArenaHandResult } from '../joker/wildHandEvaluator'

export type ArenaPersonality =
  | 'reaper' | 'cortex' | 'crag' | 'cipher'
  // Nine Sentinels (พอร์ตจาก Mastermind Conquest — ใช้เป็นตัวเติมที่นั่ง FILL แทน ARENA_MINION ทั่วไป)
  | 'iron_wall' | 'chivalry' | 'war_lord' | 'phantom' | 'dark_shark' | 'oracle' | 'jester' | 'phoenix' | 'black_magic'

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
    // ── Nine Sentinels — พอร์ตจาก gameLoop.ts:896-934 (willBid%/level ตอน Blind/Face-up Auction ของ
    // Mastermind Conquest) bidLevels.length=4 ที่นั่นตรงกับ levels.length=4 ที่นี่พอดี map index ตรงตัวได้เลย
    case 'iron_wall': // ต่ำ-กลาง ระมัดระวัง
      return random() >= 0.5 ? 0 : levels[Math.floor(random() * 2)]
    case 'chivalry': // กลาง สม่ำเสมอ — level คงที่
      return random() < 0.65 ? levels[2] : 0
    case 'war_lord': // สูง บุกไม่หยุด
      return random() < 0.95 ? levels[levels.length - 1] : 0
    case 'phantom': // กลาง variance สูง — สุ่มเต็ม range
      return random() < 0.6 ? levels[Math.floor(random() * levels.length)] : 0
    case 'dark_shark': // สูงสุดในกลุ่ม — ประมูลทุกครั้งด้วยราคาสูงสุด
      return levels[levels.length - 1]
    case 'oracle': // ตาม EV คำนวณ — deterministic ไม่มี randomness เลย
      return levels[Math.max(0, Math.ceil(levels.length * 0.65) - 1)]
    case 'phoenix': // กลาง-สูง คงที่ — level คงที่
      return random() < 0.8 ? levels[Math.floor(levels.length * 0.7)] : 0
    case 'black_magic': // กลาง ปรับตาม pot size ในต้นฉบับ — Arena ไม่มีสเกล token balance หลักพันแบบ
      // Tier ล่างให้เทียบ (Crest ทั้งแมตช์ ~228) เลยลดรูปเป็น level กลางคงที่แทนการปรับตามยอดเงิน
      return random() < 0.65 ? levels[2] : 0
    case 'jester': // สุ่มทุกครั้ง — สุ่มกว้างกว่า Cipher (เต็ม range ไม่ใช่แค่หัว-ท้าย)
      return random() < 0.7 ? levels[Math.floor(random() * levels.length)] : 0
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
    // ── Nine Sentinels — พอร์ตจาก gameLoop.ts:1669-1691 (threshold canon จาก MasterPlan v1.1 ห้ามแก้ค่า)
    case 'iron_wall': // Fold ถ้า winrate < 60%
      return winrate >= 0.6 ? 'CALL' : 'FOLD'
    case 'chivalry': // Call ที่ winrate >= 50%
      return winrate >= 0.5 ? 'CALL' : 'FOLD'
    case 'war_lord': // Call แม้ winrate ~35% — บุกไม่หยุด
      return winrate >= 0.35 ? 'CALL' : 'FOLD'
    case 'phantom': // 40% บลัฟล้วน + 60% ใช้ winrate ตรงๆ
      if (random() < 0.4) return random() < 0.5 ? 'CALL' : 'FOLD'
      return winrate >= 0.5 ? 'CALL' : 'FOLD'
    case 'dark_shark': // Call ที่ winrate >= 50%
      return winrate >= 0.5 ? 'CALL' : 'FOLD'
    case 'oracle': // Deterministic: >=50% -> Call
      return winrate >= 0.5 ? 'CALL' : 'FOLD'
    case 'phoenix': // winrate +15% (แบบ Reaper แต่เบากว่า)
      return random() < Math.min(0.99, winrate + 0.15) ? 'CALL' : 'FOLD'
    case 'black_magic': // Call ที่ winrate >= 45-50% — ใช้ค่ากลาง 47.5%
      return winrate >= 0.475 ? 'CALL' : 'FOLD'
    case 'jester': // 30% random ล้วน + 70% ใช้ winrate ตรงๆ (โครงสร้างเดียวกับ Cipher)
      if (random() < 0.3) return random() < 0.5 ? 'CALL' : 'FOLD'
      return random() < winrate ? 'CALL' : 'FOLD'
    case 'cipher': // คาดเดาไม่ได้ — 30% เมิน winrate สุ่มล้วน ที่เหลือใช้ winrate ตรงๆ
    default:
      if (random() < 0.3) return random() < 0.5 ? 'CALL' : 'FOLD'
      return random() < winrate ? 'CALL' : 'FOLD'
  }
}

// ไม่มีต้นแบบจาก Tier ล่าง (ไม่มี Joker) — ออกแบบใหม่ตามบุคลิกเดิม: reaper บุก เลือก ANTE_X2 ถ้าจ่ายไหว,
// crag ระวังตัวเสมอเลือก WILD ปลอดภัย, cortex เลือก ANTE_X2 เฉพาะตอน EV คุ้ม (winrate เป้าหมาย >= 0.6),
// cipher สุ่ม 50/50 — targetPile ล็อกที่ 3 เสมอ ตรงกับ UI ของผู้เล่นจริงเองที่มีแค่ปุ่ม "…P3" เท่านั้น
// Nine Sentinels ก็ไม่มีต้นแบบเรื่อง Joker เหมือนกัน (ไม่มีใน Mastermind Conquest) — จัดกลุ่มตามบุคลิกเดิม
// ในตาราง Auction/GF ด้านบน: บุก/ดุ (war_lord, dark_shark, phoenix) เอียงไป ANTE_X2 เหมือน reaper,
// ระวังตัว (iron_wall, black_magic) เอียงไป WILD เหมือน crag, คำนวณ EV นิ่งๆ (oracle, chivalry) ใช้เกณฑ์
// เดียวกับ cortex, ผันผวนคาดเดาไม่ได้ (phantom, jester) สุ่ม 50/50 เหมือน cipher
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
    case 'reaper': case 'war_lord': case 'dark_shark': case 'phoenix':
      return { mode: canAffordX2 ? 'ANTE_X2' : 'WILD', targetPile }
    case 'crag': case 'iron_wall': case 'black_magic':
      return { mode: 'WILD', targetPile }
    case 'cortex': case 'oracle': case 'chivalry':
      return { mode: canAffordX2 && targetPileWinrate >= 0.6 ? 'ANTE_X2' : 'WILD', targetPile }
    case 'cipher': case 'phantom': case 'jester':
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
