import { SovereignEligibleMatchResult, SovereignMonthlyRankingRow, buildMonthlySovereignRanking } from './monthlySovereignScore'
import {
  SovereignSelectedSeat,
  SovereignSelectionCandidate,
  selectMonthlySovereignSeats,
} from './sovereignSelection'

export interface SovereignCandidateProfile {
  userId: string
  accountInGoodStanding: boolean
  eligibleAtCutoff: boolean
  hasStartedLastBossMatch: boolean
  ascendantRookieConsumed: boolean
}

export interface SovereignSelectionSnapshot {
  idempotencyKey: string
  cycleId: string
  scoringStartAt: string
  scoringEndAt: string
  generatedAt: string
  rankings: readonly SovereignMonthlyRankingRow[]
  seats: readonly SovereignSelectedSeat[]
  unfilledPaths: ReadonlyArray<{ path: SovereignSelectedSeat['plannedPath']; count: number }>
}

export interface SovereignSelectionSnapshotRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<SovereignSelectionSnapshot | null>
  commitOrRead(snapshot: SovereignSelectionSnapshot): Promise<SovereignSelectionSnapshot>
}

export interface RunSovereignSelectionJobInput {
  cycleId: string
  scoringStartAt: string
  scoringEndAt: string
  executedAt: string
  matchResults: readonly SovereignEligibleMatchResult[]
  candidateProfiles: readonly SovereignCandidateProfile[]
}

function buildIdempotencyKey(input: RunSovereignSelectionJobInput): string {
  return `SOVEREIGN_SELECTION:${input.cycleId}:${input.scoringEndAt}`
}

export async function runSovereignSelectionJob(
  input: RunSovereignSelectionJobInput,
  repository: SovereignSelectionSnapshotRepository,
): Promise<SovereignSelectionSnapshot> {
  const executedAtMs = Date.parse(input.executedAt)
  const scoringEndMs = Date.parse(input.scoringEndAt)
  if (!Number.isFinite(executedAtMs) || !Number.isFinite(scoringEndMs)) throw new Error('INVALID_SELECTION_JOB_TIME')
  if (executedAtMs < scoringEndMs) throw new Error('SCORING_WINDOW_NOT_CLOSED')

  const idempotencyKey = buildIdempotencyKey(input)
  const existing = await repository.findByIdempotencyKey(idempotencyKey)
  if (existing) return existing

  const profilesByUserId = new Map<string, SovereignCandidateProfile>()
  for (const profile of input.candidateProfiles) {
    if (profilesByUserId.has(profile.userId)) throw new Error('DUPLICATE_CANDIDATE_PROFILE')
    profilesByUserId.set(profile.userId, profile)
  }

  const rankings = buildMonthlySovereignRanking(input.matchResults, {
    scoringStartAt: input.scoringStartAt,
    scoringEndAt: input.scoringEndAt,
  })
  const candidates: SovereignSelectionCandidate[] = rankings.map(ranking => {
    const profile = profilesByUserId.get(ranking.userId)
    if (!profile) throw new Error(`MISSING_CANDIDATE_PROFILE:${ranking.userId}`)
    return {
      ranking,
      accountInGoodStanding: profile.accountInGoodStanding,
      eligibleAtCutoff: profile.eligibleAtCutoff,
      hasStartedLastBossMatch: profile.hasStartedLastBossMatch,
      ascendantRookieConsumed: profile.ascendantRookieConsumed,
    }
  })
  const selection = selectMonthlySovereignSeats(candidates)

  return repository.commitOrRead({
    idempotencyKey,
    cycleId: input.cycleId,
    scoringStartAt: input.scoringStartAt,
    scoringEndAt: input.scoringEndAt,
    generatedAt: new Date(executedAtMs).toISOString(),
    rankings,
    seats: selection.seats,
    unfilledPaths: selection.unfilledPaths,
  })
}
