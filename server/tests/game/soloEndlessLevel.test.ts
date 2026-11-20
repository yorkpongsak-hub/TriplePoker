// ─────────────────────────────────────────────────────────────────────────────
// soloEndlessLevel.test.ts — Unit Tests สำหรับ Solo Mode Endless Level (2026-09-01)
// ครอบคลุม: ชนะ +2 / จบเกม (แพ้) +1, RPC error ไม่ throw (คืน null ให้ match-end settlement
// ไปต่อได้ปกติ), previous คำนวณจาก current - delta ถูกต้อง
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

const mockRpc = jest.fn()
jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { rpc: (...args: any[]) => mockRpc(...args) },
}))

import { awardSoloEndlessLevel } from '../../src/game/soloEndlessLevel'

describe('awardSoloEndlessLevel', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  test('ชนะ +2 level — เรียก RPC ด้วย delta 2 และคำนวณ previous ถูกต้อง', async () => {
    mockRpc.mockResolvedValueOnce({ data: 12, error: null })
    const result = await awardSoloEndlessLevel('user-1', true)
    expect(mockRpc).toHaveBeenCalledWith('increment_solo_endless_level', { p_user_id: 'user-1', p_delta: 2 })
    expect(result).toEqual({ previous: 10, current: 12 })
  })

  test('แพ้/จบเกมธรรมดา +1 level เสมอ', async () => {
    mockRpc.mockResolvedValueOnce({ data: 8, error: null })
    const result = await awardSoloEndlessLevel('user-2', false)
    expect(mockRpc).toHaveBeenCalledWith('increment_solo_endless_level', { p_user_id: 'user-2', p_delta: 1 })
    expect(result).toEqual({ previous: 7, current: 8 })
  })

  test('RPC คืน error — ไม่ throw คืน null แทน (ไม่บล็อก match-end settlement)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await awardSoloEndlessLevel('user-3', true)
    expect(result).toBeNull()
  })

  test('RPC throw จริง — ยัง catch ได้ ไม่ throw ทะลุออกไป', async () => {
    mockRpc.mockRejectedValueOnce(new Error('network down'))
    const result = await awardSoloEndlessLevel('user-4', false)
    expect(result).toBeNull()
  })
})
