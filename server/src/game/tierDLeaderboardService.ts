import { supabaseAdmin } from '../config/supabase'
import { buildTierDLeaderboardSnapshot, type TierDLeaderboardRow } from './tierDLeaderboard'
import { getCurrentLeague, isLeagueFinalLevel } from './tierDLeague'
import { grantTierDLeagueAwards } from './tierDRewardService'

export async function getTierDLeaderboard(userId: string) {
  const { data, error } = await supabaseAdmin.from('tier_d_league_progress').select('user_id, league_id, current_level, league_points, ranked_eligible, updated_at')
  if (error) throw error
  const ids = (data ?? []).map(row => row.user_id)
  const { data: users, error: userError } = ids.length ? await supabaseAdmin.from('users').select('user_id, display_name, avatar_url').in('user_id', ids) : { data: [], error: null }
  if (userError) throw userError
  const byId = new Map((users ?? []).map(row => [row.user_id, row]))
  const rows: TierDLeaderboardRow[] = (data ?? []).flatMap(row => {
    const user = byId.get(row.user_id); if (!user) return []
    return [{ userId: row.user_id, displayName: user.display_name, avatarUrl: user.avatar_url ?? null, leagueId: row.league_id, currentLevel: row.current_level, leaguePoints: row.league_points, rankedEligible: row.ranked_eligible, updatedAt: row.updated_at }]
  })
  return buildTierDLeaderboardSnapshot(rows, userId)
}

export async function finalizeTierDLeague(input: { userId: string; leagueId: string; finalLevel: number; finalPoints: number }) {
  const { data, error } = await supabaseAdmin.rpc('finalize_tier_d_league', { p_user_id: input.userId, p_league_id: input.leagueId, p_final_level: input.finalLevel, p_final_points: input.finalPoints })
  if (error) throw error
  return data
}

/** Called by the authoritative Tier D match settlement only after a level win. */
export async function finalizeTierDLeagueAfterLevelWin(userId: string, levelCleared: number, leaguePoints: number) {
  if (!isLeagueFinalLevel(levelCleared)) return null
  const league = getCurrentLeague(levelCleared)
  const result = await finalizeTierDLeague({ userId, leagueId: league.id, finalLevel: levelCleared, finalPoints: leaguePoints })
  await grantTierDLeagueAwards(userId, league.id)
  return result
}
