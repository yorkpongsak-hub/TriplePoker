/** Canonical League Mode progression. This module deliberately contains no
 * leaderboard, seasonal, auction, or Ranked/Relax mechanics. */
export type LeagueId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'elite' | 'master' | 'grandmaster' | 'legend' | 'mythic'
export type TierUnlock = 'C' | 'B' | 'A' | 'A+'

export interface TierDLeagueDefinition {
  id: LeagueId
  name: string
  startLevel: number
  endLevel: number | null
  aiOpponents: 1 | 2 | 3
  arrangeSeconds: number | null
  trophyLevel: number | null
  unlocksTier?: TierUnlock
}

const LEAGUES: readonly TierDLeagueDefinition[] = [
  { id: 'bronze', name: 'Bronze', startLevel: 1, endLevel: 50, aiOpponents: 1, arrangeSeconds: null, trophyLevel: 50 },
  { id: 'silver', name: 'Silver', startLevel: 51, endLevel: 100, aiOpponents: 1, arrangeSeconds: 315, trophyLevel: 100 },
  { id: 'gold', name: 'Gold', startLevel: 101, endLevel: 150, aiOpponents: 1, arrangeSeconds: 195, trophyLevel: 150 },
  { id: 'platinum', name: 'Platinum', startLevel: 151, endLevel: 200, aiOpponents: 2, arrangeSeconds: 165, trophyLevel: 200 },
  { id: 'diamond', name: 'Diamond', startLevel: 201, endLevel: 250, aiOpponents: 2, arrangeSeconds: 135, trophyLevel: 250 },
  { id: 'elite', name: 'Elite', startLevel: 251, endLevel: 350, aiOpponents: 2, arrangeSeconds: 120, trophyLevel: 350, unlocksTier: 'C' },
  { id: 'master', name: 'Master', startLevel: 351, endLevel: 500, aiOpponents: 3, arrangeSeconds: 105, trophyLevel: 500, unlocksTier: 'B' },
  { id: 'grandmaster', name: 'Grandmaster', startLevel: 501, endLevel: 700, aiOpponents: 3, arrangeSeconds: 90, trophyLevel: 700, unlocksTier: 'A' },
  { id: 'legend', name: 'Legend', startLevel: 701, endLevel: 1000, aiOpponents: 3, arrangeSeconds: 75, trophyLevel: 1000, unlocksTier: 'A+' },
  { id: 'mythic', name: 'Mythic', startLevel: 1001, endLevel: null, aiOpponents: 3, arrangeSeconds: 60, trophyLevel: 1500 },
]

export const TIER_D_PILE_BASE_SCORES = { 1: 4, 2: 6, 3: 8 } as const
/** Each League opens with ten non-ranked warm-up Levels. */
export const TIER_D_LEAGUE_REST_LEVELS = 10
export const TIER_D_LEAGUE_COMPETITION_LEVELS = 20
export function getCurrentLeague(level: number): TierDLeagueDefinition {
  assertLevel(level)
  return LEAGUES.find(league => level >= league.startLevel && (league.endLevel === null || level <= league.endLevel))!
}
export function tierDBotCountForLevel(level: number): 1 | 2 | 3 { return getCurrentLeague(level).aiOpponents }
export function getArrangeTimerSeconds(level: number): number | null { return getCurrentLeague(level).arrangeSeconds }
export function hasHandMultiplier(level: number): boolean { return level >= 51 }
export function hasMissions(level: number): boolean { return level >= 51 }
export function isLeagueFinalLevel(level: number): boolean { return getCurrentLeague(level).trophyLevel === level }
export function tierUnlockForLevel(level: number): TierUnlock | undefined { return isLeagueFinalLevel(level) ? getCurrentLeague(level).unlocksTier : undefined }
export type TierDCompetitionWindow={leagueId:LeagueId;cycle:number;startLevel:number;endLevel:number}
/** Competition alternates rest 10 / compete 20. The final round stays active even when a League has fewer than 20 Levels remaining. */
export function getTierDCompetitionWindow(level:number):TierDCompetitionWindow|undefined{
  const league=getCurrentLeague(level);const offset=level-league.startLevel;const period=TIER_D_LEAGUE_REST_LEVELS+TIER_D_LEAGUE_COMPETITION_LEVELS
  const cycle=Math.floor(offset/period)+1;const startLevel=league.startLevel+(cycle-1)*period+TIER_D_LEAGUE_REST_LEVELS;const nominalEndLevel=startLevel+TIER_D_LEAGUE_COMPETITION_LEVELS-1
  const endLevel=league.endLevel===null?nominalEndLevel:Math.min(nominalEndLevel,league.endLevel)
  if(level<startLevel||level>endLevel)return undefined
  return {leagueId:league.id,cycle,startLevel,endLevel}
}
export function isTierDLeagueCompetitionActive(level: number): boolean { return !!getTierDCompetitionWindow(level) }
export function isTierDCompetitionFinalLevel(level:number):boolean{return getTierDCompetitionWindow(level)?.endLevel===level}
function assertLevel(level: number): void { if (!Number.isInteger(level) || level < 1) throw new Error('Tier D level must be a positive integer') }
