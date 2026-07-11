// ─────────────────────────────────────────────────────────────────────────────
// monarchAI.test.ts — Unit Tests สำหรับ monarchAI (Monarch_Spec_v1_3 §1)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

const mockAiDecideArrangement = jest.fn()
jest.mock('../../src/game/aiEngine', () => ({
  aiDecideArrangement: (...args: any[]) => mockAiDecideArrangement(...args),
}))

const mockEvaluateHand = jest.fn()
jest.mock('../../src/game/handEvaluator', () => ({
  evaluateHand: (...args: any[]) => mockEvaluateHand(...args),
}))

jest.mock('../../src/config/gameConfig', () => ({
  gameConfig: {
    monarchConfig: {
      handStrengthQuartile: { veryStrong: 0.75, medium: 0.5, mediumWeak: 0.25 },
    },
  },
}))

import { evaluateMonarchHandStrength, lockMonarchPersonality } from '../../src/game/monarchAI'

const dummyArr = { pile1: [], pile2: [], pile3: [] } as any
const dummyCommunity = { row1: [], row2: [], row3: [] } as any
const dummyCards = [] as any

function setRankIndexes(r1: number, r2: number, r3: number) {
  mockEvaluateHand
    .mockReturnValueOnce({ rankIndex: r1 })
    .mockReturnValueOnce({ rankIndex: r2 })
    .mockReturnValueOnce({ rankIndex: r3 })
}

describe('monarchAI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAiDecideArrangement.mockReturnValue(dummyArr)
  })

  test('evaluateMonarchHandStrength รวม rankIndex 3 กอง หาร 27', () => {
    setRankIndexes(9, 9, 9)
    expect(evaluateMonarchHandStrength(dummyCards, dummyCommunity)).toBeCloseTo(1.0)
  })

  test('probe ใช้ personality cortex กลางๆ เสมอ (ไม่ผูกกับ personality ที่จะล็อคจริง)', () => {
    setRankIndexes(0, 0, 0)
    evaluateMonarchHandStrength(dummyCards, dummyCommunity)
    expect(mockAiDecideArrangement).toHaveBeenCalledWith(
      expect.objectContaining({ personality: 'cortex' }),
      dummyCards, dummyCommunity, 1, 'highNoble', 0,
    )
  })

  test('ไพ่แข็งมาก (strength >= 0.75) ล็อค cortex', () => {
    setRankIndexes(9, 9, 9) // 27/27 = 1.0
    expect(lockMonarchPersonality(dummyCards, dummyCommunity)).toBe('cortex')
  })

  test('ไพ่แข็งปานกลาง (0.5 <= strength < 0.75) ล็อค reaper', () => {
    setRankIndexes(5, 5, 5) // 15/27 ≈ 0.556
    expect(lockMonarchPersonality(dummyCards, dummyCommunity)).toBe('reaper')
  })

  test('ไพ่ปานกลางค่อนอ่อน (0.25 <= strength < 0.5) ล็อค crag', () => {
    setRankIndexes(2, 2, 3) // 7/27 ≈ 0.259
    expect(lockMonarchPersonality(dummyCards, dummyCommunity)).toBe('crag')
  })

  test('ไพ่อ่อน (strength < 0.25) ล็อค cipher', () => {
    setRankIndexes(0, 0, 1) // 1/27 ≈ 0.037
    expect(lockMonarchPersonality(dummyCards, dummyCommunity)).toBe('cipher')
  })

  test('เป็น pure function — input เดียวกันให้ผล personality เดียวกันเสมอ (รองรับกฎห้ามสลับกลางเกม)', () => {
    setRankIndexes(9, 9, 9)
    const first = lockMonarchPersonality(dummyCards, dummyCommunity)
    setRankIndexes(9, 9, 9)
    const second = lockMonarchPersonality(dummyCards, dummyCommunity)
    expect(first).toBe(second)
    // หมายเหตุ: การล็อคครั้งเดียวทั้งแมตช์ (ไม่เรียกซ้ำ Round 2+) บังคับที่ call site —
    // ดู highNobleMultiEngine.ts startHNRound() เงื่อนไข state.roundNumber === 1
  })
})
