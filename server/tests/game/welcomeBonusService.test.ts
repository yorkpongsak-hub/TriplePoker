// welcomeBonusService.test.ts — Guest Play / Welcome Bonus extraction (มติลุงเยาะ 2026-08-13)
// Covers grantWelcomeBonusIfNeeded() in isolation: correct mint() call shape, and that a mint
// failure is swallowed internally (never throws) — POST /auth/register relies on this service
// remaining best-effort.

const mockMint = jest.fn()
jest.mock('../../src/economy/economyService', () => ({
  economyService: { mint: (...args: unknown[]) => mockMint(...args) },
}))

import { grantWelcomeBonusIfNeeded } from '../../src/game/welcomeBonusService'

beforeEach(() => {
  mockMint.mockReset().mockResolvedValue({ transactionId: 1, replayed: false })
})

describe('grantWelcomeBonusIfNeeded', () => {
  test('mints 3,000 TOKEN with a deterministic per-user idempotency key', async () => {
    await grantWelcomeBonusIfNeeded('user-1')
    expect(mockMint).toHaveBeenCalledWith({
      idempotencyKey: 'WELCOME_BONUS:user-1',
      to: { accountType: 'PLAYER', accountId: 'user-1' },
      currency: 'TOKEN',
      amount: 3000,
      reason: 'WELCOME_BONUS',
      actor: 'registration_system',
    })
  })

  test('a mint failure is caught internally and never throws (best-effort, safe to call from any route)', async () => {
    mockMint.mockRejectedValueOnce(new Error('ledger down'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await expect(grantWelcomeBonusIfNeeded('user-2')).resolves.toBeUndefined()

    spy.mockRestore()
  })

  test('calling twice for the same user is safe (idempotency key dedupes on the RPC side, this just proves no local double-call guard is needed)', async () => {
    await grantWelcomeBonusIfNeeded('user-3')
    await grantWelcomeBonusIfNeeded('user-3')
    expect(mockMint).toHaveBeenCalledTimes(2)
    expect(mockMint.mock.calls[0][0].idempotencyKey).toBe(mockMint.mock.calls[1][0].idempotencyKey)
  })
})
