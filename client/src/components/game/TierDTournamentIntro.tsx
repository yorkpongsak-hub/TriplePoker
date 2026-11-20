import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { GameActionButton } from '../ui/GameActionButton'

const TROPHIES:Record<string,any>={
 bronze:require('../../../assets/league/Bronze League Trophy.png'),silver:require('../../../assets/league/Silver League Trophy.png'),gold:require('../../../assets/league/Gold League Trophy.png'),platinum:require('../../../assets/league/Platinum League Trophy.png'),diamond:require('../../../assets/league/Diamond League Trophy.png'),elite:require('../../../assets/league/Elite League Trophy.png'),master:require('../../../assets/league/Master League Trophy.png'),grandmaster:require('../../../assets/league/Grandmaster League Trophy.png'),legend:require('../../../assets/league/Legend League Trophy.png'),mythic:require('../../../assets/league/Champion League Trophy.png'),
}
type Band={rank1:number;rank2:number;rank3:number;rank4To20:number}
export function TierDTournamentIntro({leagueId,rewards,onEnter}:{leagueId:string;rewards:Band;onEnter:()=>void}){
 return <View style={s.screen}><View style={s.panel}>
  <Text style={s.kicker}>PERSONAL TOP 20</Text><Text style={s.title}>24H TOURNAMENT</Text>
  <Image source={TROPHIES[leagueId]??TROPHIES.bronze} resizeMode="contain" style={s.trophy}/>
  <Text style={s.league}>{leagueId.toUpperCase()} LEAGUE</Text>
  <Text style={s.body}>Players near your Level have been grouped for a personal 24-hour competition.</Text>
  <Text style={s.duration}>24 HOURS · FIXED COHORT</Text>
  <View style={s.rewards}><Reward rank="#1 · GOLD" value={rewards.rank1}/><Reward rank="#2 · SILVER" value={rewards.rank2}/><Reward rank="#3 · BRONZE" value={rewards.rank3}/><Reward rank="#4–20" value={rewards.rank4To20}/></View>
  <GameActionButton label="ENTER TOURNAMENT" variant="prestige" animation="prestige" onPress={onEnter} style={s.enter}/>
 </View></View>
}
export function TierDTournamentReward({leagueId,rank,tokens,trophy,champion,onContinue}:{leagueId:string;rank:number;tokens:number;trophy?:string|null;champion?:boolean;onContinue:()=>void}){
 return <View style={s.screen}><View style={s.panel}><Text style={s.kicker}>24H TOURNAMENT COMPLETE</Text><Text style={s.title}>{champion?'CHAMPION!':'FINAL RESULT'}</Text><Image source={TROPHIES[leagueId]??TROPHIES.bronze} resizeMode="contain" style={s.trophy}/><Text style={s.league}>{leagueId.toUpperCase()} LEAGUE</Text><Text style={s.finalRank}>#{rank}</Text>{trophy?<Text style={s.duration}>{trophy.toUpperCase()} TOURNAMENT TROPHY</Text>:null}<Text style={s.tokenReward}>+{tokens.toLocaleString()} TOKEN</Text><GameActionButton label="VIEW FINAL TOP 20" variant="prestige" animation="prestige" onPress={onContinue} style={s.enter}/></View></View>
}
function Reward({rank,value}:{rank:string;value:number}){return <View style={s.reward}><Text style={s.rewardRank}>{rank}</Text><Text style={s.rewardValue}>{value.toLocaleString()} TOKEN</Text></View>}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#07150d',padding:16,alignItems:'center',justifyContent:'center'},panel:{width:'100%',maxWidth:520,alignItems:'center',borderWidth:2,borderColor:'#FFD76A',borderRadius:20,backgroundColor:'#102d1d',padding:22},kicker:{color:'#9DDAFF',fontSize:10,fontWeight:'900',letterSpacing:2},title:{color:'#FFF0A8',fontSize:28,fontWeight:'900',letterSpacing:1.5,marginTop:5,textShadowColor:'#9a5f00',textShadowRadius:10},trophy:{width:150,height:150,marginVertical:5},league:{color:'#FFD76A',fontSize:14,fontWeight:'900',letterSpacing:1.2},body:{color:'#D8F3E0',fontSize:13,lineHeight:19,textAlign:'center',maxWidth:360,marginTop:10},duration:{color:'#8DFFB5',fontSize:11,fontWeight:'900',letterSpacing:1.2,marginVertical:12},finalRank:{color:'#FFF0A8',fontSize:58,fontWeight:'900',lineHeight:66},tokenReward:{color:'#8DFFB5',fontSize:22,fontWeight:'900',marginVertical:8},rewards:{width:'100%',gap:6},reward:{height:34,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12,borderRadius:8,borderWidth:1,borderColor:'rgba(255,215,106,.35)',backgroundColor:'rgba(20,83,48,.92)'},rewardRank:{color:'#FFF0A8',fontWeight:'900'},rewardValue:{color:'#8DFFB5',fontWeight:'900'},enter:{alignSelf:'stretch',marginTop:16}})
