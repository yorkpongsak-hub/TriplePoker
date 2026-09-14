export type TierDLeaderboardRow = {
  userId: string; displayName: string; avatarUrl: string | null; leagueId: string
  currentLevel: number; leaguePoints: number; rankedEligible: boolean; updatedAt: string
}
export type TierDLeaderboardEntry = { userId: string; displayName: string; avatarUrl: string | null; rank: number; leaguePoints: number; isMock?: boolean }
export type TierDLeaderboardConfig = { minimumEligibleMembers: number; contextTarget: number; maxDisplayed: number }
export const tierDLeaderboardConfig: TierDLeaderboardConfig = { minimumEligibleMembers: 100, contextTarget: 30, maxDisplayed: 20 }

const MOCK_NAMES = ['Nova','Atlas','Luna','Orion','Iris','Felix','Maya','Leo','Aria','Kai','Nora','Ezra','Zoe','Milo','Sora','Theo','Mina','Finn','Cleo','Jade']

/** Server-only snapshot: ranks by cumulative League Points and pads sparse boards with deterministic rivals. */
export function buildTierDLeaderboardSnapshot(rows: readonly TierDLeaderboardRow[], userId: string, config = tierDLeaderboardConfig):
  { enabled: boolean; entries: TierDLeaderboardEntry[]; currentUser: { rank: number | null; leaguePoints: number }; previousDisplayedRank: number | null } {
  const me = rows.find(row => row.userId === userId)
  if (!me || !me.rankedEligible || !isTierDLeagueCompetitionActive(me.currentLevel)) return { enabled: false, entries: [], currentUser: { rank: null, leaguePoints: me?.leaguePoints ?? 0 }, previousDisplayedRank: null }
  const eligible = rows.filter(row => row.leagueId === me.leagueId && row.rankedEligible)
  const context = [...eligible].sort((a, b) => Math.abs(a.currentLevel - me.currentLevel) - Math.abs(b.currentLevel - me.currentLevel) || a.userId.localeCompare(b.userId)).slice(0, config.contextTarget)
  if (!context.some(row => row.userId === userId)) context.push(me)
  const mockCount = Math.max(0, config.maxDisplayed - context.length)
  const mockRows: TierDLeaderboardRow[] = MOCK_NAMES.slice(0, mockCount).map((name, index) => ({
    userId: `league-mock-${index + 1}`, displayName: name, avatarUrl: null, leagueId: me.leagueId,
    currentLevel: Math.max(1, me.currentLevel + (index % 5) - 2), leaguePoints: Math.max(0, 950 - index * 50),
    rankedEligible: true, updatedAt: `2099-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }))
  const mockIds = new Set(mockRows.map(row => row.userId))
  const ranked = [...context, ...mockRows].sort(compareRows).map((row, index) => ({ userId: row.userId, displayName: row.displayName, avatarUrl: row.avatarUrl, leaguePoints: row.leaguePoints, rank: index + 1, ...(mockIds.has(row.userId) ? { isMock: true } : {}) }))
  const current = ranked.find(entry => entry.userId === userId)
  return { enabled: true, entries: ranked.slice(0, config.maxDisplayed), currentUser: { rank: current?.rank ?? null, leaguePoints: me.leaguePoints }, previousDisplayedRank: null }
}

/** Deterministic tie-break: League Points, nearer/higher level, earliest update, then immutable user id. */
export function compareRows(a: TierDLeaderboardRow, b: TierDLeaderboardRow): number {
  return b.leaguePoints - a.leaguePoints || b.currentLevel - a.currentLevel || a.updatedAt.localeCompare(b.updatedAt) || a.userId.localeCompare(b.userId)
}

export function trophyEligibleForFinalRank(rank: number): boolean { return rank >= 1 && rank <= 3 }
import { isTierDLeagueCompetitionActive } from './tierDLeague'
