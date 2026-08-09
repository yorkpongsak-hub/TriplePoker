const mockGetUser = jest.fn()

jest.mock('../../src/config/supabase', () => ({
  supabase: { auth: { getUser: mockGetUser } },
  supabaseAdmin: { from: jest.fn(), rpc: jest.fn() },
}))

import Fastify from 'fastify'
import sovereignRoutes from '../../src/routes/sovereign'

describe('Sovereign runtime routes', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalFlag = process.env.SOVEREIGN_ENABLED

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.env.SOVEREIGN_ENABLED = originalFlag
    mockGetUser.mockReset()
  })

  test('fails closed in production while the feature flag is disabled', async () => {
    process.env.NODE_ENV = 'production'; delete process.env.SOVEREIGN_ENABLED
    const app = Fastify(); await app.register(sovereignRoutes); await app.ready()
    const response = await app.inject({ method: 'GET', url: '/sovereign/status', headers: { authorization: 'Bearer token' } })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ error: 'SOVEREIGN_DISABLED' })
    expect(mockGetUser).not.toHaveBeenCalled()
    await app.close()
  })

  test('requires an authenticated user outside production too', async () => {
    process.env.NODE_ENV = 'test'
    const app = Fastify(); await app.register(sovereignRoutes); await app.ready()
    const response = await app.inject({ method: 'GET', url: '/sovereign/archive' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'UNAUTHORIZED' })
    await app.close()
  })

  test('rejects malformed public-feed cursors before database access', async () => {
    process.env.NODE_ENV = 'test'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    const app = Fastify(); await app.register(sovereignRoutes); await app.ready()
    const response = await app.inject({ method: 'GET', url: '/sovereign/public-feed?matchId=m1&after=-1', headers: { authorization: 'Bearer token' } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'INVALID_FEED_CURSOR' })
    await app.close()
  })
})
