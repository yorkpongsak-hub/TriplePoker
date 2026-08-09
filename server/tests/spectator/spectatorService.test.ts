import { sanitizePublicEvent } from '../../src/spectator/publicEventSanitizer'
import { SpectatorService } from '../../src/spectator/spectatorService'

describe('SpectatorService', () => {
  afterEach(() => jest.useRealTimers())

  function liveService(delayMs = 30_000) {
    const emitted: unknown[] = []
    const service = new SpectatorService((_id, event) => emitted.push(event))
    const broadcastId = service.create({ tableId: 't1', tierId: 'A_PLUS', tierName: 'High Noble', enabledByUserId: 'vip', delayMs })
    service.start('t1', 'Monarch')
    return { service, broadcastId, emitted }
  }

  test('the eleventh unique viewer is rejected and a seat reopens after leave', () => {
    const { service, broadcastId } = liveService()
    for (let i = 0; i < 10; i++) service.join(broadcastId, `viewer-${i}`)
    expect(() => service.join(broadcastId, 'viewer-10')).toThrow('SPECTATOR_LIMIT_REACHED')
    service.leave(broadcastId, 'viewer-0')
    expect(service.join(broadcastId, 'viewer-10').viewerCount).toBe(10)
  })

  test('public events are emitted only after the server delay', () => {
    jest.useFakeTimers().setSystemTime(1_000)
    const { service, emitted } = liveService()
    const event = service.publish('t1', { type: 'ROUND_STARTED', round: 1, totalRounds: 5 }, 1_000)
    expect(event?.broadcastAt).toBe(31_000)
    expect(emitted).toHaveLength(0)
    jest.advanceTimersByTime(29_999)
    expect(emitted).toHaveLength(0)
    jest.advanceTimersByTime(1)
    expect(emitted).toHaveLength(1)
  })

  test('mid-match join receives only timeline data at or before spectator time', () => {
    const { service, broadcastId } = liveService()
    service.saveSnapshot('t1', {
      tableId: 't1', snapshotAt: 50_000, tierId: 'A_PLUS', players: [], round: 1, totalRounds: 5,
      publicCenterCards: [], publicPiles: [], publicPot: { amount: 0 }, matchStatus: 'IN_PROGRESS',
    })
    service.publish('t1', { type: 'ROUND_STARTED', round: 2, totalRounds: 5 }, 60_000)
    service.publish('t1', { type: 'ROUND_STARTED', round: 3, totalRounds: 5 }, 80_000)
    const result = service.join(broadcastId, 'viewer', 100_000)
    expect(result.snapshot?.snapshotAt).toBe(50_000)
    expect(result.replay.map(x => x.occurredAt)).toEqual([60_000])
  })
})

describe('public event sanitizer', () => {
  test.each([
    { type: 'PLAYER_HAND_UPDATED', cards: ['AS'] },
    { type: 'ROUND_STARTED', round: 1, totalRounds: 5, rngSeed: 'secret' },
    { type: 'PLAYER_JOINED', seat: 1, publicProfile: { displayName: 'P', metadata: { email: 'x' } } },
  ])('fails closed for private or unknown payload %#', payload => {
    expect(sanitizePublicEvent(payload)).toBeNull()
  })

  test('accepts an allowlisted public payload', () => {
    expect(sanitizePublicEvent({ type: 'PILE_RESULT', pile: 1, winnerSeats: [0] }))
      .toEqual({ type: 'PILE_RESULT', pile: 1, winnerSeats: [0] })
  })
})
