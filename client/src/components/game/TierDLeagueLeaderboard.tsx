import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { router } from 'expo-router'
import { audio } from '../../audio/AudioManager'
import { AudioEvent } from '../../audio/audioEvents'
import { supabase } from '../../services/supabaseService'
import { AvatarDisplay, PRESET_AVATARS } from '../profile/AvatarPicker'
import { formatInteger, t } from '../../i18n'
import { useI18n } from '../../i18n/store'
import { GameActionButton } from '../ui/GameActionButton'
import { TierDTournamentIntro, TierDTournamentReward } from './TierDTournamentIntro'
import { ThumbUpVFX } from '../vfx/ThumbUpVFX'
import { MonetizedBannerSlot } from '../ads/MonetizedBannerSlot'
import { COUNTRIES } from '../../country/countries'

export type LeagueRankEntry = { userId:string; displayName:string; avatarUrl:string|null; countryCode?:string|null; rank:number; leaguePoints:number; longestWinStreak:number; isMock?:boolean }
type RewardBand={rank1:number;rank2:number;rank3:number;rank4To20:number}
export type LeagueRankSnapshot = { enabled:boolean;tournamentId?:string;startsAt?:string;endsAt?:string;status?:'OPEN'|'LOCKED';introRequired?:boolean;rewardPresentationRequired?:boolean;leagueId?:string;rewardBand?:RewardBand;finalReward?:{rank:number;tokens:number;trophy?:string|null;champion?:boolean};entries:LeagueRankEntry[];currentUser:{rank:number|null;leaguePoints:number;entry?:LeagueRankEntry|null};previousDisplayedRank:number|null }

const LEAGUES=[{name:'Bronze',start:1,end:50},{name:'Silver',start:51,end:100},{name:'Gold',start:101,end:150},{name:'Platinum',start:151,end:200},{name:'Diamond',start:201,end:250},{name:'Elite',start:251,end:350},{name:'Master',start:351,end:500},{name:'Grandmaster',start:501,end:700},{name:'Legend',start:701,end:1000},{name:'Mythic',start:1001,end:Number.MAX_SAFE_INTEGER}]
function leagueFor(level:number){return LEAGUES.find(entry=>level>=entry.start&&level<=entry.end)??LEAGUES[0]}
function RankingCountry({code,isMock=false}:{code?:string|null;isMock?:boolean}){
 const country=COUNTRIES.find(item=>item.code===code)
 if(isMock)return <Text accessibilityLabel="Synthetic rival" style={s.neutralFlag}>🌐</Text>
 if(!country)return <View style={s.countrySlot}/>
 return <View style={s.countrySlot}><ExpoImage source={country.image} contentFit="cover" accessibilityLabel={`Representing ${country.name}`} style={s.countryFlag}/></View>
}

export async function fetchTierDLeagueRanking(serverUrl:string, accessToken:string, level?:number):Promise<LeagueRankSnapshot>{
 const query=Number.isInteger(level)&&level!>0?`?level=${level}`:''
 const request=(token:string)=>fetch(`${serverUrl}/tier-d/leaderboard${query}`,{headers:{Authorization:`Bearer ${token}`,'Cache-Control':'no-cache'}})
 let response=await request(accessToken)
 if(response.status===401){const {data,error}=await supabase.auth.refreshSession();if(!error&&data.session)response=await request(data.session.access_token)}
 if(!response.ok){let detail='';try{const body=await response.json();detail=body.error??body.message??''}catch{}throw new Error(detail||`Could not load League ranking (${response.status}).`)}
 const snapshot:LeagueRankSnapshot=await response.json();if(__DEV__)console.info('[TIER_D_LEADERBOARD]',{event:'QUERY_RESULT',level,returnedPlayerScore:snapshot.currentUser.leaguePoints});return snapshot
}

export function TierDLeagueLeaderboard({serverUrl,accessToken,userId,level,previousRank,onClose,entryMode='manualView',onAutoComplete}:{serverUrl:string;accessToken:string;userId:string;level:number;previousRank:number|null;onClose:()=>void;entryMode?:'manualView'|'autoReward';onAutoComplete?:()=>void}){
 const locale=useI18n(state=>state.locale)
 const [snapshot,setSnapshot]=useState<LeagueRankSnapshot>()
 const [displayRank,setDisplayRank]=useState<number|null>(previousRank)
 const [error,setError]=useState('')
 const [clock,setClock]=useState(Date.now())
 const [introOpen,setIntroOpen]=useState(false)
 const [rewardOpen,setRewardOpen]=useState(false)
 const [rankUpVfxVisible,setRankUpVfxVisible]=useState(false)
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null); const autoTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
 const onAutoCompleteRef=useRef(onAutoComplete);onAutoCompleteRef.current=onAutoComplete
 const league=leagueFor(level)
 const beginRanking=(next:LeagueRankSnapshot)=>{
   const target=next.currentUser.rank;if(target===null){setDisplayRank(null);return}
   const start=next.previousDisplayedRank??previousRank??target;setDisplayRank(start);let current=start
   const rankImproved=target<start
   const complete=()=>{if(rankImproved){setRankUpVfxVisible(true);audio.play(AudioEvent.RANK_COMPLETE)}if(next.tournamentId)void fetch(`${serverUrl}/tier-d/leaderboard/seen`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({tournamentId:next.tournamentId,rank:target})}).catch(()=>{})}
   const step=()=>{if(current===target)return;current+=target<current?-1:1;LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);setDisplayRank(current);audio.play(AudioEvent.RANK_TICK);if(current!==target)timer.current=setTimeout(step,333);else complete()}
   if(current!==target)timer.current=setTimeout(step,333);else complete()
   if(entryMode==='autoReward')autoTimer.current=setTimeout(()=>onAutoCompleteRef.current?.(),Math.abs(start-target)*333+3000)
 }

 useEffect(()=>{
  let live=true
  void fetchTierDLeagueRanking(serverUrl,accessToken,level).then(next=>{
   if(!live)return
   setSnapshot(next)
   if(next.introRequired){setIntroOpen(true);return}
   if(next.rewardPresentationRequired&&next.finalReward){setRewardOpen(true);return}
   beginRanking(next)
  }).catch(e=>{if(__DEV__)console.warn('[TIER_D_LEADERBOARD] load failed',e);if(live)setError('Could not load League ranking. Please try again.')})
  return()=>{live=false;if(timer.current)clearTimeout(timer.current);if(autoTimer.current)clearTimeout(autoTimer.current)}
 // onAutoComplete is normally an inline parent callback. Keeping it out of this
 // request effect prevents a parent timer render from polling the leaderboard.
 },[accessToken,entryMode,level,previousRank,serverUrl])
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),30_000);return()=>clearInterval(id)},[])

 const entries=useMemo(()=>{
  if(!snapshot)return[]
  const rows=snapshot.entries.filter(row=>row.userId!==userId)
  const me=snapshot.entries.find(row=>row.userId===userId)
  if(!me||displayRank===null)return snapshot.entries
  const insert=Math.max(0,Math.min(rows.length,displayRank-1))
  const shown=[...rows]
  shown.splice(insert,0,{...me,rank:displayRank})
  return shown.slice(0,20).map((row,index)=>row.userId===userId?row:{...row,rank:index+1})
 },[displayRank,snapshot,userId])
 const remaining=snapshot?.endsAt?Math.max(0,Date.parse(snapshot.endsAt)-clock):0
 const remainingLabel=snapshot?.endsAt?(remaining<=0?t('ranking.tournamentEnded',{},locale):t('ranking.hoursRemaining',{hours:Math.max(1,Math.ceil(remaining/3_600_000))},locale)):t('ranking.top20',{},locale)
 const ownerOutside=snapshot?.currentUser.entry&&snapshot.currentUser.rank!==null&&snapshot.currentUser.rank>20?snapshot.currentUser.entry:null
 const continueFromRanking=()=>{
  if(autoTimer.current){clearTimeout(autoTimer.current);autoTimer.current=null}
  if(entryMode==='autoReward'&&onAutoCompleteRef.current)onAutoCompleteRef.current()
  else onClose()
 }
 const enterTournament=()=>{if(!snapshot?.tournamentId)return;setIntroOpen(false);void fetch(`${serverUrl}/tier-d/leaderboard/intro-seen`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({tournamentId:snapshot.tournamentId})}).catch(()=>{});beginRanking(snapshot)}
 const viewFinalStandings=()=>{if(!snapshot?.tournamentId)return;setRewardOpen(false);void fetch(`${serverUrl}/tier-d/leaderboard/reward-seen`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({tournamentId:snapshot.tournamentId})}).catch(()=>{});beginRanking(snapshot)}

 if(introOpen&&snapshot?.rewardBand)return <TierDTournamentIntro leagueId={snapshot.leagueId??league.name.toLowerCase()} rewards={snapshot.rewardBand} onEnter={enterTournament}/>
 if(rewardOpen&&snapshot?.finalReward)return <TierDTournamentReward leagueId={snapshot.leagueId??league.name.toLowerCase()} {...snapshot.finalReward} onContinue={viewFinalStandings}/>

 return <View style={s.screen}><View style={s.panel}>
  {entryMode==='manualView'?<GameActionButton accessibilityLabel={t('common.close',{},locale)} size="small" variant="back" animation="none" label={t('common.close',{},locale)} onPress={onClose} style={s.close}/>:null}
  <View style={s.header}><Text style={s.title}>{t('ranking.top20',{},locale)}</Text><Text style={s.leagueTitle}>{league.name.toUpperCase()} {t('game.league',{},locale)}</Text></View>
  <MonetizedBannerSlot placement="tier_d_top20" />
  <View style={s.trophyWrap}><View style={s.goldAura}/><Text style={s.sparkles}>✦  ✧  ✦</Text><Text style={s.trophyGlyph}>♛</Text></View>
  <Text style={s.speed}>{remainingLabel}</Text>
  {error?<Text style={s.error}>{error}</Text>:!snapshot?<Text style={s.state}>{t('common.loading',{},locale)}</Text>:!snapshot.enabled?<View style={s.disabled}><Text style={s.disabledTitle}>{t('common.comingSoon',{},locale)}</Text><Text style={s.state}>{t('ranking.top20',{},locale)}</Text></View>:<>
   <View style={s.columns}><Text style={s.colRank}>{t('ranking.rank',{rank:''},locale).replace('#','')}</Text><Text style={s.colName}>{t('ranking.player',{},locale)}</Text><Text style={s.colStreak}>{t('ranking.streak',{},locale)}</Text><Text style={s.colPoints}>{t('ranking.points',{},locale)}</Text></View>
   <ScrollView style={s.scroll} contentContainerStyle={s.list}>{entries.map(row=>{const isMe=row.userId===userId;const preset=row.avatarUrl?PRESET_AVATARS.find(item=>item.key===row.avatarUrl):undefined;const avatar=preset?<AvatarDisplay config={{type:'preset',presetKey:preset.key,frameKey:'default'}} size={26} showFrame={false}/>:row.avatarUrl&&/^(https?:|data:)/i.test(row.avatarUrl)?<ExpoImage source={row.avatarUrl} contentFit="cover" transition={120} style={s.avatar}/>:<View style={[s.avatarFallback,isMe&&s.meAvatar]}><Text style={s.avatarText}>{row.displayName.slice(0,1).toUpperCase()}</Text></View>;return <Pressable key={row.userId} accessibilityRole="button" accessibilityLabel={`View ${row.displayName}'s profile`} onPress={()=>router.push({pathname:'/(home)/player/[userId]',params:{userId:row.userId}})}><View style={[s.row,isMe?s.me:s.rival,isMe&&entryMode==='autoReward'&&s.autoMe]}><Text style={[s.rank,row.rank<=3&&s.medal,isMe&&s.meText]}>#{row.rank}</Text><View style={s.avatarSlot}>{avatar}</View><View style={s.identity}><Text style={[s.name,isMe&&s.meText]} numberOfLines={1}>{row.displayName}{isMe?'  · YOU':row.isMock?'  · RIVAL':''}</Text><RankingCountry code={row.countryCode} isMock={row.isMock}/></View><Text style={[s.streak,isMe&&s.meText]}>🔥{row.longestWinStreak}</Text><Text style={[s.points,isMe&&s.mePoints]}>{row.leaguePoints.toLocaleString()} LP</Text></View></Pressable>})}</ScrollView>
   {ownerOutside?<View style={[s.row,s.me]}><Text style={[s.rank,s.meText]}>#{displayRank??ownerOutside.rank}</Text><View style={s.avatarSlot}><View style={[s.avatarFallback,s.meAvatar]}><Text style={s.avatarText}>{ownerOutside.displayName.slice(0,1).toUpperCase()}</Text></View></View><View style={s.identity}><Text style={[s.name,s.meText]} numberOfLines={1}>{ownerOutside.displayName}  · YOU</Text><RankingCountry code={ownerOutside.countryCode}/></View><Text style={[s.streak,s.meText]}>🔥{ownerOutside.longestWinStreak}</Text><Text style={[s.points,s.mePoints]}>{ownerOutside.leaguePoints.toLocaleString()} LP</Text></View>:null}
   {displayRank!==null?<Text style={s.footer}>{t('ranking.rank',{rank:displayRank},locale)}  ·  {formatInteger(snapshot.currentUser.leaguePoints,locale)} LP</Text>:null}
  </>}
  {entryMode==='autoReward'?<GameActionButton accessibilityLabel={t('common.continue',{},locale)} label={t('common.continue',{},locale)} onPress={continueFromRanking} style={s.continue}/>:null}
 </View><ThumbUpVFX visible={rankUpVfxVisible} label="Good job" onFinish={()=>setRankUpVfxVisible(false)}/></View>
}

const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#07150d',padding:16,justifyContent:'center'},
 panel:{width:'100%',maxWidth:520,maxHeight:'92%',alignSelf:'center',backgroundColor:'#102d1d',borderWidth:1.5,borderColor:'#FFD76A',borderRadius:16,padding:14},
 header:{alignItems:'center',marginBottom:2},
 title:{color:'#FFD76A',fontSize:20,fontWeight:'900',letterSpacing:1,textShadowColor:'#9a5f00',textShadowRadius:9},
 leagueTitle:{color:'#FFF0A8',fontSize:15,fontWeight:'900',letterSpacing:1.1,marginTop:2,textShadowColor:'#9a5f00',textShadowRadius:7},
 speed:{color:'#a9d5bf',fontSize:9,fontWeight:'800',marginBottom:10,textAlign:'center'},
 close:{position:'absolute',right:12,top:12,zIndex:8,width:76},
 closeText:{color:'#FFD76A',fontSize:9,fontWeight:'900'},
 columns:{flexDirection:'row',paddingHorizontal:8,paddingBottom:5,borderBottomWidth:1,borderBottomColor:'rgba(255,215,106,.35)'},
 colRank:{width:36,color:'#8eb7c7',fontSize:9,fontWeight:'900'},
 colName:{flex:1,color:'#8eb7c7',fontSize:9,fontWeight:'900'},
 colStreak:{width:52,textAlign:'right',color:'#8eb7c7',fontSize:9,fontWeight:'900'},
 colPoints:{width:70,textAlign:'right',color:'#8eb7c7',fontSize:9,fontWeight:'900'},
 trophyWrap:{height:92,alignItems:'center',justifyContent:'center'},
 trophyGlyph:{zIndex:3,color:'#FFF0A8',fontSize:72,lineHeight:84,fontWeight:'900',textShadowColor:'#9a5f00',textShadowRadius:12},
 goldAura:{position:'absolute',width:90,height:90,borderRadius:45,backgroundColor:'rgba(255,211,80,.42)',shadowColor:'#FFD76A',shadowOpacity:1,shadowRadius:24,elevation:10},
 sparkles:{position:'absolute',zIndex:4,color:'#fff5b5',fontSize:28,fontWeight:'900',textShadowColor:'#FFD76A',textShadowRadius:16},
 scroll:{flexShrink:1},
 list:{gap:4,paddingVertical:7},
 row:{height:40,flexDirection:'row',alignItems:'center',paddingHorizontal:8,borderRadius:8,borderWidth:1},
 rival:{backgroundColor:'rgba(20,83,48,.92)',borderColor:'rgba(91,181,117,.35)'},
 me:{borderWidth:2,borderColor:'#FFE58A',shadowColor:'#FFD76A',shadowOpacity:.8,shadowRadius:7,elevation:5},autoMe:{borderStyle:'dashed',borderWidth:2,borderColor:'#fff3a5'},
 meText:{color:'#fff8d6',textShadowColor:'#704000',textShadowRadius:3},
 mePoints:{color:'#fffbd8'},
 meAvatar:{backgroundColor:'#9b6414',borderWidth:1,borderColor:'#fff0a0'},
 rank:{width:36,color:'#F5F2E8',fontWeight:'900'},
 medal:{color:'#FFD76A'},
 avatar:{width:26,height:26,borderRadius:13,marginRight:8},
 avatarSlot:{width:34,height:26,marginRight:0,alignItems:'center',justifyContent:'center'},
 avatarFallback:{width:26,height:26,borderRadius:13,alignItems:'center',justifyContent:'center',backgroundColor:'#28583c'},
 avatarText:{color:'#F5F2E8',fontSize:11,fontWeight:'900'},
 identity:{flex:1,minWidth:0,alignItems:'flex-start',justifyContent:'center'},
 name:{width:'100%',color:'#F5F2E8',fontSize:11,fontWeight:'800'},
 countrySlot:{width:22,height:13,marginTop:1,alignItems:'flex-start',justifyContent:'center'},
 countryFlag:{width:18,height:12,borderRadius:1},
 neutralFlag:{width:22,height:13,lineHeight:13,textAlign:'left',fontSize:11},
 streak:{width:52,textAlign:'right',color:'#ffbf61',fontSize:10,fontWeight:'900'},
 points:{width:70,textAlign:'right',color:'#8DFFB5',fontWeight:'900'},
 footer:{color:'#FFD76A',fontWeight:'900',textAlign:'center',paddingTop:8},
 continue:{marginTop:10},
 state:{color:'#C8C4B0',textAlign:'center',lineHeight:20},
 disabled:{paddingVertical:42,gap:8},
 disabledTitle:{color:'#FFD76A',fontWeight:'900',fontSize:16,textAlign:'center'},
 error:{color:'#ff9f9f',textAlign:'center',paddingVertical:36},
})
