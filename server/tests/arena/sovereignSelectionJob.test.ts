import {
  RunSovereignSelectionJobInput,
  SovereignSelectionSnapshot,
  SovereignSelectionSnapshotRepository,
  runSovereignSelectionJob,
} from '../../src/arena/sovereign/sovereignSelectionJob'

class MemorySnapshotRepository implements SovereignSelectionSnapshotRepository {
  snapshot: SovereignSelectionSnapshot | null = null
  commits = 0

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.snapshot?.idempotencyKey === idempotencyKey ? this.snapshot : null
  }

  async commitOrRead(snapshot: SovereignSelectionSnapshot) {
    this.commits += 1
    if (!this.snapshot) this.snapshot = snapshot
    return this.snapshot
  }
}

function jobInput(): RunSovereignSelectionJobInput {
  const matchResults = Array.from({ length: 10 }, (_, index) => ({
    matchId: `m${index + 1}`,
    userId: 'rising-1',
    pool: 'MAIN' as const,
    humanRank: 1 as const,
    completedAt: `2026-08-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    completedByBot: false,
    qualificationAccessActive: true,
    valid: true,
  }))
  return {
    cycleId: 'cycle-2026-08',
    scoringStartAt: '2026-07-31T17:00:01.000Z',
    scoringEndAt: '2026-08-23T11:00:00.000Z',
    executedAt: '2026-08-23T11:00:01.000Z',
    matchResults,
    candidateProfiles: [{
      userId: 'rising-1',
      accountInGoodStanding: true,
      eligibleAtCutoff: true,
      hasStartedLastBossMatch: false,
      ascendantRookieConsumed: false,
    }],
  }
}

describe('Gate 10.2 idempotent selection job boundary', () => {
  test('commits once and returns the persisted snapshot on retry', async () => {
    const repository = new MemorySnapshotRepository()
    const first = await runSovereignSelectionJob(jobInput(), repository)
    const retry = await runSovereignSelectionJob({ ...jobInput(), executedAt: '2026-08-23T12:00:00.000Z' }, repository)

    expect(repository.commits).toBe(1)
    expect(retry).toBe(first)
    expect(first.idempotencyKey).toBe('SOVEREIGN_SELECTION:cycle-2026-08:2026-08-23T11:00:00.000Z')
    expect(first.seats.map(seat => seat.userId)).toEqual(['rising-1'])
  })

  test('rejects execution before the scoring cutoff', async () => {
    const input = { ...jobInput(), executedAt: '2026-08-23T10:59:59.999Z' }
    await expect(runSovereignSelectionJob(input, new MemorySnapshotRepository()))
      .rejects.toThrow('SCORING_WINDOW_NOT_CLOSED')
  })

  test('fails closed when a ranked user has no authoritative profile snapshot', async () => {
    const input = { ...jobInput(), candidateProfiles: [] }
    await expect(runSovereignSelectionJob(input, new MemorySnapshotRepository()))
      .rejects.toThrow('MISSING_CANDIDATE_PROFILE:rising-1')
  })
})
