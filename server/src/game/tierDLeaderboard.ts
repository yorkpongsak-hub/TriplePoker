export type TierDLeaderboardRow = {
  userId: string; displayName: string; avatarUrl: string | null; leagueId: string
  currentLevel: number; leaguePoints: number; rankedEligible: boolean; updatedAt: string
}
export type TierDLeaderboardEntry = { userId: string; displayName: string; avatarUrl: string | null; rank: number; leaguePoints: number }
export type TierDLeaderboardConfig = { minimumEligibleMembers: number; contextTarget: number; maxDisplayed: number }
export const tierDLeaderboardConfig: TierDLeaderboardConfig = { minimumEligibleMembers: 100, contextTarget: 30, maxDisplayed: 20 }

/** Server-only snapshot: filters a same-League local context before ranking. It never returns population size. */
export function buildTierDLeaderboardSnapshot(rows: readonly TierDLeaderboardRow[], userId: string, config = tierDLeaderboardConfig):
  { enabled: boolean; entries: TierDLeaderboardEntry[]; currentUser: { rank: number | null; leaguePoints: number }; previousDisplayedRank: number | null } {
  const me = rows.find(row => row.userId === userId)
  if (!me || !me.rankedEligible) return { enabled: false, entries: [], currentUser: { rank: null, leaguePoints: me?.leaguePoints ?? 0 }, previousDisplayedRank: null }
  const eligible = rows.filter(row => row.leagueId === me.leagueId && row.rankedEligible)
  if (eligible.length < config.minimumEligibleMembers) return { enabled: false, entries: [], currentUser: { rank: null, leaguePoints: me.leaguePoints }, previousDisplayedRank: null }
  const context = eligible.sort((a, b) => Math.abs(a.currentLevel - me.currentLevel) - Math.abs(b.currentLevel - me.currentLevel) || a.userId.localeCompare(b.userId)).slice(0, config.contextTarget)
  if (!context.some(row => row.userId === userId)) context.push(me)
  const ranked = context.sort(compareRows).map((row, index) => ({ userId: row.userId, displayName: row.displayName, avatarUrl: row.avatarUrl, leaguePoints: row.leaguePoints, rank: index + 1 }))
  const current = ranked.find(entry => entry.userId === userId)
  return { enabled: true, entries: ranked.slice(0, config.maxDisplayed), currentUser: { rank: current?.rank ?? null, leaguePoints: me.leaguePoints }, previousDisplayedRank: null }
}

/** Deterministic tie-break: League Points, nearer/higher level, earliest update, then immutable user id. */
export function compareRows(a: TierDLeaderboardRow, b: TierDLeaderboardRow): number {
  return b.leaguePoints - a.leaguePoints || b.currentLevel - a.currentLevel || a.updatedAt.localeCompare(b.updatedAt) || a.userId.localeCompare(b.userId)
}

export function trophyEligibleForFinalRank(rank: number): boolean { return rank >= 1 && rank <= 3 }
