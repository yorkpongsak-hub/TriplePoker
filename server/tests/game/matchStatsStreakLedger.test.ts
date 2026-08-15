// matchStatsStreakLedger.test.ts — Streak Milestone Bonus (มติลุงเยาะ 2026-08-14)
// เดิมไฟล์นี้เทส recordMatchStats() ที่ mint TOKEN อัตโนมัติทุกวัน 1-7 (Central Economy Ledger Phase 7
// Round 8) — ระบบนั้นถูกแทนที่ด้วย Streak Milestone Bonus ใหม่ (วันที่ 3/5/7 เท่านั้น, ต้องกด Claim
// เองผ่าน POST /profile/claim-streak-reward, ดูโฆษณาก่อนถ้าไม่ใช่ VIP) — เทสไฟล์นี้เปลี่ยนมาคุม 2 เรื่อง
// แทน: (1) recordMatchStats() ไม่ mint TOKEN เองอีกต่อไปเลย ไม่ว่ากรณีไหน (2)
// streak_claimed_milestone เขียนถูกต้อง — คงค่าเดิมระหว่าง cycle, รีเซ็ตเป็น 0 ตอนวนรอบใหม่ (cycleDay
// กลับไปเป็น 1) กัน milestone เดิมจาก cycle ก่อนหน้าค้างขวางไม่ให้ claim รอบใหม่ได้

const mockMint = jest.fn()
jest.mock('../../src/economy/economyService', () => ({
  economyService: { mint: (...args: unknown[]) => mockMint(...args) },
}))

let selectData: any[] = []
const mockUpdateEq = jest.fn(() => Promise.resolve({ error: null }))
const mockUpdate = jest.fn((_fields: Record<string, unknown>) => ({ eq: mockUpdateEq }))
const mockSelectIn = jest.fn(() => Promise.resolve({ data: selectData, error: null }))
const mockSelect = jest.fn((_cols: string) => ({ in: mockSelectIn }))
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect, update: mockUpdate }))

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { from: mockFrom },
}))

import { recordMatchStats, type MatchStatsPlayerInput } from '../../src/game/matchStatsService'

function freshUserRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'u1', token_balance: 1000, vip_status: 'none', games_played: 0, games_won: 0, xp: 0,
    best_hands: {}, debt_amount: 0, streak_count: 0, last_played_date: null, streak_shields: 0,
    best_streak_count: 0, streak_7days_badge: false, streak_claimed_milestone: 0,
    ...overrides,
  }
}

function input(overrides: Partial<MatchStatsPlayerInput> = {}): MatchStatsPlayerInput {
  return { userId: 'u1', tier: 'initiate', won: true, isTripleSweep: false, bestHandThisMatch: null, ...overrides }
}

// recordMatchStats() ใช้ new Date() จริงข้างในเสมอ (ไม่ใช่ pure function) — ต้องคำนวณวันที่ "เมื่อวาน"
// เทียบเวลา Bangkok จริง ณ ตอนรันเทส ห้าม hardcode string วันที่ตายตัว ไม่งั้นเทสจะพังเองในอนาคต
function daysAgoBangkok(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d)
}

beforeEach(() => {
  selectData = []
  mockMint.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
  mockFrom.mockClear()
  mockSelect.mockClear()
  mockSelectIn.mockClear()
  mockUpdate.mockClear()
  mockUpdateEq.mockClear()
})

describe('recordMatchStats — no longer auto-mints TOKEN for streak (superseded by claim-based Milestone Bonus)', () => {
  test('first match ever (day 1) never calls economyService.mint()', async () => {
    selectData = [freshUserRow()]
    await recordMatchStats([input()])
    expect(mockMint).not.toHaveBeenCalled()
  })

  test('reaching a milestone day (day 3) never calls economyService.mint() either — claiming is a separate manual step', async () => {
    selectData = [freshUserRow({ streak_count: 2, last_played_date: daysAgoBangkok(1), best_streak_count: 2 })]
    await recordMatchStats([input()])
    expect(mockMint).not.toHaveBeenCalled()
  })

  test('ไม่เขียน token_balance จาก snapshot เก่าทับ settlement/reward ที่อาจเข้าพร้อมกัน', async () => {
    selectData = [freshUserRow({ token_balance: 4321 })]
    await recordMatchStats([input()])
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('token_balance')
  })
})

describe('recordMatchStats — streak_claimed_milestone bookkeeping', () => {
  test('stays untouched (0) on a brand-new streak', async () => {
    selectData = [freshUserRow()]
    await recordMatchStats([input()])
    const fields = mockUpdate.mock.calls[0][0]
    expect(fields.streak_count).toBe(1)
    expect(fields.streak_claimed_milestone).toBe(0)
  })

  test('carries a claimed milestone forward while still inside the same cycle', async () => {
    // ผู้เล่นอยู่วันที่ 3 ของ cycle (เล่นเมื่อวาน) และเคย claim milestone 3 ไปแล้ว — วันนี้เล่นต่อ ขึ้นวันที่ 4
    // (ยังไม่ถึง milestone ถัดไป) ค่า streak_claimed_milestone ต้องคงอยู่ที่ 3 ไม่หายไป
    selectData = [freshUserRow({ streak_count: 3, last_played_date: daysAgoBangkok(1), best_streak_count: 3, streak_claimed_milestone: 3 })]
    await recordMatchStats([input()])
    const fields = mockUpdate.mock.calls[0][0]
    expect(fields.streak_count).toBe(4)
    expect(fields.streak_claimed_milestone).toBe(3)
  })

  test('resets to 0 when the cycle wraps back to day 1 (streak broken)', async () => {
    // เคย claim ถึง milestone 7 ในรอบก่อน แต่ขาดเล่นไปหลายวันจนสตรีคขาด (elapsedDays > 2, ไม่มี shield กัน)
    // -> cycleDay กลับไปเป็น 1 -> streak_claimed_milestone ต้องรีเซ็ตกลับ 0 ด้วย ไม่งั้น claim รอบใหม่ไม่ได้เลย
    selectData = [freshUserRow({
      streak_count: 7, last_played_date: daysAgoBangkok(10), best_streak_count: 7,
      streak_claimed_milestone: 7, streak_shields: 0,
    })]
    await recordMatchStats([input()])
    const fields = mockUpdate.mock.calls[0][0]
    expect(fields.streak_count).toBe(1)
    expect(fields.streak_claimed_milestone).toBe(0)
  })

  test('resets to 0 when a completed 7-day cycle naturally loops back to day 1', async () => {
    selectData = [freshUserRow({
      streak_count: 7, last_played_date: daysAgoBangkok(1), best_streak_count: 7,
      streak_claimed_milestone: 7, streak_shields: 2, streak_7days_badge: true,
    })]
    await recordMatchStats([input()])
    const fields = mockUpdate.mock.calls[0][0]
    expect(fields.streak_count).toBe(1)
    expect(fields.streak_claimed_milestone).toBe(0)
  })
})
