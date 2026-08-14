// profileStreakClaim.test.ts — POST /profile/claim-streak-reward (Streak Milestone Bonus, มติลุงเยาะ
// 2026-08-14). This route only decides "is there a reward, and if so mint it" — it does not check
// VIP status or whether an ad was watched at all; that's entirely the client's responsibility
// (routing free members through /watch-ad?mode=gate before ever calling this endpoint).

const mockMint = jest.fn()
jest.mock('../../src/economy/economyService', () => ({
  economyService: { mint: (...args: unknown[]) => mockMint(...args) },
}))

const mockGetUser = jest.fn()

let readUserData: any = null
const mockReadMaybeSingle = jest.fn(() => Promise.resolve({ data: readUserData, error: null }))
const mockReadEq = jest.fn(() => ({ maybeSingle: mockReadMaybeSingle }))
const mockReadSelect = jest.fn(() => ({ eq: mockReadEq }))

let updateUserData: any = { token_balance: 1500 }
const mockUpdateMaybeSingle = jest.fn(() => Promise.resolve({ data: updateUserData, error: null }))
const mockUpdateSelect = jest.fn(() => ({ maybeSingle: mockUpdateMaybeSingle }))
const mockUpdateEq = jest.fn(() => ({ select: mockUpdateSelect }))
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }))

const mockFrom = jest.fn((table: string) => {
  if (table !== 'users') throw new Error(`unexpected table: ${table}`)
  return { select: mockReadSelect, update: mockUpdate }
})

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser } },
  supabaseAdmin: { from: mockFrom },
}))

import Fastify from 'fastify'
import { profileRoutes } from '../../src/routes/profile'

async function buildApp() {
  const app = Fastify()
  await app.register(profileRoutes)
  await app.ready()
  return app
}

beforeEach(() => {
  readUserData = null
  updateUserData = { token_balance: 1500 }
  mockGetUser.mockReset()
  mockMint.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
  mockFrom.mockClear()
  mockReadSelect.mockClear()
  mockReadEq.mockClear()
  mockReadMaybeSingle.mockClear()
  mockUpdate.mockClear()
  mockUpdateEq.mockClear()
  mockUpdateSelect.mockClear()
  mockUpdateMaybeSingle.mockClear()
})

describe('POST /profile/claim-streak-reward', () => {
  test('requires an authenticated user', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/profile/claim-streak-reward' })
    expect(response.statusCode).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
    await app.close()
  })

  test('day 3, never claimed — mints 300 Token and marks milestone 3 claimed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    readUserData = { streak_count: 3, streak_claimed_milestone: 0 }
    updateUserData = { token_balance: 1300 }
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, milestone: 3, tokensAwarded: 300, newTokenBalance: 1300 })
    expect(mockMint).toHaveBeenCalledTimes(1)
    const mintCall = mockMint.mock.calls[0][0]
    expect(mintCall.amount).toBe(300)
    expect(mintCall.reason).toBe('STREAK_MILESTONE_BONUS')
    expect(mintCall.to).toEqual({ accountType: 'PLAYER', accountId: 'user-1' })
    expect(mintCall.idempotencyKey).toMatch(/^STREAK_MILESTONE:user-1:3:\d{4}-\d{2}-\d{2}$/)
    expect(mockUpdate).toHaveBeenCalledWith({ streak_claimed_milestone: 3 })
    await app.close()
  })

  test('day 7, highest unclaimed milestone (7) wins over lower ones — mints 1000', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
    readUserData = { streak_count: 7, streak_claimed_milestone: 0 }
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().milestone).toBe(7)
    expect(response.json().tokensAwarded).toBe(1000)
    await app.close()
  })

  test('nothing to claim (day 4, already claimed 3) — 400, mint never called', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-3' } }, error: null })
    readUserData = { streak_count: 4, streak_claimed_milestone: 3 }
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'NOTHING_TO_CLAIM' })
    expect(mockMint).not.toHaveBeenCalled()
    await app.close()
  })

  test('user row not found — 404', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-4' } }, error: null })
    readUserData = null
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  test('mint failure — 500, streak_claimed_milestone is not updated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-5' } }, error: null })
    readUserData = { streak_count: 5, streak_claimed_milestone: 3 }
    mockMint.mockRejectedValueOnce(new Error('ledger down'))
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(500)
    expect(mockUpdate).not.toHaveBeenCalled()
    await app.close()
  })
})
