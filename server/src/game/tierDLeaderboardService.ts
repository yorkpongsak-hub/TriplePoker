import { supabaseAdmin } from '../config/supabase'
import { buildTierDLeaderboardSnapshot, type TierDLeaderboardRow } from './tierDLeaderboard'
import { getCurrentLeague, getTierDCompetitionWindow, isLeagueFinalLevel } from './tierDLeague'
import { grantTierDLeagueAwards } from './tierDRewardService'
import { resolveProfileAvatar, resolveProfileAvatars } from './profileAvatarService'

export async function getTierDLeaderboard(userId: string) {
  const { data: meUser, error: meError } = await supabaseAdmin.from('users').select('user_id, display_name, avatar_url, profile_image_url, vip_status, tier_d_solo_level').eq('user_id',userId).maybeSingle()
  if(meError)throw meError
  const window=meUser?getTierDCompetitionWindow(meUser.tier_d_solo_level):undefined
  if(!meUser||!window)return { enabled:false, entries:[], currentUser:{rank:null,leaguePoints:0}, previousDisplayedRank:null }
  const { data, error } = await supabaseAdmin.from('tier_d_competition_progress').select('user_id, league_id, cycle_no, current_level, league_points, updated_at').eq('league_id',window.leagueId).eq('cycle_no',window.cycle)
  if (error) throw error
  const ids = (data ?? []).map(row => row.user_id)
  const { data: users, error: userError } = ids.length ? await supabaseAdmin.from('users').select('user_id, display_name, avatar_url, profile_image_url, vip_status, tier_d_best_win_streak').in('user_id', ids) : { data: [], error: null }
  if (userError) throw userError
  const byId = new Map((users ?? []).map(row => [row.user_id, row]))
  const avatarById=await resolveProfileAvatars(users??[])
  const { data: languages, error: languageError } = ids.length ? await supabaseAdmin.from('player_language_preferences').select('user_id, language_code').in('user_id', ids) : { data: [], error: null }
  // Language flags are cosmetic. A database that has not yet received 063
  // must still be able to serve the entire ranking.
  if (languageError) console.warn('[TIER_D_LEADERBOARD] language flags unavailable; using English fallback', languageError.code)
  const languageById = new Map((languages ?? []).map(row => [row.user_id, row.language_code]))
  const rows: TierDLeaderboardRow[] = (data ?? []).flatMap(row => {
    const user = byId.get(row.user_id); if (!user) return []
    return [{ userId: row.user_id, displayName: user.display_name, avatarUrl: avatarById.get(row.user_id)??user.avatar_url ?? null, languageCode:languageById.get(row.user_id)??'en', leagueId: row.league_id, currentLevel: row.current_level, leaguePoints: row.league_points, longestWinStreak: user.tier_d_best_win_streak ?? 0, rankedEligible: true, updatedAt: row.updated_at }]
  })
  if(!rows.some(row=>row.userId===userId))rows.push({userId,displayName:meUser.display_name,avatarUrl:await resolveProfileAvatar(meUser)??meUser.avatar_url??null,languageCode:languageById.get(userId)??'en',leagueId:window.leagueId,currentLevel:meUser.tier_d_solo_level,leaguePoints:0,longestWinStreak:0,rankedEligible:true,updatedAt:new Date().toISOString()})
  return buildTierDLeaderboardSnapshot(rows, userId)
}

const COMPETITION_ITEMS=['shuffle','swap','double_pile','freeze','undo'] as const
function rewardCount(rank:number,isVip:boolean){return (rank<=3?3:rank<=10?2:1)+(isVip?1:0)}
function randomCompetitionItems(count:number){return Array.from({length:count},()=>COMPETITION_ITEMS[Math.floor(Math.random()*COMPETITION_ITEMS.length)])}

/** Adds points for a cleared competitive Level and settles only at the end of a full 20-Level round. */
export async function recordTierDCompetitionLevelWin(input:{userId:string;level:number;points:number;isVip:boolean}){
  const window=getTierDCompetitionWindow(input.level);if(!window)return undefined
  const {error}=await supabaseAdmin.rpc('add_tier_d_competition_points',{p_user_id:input.userId,p_league_id:window.leagueId,p_cycle_no:window.cycle,p_level:input.level,p_points:Math.max(0,Math.round(input.points))})
  if(error)throw error
  if(input.level!==window.endLevel)return undefined
  const snapshot=await getTierDLeaderboard(input.userId);const rank=snapshot.currentUser.rank
  if(!rank)throw new Error('COMPETITION_RANK_UNAVAILABLE')
  const items=randomCompetitionItems(rewardCount(rank,input.isVip))
  const {data,error:awardError}=await supabaseAdmin.rpc('award_tier_d_competition',{p_user_id:input.userId,p_league_id:window.leagueId,p_cycle_no:window.cycle,p_rank:rank,p_item_keys:items})
  if(awardError)throw awardError
  // Clear the round's accumulated points after its one-time settlement. The
  // reward row remains as the immutable rank/award record and trophies retain best rank.
  await supabaseAdmin.from('tier_d_competition_progress').delete().eq('user_id',input.userId).eq('league_id',window.leagueId).eq('cycle_no',window.cycle)
  return {leagueId:window.leagueId,cycle:window.cycle,rank,items,awarded:data===true}
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
