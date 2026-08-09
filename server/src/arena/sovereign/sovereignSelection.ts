import {
  SovereignEventDay,
  SovereignQualificationPath,
  SovereignSelectionSource,
} from '../contracts/sovereignContracts'
import {
  compareSovereignRankingRows,
  SovereignMonthlyRankingRow,
} from './monthlySovereignScore'

export interface SovereignSelectionCandidate {
  ranking: SovereignMonthlyRankingRow
  accountInGoodStanding: boolean
  eligibleAtCutoff: boolean
  hasStartedLastBossMatch: boolean
  ascendantRookieConsumed: boolean
}

export interface SovereignSelectedSeat {
  userId: string
  plannedPath: SovereignQualificationPath
  selectionSource: SovereignSelectionSource
  pathRank: 1 | 2 | 3
  eventDay: SovereignEventDay
  ranking: SovereignMonthlyRankingRow
}

export interface SovereignSelectionResult {
  seats: SovereignSelectedSeat[]
  unfilledPaths: ReadonlyArray<{ path: SovereignQualificationPath; count: number }>
}

const PATH_ORDER: readonly SovereignQualificationPath[] = [
  'ASCENDANT_ROOKIE',
  'VETERAN',
  'RISING_STAR',
]

const EVENT_DAY_BY_PATH_RANK: Readonly<Record<1 | 2 | 3, SovereignEventDay>> = {
  1: 'FRIDAY',
  2: 'SATURDAY',
  3: 'SUNDAY',
}

function candidateComparator(left: SovereignSelectionCandidate, right: SovereignSelectionCandidate): number {
  return compareSovereignRankingRows(left.ranking, right.ranking)
}

function isGenerallyEligible(candidate: SovereignSelectionCandidate): boolean {
  if (!candidate.accountInGoodStanding || !candidate.eligibleAtCutoff || !candidate.ranking.eligible) return false
  if (candidate.ranking.pool === 'ASCENDANT' && candidate.ascendantRookieConsumed) return false
  return true
}

function isPrimaryForPath(
  candidate: SovereignSelectionCandidate,
  path: SovereignQualificationPath,
): boolean {
  if (!isGenerallyEligible(candidate)) return false
  if (path === 'VETERAN') {
    return candidate.ranking.pool === 'MAIN' && candidate.hasStartedLastBossMatch
  }
  if (path === 'RISING_STAR') {
    return candidate.ranking.pool === 'MAIN' && !candidate.hasStartedLastBossMatch
  }
  return candidate.ranking.pool === 'ASCENDANT'
    && !candidate.hasStartedLastBossMatch
    && !candidate.ascendantRookieConsumed
}

export function selectMonthlySovereignSeats(
  candidates: readonly SovereignSelectionCandidate[],
): SovereignSelectionResult {
  const uniqueCandidates = new Map<string, SovereignSelectionCandidate>()
  for (const candidate of candidates) {
    if (uniqueCandidates.has(candidate.ranking.userId)) throw new Error('DUPLICATE_SELECTION_CANDIDATE')
    uniqueCandidates.set(candidate.ranking.userId, candidate)
  }

  const selectedUserIds = new Set<string>()
  const selectedByPath = new Map<SovereignQualificationPath, SovereignSelectionCandidate[]>()

  for (const path of PATH_ORDER) {
    const primary = [...uniqueCandidates.values()]
      .filter(candidate => !selectedUserIds.has(candidate.ranking.userId) && isPrimaryForPath(candidate, path))
      .sort(candidateComparator)
      .slice(0, 3)
    primary.forEach(candidate => selectedUserIds.add(candidate.ranking.userId))
    selectedByPath.set(path, primary)
  }

  const sourceByPathAndUser = new Map<string, SovereignSelectionSource>()
  for (const path of PATH_ORDER) {
    for (const candidate of selectedByPath.get(path) ?? []) {
      sourceByPathAndUser.set(`${path}:${candidate.ranking.userId}`, 'PRIMARY')
    }
  }

  for (const path of PATH_ORDER) {
    const selected = selectedByPath.get(path) ?? []
    const vacancies = 3 - selected.length
    if (vacancies === 0) continue

    const fallback = [...uniqueCandidates.values()]
      .filter(candidate => !selectedUserIds.has(candidate.ranking.userId) && isGenerallyEligible(candidate))
      .sort(candidateComparator)
      .slice(0, vacancies)

    fallback.forEach(candidate => {
      selected.push(candidate)
      selectedUserIds.add(candidate.ranking.userId)
      sourceByPathAndUser.set(`${path}:${candidate.ranking.userId}`, 'FALLBACK_RANKING')
    })
  }

  const seats: SovereignSelectedSeat[] = []
  const unfilledPaths: Array<{ path: SovereignQualificationPath; count: number }> = []

  for (const path of PATH_ORDER) {
    const selected = selectedByPath.get(path) ?? []
    selected.forEach((candidate, index) => {
      const pathRank = (index + 1) as 1 | 2 | 3
      seats.push({
        userId: candidate.ranking.userId,
        plannedPath: path,
        selectionSource: sourceByPathAndUser.get(`${path}:${candidate.ranking.userId}`) ?? 'PRIMARY',
        pathRank,
        eventDay: EVENT_DAY_BY_PATH_RANK[pathRank],
        ranking: candidate.ranking,
      })
    })
    if (selected.length < 3) unfilledPaths.push({ path, count: 3 - selected.length })
  }

  return { seats, unfilledPaths }
}
