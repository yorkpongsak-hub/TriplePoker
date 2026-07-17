// ─────────────────────────────────────────────────────────────────────────────
// monarchSettlement.test.ts — Unit Tests สำหรับ computeHNHumanPayout (Monarch_Spec_v1_3 §3)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { computeHNHumanPayout } from '../../src/game/highNobleMultiEngine'

describe('computeHNHumanPayout — Monarch Pot x2.0 (ระดับ match, ยืนยันขอบเขตกับลุงเยาะแล้ว)', () => {
  test('ผู้ชนะ human เจอ Monarch + กำไรสุทธิเป็นบวก → payout = netDelta x2', () => {
    expect(computeHNHumanPayout(1000, true, 2.0)).toBe(2000)
  })

  test('ไม่ใช่ผู้ชนะ (isMonarchWinnerCandidate=false) → payout = netDelta เดิม แม้เจอ Monarch', () => {
    expect(computeHNHumanPayout(1000, false, 2.0)).toBe(1000)
  })

  test('เป็นผู้ชนะ Monarch แต่กำไรสุทธิเป็นลบ → ไม่คูณ (ป้องกันคูณผลลบให้แย่ลง)', () => {
    expect(computeHNHumanPayout(-500, true, 2.0)).toBe(-500)
  })

  test('เป็นผู้ชนะ Monarch แต่กำไรสุทธิ = 0 → ไม่คูณ (0 x2 ยังคง 0 แต่ยืนยัน path ไม่ throw)', () => {
    expect(computeHNHumanPayout(0, true, 2.0)).toBe(0)
  })

  test('potMultiplier มาจาก config ตรงๆ ไม่ hardcode 2 ในฟังก์ชัน', () => {
    expect(computeHNHumanPayout(1000, true, 3.0)).toBe(3000)
  })
})
