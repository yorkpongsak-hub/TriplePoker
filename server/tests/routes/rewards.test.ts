// ─────────────────────────────────────────────────────────────────────────────
// rewards.test.ts — Unit Tests สำหรับ POST /rewards/watch-ad
// Central Economy Ledger Phase 7 Round 8 (Ad-Watch Bonus, 2026-08-13)
// ครอบคลุม: auth guard · cooldown active (429) · success (mint + balance re-read) ·
// mint failure releases the cooldown lock (500)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

const mockGetUser = jest.fn()
const mockSingle = jest.fn()
const mockEq = jest.fn(() => ({ single: mockSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser } },
  supabaseAdmin: { from: mockFrom },
}))

const mockRedisSet = jest.fn()
const mockRedisTtl = jest.fn()
const mockRedisDel = jest.fn()
jest.mock('../../src/config/redis', () => ({
  redis: { set: (...args: unknown[]) => mockRedisSet(...args), ttl: (...args: unknown[]) => mockRedisTtl(...args), del: (...args: unknown[]) => mockRedisDel(...args) },
}))

const mockMint = jest.fn()
jest.mock('../../src/economy/economyService', () => ({
  economyService: { mint: (...args: unknown[]) => mockMint(...args) },
}))

import Fastify, { FastifyInstance } from 'fastify'
import rewardsRoutes from '../../src/routes/rewards'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(rewardsRoutes)
  await app.ready()
  return app
}

const AUTH_USER = { id: 'user-uuid-123' }

beforeEach(() => {
  mockGetUser.mockReset()
  mockSingle.mockReset()
  mockEq.mockClear()
  mockSelect.mockClear()
  mockFrom.mockClear()
  mockRedisSet.mockReset()
  mockRedisTtl.mockReset()
  mockRedisDel.mockReset()
  mockMint.mockReset()
})

describe('POST /rewards/watch-ad', () => {
  test('ไม่มี Authorization header → 401', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/rewards/watch-ad' })
    expect(res.statusCode).toBe(401)
    expect(mockRedisSet).not.toHaveBeenCalled()
    await app.close()
  })

  test('token ไม่ valid → 401', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad token' } })
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/rewards/watch-ad', headers: { authorization: 'Bearer bad' } })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('cooldown ยังไม่หมด (redis SET NX ล้มเหลว) → 429 พร้อม retryAfterSeconds, ไม่เรียก mint', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockRedisSet.mockResolvedValueOnce(null) // NX ล้มเหลว = key มีอยู่แล้ว
    mockRedisTtl.mockResolvedValueOnce(1800)

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/rewards/watch-ad', headers: { authorization: 'Bearer good' } })
    expect(res.statusCode).toBe(429)
    expect(res.json()).toEqual({ error: 'AD_COOLDOWN_ACTIVE', retryAfterSeconds: 1800 })
    expect(mockMint).not.toHaveBeenCalled()
    await app.close()
  })

  test('claim สำเร็จ → mint TOKEN ผ่าน Ledger, คืน tokensAwarded อยู่ในช่วง config + newTokenBalance', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockRedisSet.mockResolvedValueOnce('OK')
    mockMint.mockResolvedValueOnce({ transactionId: 1, replayed: false })
    mockSingle.mockResolvedValueOnce({ data: { token_balance: 1150 }, error: null })

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/rewards/watch-ad', headers: { authorization: 'Bearer good' } })
    expect(res.statusCode).toBe(200)
    const json = res.json()
    expect(json.success).toBe(true)
    expect(json.tokensAwarded).toBeGreaterThanOrEqual(50)
    expect(json.tokensAwarded).toBeLessThanOrEqual(100)
    expect(json.newTokenBalance).toBe(1150)

    const mintCall = mockMint.mock.calls[0][0]
    expect(mintCall.to).toEqual({ accountType: 'PLAYER', accountId: AUTH_USER.id })
    expect(mintCall.currency).toBe('TOKEN')
    expect(mintCall.reason).toBe('AD_REWARD')
    expect(mintCall.idempotencyKey).toMatch(new RegExp(`^AD_REWARD:${AUTH_USER.id}:\\d+$`))
    await app.close()
  })

  test('mint ล้มเหลว → คืน cooldown lock (redis.del) แล้วตอบ 500', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockRedisSet.mockResolvedValueOnce('OK')
    mockMint.mockRejectedValueOnce(new Error('ledger down'))

    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/rewards/watch-ad', headers: { authorization: 'Bearer good' } })
    expect(res.statusCode).toBe(500)
    expect(mockRedisDel).toHaveBeenCalledWith(`ad_reward_cooldown:${AUTH_USER.id}`)
    await app.close()
  })
})
