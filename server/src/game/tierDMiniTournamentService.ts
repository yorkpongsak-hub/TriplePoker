import { supabaseAdmin } from '../config/supabase'
import { economyService } from '../economy/economyService'
import { MINI_TOURNAMENT_COHORT_SIZE, MINI_TOURNAMENT_DURATION_MS, MINI_TOURNAMENT_LEVEL_RANGE, MINI_TOURNAMENT_MIN_LEVEL, type TournamentRewardBand, advanceSyntheticEntries, miniTournamentStatus, rankMiniTournament, shouldTriggerPersonalTournament, syntheticEntries, tournamentBaseline, tournamentRewardBand, tournamentScore, tournamentTokenReward, tournamentTrophy } from './tierDMiniTournament'

type EventRow={id:string;owner_user_id:string;league_id:string;level_anchor:number;start_at:string;end_at:string;locked_at:string|null;status:'OPEN'|'LOCKED';last_seen_rank:number|null;final_owner_rank:number|null;reward_band:TournamentRewardBand|null;intro_seen_at:string|null;reward_seen_at:string|null}
type StoredEntry={tournament_id:string;user_id:string;level:number;points:number;baseline_score:number;synthetic:boolean;updated_at:string;final_rank:number|null;final_score:number|null;mock_update_slot:number}

async function activeOwnedTournament(userId:string,now:number){
 const {data,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('owner_user_id',userId).eq('status','OPEN').order('start_at',{ascending:false});if(error)throw error
 for(const raw of data??[]){const event=raw as EventRow;if(Date.parse(event.end_at)<=now){await finalizePersonalTournament(event,now);return{...event,status:'LOCKED' as const,finalized_at:new Date(now).toISOString()}}else return event}
 return null
}

/** Repairs an orphaned tournament whose event row exists but cohort insert did not complete. */
async function ensurePersonalTournamentEntries(event:EventRow,now=Date.now()){
 const {data:existing,error:existingError}=await supabaseAdmin.from('tier_d_mini_tournament_entries').select('user_id').eq('tournament_id',event.id).limit(1);if(existingError)throw existingError
 if(existing?.length)return
 const level=event.level_anchor;const userId=event.owner_user_id
 const {data:candidates,error:candidateError}=await supabaseAdmin.from('users').select('user_id,tier_d_solo_level,last_login').gte('tier_d_solo_level',Math.max(1,level-MINI_TOURNAMENT_LEVEL_RANGE)).lte('tier_d_solo_level',level+MINI_TOURNAMENT_LEVEL_RANGE).order('last_login',{ascending:false,nullsFirst:false}).limit(MINI_TOURNAMENT_COHORT_SIZE*2);if(candidateError)throw candidateError
 const real=[...(candidates??[])].sort((a,b)=>Math.abs(a.tier_d_solo_level-level)-Math.abs(b.tier_d_solo_level-level)||String(a.user_id).localeCompare(String(b.user_id)))
 const owner=real.find(row=>row.user_id===userId)??{user_id:userId,tier_d_solo_level:level,last_login:null};const selected=[owner,...real.filter(row=>row.user_id!==userId)].slice(0,MINI_TOURNAMENT_COHORT_SIZE)
 const realIds=selected.map(row=>row.user_id);const {data:totals,error:totalError}=realIds.length?await supabaseAdmin.from('tier_d_ranking_score_totals').select('user_id,total_score').in('user_id',realIds):{data:[],error:null};if(totalError)throw totalError
 const totalById=new Map((totals??[]).map(row=>[row.user_id,Number(row.total_score)]));const updatedAt=new Date(now).toISOString()
 // Every object in a PostgREST bulk upsert must provide the same NOT NULL
 // columns. Mixing rows with and without updated_at causes the omitted values
 // to be sent as null instead of using the database default.
 const entries=selected.map(row=>({tournament_id:event.id,user_id:row.user_id,level:row.tier_d_solo_level,points:0,baseline_score:totalById.get(row.user_id)??0,synthetic:false,mock_update_slot:0,updated_at:updatedAt}))
 const mocks=syntheticEntries(event.id,level,MINI_TOURNAMENT_COHORT_SIZE-entries.length).map(row=>({tournament_id:event.id,user_id:row.userId,level:row.level,points:0,baseline_score:0,synthetic:true,mock_update_slot:0,updated_at:updatedAt}))
 const {error:entryError}=await supabaseAdmin.from('tier_d_mini_tournament_entries').upsert([...entries,...mocks],{onConflict:'tournament_id,user_id',ignoreDuplicates:true});if(entryError)throw entryError
 console.warn('[TIER_D_LEADERBOARD]',{event:'COHORT_REPAIRED',tournamentId:event.id,ownerUserId:userId,entryCount:entries.length+mocks.length})
}

/** One idempotent roll per cleared Level. An owned open tournament suppresses rolls. */
export async function progressPersonalMiniTournament(userId:string,leagueId:string,level:number,_qualifies=true,now=Date.now(),random=Math.random){
 const active=await activeOwnedTournament(userId,now);if(active)return{event:active,created:false,active:true,completed:active.status==='LOCKED'}
 if(level<MINI_TOURNAMENT_MIN_LEVEL)return{event:null,created:false,active:false,ineligible:true}
 const {data:prior,error:priorError}=await supabaseAdmin.from('tier_d_personal_tournament_rolls').select('*').eq('user_id',userId).eq('level',level).maybeSingle();if(priorError)throw priorError
 if(prior){if(prior.tournament_id){const {data:event}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('id',prior.tournament_id).maybeSingle();return{event,created:false,active:!!event}}return{event:null,created:false,active:false}}
 const roll=Math.max(0,Math.min(.999999999,random()));const triggered=shouldTriggerPersonalTournament(roll)
 const {error:rollError}=await supabaseAdmin.from('tier_d_personal_tournament_rolls').insert({user_id:userId,level,roll_value:roll,triggered});if(rollError){if(rollError.code==='23505')return progressPersonalMiniTournament(userId,leagueId,level,true,now,random);throw rollError}
 if(!triggered)return{event:null,created:false,active:false}
 const rewardBand=tournamentRewardBand(level);if(!rewardBand)return{event:null,created:false,active:false,ineligible:true}
 const {data:eventData,error:createError}=await supabaseAdmin.from('tier_d_mini_tournaments').insert({owner_user_id:userId,league_id:leagueId,level_anchor:level,start_at:new Date(now).toISOString(),end_at:new Date(now+MINI_TOURNAMENT_DURATION_MS).toISOString(),reward_band:rewardBand}).select('*').single()
 if(createError){if(createError.code==='23505'){const concurrent=await activeOwnedTournament(userId,now);return{event:concurrent,created:false,active:!!concurrent}}throw createError}
 const event=eventData as EventRow
 await ensurePersonalTournamentEntries(event,now)
 await supabaseAdmin.from('tier_d_personal_tournament_rolls').update({tournament_id:event.id}).eq('user_id',userId).eq('level',level)
 return{event,created:true,active:true}
}

async function materializeScores(event:EventRow,now:number){
 const {data,error}=await supabaseAdmin.from('tier_d_mini_tournament_entries').select('*').eq('tournament_id',event.id);if(error)throw error
 const stored=(data??[]) as StoredEntry[];const realIds=stored.filter(row=>!row.synthetic).map(row=>row.user_id);const capped=Math.min(now,Date.parse(event.end_at))
 const [{data:totals,error:totalsError},{data:credits,error:creditsError}]=realIds.length?await Promise.all([supabaseAdmin.from('tier_d_ranking_score_totals').select('user_id,total_score').in('user_id',realIds),supabaseAdmin.from('tier_d_ranking_score_credits').select('user_id,earned_score').in('user_id',realIds).gte('credited_at',event.start_at).lte('credited_at',new Date(capped).toISOString())]):[{data:[],error:null},{data:[],error:null}];if(totalsError)throw totalsError;if(creditsError)throw creditsError
 const totalById=new Map((totals??[]).map(row=>[String(row.user_id),Number(row.total_score)]));const earnedAfterStart=new Map<string,number>();for(const credit of credits??[]){const id=String(credit.user_id);earnedAfterStart.set(id,(earnedAfterStart.get(id)??0)+Number(credit.earned_score??0))}
 const canonicalBaseline=new Map(realIds.map(id=>[id,tournamentBaseline(totalById.get(id)??0,earnedAfterStart.get(id)??0)] as const))
 for(const row of stored.filter(row=>!row.synthetic)){const baseline=canonicalBaseline.get(row.user_id);if(baseline!==undefined&&Number(row.baseline_score)!==baseline){await supabaseAdmin.from('tier_d_mini_tournament_entries').update({baseline_score:baseline}).eq('tournament_id',event.id).eq('user_id',row.user_id);row.baseline_score=baseline}}
 const base=stored.map(row=>({userId:row.user_id,level:row.level,points:row.synthetic?row.points:tournamentScore(totalById.get(row.user_id)??row.baseline_score,row.baseline_score),updatedAt:Date.parse(row.updated_at),synthetic:row.synthetic,mockUpdateSlot:row.mock_update_slot}))
 const advanced=advanceSyntheticEntries(base,Date.parse(event.start_at),capped,event.id)
 for(const row of advanced.filter(row=>row.synthetic)){const old=stored.find(item=>item.user_id===row.userId)!;if(old.points!==row.points||old.mock_update_slot!==(row.mockUpdateSlot??0))await supabaseAdmin.from('tier_d_mini_tournament_entries').update({points:row.points,mock_update_slot:row.mockUpdateSlot,updated_at:new Date(row.updatedAt).toISOString()}).eq('tournament_id',event.id).eq('user_id',row.userId)}
 return advanced
}

async function finalizePersonalTournament(event:EventRow,now=Date.now()){
 const rows=rankMiniTournament(await materializeScores(event,Date.parse(event.end_at)));const owner=rows.find(row=>row.userId===event.owner_user_id)
 for(const row of rows)await supabaseAdmin.from('tier_d_mini_tournament_entries').update({final_rank:row.rank,final_score:row.points}).eq('tournament_id',event.id).eq('user_id',row.userId)
 const {data:locked,error}=await supabaseAdmin.from('tier_d_mini_tournaments').update({status:'LOCKED',locked_at:new Date(now).toISOString(),finalized_at:new Date(now).toISOString(),final_owner_rank:owner?.rank??null}).eq('id',event.id).eq('status','OPEN').select('id');if(error)throw error
 if(owner&&owner.rank<=20)await settleOwnerReward(event,owner.rank)
 return rows
}

async function settleOwnerReward(event:EventRow,rank:number){
 const band=event.reward_band??tournamentRewardBand(event.level_anchor);if(!band)return
 const tokens=tournamentTokenReward(rank,band);const trophy=tournamentTrophy(rank);const item=['auto_sort','freeze','double_pile','shuffle','undo'][Math.min(4,rank-1)]
 const {error}=await supabaseAdmin.rpc('award_tier_d_personal_tournament',{p_tournament_id:event.id,p_user_id:event.owner_user_id,p_league_id:event.league_id,p_rank:rank,p_item_key:item,p_token_reward:tokens,p_trophy_type:trophy??'',p_champion:rank===1});if(error)throw error
 if(tokens>0)await economyService.mint({idempotencyKey:`TIER_D_PERSONAL_TOP20:${event.id}:${event.owner_user_id}`,to:{accountType:'PLAYER',accountId:event.owner_user_id},currency:'TOKEN',amount:tokens,reason:'EVENT_REWARD',actor:'tier_d_personal_top20',context:{playerId:event.owner_user_id,tier:'tier_d'},metadata:{tournamentId:event.id,rank,leagueId:event.league_id}})
}

export async function getMiniTournamentStandings(tournamentId:string,userId?:string,now=Date.now()){
 const {data,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('id',tournamentId).single();if(error)throw error
 const event=data as EventRow;if(userId&&event.owner_user_id!==userId)throw new Error('TOURNAMENT_NOT_OWNED')
 await ensurePersonalTournamentEntries(event,now)
 let ranked=event.status==='OPEN'&&miniTournamentStatus(Date.parse(event.end_at),now)==='LOCKED'?await finalizePersonalTournament(event,now):rankMiniTournament(await materializeScores(event,event.status==='LOCKED'?Date.parse(event.end_at):now))
 if(event.status==='LOCKED'){const {data:finalRows,error:finalError}=await supabaseAdmin.from('tier_d_mini_tournament_entries').select('*').eq('tournament_id',event.id);if(finalError)throw finalError;ranked=(finalRows??[]).map(row=>({userId:row.user_id,level:row.level,points:Number(row.final_score??row.points),updatedAt:Date.parse(row.updated_at),synthetic:row.synthetic,rank:row.final_rank})).sort((a,b)=>a.rank-b.rank);const owner=ranked.find(row=>row.userId===event.owner_user_id);if(owner?.rank&&owner.rank<=20)await settleOwnerReward(event,owner.rank)}
 const realIds=ranked.filter(row=>!row.synthetic).map(row=>row.userId);const [{data:profiles},{data:languages}]=await Promise.all([realIds.length?supabaseAdmin.from('users').select('user_id,display_name,avatar_url,tier_d_best_win_streak').in('user_id',realIds):Promise.resolve({data:[]}),realIds.length?supabaseAdmin.from('player_language_preferences').select('user_id,language_code').in('user_id',realIds):Promise.resolve({data:[]})])
 const profileById=new Map((profiles??[]).map(row=>[row.user_id,row]));const languageById=new Map((languages??[]).map(row=>[row.user_id,row.language_code]));const owner=ranked.find(row=>row.userId===event.owner_user_id)
 const decorate=(row:typeof ranked[number])=>({userId:row.userId,displayName:row.synthetic?`RIVAL ${row.rank}`:(profileById.get(row.userId)?.display_name??(row.userId===event.owner_user_id?'YOU':'PLAYER')),avatarUrl:row.synthetic?null:profileById.get(row.userId)?.avatar_url??null,languageCode:row.synthetic?'en':languageById.get(row.userId)??'en',rank:row.rank,leaguePoints:row.points,longestWinStreak:row.synthetic?0:profileById.get(row.userId)?.tier_d_best_win_streak??0,isMock:!!row.synthetic})
 const rewardBand=event.reward_band??tournamentRewardBand(event.level_anchor)
 return{enabled:true,tournamentId:event.id,startsAt:event.start_at,endsAt:event.end_at,status:miniTournamentStatus(Date.parse(event.end_at),now),introRequired:event.status==='OPEN'&&!event.intro_seen_at,rewardPresentationRequired:event.status==='LOCKED'&&!event.reward_seen_at,leagueId:event.league_id,rewardBand,finalReward:owner&&rewardBand?{rank:owner.rank,tokens:tournamentTokenReward(owner.rank,rewardBand),trophy:tournamentTrophy(owner.rank),champion:owner.rank===1}:undefined,entries:ranked.slice(0,20).map(decorate),currentUser:{rank:owner?.rank??null,leaguePoints:owner?.points??0,entry:owner?decorate(owner):null},previousDisplayedRank:event.last_seen_rank}
}

export async function getActivePersonalTournament(userId:string,now=Date.now()){const event=await activeOwnedTournament(userId,now);if(event)return getMiniTournamentStandings(event.id,userId,now);const{data:pending,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('owner_user_id',userId).eq('status','LOCKED').is('reward_seen_at',null).order('end_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return pending?getMiniTournamentStandings(pending.id,userId,now):{enabled:false,entries:[],currentUser:{rank:null,leaguePoints:0,entry:null},previousDisplayedRank:null}}
export async function markPersonalTournamentRankSeen(userId:string,tournamentId:string,rank:number){const {error}=await supabaseAdmin.from('tier_d_mini_tournaments').update({last_seen_rank:rank}).eq('id',tournamentId).eq('owner_user_id',userId);if(error)throw error;return{ok:true}}
export async function markPersonalTournamentIntroSeen(userId:string,tournamentId:string){const {error}=await supabaseAdmin.from('tier_d_mini_tournaments').update({intro_seen_at:new Date().toISOString()}).eq('id',tournamentId).eq('owner_user_id',userId).is('intro_seen_at',null);if(error)throw error;return{ok:true}}
export async function markPersonalTournamentRewardSeen(userId:string,tournamentId:string){const {error}=await supabaseAdmin.from('tier_d_mini_tournaments').update({reward_seen_at:new Date().toISOString()}).eq('id',tournamentId).eq('owner_user_id',userId).is('reward_seen_at',null);if(error)throw error;return{ok:true}}
/** Lifetime totals are authoritative; retained as a compatibility no-op. */
export async function addMiniTournamentPoints(_userId:string,_points:number,_now=Date.now()){}
export async function lockExpiredMiniTournaments(now=Date.now()){const {data,error}=await supabaseAdmin.from('tier_d_mini_tournaments').select('*').eq('status','OPEN').lte('end_at',new Date(now).toISOString());if(error)throw error;for(const row of data??[])await finalizePersonalTournament(row as EventRow,now)}
