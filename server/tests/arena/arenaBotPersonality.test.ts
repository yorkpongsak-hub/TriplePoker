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
