import { buildOriginPolicy, takeRate, validateSocketPacket } from '../../src/security/runtimeSecurity'

describe('runtime security', () => {
  test('production origin policy accepts native clients and configured web origins only', () => {
    const allowed = buildOriginPolicy('https://game.example, https://admin.example', true)
    expect(allowed(undefined)).toBe(true)
    expect(allowed('https://game.example')).toBe(true)
    expect(allowed('http://localhost:8081')).toBe(false)
    expect(allowed('https://evil.example')).toBe(false)
  })

  test('rate bucket enforces the limit and resets after its window', () => {
    const store = new Map()
    expect(takeRate(store, 'client', 2, 1_000, 100)).toBe(true)
    expect(takeRate(store, 'client', 2, 1_000, 200)).toBe(true)
    expect(takeRate(store, 'client', 2, 1_000, 300)).toBe(false)
    expect(takeRate(store, 'client', 2, 1_000, 1_101)).toBe(true)
  })

  test('socket packets cannot select another account', () => {
    expect(validateSocketPacket('owner', { userId: 'attacker' })).toBe('FORBIDDEN_IDENTITY')
    expect(validateSocketPacket('owner', { playerId: 'attacker' })).toBe('FORBIDDEN_IDENTITY')
    expect(validateSocketPacket('owner', { userId: 'owner' })).toBeUndefined()
  })

  test('socket room identifiers are bounded and conservative', () => {
    expect(validateSocketPacket('owner', { roomId: 'tier_d:owner-123' })).toBeUndefined()
    expect(validateSocketPacket('owner', { roomId: '../another-room' })).toBe('INVALID_ROOM_ID')
    expect(validateSocketPacket('owner', { roomId: 'x'.repeat(161) })).toBe('INVALID_ROOM_ID')
  })
})
