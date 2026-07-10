// ============================================================
// aiEngine.ts — AI Arrangement Engine
// 3 Personality: The Sage / The Reckless / The Ghost
// Beginner's Luck System: Beginner table เท่านั้น
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Card } from './deck'
import { evaluateHand, compareHands, HandResult } from './handEvaluator'
import { checkFoul, PlayerArrangement, CommunityCards } from './foulChecker'

// ── Types ────────────────────────────────────────────────────
export type AIPersonality =
  | 'sage' | 'reckless' | 'ghost' | 'reaper' | 'crag' | 'cortex' | 'cipher'
  | 'iron_wall' | 'chivalry' | 'war_lord' | 'phantom' | 'dark_shark' | 'oracle' | 'jester' | 'phoenix' | 'black_magic'

export interface AIConfig {
  id: string
  name: string
  emoji: string
  personality: AIPersonality
}

// AI 3 ตัวในโต๊ะ (Mastermind/Last Boss ใช้ทั้ง P2/Boss/P4)
export const AI_CONFIGS: AIConfig[] = [
  { id: 'AI_SAGE',     name: 'The Sage',     emoji: '🧙', personality: 'sage'     },
  { id: 'AI_RECKLESS', name: 'The Reckless', emoji: '😈', personality: 'reckless' },
  { id: 'AI_GHOST',    name: 'The Ghost',    emoji: '👻', personality: 'ghost'    },
]
// Patch High Noble: จตุรเทพ 4 องค์ — ใช้แทนที่นั่ง Boss (P3) เท่านั้น เลือกได้ผ่าน Dev Boss Selector (__DEV__)
// P2/P4 ยังใช้ AI_CONFIGS (Sage/Reckless/Ghost) เดิมไม่เปลี่ยน
export const FOUR_GODS: AIConfig[] = [
  { id: 'AI_REAPER', name: 'Reaper',    emoji: '💀', personality: 'reaper' },
  { id: 'AI_CRAG',   name: 'The Crag',  emoji: '🗿', personality: 'crag'   },
  { id: 'AI_CORTEX', name: 'Cortex',    emoji: '🤖', personality: 'cortex' },
  { id: 'AI_CIPHER', name: 'Cipher',    emoji: '🎭', personality: 'cipher' },
]

// Patch Mastermind Conquest: The Nine Sentinels — ผู้เล่นเลือกเองจาก select.tsx (ไม่สุ่มแบบ Four Gods)
// bossId (key) ต้องตรงกับชื่อไฟล์ asset boss_[key].png และ route param จาก client ทุกจุด
// P2/P4 ยังใช้ AI_CONFIGS (Sage/Reckless/Ghost) เดิมไม่เปลี่ยน — Sentinel แทนที่นั่ง Boss (P3) เท่านั้น
export const NINE_SENTINELS: (AIConfig & { bossId: string })[] = [
  { id: 'AI_IRON_WALL',   bossId: 'iron_wall',   name: 'Iron Wall',   emoji: '🛡️', personality: 'iron_wall'   },
  { id: 'AI_CHIVALRY',    bossId: 'chivalry',    name: 'Chivalry',    emoji: '⚔️', personality: 'chivalry'    },
  { id: 'AI_WAR_LORD',    bossId: 'war_lord',    name: 'War Lord',    emoji: '🪓', personality: 'war_lord'    },
  { id: 'AI_PHANTOM',     bossId: 'phantom',     name: 'Phantom',     emoji: '🌫️', personality: 'phantom'     },
  { id: 'AI_DARK_SHARK',  bossId: 'dark_shark',  name: 'Dark Shark',  emoji: '🦈', personality: 'dark_shark'  },
  { id: 'AI_ORACLE',      bossId: 'oracle',      name: 'Oracle',      emoji: '🔮', personality: 'oracle'      },
  { id: 'AI_JESTER',      bossId: 'jester',      name: 'Jester',      emoji: '🤡', personality: 'jester'      },
  { id: 'AI_PHOENIX',     bossId: 'phoenix',     name: 'Phoenix',     emoji: '🔥', personality: 'phoenix'     },
  { id: 'AI_BLACK_MAGIC', bossId: 'black_magic', name: 'Black Magic', emoji: '🪄', personality: 'black_magic' },
]

// ── Helper: First-Valid Arrangement (สำหรับ Initiate) ─────────
// สุ่มจัดไพ่จนผ่าน Foul → ใช้เลย (ไม่ optimize) — AI อ่อนมาก เหมาะกับผู้เล่นใหม่
function firstValidArrangement(cards: Card[], community: CommunityCards): PlayerArrangement {
  const maxAttempts = 100
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    const arr: PlayerArrangement = {
      pile1: shuffled.slice(0, 3),
      pile2: shuffled.slice(3, 6),
      pile3: shuffled.slice(6),
    }
    const foul = checkFoul(arr, community)
    if (!foul.isFoul) return arr
  }
  // fallback ถ้าสุ่ม 100 ครั้งไม่ผ่าน → ใช้ bestArrangement
  return bestArrangement(cards, community)
}

// ── Helper: Greedy Arrangement (สำหรับ Adept) ─────────────
// เลือกทีละกอง: กอง 3 ดีสุดก่อน → กอง 2 จากที่เหลือ → กอง 1 ที่เหลือทั้งหมด
// ดีกว่า First-Valid แต่พลาดกรณีที่ต้อง swap ข้ามกอง
function greedyArrangement(cards: Card[], community: CommunityCards): PlayerArrangement {
  const n = cards.length
  let bestP3Score = -Infinity
  let bestP3: Card[] = cards.slice(n - 5) // fallback
  let bestP3Rest: Card[] = cards.slice(0, n - 5)

  // เลือก 3 ใบที่ทำกอง 3 ดีที่สุด (ประเมินกับ community.row3)
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const p3 = [cards[i], cards[j], cards[k]]
        const rest = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k)
        const h3 = evaluateHand([...p3, ...community.row3])
        if (h3.score > bestP3Score) {
          bestP3Score = h3.score
          bestP3 = p3
          bestP3Rest = rest
        }
      }
    }
  }

  // จากที่เหลือ เลือก 3 ใบที่ทำกอง 2 ดีที่สุด (ประเมินกับ community.row2)
  let bestP2Score = -Infinity
  let bestP2: Card[] = bestP3Rest.slice(0, 3)
  let bestP1: Card[] = bestP3Rest.slice(3)

  for (let a = 0; a < bestP3Rest.length - 2; a++) {
    for (let b = a + 1; b < bestP3Rest.length - 1; b++) {
      for (let c = b + 1; c < bestP3Rest.length; c++) {
        const p2 = [bestP3Rest[a], bestP3Rest[b], bestP3Rest[c]]
        const p1 = bestP3Rest.filter((_, idx) => idx !== a && idx !== b && idx !== c)
        const h2 = evaluateHand([...p2, ...community.row2])
        if (h2.score > bestP2Score) {
          bestP2Score = h2.score
          bestP2 = p2
          bestP1 = p1
        }
      }
    }
  }

  const arr: PlayerArrangement = { pile1: bestP1, pile2: bestP2, pile3: bestP3 }
  const foul = checkFoul(arr, community)
  // ถ้า Greedy foul (h1 > h2 หรือ h2 > h3) → fallback เป็น bestArrangement
  return foul.isFoul ? bestArrangement(cards, community) : arr
}

// ── Helper: หา best 3 ใบจาก N ใบ ของ pile3 ───────────────────
// เลือก 3 ใบจาก N ใบที่ evaluate กับ community.row3 (2 ใบ) แล้วได้ score สูงสุด
// resolvePile ตัดสินจาก pile3.slice(0,3) — AI ต้องเรียง 3 ใบดีสุดไว้ index 0-2
function bestThreeFromN(
  cards: Card[],
  communityRow3: Card[]
): { bestThree: Card[]; leftover: Card[]; result: HandResult } {
  const n = cards.length
  // ถ้ามีแค่ 3 ใบพอดี ใช้ตรงๆ ไม่ต้องลอง combination
  if (n <= 3) {
    const result = evaluateHand([...cards, ...communityRow3])
    return { bestThree: cards, leftover: [], result }
  }
  let bestScore = -Infinity
  let bestThree: Card[] = cards.slice(0, 3)
  let leftover: Card[] = cards.slice(3)
  let bestResult: HandResult = evaluateHand([...bestThree, ...communityRow3])
  // ลองทุก combination C(N,3)
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const three = [cards[i], cards[j], cards[k]]
        const rest = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k)
        const result = evaluateHand([...three, ...communityRow3])
        if (result.score > bestScore) {
          bestScore = result.score
          bestThree = three
          leftover = rest
          bestResult = result
        }
      }
    }
  }
  return { bestThree, leftover, result: bestResult }
}

// ── Helper: สร้าง arrangement ที่ดีที่สุด (brute force C(11,3)xC(8,3)) ─
function bestArrangement(
  cards: Card[],
  community: CommunityCards,
  weights: { w1: number; w2: number; w3: number } = { w1: 1, w2: 2, w3: 4 }
): PlayerArrangement {
  let bestScore = -Infinity
  let bestArr: PlayerArrangement = {
    pile1: cards.slice(0, 3),
    pile2: cards.slice(3, 6),
    pile3: cards.slice(6),
  }

  const n = cards.length
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const p1 = [cards[i], cards[j], cards[k]]
        const rest = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k)
        for (let a = 0; a < rest.length - 2; a++) {
          for (let b = a + 1; b < rest.length - 1; b++) {
            for (let c = b + 1; c < rest.length; c++) {
              const p2 = [rest[a], rest[b], rest[c]]
              const p3 = rest.filter((_, idx) => idx !== a && idx !== b && idx !== c)
              // Patch (บั๊กแก้ครั้ง 2): สำหรับ pile3 ที่อาจมี > 3 ใบ (กรณี AI ประมูลได้ไพ่ใน High Noble หรือ Mastermind ก่อน Discard)
              // ใช้ bestThreeFromN เพื่อหา best 3 จาก p3 — เพราะ evaluateHand รับ N ใบจะคำนวณ flush/straight ผิด
              // resolvePile ตัดสินจาก pile3.slice(0,3) → ต้อง sort best 3 ใบไว้ index 0-2 เพื่อให้ sync กัน
              const h1 = evaluateHand([...p1, ...community.row1])
              const h2 = evaluateHand([...p2, ...community.row2])
              const { bestThree: p3Best, leftover: p3Rest, result: h3 } = bestThreeFromN(p3, community.row3)
              if (compareHands(h1, h2) > 0 || compareHands(h2, h3) > 0) continue
              const total = h1.score * weights.w1 + h2.score * weights.w2 + h3.score * weights.w3
              if (total > bestScore) {
                bestScore = total
                // sort p3 ใหม่: best 3 อยู่ index 0-2, ที่เหลือต่อท้าย
                bestArr = { pile1: p1, pile2: p2, pile3: [...p3Best, ...p3Rest] }
              }
            }
          }
        }
      }
    }
  }
  return bestArr
}

// ── Helper: arrangement ดีรองลงมา (สำหรับ Beginner's Luck) ──
function subOptimalArrangement(
  cards: Card[],
  community: CommunityCards
): PlayerArrangement {
  // สุ่มสลับไพ่ใน pile3 บางใบกับ pile1/pile2 เพื่อให้แย่ลงเล็กน้อย
  const best = bestArrangement(cards, community)
  // swap ไพ่แรกของ pile3 กับไพ่สุดท้ายของ pile1
  const p1 = [...best.pile1]
  const p3 = [...best.pile3]
  const tmp = p1[0]
  p1[0] = p3[0]
  p3[0] = tmp
  const arr = { pile1: p1, pile2: best.pile2, pile3: p3 }
  // ถ้า foul → คืน best แทน
  const foul = checkFoul(arr, community)
  return foul.isFoul ? best : arr
}

// ── AI Arrangement ตาม Personality ──────────────────────────
function arrangeByPersonality(
  personality: AIPersonality,
  cards: Card[],
  community: CommunityCards
): PlayerArrangement {
  switch (personality) {

    case 'sage': {
      // Defensive: เน้น Pile 1/2 แข็ง → sort cards ค่าสูงลงมา แล้วแจกให้ Pile 1 ก่อน
      const sorted = [...cards].sort((a, b) => b.value - a.value)
      const p1 = sorted.slice(0, 3)
      const p2 = sorted.slice(3, 6)
      const p3 = sorted.slice(6)
      const arr = { pile1: p1, pile2: p2, pile3: p3 }
      const foul = checkFoul(arr, community)
      return foul.isFoul ? bestArrangement(cards, community) : arr
    }

    case 'reckless': {
      // Aggressive: โยน hand ดีสุดลง Pile 3 เสมอ → best arrangement แล้ว boost pile3
      return bestArrangement(cards, community)
    }

    case 'ghost': {
      // Unpredictable: 50% best, 50% สุ่มกอง
      if (Math.random() < 0.5) return bestArrangement(cards, community)
      const shuffled = [...cards].sort(() => Math.random() - 0.5)
      const arr = { pile1: shuffled.slice(0, 3), pile2: shuffled.slice(3, 6), pile3: shuffled.slice(6) }
      const foul = checkFoul(arr, community)
      return foul.isFoul ? bestArrangement(cards, community) : arr
    }

    // ── จตุรเทพ (High Noble Boss เท่านั้น) ──────────────────────
    // ทุกตนจัดไพ่เต็มฝีมือ (bestArrangement) — ความแตกต่างอยู่ที่สไตล์ประมูล/Call-Fold
    // ใน Grand Finale (ดู decideAIGrandFinaleAction + AI bid logic ใน gameLoop.ts) ไม่ใช่ตอนจัดไพ่
    // Patch: กระจาย weight ให้ครอบคลุม 3 สไตล์ — Reaper เน้นกอง 3, Cortex สมดุล, Crag เน้นกอง 1-2
    case 'reaper': { // นักเก็บเกี่ยว — เน้นกอง 3 (เพื่อ Pot สูง + ดุตอน Call/Fold)
      return bestArrangement(cards, community, { w1: 1, w2: 2, w3: 4 })
    }

    case 'cortex': { // สมองกล — คำนวณ EV สมดุล (ตรงตาม token pot ratio + Call value)
      return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 4 })
    }

    case 'crag': {   // หินผา — เน้นกอง 1-2 (ป้องกันแน่น ลด w2 จาก 6 เป็น 5 ให้อยู่ในช่วงเดียวกับ Cipher)
      return bestArrangement(cards, community, { w1: 5, w2: 5, w3: 4 })
    }

    case 'cipher': { // รหัสลับ — สุ่มตัวคูณ 1-5 (เดิม 1-10) บางครั้งออกตรงสไตล์จตุรเทพคนอื่นได้
      const w1 = Math.floor(Math.random() * 5) + 1
      const w2 = Math.floor(Math.random() * 5) + 1
      const w3 = Math.floor(Math.random() * 5) + 1
      return bestArrangement(cards, community, { w1, w2, w3 })
    }

    // ── The Nine Sentinels (Mastermind Conquest Boss เท่านั้น) ──────
    // Weight canon จาก MasterPlan v1.1 — ห้ามแก้ค่า (ยกเว้น Jester ที่สุ่มใหม่ทุกครั้งตามสเปค)
    case 'iron_wall':   return bestArrangement(cards, community, { w1: 4, w2: 4, w3: 2 })
    case 'chivalry':    return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 })
    case 'war_lord':    return bestArrangement(cards, community, { w1: 1, w2: 2, w3: 7 })
    case 'phantom':     return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 })
    case 'dark_shark':  return bestArrangement(cards, community, { w1: 2, w2: 4, w3: 4 })
    case 'oracle':      return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 })
    case 'phoenix':     return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 })
    case 'black_magic': return bestArrangement(cards, community, { w1: 3, w2: 3, w3: 4 })

    case 'jester': { // ตัวตลก — สุ่ม weight 1-10 ใหม่ทุกเกม (pattern เดียวกับ Cipher แต่ range กว้างกว่า)
      const w1 = Math.floor(Math.random() * 10) + 1
      const w2 = Math.floor(Math.random() * 10) + 1
      const w3 = Math.floor(Math.random() * 10) + 1
      return bestArrangement(cards, community, { w1, w2, w3 })
    }
  }
}

// ── Main: AI decide arrangement ──────────────────────────────
export function aiDecideArrangement(
  config: AIConfig,
  cards: Card[],
  community: CommunityCards,
  roundNumber: number,       // เริ่มจาก 1
  tier: string,
  humanWinStreak: number,    // จำนวนตาที่ human ชนะต่อกัน
): PlayerArrangement {

  const isBeginnerTable = tier === 'initiate'

  // ── Beginner's Luck System ───────────────────────────────
  if (isBeginnerTable) {

    // ตา 1-2: AI จงใจอ่อนฝีมือ
    if (roundNumber <= 2) {
      return subOptimalArrangement(cards, community)
    }

    // ตา 3: AI เล่นปกติแต่ ghost มีโอกาส foul 30%
    if (roundNumber === 3) {
      if (config.personality === 'ghost' && Math.random() < 0.3) {
        // จัดแบบสุ่มเพื่อเพิ่มโอกาส foul
        const shuffled = [...cards].sort(() => Math.random() - 0.5)
        return { pile1: shuffled.slice(0, 3), pile2: shuffled.slice(3, 6), pile3: shuffled.slice(6) }
      }
      // Patch: Initiate ใช้ First-Valid (ไม่ใช่ bestArrangement) — AI อ่อนกว่า Tier สูง
      return firstValidArrangement(cards, community)
    }

    // ตา 4+: สุ่ม 50% อ่อนฝีมือ / 50% First-Valid
    if (roundNumber >= 4) {
      if (Math.random() < 0.5) {
        return subOptimalArrangement(cards, community)
      }
      return firstValidArrangement(cards, community)
    }
  }

  // ── Adept table: ใช้ Greedy (ดีกว่า First-Valid แต่ยังไม่ optimal) ────
  if (tier === 'adept') {
    return greedyArrangement(cards, community)
  }

  // ── Mastermind+ table: เต็มฝีมือตาม personality ────────────────
  return arrangeByPersonality(config.personality, cards, community)
}
