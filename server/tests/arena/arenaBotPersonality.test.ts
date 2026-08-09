import { createSeededRandom } from '../../src/arena/cards/arenaDeck'
import {
  arenaAuctionBid, arenaGfDecision, arenaJokerDecision, estimateArenaWinrate, lockArenaBossPersonality, ArenaPersonality,
} from '../../src/arena/ai/arenaBotPersonality'
import { ArenaHandResult } from '../../src/arena/joker/wildHandEvaluator'

function hand(rankIndex: number): ArenaHandResult {
  return { rank: 'high_card' as any, score: 0, rankIndex, natural: true, jokerAs: null, selectedCardIds: [] }
}

function sampleBids(personality: ArenaPersonality, n: number, seed: number): number[] {
  const random = createSeededRandom(seed)
  return Array.from({ length: n }, () => arenaAuctionBid(personality, random))
}

describe('estimateArenaWinrate', () => {
  test('map rankIndex -> winrate ตาม threshold ของ gameLoop.ts เป๊ะ', () => {
    expect(estimateArenaWinrate(hand(9))).toBe(0.99) // straight flush ก็ยังเข้าเงื่อนไข >=3
    expect(estimateArenaWinrate(hand(3))).toBe(0.99)
    expect(estimateArenaWinrate(hand(2))).toBe(0.90)
    expect(estimateArenaWinrate(hand(1))).toBe(0.80)
    expect(estimateArenaWinrate(hand(0))).toBe(0.40)
  })
})

describe('arenaAuctionBid — สุ่ม 2,000 ครั้งต่อบุคลิก', () => {
  test('REAPER ดุที่สุด: บิดเฉลี่ยสูงกว่า CRAG และ CORTEX', () => {
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const reaper = mean(sampleBids('reaper', 2000, 1))
    const crag = mean(sampleBids('crag', 2000, 2))
    const cortex = mean(sampleBids('cortex', 2000, 3))
    expect(reaper).toBeGreaterThan(crag)
    expect(crag).toBeGreaterThan(cortex)
  })

  test('REAPER ที่บิดเลือกสูงสุด (12) เสมอ ไม่เคยเลือกระดับอื่น', () => {
    const bids = sampleBids('reaper', 500, 11).filter(value => value > 0)
    expect(bids.every(value => value === 12)).toBe(true)
  })

  test('CIPHER บิดแค่สุดขั้ว (3 หรือ 12) ไม่มีค่ากลาง', () => {
    const bids = sampleBids('cipher', 500, 22).filter(value => value > 0)
    expect(bids.every(value => value === 3 || value === 12)).toBe(true)
  })
})

describe('arenaGfDecision', () => {
  test('CORTEX deterministic ตาม winrate ล้วน ไม่มี randomness', () => {
    const random = createSeededRandom(5)
    for (let i = 0; i < 50; i++) {
      expect(arenaGfDecision('cortex', 0.51, random)).toBe('CALL')
      expect(arenaGfDecision('cortex', 0.49, random)).toBe('FOLD')
    }
  })

  test('REAPER Call บ่อยกว่า CRAG ที่ winrate เดียวกัน', () => {
    const callRate = (personality: ArenaPersonality, seed: number) => {
      const random = createSeededRandom(seed)
      const decisions = Array.from({ length: 1000 }, () => arenaGfDecision(personality, 0.5, random))
      return decisions.filter(decision => decision === 'CALL').length / decisions.length
    }
    expect(callRate('reaper', 7)).toBeGreaterThan(callRate('crag', 8))
  })
})

describe('arenaJokerDecision', () => {
  test('CRAG เลือก WILD เสมอไม่ว่าเงื่อนไขไหน', () => {
    const random = createSeededRandom(9)
    for (let i = 0; i < 20; i++) {
      expect(arenaJokerDecision('crag', 1000, 6, 0.99, random).mode).toBe('WILD')
    }
  })

  test('REAPER เลือก ANTE_X2 ถ้าจ่ายไหว, WILD ถ้าไม่พอ', () => {
    const random = createSeededRandom(10)
    expect(arenaJokerDecision('reaper', 10, 6, 0.1, random)).toMatchObject({ mode: 'ANTE_X2', targetPile: 3 })
    expect(arenaJokerDecision('reaper', 3, 6, 0.99, random)).toMatchObject({ mode: 'WILD', targetPile: 3 })
  })

  test('CORTEX เลือก ANTE_X2 เฉพาะตอน EV คุ้ม (winrate เป้าหมาย >= 0.6) และจ่ายไหว', () => {
    const random = createSeededRandom(12)
    expect(arenaJokerDecision('cortex', 10, 6, 0.8, random).mode).toBe('ANTE_X2')
    expect(arenaJokerDecision('cortex', 10, 6, 0.3, random).mode).toBe('WILD')
    expect(arenaJokerDecision('cortex', 3, 6, 0.99, random).mode).toBe('WILD')
  })
})

// Nine Sentinels — พอร์ตจาก gameLoop.ts:896-934 (auction), gameLoop.ts:1669-1691 (GF, "ห้ามแก้ค่า")
// ใช้เป็นตัวเติมที่นั่ง FILL แทน ARENA_MINION ทั่วไป (ดู arenaMatchmaking.ts's SENTINELS)
describe('arenaAuctionBid — Nine Sentinels', () => {
  test('DARK_SHARK ประมูลราคาสูงสุด (12) ทุกครั้งแบบ deterministic ไม่มี randomness เลย', () => {
    const random = createSeededRandom(31)
    for (let i = 0; i < 30; i++) expect(arenaAuctionBid('dark_shark', random)).toBe(12)
  })

  test('ORACLE ประมูลราคาเดียวคงที่ (9) ทุกครั้งแบบ deterministic', () => {
    const random = createSeededRandom(32)
    for (let i = 0; i < 30; i++) expect(arenaAuctionBid('oracle', random)).toBe(9)
  })

  test('WAR_LORD บิดเฉลี่ยสูงกว่า IRON_WALL (บุกไม่หยุด vs ระมัดระวัง)', () => {
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean(sampleBids('war_lord', 2000, 33))).toBeGreaterThan(mean(sampleBids('iron_wall', 2000, 34)))
  })

  test('CHIVALRY กับ PHOENIX บิดที่ level คงที่เสมอเวลาเข้าประมูล (9)', () => {
    const random1 = createSeededRandom(35)
    const chivalryBids = Array.from({ length: 300 }, () => arenaAuctionBid('chivalry', random1)).filter(value => value > 0)
    expect(chivalryBids.every(value => value === 9)).toBe(true)
    const random2 = createSeededRandom(36)
    const phoenixBids = Array.from({ length: 300 }, () => arenaAuctionBid('phoenix', random2)).filter(value => value > 0)
    expect(phoenixBids.every(value => value === 9)).toBe(true)
  })
})

describe('arenaGfDecision — Nine Sentinels threshold canon (ห้ามแก้ค่าตาม MasterPlan v1.1)', () => {
  test('IRON_WALL: Fold ถ้า winrate < 60%', () => {
    expect(arenaGfDecision('iron_wall', 0.6, Math.random)).toBe('CALL')
    expect(arenaGfDecision('iron_wall', 0.59, Math.random)).toBe('FOLD')
  })
  test('WAR_LORD: Call แม้ winrate ต่ำถึง 35%', () => {
    expect(arenaGfDecision('war_lord', 0.35, Math.random)).toBe('CALL')
    expect(arenaGfDecision('war_lord', 0.34, Math.random)).toBe('FOLD')
  })
  test('CHIVALRY / DARK_SHARK / ORACLE: threshold 50% ทั้งคู่', () => {
    for (const personality of ['chivalry', 'dark_shark', 'oracle'] as ArenaPersonality[]) {
      expect(arenaGfDecision(personality, 0.5, Math.random)).toBe('CALL')
      expect(arenaGfDecision(personality, 0.49, Math.random)).toBe('FOLD')
    }
  })
  test('BLACK_MAGIC: threshold 47.5%', () => {
    expect(arenaGfDecision('black_magic', 0.475, Math.random)).toBe('CALL')
    expect(arenaGfDecision('black_magic', 0.474, Math.random)).toBe('FOLD')
  })
  test('PHOENIX: bias +15% เหมือน Reaper แต่เบากว่า', () => {
    const callRate = (personality: ArenaPersonality, seed: number) => {
      const random = createSeededRandom(seed)
      const decisions = Array.from({ length: 1000 }, () => arenaGfDecision(personality, 0.5, random))
      return decisions.filter(decision => decision === 'CALL').length / decisions.length
    }
    // cortex ที่ winrate 0.5 deterministic call เสมอ (rate=1.0) เลยเทียบแค่ reaper vs phoenix ที่เป็น probabilistic ทั้งคู่
    expect(callRate('reaper', 37)).toBeGreaterThan(callRate('phoenix', 38))
  })
  test('PHANTOM มี randomness (40% บลัฟ) ต่างจาก DARK_SHARK ที่ deterministic ล้วน', () => {
    const random = createSeededRandom(40)
    const decisions = new Set(Array.from({ length: 200 }, () => arenaGfDecision('phantom', 0.3, random)))
    expect(decisions.size).toBe(2) // ต้องเห็นทั้ง CALL และ FOLD แม้ winrate ต่ำกว่า threshold ตลอด
  })
})

describe('arenaJokerDecision — Nine Sentinels จัดกลุ่มตามบุคลิก (ไม่มี precedent เรื่อง Joker เหมือน Four Gods)', () => {
  test('บุก/ดุ (war_lord, dark_shark, phoenix) เอียงไป ANTE_X2 เหมือน reaper', () => {
    const random = createSeededRandom(41)
    for (const personality of ['war_lord', 'dark_shark', 'phoenix'] as ArenaPersonality[]) {
      expect(arenaJokerDecision(personality, 10, 6, 0.1, random).mode).toBe('ANTE_X2')
      expect(arenaJokerDecision(personality, 3, 6, 0.99, random).mode).toBe('WILD')
    }
  })
  test('ระวังตัว (iron_wall, black_magic) เลือก WILD เสมอเหมือน crag', () => {
    const random = createSeededRandom(42)
    for (const personality of ['iron_wall', 'black_magic'] as ArenaPersonality[]) {
      for (let i = 0; i < 10; i++) expect(arenaJokerDecision(personality, 1000, 6, 0.99, random).mode).toBe('WILD')
    }
  })
  test('คำนวณ EV นิ่งๆ (oracle, chivalry) ใช้เกณฑ์เดียวกับ cortex (winrate เป้าหมาย >= 0.6)', () => {
    const random = createSeededRandom(43)
    for (const personality of ['oracle', 'chivalry'] as ArenaPersonality[]) {
      expect(arenaJokerDecision(personality, 10, 6, 0.8, random).mode).toBe('ANTE_X2')
      expect(arenaJokerDecision(personality, 10, 6, 0.3, random).mode).toBe('WILD')
    }
  })
})

describe('lockArenaBossPersonality', () => {
  test('ขอบเขต quartile map ตรงกับ gameConfig.monarchConfig.handStrengthQuartile', () => {
    expect(lockArenaBossPersonality(0.9)).toBe('cortex')
    expect(lockArenaBossPersonality(0.75)).toBe('cortex')
    expect(lockArenaBossPersonality(0.74)).toBe('reaper')
    expect(lockArenaBossPersonality(0.5)).toBe('reaper')
    expect(lockArenaBossPersonality(0.49)).toBe('crag')
    expect(lockArenaBossPersonality(0.25)).toBe('crag')
    expect(lockArenaBossPersonality(0.24)).toBe('cipher')
    expect(lockArenaBossPersonality(0)).toBe('cipher')
  })
})
