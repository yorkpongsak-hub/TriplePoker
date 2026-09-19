import React, { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

type Entry={userId:string;points:number;rank:number;synthetic?:boolean;displayName?:string}
type Board={event:{id:string;endAt:string;status:'OPEN'|'LOCKED'};entries:Entry[]}
export function TierDMiniTournament({serverUrl,accessToken,tournamentId,onClose}:{serverUrl:string;accessToken:string;tournamentId:string;onClose:()=>void}){
 const [board,setBoard]=useState<Board|null>(null);const [error,setError]=useState(false)
 useEffect(()=>{let live=true;const load=()=>fetch(`${serverUrl}/tier-d/mini-tournament?tournamentId=${encodeURIComponent(tournamentId)}`,{headers:{Authorization:`Bearer ${accessToken}`}}).then(r=>r.ok?r.json():Promise.reject()).then(v=>live&&setBoard(v)).catch(()=>live&&setError(true));void load();const timer=setInterval(load,30000);return()=>{live=false;clearInterval(timer)}},[accessToken,serverUrl,tournamentId])
 if(error)return <View style={s.root}><Text style={s.title}>TOURNAMENT UNAVAILABLE</Text><Pressable onPress={onClose}><Text style={s.close}>CLOSE</Text></Pressable></View>
 if(!board)return <View style={s.root}><Text style={s.title}>LOADING TOURNAMENT…</Text></View>
 const remaining=Math.max(0,Date.parse(board.event.endAt)-Date.now());const hours=Math.floor(remaining/3600000);const minutes=Math.floor((remaining%3600000)/60000);const clock=board.event.status==='LOCKED'?'FINAL STANDINGS':`${hours}H ${String(minutes).padStart(2,'0')}M REMAINING`
 return <View style={s.root}><Text style={s.title}>YOUR 24-HOUR TOP 20</Text><Text style={s.clock}>{clock}</Text><ScrollView style={s.list}>{board.entries.slice(0,20).map(row=><View key={row.userId} style={s.row}><Text style={s.rank}>#{row.rank}</Text><Text style={s.name}>{row.displayName??(row.synthetic?`RIVAL ${row.rank}`:row.userId.slice(0,8))}</Text><Text style={s.points}>{row.points} PTS</Text></View>)}</ScrollView><Pressable onPress={onClose}><Text style={s.close}>CONTINUE</Text></Pressable></View>
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#091808',padding:20,alignItems:'center'},title:{color:'#ffd76a',fontWeight:'900',fontSize:18,textAlign:'center'},clock:{color:'#9ddaff',fontWeight:'800',marginVertical:8},list:{alignSelf:'stretch'},row:{flexDirection:'row',padding:10,borderBottomWidth:1,borderColor:'rgba(255,215,106,.2)'},rank:{width:40,color:'#ffd76a',fontWeight:'900'},name:{flex:1,color:'#f5f2e8'},points:{color:'#8dffb5',fontWeight:'900'},close:{marginTop:12,color:'#ffd76a',fontWeight:'900'}})
