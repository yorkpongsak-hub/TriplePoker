const mockRpc = jest.fn()
jest.mock('../../src/config/supabase', () => ({ supabaseAdmin: { rpc: (...args: any[]) => mockRpc(...args) } }))

import { persistTierDLevelOutcome } from '../../src/game/tierDSoloProgress'

describe('Tier D Solo progress persistence', () => {
  beforeEach(() => mockRpc.mockReset())

  test('uses the atomic settlement RPC and returns the persisted progression', async () => {
    mockRpc.mockResolvedValueOnce({ data: { level: 501, currentWinStreak: 8, bestWinStreak: 8 }, error: null })
    await expect(persistTierDLevelOutcome('user-1', true)).resolves.toEqual({ level: 501, currentWinStreak: 8, bestWinStreak: 8 })
    expect(mockRpc).toHaveBeenCalledWith('settle_tier_d_solo_level', { p_user_id: 'user-1', p_won: true })
  })

  test('does not invent progress when persistence fails', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'failed' } })
    await expect(persistTierDLevelOutcome('user-1', false)).resolves.toBeNull()
  })
})
