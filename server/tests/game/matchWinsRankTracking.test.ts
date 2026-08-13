// matchWinsRankTracking.test.ts — Top10 Leaderboard rank tracking (มติลุงเยาะ 2026-08-13)
// Covers computeRank() and recordMatchWin()'s new rank_before/rank_after write logic. Independent
// of the Central Economy Ledger work — no economyService/gameLoop involvement at all.

type Row = { user_id: string; tokens_won: number }

let selectRows: Row[] = []
let selectError: { message: string } | null = null
let insertError: { message: string } | null = null
let insertedId = 42
let updateError: { message: string } | null = null

const mockSelectEq = jest.fn(() => Promise.resolve({ data: selectRows, error: selectError }))
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }))

const mockInsertSingle = jest.fn(() => Promise.resolve({ data: insertError ? null : { id: insertedId }, error: insertError }))
const mockInsertSelect = jest.fn(() => ({ single: mockInsertSingle }))
const mockInsert = jest.fn(() => ({ select: mockInsertSelect }))

const mockUpdateEq = jest.fn(() => Promise.resolve({ error: updateError }))
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }))

const mockFrom = jest.fn((table: string) => {
  if (table === 'match_wins') return { select: mockSelect, insert: mockInsert, update: mockUpdate }
  throw new Error(`Unexpected table in test: ${table}`)
})

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { from: mockFrom },
}))

import { computeRank, recordMatchWin, type RecordMatchWinInput } from '../../src/game/matchWinsService'

function baseInput(overrides: Partial<RecordMatchWinInput> = {}): RecordMatchWinInput {
  return {
    userId: 'u-new',
    tier: 'initiate',
    mode: 'solo',
    tokensWon: 1000,
    isTripleSweep: false,
    bestHand: null,
    opponents: [],
    ...overrides,
  }
}

beforeEach(() => {
  selectRows = []
  selectError = null
  insertError = null
  insertedId = 42
  updateError = null
  mockFrom.mockClear()
  mockSelect.mockClear()
  mockSelectEq.mockClear()
  mockInsert.mockClear()
  mockInsertSelect.mockClear()
  mockInsertSingle.mockClear()
  mockUpdate.mockClear()
  mockUpdateEq.mockClear()
})

describe('computeRank', () => {
  test('returns 1-indexed rank based on personal-best tokens_won per user', async () => {
    selectRows = [
      { user_id: 'u1', tokens_won: 500 },
      { user_id: 'u2', tokens_won: 900 },
      { user_id: 'u1', tokens_won: 1200 }, // u1's best is 1200, not 500
      { user_id: 'u3', tokens_won: 700 },
    ]
    await expect(computeRank('initiate', 'u1')).resolves.toBe(1) // 1200 > 900 > 700
    await expect(computeRank('initiate', 'u2')).resolves.toBe(2)
    await expect(computeRank('initiate', 'u3')).resolves.toBe(3)
  })

  test('returns null when the user has never won in this tier', async () => {
    selectRows = [{ user_id: 'someone-else', tokens_won: 500 }]
    await expect(computeRank('initiate', 'u-absent')).resolves.toBeNull()
  })

  test('returns null and logs on query error rather than throwing', async () => {
    selectError = { message: 'boom' }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(computeRank('initiate', 'u1')).resolves.toBeNull()
    spy.mockRestore()
  })

  test('filters strictly by tier — a user_id present only in another tier does not appear', async () => {
    // mockSelectEq ignores the actual tier arg passed (test double), but this documents the
    // intended real-world behavior: the .eq('tier', tier) call scopes the query server-side.
    expect(mockSelect).not.toHaveBeenCalled()
    await computeRank('adept', 'u1')
    expect(mockFrom).toHaveBeenCalledWith('match_wins')
    expect(mockSelectEq).toHaveBeenCalledWith('tier', 'adept')
  })
})

describe('recordMatchWin — rank_before/rank_after write logic', () => {
  test('writes rank_before/rank_after when the new row is a top-10 personal best that changes rank', async () => {
    // Before insert: u-new has never won here (rankBefore=null). Score 2500 slots in between
    // c(3000) and d(2000) once inserted, i.e. rank 4 (a=5000#1, b=4000#2, c=3000#3, u-new=2500#4).
    selectRows = [
      { user_id: 'a', tokens_won: 5000 },
      { user_id: 'b', tokens_won: 4000 },
      { user_id: 'c', tokens_won: 3000 },
      { user_id: 'd', tokens_won: 2000 },
    ]
    // After insert() is called, computeRank runs again — simulate the new row now being present
    // by mutating selectRows inside the insert mock (mimics a real DB read-after-write).
    mockInsertSingle.mockImplementationOnce(() => {
      selectRows = [...selectRows, { user_id: 'u-new', tokens_won: 2500 }]
      return Promise.resolve({ data: { id: 99 }, error: null })
    })

    await recordMatchWin(baseInput({ userId: 'u-new', tokensWon: 2500 }))

    expect(mockUpdate).toHaveBeenCalledWith({ rank_before: null, rank_after: 4 })
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 99)
  })

  test('does not write rank columns when the match does not crack the top 10', async () => {
    selectRows = Array.from({ length: 10 }, (_, i) => ({ user_id: `p${i}`, tokens_won: 10000 - i }))
    mockInsertSingle.mockImplementationOnce(() => {
      selectRows = [...selectRows, { user_id: 'u-new', tokens_won: 1 }]
      return Promise.resolve({ data: { id: 100 }, error: null })
    })

    await recordMatchWin(baseInput({ userId: 'u-new', tokensWon: 1 }))

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('does not write rank columns when rank is unchanged (re-affirming an existing rank)', async () => {
    // u-new already holds rank 1 today (10000); this match is a smaller win (still their best is
    // still 10000, this new row of 500 does not change their personal best or rank at all).
    selectRows = [{ user_id: 'u-new', tokens_won: 10000 }, { user_id: 'other', tokens_won: 100 }]
    mockInsertSingle.mockImplementationOnce(() => {
      selectRows = [...selectRows, { user_id: 'u-new', tokens_won: 500 }]
      return Promise.resolve({ data: { id: 101 }, error: null })
    })

    await recordMatchWin(baseInput({ userId: 'u-new', tokensWon: 500 }))

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('grandmaster wins never trigger rank computation at all (not one of the 4 Top10 tiers)', async () => {
    await recordMatchWin(baseInput({ tier: 'grandmaster' }))

    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalled()
  })

  test('a failed insert is logged and rank computation is skipped entirely', async () => {
    insertError = { message: 'insert boom' }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await recordMatchWin(baseInput())

    expect(mockUpdate).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test('a failed rank update is logged but does not throw', async () => {
    updateError = { message: 'update boom' }
    selectRows = []
    mockInsertSingle.mockImplementationOnce(() => Promise.resolve({ data: { id: 102 }, error: null }))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(recordMatchWin(baseInput({ tokensWon: 999 }))).resolves.toBeUndefined()

    spy.mockRestore()
  })
})
