import React, { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../../src/store/authStore'
import RoyalStraightFlushVFX from '../../../src/components/vfx/RoyalStraightFlushVFX'

const SERVER_URL=process.env.EXPO_PUBLIC_SERVER_URL||'http://localhost:3001'
const VALID_ITEMS=['shuffle','swap','double_pile','freeze','auto_sort','undo'] as const
type ItemKey=typeof VALID_ITEMS[number]

function eventId(){return typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():`tier-d-ad-${Date.now()}-${Math.random().toString(36).slice(2)}`}

/** Rewarded-ad transition for an empty Tier D item. Provider verification replaces devMock in production. */
export default function TierDItemAd(){
 const {item,placement}=useLocalSearchParams<{item?:string;placement?:string}>();const token=useAuthStore(state=>state.session?.access_token);const [message,setMessage]=useState<string>()
 const selected=VALID_ITEMS.includes(item as ItemKey)?item as ItemKey:undefined
 const claimId=useRef(eventId());const claiming=useRef(false)
 const back=()=>router.canGoBack()?router.back():router.replace('/game/tier-d')
 // This is an interstitial placeholder until the production ad provider is wired.
 // It deliberately grants no item and simply returns to the already-computed result.
 if(placement==='level-result')return <View style={s.screen}><RoyalStraightFlushVFX playerName="ADVERTISEMENT" minimumDurationMs={5000} closeLabel="CONTINUE" onClose={back}/></View>
 const finish=async()=>{if(claiming.current)return;if(!selected||!token){setMessage('Unable to prepare this item reward.');return}claiming.current=true;setMessage('CLAIMING ITEM...');try{
   const response=await fetch(`${SERVER_URL}/tier-d/reward/item-ad-complete`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({item:selected,eventId:claimId.current,devMock:true})})
   const body=await response.json();if(!response.ok)throw new Error(body.error??'Ad reward unavailable')
   setMessage(`+1 ${selected.replaceAll('_',' ').toUpperCase()} - READY TO USE`);setTimeout(back,900)
  }catch(error){claiming.current=false;setMessage(error instanceof Error?error.message:'Ad reward unavailable')}}
 if(!selected)return <View style={s.screen}><Text style={s.title}>Invalid item reward.</Text></View>
 return <View style={s.screen}>{!message?<RoyalStraightFlushVFX playerName="REWARDED AD" minimumDurationMs={5000} closeLabel={`CLAIM +1 ${selected.replaceAll('_',' ').toUpperCase()}`} onClose={finish}/>:<View style={s.claimPanel}><Text style={s.title}>{message}</Text>{!claiming.current?<Pressable onPress={finish} style={s.claimButton}><Text style={s.claimText}>RETRY CLAIM</Text></Pressable>:null}</View>}</View>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#000',alignItems:'center',justifyContent:'center'},claimPanel:{alignItems:'center',gap:18,padding:24},title:{color:'#FFD76A',fontSize:18,fontWeight:'900',textAlign:'center'},claimButton:{paddingHorizontal:22,paddingVertical:14,borderRadius:9,borderWidth:2,borderColor:'#FFD76A',backgroundColor:'#3b2b0c'},claimText:{color:'#FFF2B0',fontWeight:'900',fontSize:14}})
