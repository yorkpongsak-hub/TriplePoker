import { sovereignConfig } from '../config/sovereignConfig'
import { SovereignPool } from '../contracts/sovereignContracts'

export interface SovereignEligibleMatchResult {
  matchId: string
  userId: string
  pool: SovereignPool
  humanRank: 1 | 2 | 3
  completedAt: string
  completedByBot: boolean
  qualificationAccessActive: boolean
  valid: boolean
}

export interface SovereignMonthlyRankingRow {
  userId: string
  pool: SovereignPool
  rank: number
  eligible: boolean
  eligibleMatchCount: number
  bestTenScore: number
  allEligibleMatchScore: number
  firstPlaceFinishes: number
  bestTenAchievedAt: string
  botTakeoverCount: number
  bestMatchIds: readonly string[]
}

export interface SovereignScoreWindow {
  scoringStartAt: string
  scoringEndAt: string
}

interface ScoredMatch extends SovereignEligibleMatchResult {
  score: 10 | 6 | 3 | 0
  completedAtMs: number
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function scoreMatch(result: SovereignEligibleMatchResult): 10 | 6 | 3 | 0 {
  if (result.completedByBot) return 0
  return sovereignConfig.monthlyScoreByHumanRank[result.humanRank]
}

function parseTimestamp(value: string, errorCode: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(errorCode)
  return parsed
}

export function compareSovereignRankingRows(
  left: Omit<SovereignMonthlyRankingRow, 'rank'>,
  right: Omit<SovereignMonthlyRankingRow, 'rank'>,
): number {
  if (left.bestTenScore !== right.bestTenScore) return right.bestTenScore - left.bestTenScore
  if (left.firstPlaceFinishes !== right.firstPlaceFinishes) {
    return right.firstPlaceFinishes - left.firstPlaceFinishes
  }
  if (left.allEligibleMatchScore !== right.allEligibleMatchScore) {
    return right.allEligibleMatchScore - left.allEligibleMatchScore
  }
  const achievedDifference = Date.parse(left.bestTenAchievedAt) - Date.parse(right.bestTenAchievedAt)
  if (achievedDifference !== 0) return achievedDifference
  if (left.botTakeoverCount !== right.botTakeoverCount) {
    return left.botTakeoverCount - right.botTakeoverCount
  }
  return compareStrings(left.userId, right.userId)
}

export function buildMonthlySovereignRanking(
  results: readonly SovereignEligibleMatchResult[],
  window: SovereignScoreWindow,
): SovereignMonthlyRankingRow[] {
  const scoringStartMs = parseTimestamp(window.scoringStartAt, 'INVALID_SCORING_START')
  const scoringEndMs = parseTimestamp(window.scoringEndAt, 'INVALID_SCORING_END')
  if (scoringStartMs >= scoringEndMs) throw new Error('INVALID_SCORING_WINDOW')

  const grouped = new Map<string, ScoredMatch[]>()
  const seenMatches = new Set<string>()

  for (const result of results) {
    const completedAtMs = parseTimestamp(result.completedAt, 'INVALID_MATCH_COMPLETED_AT')
    if (
      !result.valid
      || !result.qualificationAccessActive
      || completedAtMs < scoringStartMs
      || completedAtMs >= scoringEndMs
    ) continue

    const duplicateKey = `${result.userId}:${result.matchId}`
    if (seenMatches.has(duplicateKey)) throw new Error('DUPLICATE_USER_MATCH_RESULT')
    seenMatches.add(duplicateKey)

    const groupKey = `${result.pool}:${result.userId}`
    const current = grouped.get(groupKey) ?? []
    current.push({ ...result, score: scoreMatch(result), completedAtMs })
    grouped.set(groupKey, current)
  }

  const byPool: Record<SovereignPool, Array<Omit<SovereignMonthlyRankingRow, 'rank'>>> = {
    MAIN: [],
    ASCENDANT: [],
  }

  for (const matches of grouped.values()) {
    const [first] = matches
    const bestMatches = [...matches]
      .sort((left, right) => (
        right.score - left.score
        || left.completedAtMs - right.completedAtMs
        || compareStrings(left.matchId, right.matchId)
      ))
      .slice(0, sovereignConfig.bestMatchCount)

    const bestTenAchievedAtMs = Math.max(...bestMatches.map(match => match.completedAtMs))
    const row: Omit<SovereignMonthlyRankingRow, 'rank'> = {
      userId: first.userId,
      pool: first.pool,
      eligible: matches.length >= sovereignConfig.minimumCompletedMatches,
      eligibleMatchCount: matches.length,
      bestTenScore: bestMatches.reduce((sum, match) => sum + match.score, 0),
      allEligibleMatchScore: matches.reduce((sum, match) => sum + match.score, 0),
      firstPlaceFinishes: matches.filter(match => !match.completedByBot && match.humanRank === 1).length,
      bestTenAchievedAt: new Date(bestTenAchievedAtMs).toISOString(),
      botTakeoverCount: matches.filter(match => match.completedByBot).length,
      bestMatchIds: bestMatches.map(match => match.matchId),
    }
    byPool[first.pool].push(row)
  }

  return (Object.keys(byPool) as SovereignPool[]).flatMap(pool => (
    byPool[pool]
      .sort(compareSovereignRankingRows)
      .map((row, index) => ({ ...row, rank: index + 1 }))
  ))
}
