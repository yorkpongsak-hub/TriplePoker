import { SovereignLifecycleStore, startSovereignLifecycleRuntime, tickSovereignLifecycle } from '../../src/arena/sovereign/sovereignLifecycleRuntime'

describe('Sovereign lifecycle runtime', () => {
  test('advances every due boundary through an injected idempotent store', async () => {
    const calls: string[] = []
    const store: SovereignLifecycleStore = {
      transitionMatches: async (from, to, column) => { calls.push(`${from}:${to}:${column}`); return 1 },
    }
    expect(await tickSovereignLifecycle(store, Date.parse('2026-08-01T00:00:00Z'))).toBe(5)
    expect(calls).toEqual([
      'PUBLISHED:CONFIRMATION_OPEN:created_at',
      'CONFIRMATION_OPEN:CHECK_IN_PENDING:scheduled_standby_open_at',
      'CHECK_IN_PENDING:CHECK_IN_OPEN:scheduled_check_in_open_at',
      'CHECK_IN_OPEN:FILLING_SEATS:scheduled_check_in_close_at',
      'READY:IN_PROGRESS:scheduled_start_at',
    ])
  })

  test('does not start a scheduler while the feature flag is disabled', () => {
    const previous = process.env.SOVEREIGN_ENABLED; delete process.env.SOVEREIGN_ENABLED
    expect(startSovereignLifecycleRuntime()).toBeNull()
    if (previous === undefined) delete process.env.SOVEREIGN_ENABLED
    else process.env.SOVEREIGN_ENABLED = previous
  })
})
