// matchStatsStreakLedger.test.ts — Central Economy Ledger Phase 7 Round 8 (Daily Streak Bonus)
// Covers recordMatchStats()'s streak-reward mint wiring only (not the whole combined stats update —
// games_played/xp/best_hands/debt_amount stay on the raw .update() path, unchanged, out of scope).

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
    best_streak_count: 0, streak_7days_badge: false,
    ...overrides,
  }
}

function input(overrides: Partial<MatchStatsPlayerInput> = {}): MatchStatsPlayerInput {
  return { userId: 'u1', tier: 'initiate', won: true, isTripleSweep: false, bestHandThisMatch: null, ...overrides }
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

describe('recordMatchStats — Daily Streak Bonus mint wiring', () => {
  test('first match ever (day 1) grants a reward via economyService.mint(), not folded into token_balance', async () => {
    selectData = [freshUserRow()]
    await recordMatchStats([input()])

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const updateFields = mockUpdate.mock.calls[0][0]
    expect(updateFields.token_balance).toBe(1000) // NOT +100 — the mint call carries the reward instead

    expect(mockMint).toHaveBeenCalledTimes(1)
    const mintCall = mockMint.mock.calls[0][0]
    expect(mintCall.to).toEqual({ accountType: 'PLAYER', accountId: 'u1' })
    expect(mintCall.currency).toBe('TOKEN')
    expect(mintCall.amount).toBe(100) // gameConfig.dailyEconomy.playStreak.rewards[0].token
    expect(mintCall.reason).toBe('STREAK_BONUS')
    expect(mintCall.idempotencyKey).toMatch(/^STREAK_BONUS:u1:\d{4}-\d{2}-\d{2}$/)
  })

  test('already played today — no reward, mint not called', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
    selectData = [freshUserRow({ last_played_date: today, streak_count: 1 })]
    await recordMatchStats([input()])

    expect(mockMint).not.toHaveBeenCalled()
  })

  test('a failed mint is logged but does not throw and does not block the stats update', async () => {
    selectData = [freshUserRow()]
    mockMint.mockRejectedValueOnce(new Error('ledger down'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(recordMatchStats([input()])).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    spy.mockRestore()
  })

  test('two players in one match, only one earns a streak reward — one isolated mint call each as applicable', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
    selectData = [
      freshUserRow({ user_id: 'u1' }),
      freshUserRow({ user_id: 'u2', last_played_date: today, streak_count: 1 }),
    ]
    await recordMatchStats([input({ userId: 'u1' }), input({ userId: 'u2' })])

    expect(mockMint).toHaveBeenCalledTimes(1)
    expect(mockMint.mock.calls[0][0].to.accountId).toBe('u1')
  })
})
