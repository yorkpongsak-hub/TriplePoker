import { supabaseAdmin } from '../config/supabase'
import { MINI_TOURNAMENT_DURATION_MS, MINI_TOURNAMENT_SYNTHETIC_MAX, advanceSyntheticEntries, miniTournamentStatus, personalRealRivalCount, personalTournamentTrigger, rankMiniTournament, syntheticEntries } from './tierDMiniTournament'

type EventRow={id:string;owner_user_id:string|null;league_id:string;level_anchor:number;start_at:string;end_at:string;locked_at:string|null;status:'OPEN'|'LOCKED'}
export async function progressPersonalMiniTournament(userId:string,leagueId:string,level:number,qualifiesForTrigger=true,now=Date.now()) {
  const {data:open,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('owner_user_id',userId).eq('status','OPEN').gte('end_at',new Date(now).toISOString()).order('start_at',{ascending:false}).limit(1).maybeSingle()
  if(error)throw error
  if(open)return {event:open as EventRow,created:false,qualifyingLevelCount:0,triggerAt:0}
  if(!qualifiesForTrigger)return {event:null,created:false,qualifyingLevelCount:0,triggerAt:0,pausedForLeagueTournament:true}
  const {data:stored,error:progressError}=await supabaseAdmin.from('tier_d_personal_tournament_progress').select('*').eq('user_id',userId).maybeSingle();if(progressError)throw progressError
  const cycle=stored?.cycle_no??1;const triggerAt=stored?.trigger_at??personalTournamentTrigger(userId,cycle);const qualifyingLevelCount=(stored?.qualifying_level_count??0)+1
  if(qualifyingLevelCount<triggerAt){const {error:updateError}=await supabaseAdmin.from('tier_d_personal_tournament_progress').upsert({user_id:userId,qualifying_level_count:qualifyingLevelCount,trigger_at:triggerAt,cycle_no:cycle,updated_at:new Date(now).toISOString()},{onConflict:'user_id'});if(updateError)throw updateError;return {event:null,created:false,qualifyingLevelCount,triggerAt}}
  const {data,error:createError}=await supabaseAdmin.from('tier_d_mini_tournaments').insert({owner_user_id:userId,league_id:leagueId,level_anchor:level,end_at:new Date(now+MINI_TOURNAMENT_DURATION_MS).toISOString()}).select('*').single();if(createError)throw createError
  const event=data as EventRow;const rivalCount=personalRealRivalCount(userId,cycle)
  const {data:rivals,error:rivalError}=await supabaseAdmin.from('users').select('user_id,tier_d_solo_level,tier_d_best_match_score').neq('user_id',userId).gte('tier_d_solo_level',Math.max(1,level-30)).lte('tier_d_solo_level',level+30).order('last_login',{ascending:false,nullsFirst:false}).limit(rivalCount);if(rivalError)throw rivalError
  const realRows=[{tournament_id:event.id,user_id:userId,level,points:0,synthetic:false},...(rivals??[]).map(row=>({tournament_id:event.id,user_id:row.user_id,level:row.tier_d_solo_level,points:Math.max(0,row.tier_d_best_match_score??0),synthetic:false}))]
  const mocks=syntheticEntries(event.id,level,MINI_TOURNAMENT_SYNTHETIC_MAX).map(row=>({tournament_id:event.id,user_id:row.userId,level:row.level,points:row.points,synthetic:true,updated_at:new Date(now).toISOString()}))
  const {error:entryError}=await supabaseAdmin.from('tier_d_mini_tournament_entries').insert([...realRows,...mocks]);if(entryError)throw entryError
  const nextCycle=cycle+1;const {error:resetError}=await supabaseAdmin.from('tier_d_personal_tournament_progress').upsert({user_id:userId,qualifying_level_count:0,trigger_at:personalTournamentTrigger(userId,nextCycle),cycle_no:nextCycle,updated_at:new Date(now).toISOString()},{onConflict:'user_id'});if(resetError)throw resetError
  return {event,created:true,qualifyingLevelCount:0,triggerAt:personalTournamentTrigger(userId,nextCycle)}
}
export async function getMiniTournamentStandings(tournamentId:string,userId?:string,now=Date.now()) {
  const {data:event,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('id',tournamentId).single();if(error)throw error
  if(userId&&event.owner_user_id!==userId)throw new Error('TOURNAMENT_NOT_OWNED')
  const {data:entries,error:entryError}=await supabaseAdmin.from('tier_d_mini_tournament_entries').select('*').eq('tournament_id',tournamentId);if(entryError)throw entryError
  // A legacy event can predate its entry rows (for example, after a partial
  // migration). Keep its private board readable instead of rendering an empty
  // Top 20 while the next canonical settlement replaces it.
  const storedRows=(entries??[]).map(row=>({userId:row.user_id,level:row.level,points:row.points,updatedAt:Date.parse(row.updated_at),synthetic:!!row.synthetic}))
  if(!storedRows.length){
    const owner=userId??event.owner_user_id
    if(owner)storedRows.push({userId:owner,level:event.level_anchor,points:0,updatedAt:Date.parse(event.start_at),synthetic:false})
    storedRows.push(...syntheticEntries(event.id,event.level_anchor,MINI_TOURNAMENT_SYNTHETIC_MAX).map(row=>({...row,synthetic:true,updatedAt:Date.parse(event.start_at)})))
  }
  const rows=advanceSyntheticEntries(storedRows,Date.parse(event.start_at),Math.min(now,Date.parse(event.end_at)))
  const status=miniTournamentStatus(Date.parse(event.end_at),now)
  if(status==='LOCKED'&&event.status!=='LOCKED'){const ranked=rankMiniTournament(rows);for(const row of ranked)await supabaseAdmin.from('tier_d_mini_tournament_entries').update({final_rank:row.rank}).eq('tournament_id',tournamentId).eq('user_id',row.userId);await supabaseAdmin.from('tier_d_mini_tournaments').update({status:'LOCKED',locked_at:new Date(now).toISOString()}).eq('id',tournamentId)}
  if(status==='LOCKED'){
    const ranked=rankMiniTournament(rows)
    // A personal tournament pays only its owner. Real rivals are comparison
    // snapshots/participants and must never collect rewards from someone
    // else's private event. Legacy shared events retain their old behavior.
    for(const row of ranked.filter(row=>row.rank<=20&&!row.synthetic&&(!event.owner_user_id||row.userId===event.owner_user_id))){
      const item=['auto_sort','freeze','double_pile','shuffle','undo'][Math.min(4,row.rank-1)]
      const trophy=row.rank<=3?`Silver@${row.rank}`:null
      const {error:rewardError}=await supabaseAdmin.rpc('award_tier_d_mini_tournament',{p_tournament_id:tournamentId,p_user_id:row.userId,p_rank:row.rank,p_item_key:item,p_trophy:trophy??''})
      if(rewardError)throw rewardError
    }
  }
  const ranked=rankMiniTournament(rows)
  const realIds=ranked.filter(row=>!row.synthetic).map(row=>row.userId)
  const {data:profiles}=realIds.length?await supabaseAdmin.from('users').select('user_id,display_name').in('user_id',realIds):{data:[]}
  const names=new Map((profiles??[]).map(row=>[row.user_id,row.display_name]))
  return {event:{id:event.id,leagueId:event.league_id,startAt:event.start_at,endAt:event.end_at,status},entries:ranked.map(row=>({...row,displayName:row.synthetic?`RIVAL ${row.rank}`:(names.get(row.userId)??(row.userId===event.owner_user_id?'YOU':'PLAYER'))}))}
}

/** Called only from canonical Tier D settlement; absent enrollment is a no-op. */
export async function addMiniTournamentPoints(userId:string,points:number,now=Date.now()) {
  const {data:entries,error}=await supabaseAdmin.from('tier_d_mini_tournament_entries').select('tournament_id').eq('user_id',userId)
  if(error)throw error
  for(const entry of entries??[]){
    const {data:event,error:eventError}=await supabaseAdmin.from('tier_d_mini_tournaments').select('status,end_at').eq('id',entry.tournament_id).maybeSingle()
    if(eventError||!event||event.status!=='OPEN'||miniTournamentStatus(Date.parse(event.end_at),now)!=='OPEN')continue
    const {error:updateError}=await supabaseAdmin.rpc('add_tier_d_mini_tournament_points',{p_tournament_id:entry.tournament_id,p_user_id:userId,p_points:Math.max(0,Math.round(points))})
    if(updateError)throw updateError
  }
}
/** Background deadline sweep; standings reads remain safe to retry as a fallback. */
export async function lockExpiredMiniTournaments(now=Date.now()) {
  const {data,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('id').eq('status','OPEN').lte('end_at',new Date(now).toISOString())
  if(error)throw error
  for(const event of data??[])await getMiniTournamentStandings(event.id,undefined,now)
}
