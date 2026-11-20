const mockGetUser = jest.fn()
jest.mock('../../src/config/supabase', () => ({ supabase: { auth: { getUser: mockGetUser } }, supabaseAdmin: { from: jest.fn() } }))
import Fastify from 'fastify'
import { profileRoutes } from '../../src/routes/profile'

test('legacy milestone endpoint cannot issue a second Daily Streak reward', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
  const app = Fastify(); await app.register(profileRoutes); await app.ready()
  const response = await app.inject({ method: 'POST', url: '/profile/claim-streak-reward', headers: { authorization: 'Bearer token' } })
  expect(response.statusCode).toBe(410)
  expect(response.json()).toEqual({ error: 'DAILY_STREAK_REPLACED' })
  await app.close()
})
