import { createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { recordHumanGfDecision, sorenAuctionBid, sorenGfDecision, SorenMatchStats } from '../../src/arena/ai/arenaSorenPersonality'

describe('recordHumanGfDecision', () => {
  test('สะสม Call/Fold ของ Human แยกกันถูกต้อง', () => {
    let stats: SorenMatchStats = { humanCalls: 0, humanFolds: 0 }
    stats = recordHumanGfDecision(stats, 'CALL')
    stats = recordHumanGfDecision(stats, 'CALL')
    stats = recordHumanGfDecision(stats, 'FOLD')
    expect(stats).toEqual({ humanCalls: 2, humanFolds: 1 })
  })
})

describe('sorenGfDecision', () => {
  const callRate = (stats: SorenMatchStats, seed: number) => {
    const random = createSeededRandom(seed)
    const decisions = Array.from({ length: 2000 }, () => sorenGfDecision(stats, 0.5, random))
    return decisions.filter(decision => decision === 'CALL').length / decisions.length
  }

  test('Human Call เยอะในแมตช์ -> Soren ระวังขึ้น (Call น้อยลง) เทียบกับ Human Fold เยอะ', () => {
    const humanCallsALot: SorenMatchStats = { humanCalls: 18, humanFolds: 2 }
    const humanFoldsALot: SorenMatchStats = { humanCalls: 2, humanFolds: 18 }
    expect(callRate(humanCallsALot, 1)).toBeLessThan(callRate(humanFoldsALot, 2))
  })

  test('ไม่มีสถิติเลย (เกม 1) ยังตัดสินใจได้ปกติ ไม่ throw', () => {
    const random = createSeededRandom(3)
    expect(() => sorenGfDecision({ humanCalls: 0, humanFolds: 0 }, 0.7, random)).not.toThrow()
  })
})

describe('sorenAuctionBid', () => {
  test('Human Fold เยอะในแมตช์ -> Soren ประมูลถี่ขึ้น (bid rate สูงขึ้น)', () => {
    const bidRate = (stats: SorenMatchStats, seed: number) => {
      const random = createSeededRandom(seed)
      const bids = Array.from({ length: 2000 }, () => sorenAuctionBid(stats, random))
      return bids.filter(value => value > 0).length / bids.length
    }
    const humanFoldsALot: SorenMatchStats = { humanCalls: 2, humanFolds: 18 }
    const humanCallsALot: SorenMatchStats = { humanCalls: 18, humanFolds: 2 }
    expect(bidRate(humanFoldsALot, 4)).toBeGreaterThan(bidRate(humanCallsALot, 5))
  })
})
