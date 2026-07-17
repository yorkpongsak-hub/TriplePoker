// ─────────────────────────────────────────────────────────────────────────────
// auth.test.ts — Unit Tests สำหรับ POST /auth/register
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ครอบคลุม: auth guard · missing body · name validation reject · DB error · success
// ─────────────────────────────────────────────────────────────────────────────

const mockGetUser = jest.fn()
const mockMaybeSingle = jest.fn()
const mockSelect = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockEq = jest.fn(() => ({ select: mockSelect }))
const mockUpdate = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ update: mockUpdate }))

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
  },
  supabaseAdmin: {
    from: mockFrom,
  },
}))

const mockValidateDisplayName = jest.fn()
jest.mock('../../src/utils/nameValidator', () => ({
  validateDisplayName: mockValidateDisplayName,
}))

import Fastify, { FastifyInstance } from 'fastify'
import { authRoutes } from '../../src/routes/auth'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()
  await app.register(authRoutes)
  await app.ready()
  return app
}

const AUTH_USER = { id: 'user-uuid-123', email: 'test@example.com' }

beforeEach(() => {
  mockGetUser.mockReset()
  mockMaybeSingle.mockReset()
  mockSelect.mockClear()
  mockEq.mockClear()
  mockUpdate.mockClear()
  mockFrom.mockClear()
  mockValidateDisplayName.mockReset()
})

describe('POST /auth/register', () => {

  test('Case 1: ไม่มี Authorization header → 401', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { displayName: 'York' } })
    expect(res.statusCode).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
    await app.close()
  })

  test('Case 2: token ไม่ valid → 401', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad token' } })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer bad-token' },
      payload: { displayName: 'York' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('Case 3: ไม่ส่ง displayName มา → 400 INVALID_FORMAT', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer good-token' },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_FORMAT')
    expect(mockValidateDisplayName).not.toHaveBeenCalled()
    await app.close()
  })

  test('Case 4: validateDisplayName reject (เช่น BOSS_NAME) → 400 พร้อม reason', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockValidateDisplayName.mockResolvedValueOnce({
      allowed: false,
      reason: 'BOSS_NAME',
      message: 'This name belongs to a legendary Last Boss and cannot be used.',
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: 'I am York' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({
      error: 'BOSS_NAME',
      message: 'This name belongs to a legendary Last Boss and cannot be used.',
    })
    expect(mockFrom).not.toHaveBeenCalled()
    await app.close()
  })

  test('Case 5: validateDisplayName ผ่าน แต่ update DB error → 500 DB_ERROR', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockValidateDisplayName.mockResolvedValueOnce({ allowed: true })
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: 'Regular Player' },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('DB_ERROR')
    await app.close()
  })

  test('Case 6: validateDisplayName ผ่าน แต่ไม่มี user row ให้ update → 404 USER_NOT_FOUND', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockValidateDisplayName.mockResolvedValueOnce({ allowed: true })
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: 'Regular Player' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('USER_NOT_FOUND')
    await app.close()
  })

  test('Case 7: ทุกอย่างผ่าน → 200 บันทึกสำเร็จ', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: AUTH_USER }, error: null })
    mockValidateDisplayName.mockResolvedValueOnce({ allowed: true })
    mockMaybeSingle.mockResolvedValueOnce({
      data: { user_id: AUTH_USER.id, display_name: 'Regular Player' },
      error: null,
    })

    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: 'Bearer good-token' },
      payload: { displayName: '  Regular Player  ' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      success: true,
      user: { user_id: AUTH_USER.id, display_name: 'Regular Player' },
    })
    expect(mockValidateDisplayName).toHaveBeenCalledWith('  Regular Player  ')
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Regular Player' })
    expect(mockEq).toHaveBeenCalledWith('user_id', AUTH_USER.id)
    await app.close()
  })
})
