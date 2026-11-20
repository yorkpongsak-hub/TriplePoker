const mockGetUser = jest.fn()
const mockMaybeSingle = jest.fn()
const mockSelect = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockOr = jest.fn(() => ({ select: mockSelect }))
const mockEq = jest.fn(() => ({ or: mockOr }))
const mockUpdate = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ update: mockUpdate }))

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
  mockGetUser.mockReset()
  mockMaybeSingle.mockReset()
  mockFrom.mockClear()
  mockUpdate.mockClear()
  mockEq.mockClear()
  mockSelect.mockClear()
  mockOr.mockClear()
})

describe('POST /profile/touch-last-login', () => {
  test('requires an authenticated user', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/profile/touch-last-login' })
    expect(response.statusCode).toBe(401)
    expect(mockGetUser).not.toHaveBeenCalled()
    await app.close()
  })

  test('updates last_login for the authenticated profile', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: { last_login: '2026-08-03T12:00:00.000Z' }, error: null })
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/touch-last-login', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ last_login: expect.any(String) })
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('last_login.is.null,last_login.lt.'))
    expect(response.json()).toEqual({ success: true, updated: true, lastLoginAt: '2026-08-03T12:00:00.000Z' })
    await app.close()
  })

  test('does not update again when today was already recorded', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST', url: '/profile/touch-last-login', headers: { authorization: 'Bearer valid-token' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, updated: false, lastLoginAt: null })
    await app.close()
  })
})
