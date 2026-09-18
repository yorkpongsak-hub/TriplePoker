import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { watchAd } from '../../src/services/adRewards'
import { adProvider } from '../../src/ads/adProvider'
import { adMode } from '../../src/ads/adConfig'

const SERVER_URL=process.env.EXPO_PUBLIC_SERVER_URL||'http://localhost:3001'
export default function WatchAdScreen(){
 const params=useLocalSearchParams<{returnTo?:string;mode?:string}>(),token=useAuthStore(s=>s.session?.access_token??null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const mode=params.mode,go=()=>router.replace((params.returnTo??'/(home)/profile') as any),context=mode==='daily_streak'?'DAILY_STREAK':mode==='random_item'?'RANDOM_ITEM':'TOKEN_RESCUE'
 const show=async()=>{if(busy)return;setBusy(true);setMessage('LOADING AD…');const result=await adProvider.showRewarded(context)
   if(!result.earned){setBusy(false);setMessage('AD UNAVAILABLE — TRY AGAIN LATER');return}
   if(mode==='daily_streak'){router.replace({pathname:'/(home)/streak',params:{dailyClaim:'1',googleTestEarned:adProvider.mode==='google_test'?'1':undefined}} as any);return}
   const reward=await watchAd(token,{googleTestEarned:adProvider.mode==='google_test',devMock:adProvider.mode==='mock'&&__DEV__});if(!reward.ok){setBusy(false);setMessage(reward.reason==='cooldown'?'REWARD NOT AVAILABLE YET':'REWARD COULD NOT BE CLAIMED');return};setMessage(`+${reward.tokensAwarded} TOKEN`);setTimeout(go,900)
 }
 const forced=async()=>{setBusy(true);const result=await adProvider.showInterstitial();if(result.shown&&token)await fetch(`${SERVER_URL}/ads/forced-complete`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});go()}
 if(mode==='forced')return <View style={s.page}><Text style={s.title}>ADVERTISEMENT</Text><Pressable style={s.button} onPress={forced}><Text style={s.buttonText}>{busy?'PLEASE WAIT…':'CONTINUE'}</Text></Pressable></View>
 return <View style={s.page}><Text style={s.title}>{adMode==='google_test'?'GOOGLE TEST AD':'AD REWARD'}</Text><Text style={s.copy}>Complete the ad to receive your TriplePoker reward.</Text>{message?<Text style={s.message}>{message}</Text>:null}<Pressable disabled={busy} style={[s.button,busy&&s.disabled]} onPress={show}><Text style={s.buttonText}>{busy?'PLEASE WAIT…':'WATCH AD'}</Text></Pressable></View>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#000',alignItems:'center',justifyContent:'center',padding:28,gap:18},title:{color:'#FFD76A',fontWeight:'900',fontSize:25},copy:{color:'#E8E3D0',textAlign:'center'},message:{color:'#FFD76A',fontWeight:'800',textAlign:'center'},button:{backgroundColor:'#67430d',borderColor:'#FFD76A',borderWidth:2,borderRadius:10,paddingVertical:14,paddingHorizontal:26},disabled:{opacity:.45},buttonText:{color:'#FFF3B8',fontWeight:'900'}})
