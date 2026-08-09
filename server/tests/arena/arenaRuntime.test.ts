import { ArenaRuntime } from '../../src/arena/realtime/arenaRuntime'

describe('ArenaRuntime', () => {
  test('creates an isolated match and binds every human to it', () => {
    const runtime = new ArenaRuntime(() => 0.2, 1_000)
    expect(runtime.join({ playerId: 'p1', tokenBalance: 1_000_001, joinedAt: 1_000 }, 1_000)).toMatchObject({ ok: true, status: 'WAITING' })
    expect(runtime.join({ playerId: 'p2', tokenBalance: 1_000_001, joinedAt: 1_001 }, 1_001)).toMatchObject({ ok: true, status: 'WAITING' })
    const result = runtime.join({ playerId: 'p3', tokenBalance: 1_000_001, joinedAt: 1_002 }, 1_002)
    expect(result).toMatchObject({ ok: true, status: 'WAITING', humanCount: 3 })
    expect(runtime.matchForPlayer('p1')).toBeNull()
    runtime.tickQueue(1_002)
    expect(runtime.matchForPlayer('p1')).toBe(runtime.matchForPlayer('p3'))
  })

  test('rejects actor spoofing before the engine sees the action', () => {
    const runtime = new ArenaRuntime(() => 0.2, 1_000)
    runtime.join({ playerId: 'p1', tokenBalance: 1_000_001, joinedAt: 1_000 }, 1_000)
    runtime.join({ playerId: 'p2', tokenBalance: 1_000_001, joinedAt: 1_001 }, 1_001)
    runtime.join({ playerId: 'p3', tokenBalance: 1_000_001, joinedAt: 1_002 }, 1_002)
    runtime.tickQueue(1_002)
    expect(() => runtime.submit('p1', { type: 'BUY_IN_RESERVED', actionId: 'spoof', actorId: 'p2' }, 1_003)).toThrow('ARENA_ACTION_ACTOR_MISMATCH')
  })

  test('server token threshold is enforced in the runtime queue', () => {
    const runtime = new ArenaRuntime(() => 0.2, 1_000)
    expect(runtime.join({ playerId: 'p1', tokenBalance: 1_000_000, joinedAt: 1_000 }, 1_000)).toEqual({ ok: false, reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED' })
  })

  test('two humans wait 60 seconds measured from the second join, then ticker alone starts the table', () => {
    const runtime = new ArenaRuntime(() => 0.9, 0)
    runtime.join({ playerId: 'p1', tokenBalance: 1_000_001, joinedAt: 1_000 }, 1_000)
    runtime.join({ playerId: 'p2', tokenBalance: 1_000_001, joinedAt: 200_000 }, 200_000)
    expect(runtime.tickQueue(259_999)).toBeNull()
    expect(runtime.matchForPlayer('p1')).toBeNull()
    expect(runtime.tickQueue(260_000)).not.toBeNull()
    expect(runtime.matchForPlayer('p1')).not.toBeNull()
  })
})
