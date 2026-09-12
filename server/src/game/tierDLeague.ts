/** Tier D leagues are player-progress brackets, never calendar seasons. */
export const TIER_D_LEVELS_PER_LEAGUE = 50
export const TIER_D_RELAX_LEVELS = 20
export const TIER_D_RANKED_LEVELS = 30

export type TierDLeaguePhase = 'relax' | 'ranked'
export type TierDLeagueAwardRefs = {
  /** Asset keys are intentionally unset until the approved Medal SVG assets land. */
  medalSvgKey: string | null
  trophyKeys: { 1: string | null; 2: string | null; 3: string | null }
}

export interface TierDLeagueDefinition {
  id: string
  name: string
  startLevel: number
  endLevel: number
  relaxEndLevel: number
  rankedStartLevel: number
  pointsPerRankedWin: number
  finalized: boolean
  finalRank: number | null
  awardRefs: TierDLeagueAwardRefs
}

export interface TierDLeagueProgress {
  league: TierDLeagueDefinition
  levelInLeague: number
  phase: TierDLeaguePhase
  leaguePoints: number
  rankedLeaderboardEligible: boolean
  isFinalLevel: boolean
}

/** Kept separate from game rules so playtesting can change point awards alone. */
export const tierDLeaguePointsConfig = {
  rankedWinPoints: 10,
  pointsForRankedWin: (context: { level: number; won: boolean }): number => context.won ? 10 : 0,
} as const

/**
 * The repository has no pre-existing League lore/name or League-medal assets.
 * Until approved assets are supplied, use intentionally neutral, stable names.
 */
export function getCurrentLeague(level: number): TierDLeagueDefinition {
  assertLevel(level)
  const leagueNumber = Math.floor((level - 1) / TIER_D_LEVELS_PER_LEAGUE) + 1
  const startLevel = (leagueNumber - 1) * TIER_D_LEVELS_PER_LEAGUE + 1
  const endLevel = startLevel + TIER_D_LEVELS_PER_LEAGUE - 1
  return {
    id: `tier-d-league-${leagueNumber}`,
    name: `League ${leagueNumber}`,
    startLevel,
    endLevel,
    relaxEndLevel: startLevel + TIER_D_RELAX_LEVELS - 1,
    rankedStartLevel: startLevel + TIER_D_RELAX_LEVELS,
    pointsPerRankedWin: tierDLeaguePointsConfig.rankedWinPoints,
    finalized: false,
    finalRank: null,
    awardRefs: { medalSvgKey: null, trophyKeys: { 1: null, 2: null, 3: null } },
  }
}

export function getLeaguePhase(level: number): TierDLeaguePhase {
  const league = getCurrentLeague(level)
  return level <= league.relaxEndLevel ? 'relax' : 'ranked'
}

export function getLeagueProgress(level: number, leaguePoints = 0): TierDLeagueProgress {
  if (!Number.isInteger(leaguePoints) || leaguePoints < 0) throw new Error('League Points must be a non-negative integer')
  const league = getCurrentLeague(level)
  const phase = getLeaguePhase(level)
  return {
    league,
    levelInLeague: level - league.startLevel + 1,
    phase,
    leaguePoints,
    rankedLeaderboardEligible: phase === 'ranked',
    isFinalLevel: level === league.endLevel,
  }
}

export function isLeagueFinalLevel(level: number): boolean { return getLeagueProgress(level).isFinalLevel }

/** Relax earns no points. No loss penalties exist in this version. */
export function getLeaguePointsAward(level: number, won: boolean): number {
  if (getLeaguePhase(level) !== 'ranked') return 0
  return tierDLeaguePointsConfig.pointsForRankedWin({ level, won })
}

/** Move into a new League with its League Points reset, preserving no prior league score. */
export function nextLeaguePoints(levelJustCleared: number, won: boolean, currentPoints: number): number {
  if (!won) return currentPoints
  return isLeagueFinalLevel(levelJustCleared) ? 0 : currentPoints + getLeaguePointsAward(levelJustCleared, true)
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) throw new Error('Tier D level must be a positive integer')
}
