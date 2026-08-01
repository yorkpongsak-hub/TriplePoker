import { createSovereignPublicEvent, SovereignDelayedFeed, SovereignSpectatorCapacity } from '../../src/arena/sovereign/sovereignPublicFeed'

const event = (sequence: number, payload: Record<string, unknown> = {}) => createSovereignPublicEvent({
  eventId: `e${sequence}`, matchId: 'm1', sequence, type: 'PUBLIC_PHASE_CHANGED', publicPayload: payload,
  occurredAt: `2026-08-01T00:00:${String(sequence).padStart(2, '0')}.000Z`, schemaVersion: 1,
})

describe('Gate 10.5 delayed public feed', () => {
  test('enforces 30 seconds for incremental events and snapshots', () => {
    const feed = new SovereignDelayedFeed(); feed.append(event(1)); feed.append(event(2))
    expect(feed.visibleAfter('2026-08-01T00:00:31.999Z')).toHaveLength(1)
    expect(feed.snapshotThrough('2026-08-01T00:00:32.000Z').throughSequence).toBe(2)
  })
  test('rejects secret-shaped payloads and sequence gaps', () => {
    expect(() => event(1, { player: { hiddenCards: ['x'] } })).toThrow('SPECTATOR_SECRET_FIELD')
    const feed = new SovereignDelayedFeed(); feed.append(event(1))
    expect(() => feed.append(event(3))).toThrow('PUBLIC_SEQUENCE_GAP')
  })
  test('deduplicates events and replays only after requested sequence', () => {
    const feed = new SovereignDelayedFeed(); feed.append(event(1)); feed.append(event(1)); feed.append(event(2))
    expect(feed.visibleAfter('2026-08-01T00:01:00.000Z', 1).map(item => item.sequence)).toEqual([2])
  })
  test('caps spectators at exactly 100 while allowing idempotent rejoin', () => {
    const capacity = new SovereignSpectatorCapacity()
    for (let i = 1; i <= 100; i += 1) expect(capacity.join(`u${i}`, i).admitted).toBe(true)
    expect(capacity.join('u101', 101).admitted).toBe(false)
    expect(capacity.join('u1', 102).admitted).toBe(true)
  })
  test('holds a seat for the 20-second reconnect grace then releases it', () => {
    const capacity = new SovereignSpectatorCapacity()
    expect(capacity.join('u1', 1_000).admitted).toBe(true)
    expect(capacity.disconnect('u1', 2_000)).toBe(true)
    expect(capacity.reconnect('u1', 21_999)).toBe(true)
    expect(capacity.disconnect('u1', 22_000)).toBe(true)
    expect(capacity.expireGrace(42_001)).toEqual(['u1'])
    expect(capacity.count).toBe(0)
  })
})
