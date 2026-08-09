import {
  SovereignStandbyEntry,
  beginStandbyDisconnectGrace,
  canJoinSovereignStandby,
  claimFirstValidStandby,
  restoreStandbyConnection,
} from '../../src/arena/sovereign/sovereignStandby'

function entry(id: string, sequence: number, overrides: Partial<SovereignStandbyEntry> = {}): SovereignStandbyEntry {
  return {
    id,
    userId: `u-${id}`,
    queueSequence: sequence,
    joinedAtServer: '2026-08-28T12:45:00.000Z',
    status: 'QUEUED',
    connected: true,
    eligible: true,
    reservationActive: true,
    graceExpiresAt: null,
    ...overrides,
  }
}

describe('Gate 10.3 Sovereign standby', () => {
  test('join window is inclusive at open and exclusive at 20:05', () => {
    const open = '2026-08-28T12:45:00.000Z'
    const close = '2026-08-28T13:05:00.000Z'
    expect(canJoinSovereignStandby(open, open, close)).toBe(true)
    expect(canJoinSovereignStandby(close, open, close)).toBe(false)
  })

  test('restores queue position inside the 20-second grace window', () => {
    const disconnected = beginStandbyDisconnectGrace(entry('a', 1), '2026-08-28T13:00:00.000Z')
    expect(disconnected.graceExpiresAt).toBe('2026-08-28T13:00:20.000Z')
    expect(restoreStandbyConnection(disconnected, '2026-08-28T13:00:20.000Z')).toMatchObject({
      status: 'QUEUED', connected: true, queueSequence: 1,
    })
  })

  test('skips invalid earlier entries and claims the first valid FCFS entry', () => {
    const result = claimFirstValidStandby([
      entry('a', 1, { connected: false }),
      entry('b', 2, { reservationActive: false }),
      entry('c', 3),
    ], '2026-08-28T13:05:00.000Z')
    expect(result.skippedIds).toEqual(['a', 'b'])
    expect(result.claimed).toMatchObject({ id: 'c', status: 'CLAIMED' })
  })
})
