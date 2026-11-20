import { supabaseAdmin } from '../config/supabase'
import { getCurrentLeague, isLeagueFinalLevel } from './tierDLeague'
import { getActivePersonalTournament, progressPersonalMiniTournament } from './tierDMiniTournamentService'
import { grantTierDLeagueAwards } from './tierDRewardService'

export async function getTierDLeaderboard(userId:string,_completedLevel?:number){
 const snapshot=await getActivePersonalTournament(userId)
 console.info('[TIER_D_LEADERBOARD]',{event:'QUERY',userId,tournamentId:'tournamentId'in snapshot?snapshot.tournamentId:undefined,returnedPlayerScore:snapshot.currentUser.leaguePoints})
 return snapshot
}

/** Commits lifetime score once, then performs the one idempotent 20% tournament roll for this cleared Level. */
export async function recordTierDCompetitionLevelWin(input:{userId:string;level:number;points:number;isVip:boolean}){
 const earnedScore=Math.max(0,Math.round(input.points))
 const {data,error}=await supabaseAdmin.rpc('commit_tier_d_ranking_score',{p_user_id:input.userId,p_level:input.level,p_earned_score:earnedScore});if(error)throw error
 const scoreCommit=data as {credited?:boolean;earnedScore?:number;previousTotal?:number;newTotal?:number}
 console.info('[TIER_D_LEADERBOARD]',{event:'SCORE_COMMIT',userId:input.userId,level:input.level,earnedScore,previousTotal:scoreCommit.previousTotal??0,newTotal:scoreCommit.newTotal??0,credited:scoreCommit.credited!==false})
 const tournament=await progressPersonalMiniTournament(input.userId,getCurrentLeague(input.level).id,input.level)
 console.info('[TIER_D_LEADERBOARD]',{event:'PERSONAL_TOURNAMENT_ROLL',userId:input.userId,level:input.level,active:tournament.active,created:tournament.created,tournamentId:tournament.event?.id})
 return{scoreCommit,tournament:{active:tournament.active,created:tournament.created,id:tournament.event?.id}}
}

export async function finalizeTierDLeague(input:{userId:string;leagueId:string;finalLevel:number;finalPoints:number}){const{data,error}=await supabaseAdmin.rpc('finalize_tier_d_league',{p_user_id:input.userId,p_league_id:input.leagueId,p_final_level:input.finalLevel,p_final_points:input.finalPoints});if(error)throw error;return data}
export async function finalizeTierDLeagueAfterLevelWin(userId:string,levelCleared:number,leaguePoints:number){if(!isLeagueFinalLevel(levelCleared))return null;const league=getCurrentLeague(levelCleared);const result=await finalizeTierDLeague({userId,leagueId:league.id,finalLevel:levelCleared,finalPoints:leaguePoints});await grantTierDLeagueAwards(userId,league.id);return result}
