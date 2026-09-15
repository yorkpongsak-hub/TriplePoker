import { supabaseAdmin } from '../config/supabase'

export type TierDRecordLeague = 'all'|'bronze'|'silver'|'gold'|'platinum'|'diamond'|'elite'|'master'|'grandmaster'|'legend'|'mythic'
export type TierDRecordBoard = 'pb'|'streak'
const leagueRanges: Record<Exclude<TierDRecordLeague,'all'>,[number,number]> = {bronze:[1,50],silver:[51,100],gold:[101,150],platinum:[151,200],diamond:[201,250],elite:[251,350],master:[351,500],grandmaster:[501,700],legend:[701,1000],mythic:[1001,Number.MAX_SAFE_INTEGER]}

export async function getTierDRecords(board: TierDRecordBoard, league: TierDRecordLeague) {
  if (board === 'streak') {
    const { data, error } = await supabaseAdmin.from('users').select('user_id,display_name,avatar_url,profile_image_url,tier_d_best_win_streak').gt('tier_d_best_win_streak', 0).order('tier_d_best_win_streak',{ascending:false}).order('user_id',{ascending:true}).limit(50)
    if (error) throw error
    return { board, league:'all', entries:(data??[]).map((row,index)=>({rank:index+1,userId:row.user_id,displayName:row.display_name,avatarUrl:row.profile_image_url??row.avatar_url??null,streak:row.tier_d_best_win_streak})) }
  }
  let query=supabaseAdmin.from('tier_d_level_personal_bests').select('user_id,level,elapsed_ms,achieved_at').order('elapsed_ms',{ascending:true}).order('achieved_at',{ascending:true}).limit(1000)
  if(league!=='all'){const [from,to]=leagueRanges[league];query=query.gte('level',from).lte('level',to)}
  const {data:records,error}=await query
  if(error) throw error
  // One record per player on each board: their fastest clear in the selected scope.
  const bestByUser=new Map<string,any>()
  for(const row of records??[])if(!bestByUser.has(row.user_id))bestByUser.set(row.user_id,row)
  const best=[...bestByUser.values()].slice(0,50)
  const ids=best.map(row=>row.user_id)
  const {data:users,error:userError}=ids.length?await supabaseAdmin.from('users').select('user_id,display_name,avatar_url,profile_image_url').in('user_id',ids):{data:[],error:null}
  if(userError)throw userError
  const usersById=new Map((users??[]).map(row=>[row.user_id,row]))
  return {board,league,entries:best.flatMap((row,index)=>{const user=usersById.get(row.user_id);return user?[{rank:index+1,userId:row.user_id,displayName:user.display_name,avatarUrl:user.profile_image_url??user.avatar_url??null,level:row.level,elapsedMs:row.elapsed_ms,achievedAt:row.achieved_at}]:[]})}
}

export async function getTierDShowcase(userId:string){
  const [{data:user,error:userError},{data:awards,error:awardError}] = await Promise.all([
    supabaseAdmin.from('users').select('tier_d_solo_level,tier_d_best_win_streak,tier_d_best_level_clear_time_ms,tier_d_best_match_score').eq('user_id',userId).maybeSingle(),
    supabaseAdmin.from('tier_d_league_awards').select('league_id,award_type,final_rank,final_points,league_name,awarded_at').eq('user_id',userId).order('awarded_at',{ascending:false}),
  ])
  if(userError)throw userError
  if(awardError)throw awardError
  return {stats:user??null,awards:awards??[]}
}
