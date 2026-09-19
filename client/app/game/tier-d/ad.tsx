import React, { useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../../src/store/authStore'
import RoyalStraightFlushVFX from '../../../src/components/vfx/RoyalStraightFlushVFX'
import { adProvider } from '../../../src/ads/adProvider'
import { GameActionButton } from '../../../src/components/ui/GameActionButton'

const SERVER_URL=process.env.EXPO_PUBLIC_SERVER_URL||'http://localhost:3001'
const REWARD_FREE_FX=require('../../../assets/fx/reward_free.webp')
const VALID_ITEMS=['shuffle','swap','double_pile','freeze','auto_sort','undo'] as const
type ItemKey=typeof VALID_ITEMS[number]

function eventId(){return typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():`tier-d-ad-${Date.now()}-${Math.random().toString(36).slice(2)}`}

/** Rewarded-ad transition for an empty Tier D item. Provider verification replaces devMock in production. */
export default function TierDItemAd(){
 const {item,placement,returnTo}=useLocalSearchParams<{item?:string;placement?:string;returnTo?:string}>();const token=useAuthStore(state=>state.session?.access_token);const [message,setMessage]=useState<string>();const [grantedItem,setGrantedItem]=useState<string>()
 const selected=VALID_ITEMS.includes(item as ItemKey)?item as ItemKey:undefined
 const claimId=useRef(eventId());const claiming=useRef(false)
 const back=()=>router.canGoBack()?router.back():router.replace('/game/tier-d')
 const finishForced=()=>returnTo==='lobby'?router.replace('/(home)/lobby'):back()
 // Policy approval happened before navigating here. If no native ad is ready,
 // continue immediately rather than creating ad debt or blocking the transition.
 const forced=async()=>{const result=await adProvider.showInterstitial();if(result.shown&&token)await fetch(`${SERVER_URL}/ads/forced-complete`,{method:'POST',headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});finishForced()}
 if(placement==='forced')return <View style={s.screen}><GameActionButton label="CONTINUE" onPress={forced} style={s.action}/></View>
 const finish=async()=>{if(claiming.current)return;if(!selected||!token){setMessage('Unable to prepare this item reward.');return}claiming.current=true;setMessage('LOADING AD...');const earned=await adProvider.showRewarded('SELECTED_ITEM_REFILL');if(!earned.earned){claiming.current=false;setMessage('AD UNAVAILABLE — TRY AGAIN LATER');return}setMessage('CLAIMING ITEM...');try{
   const response=await fetch(`${SERVER_URL}/tier-d/reward/item-ad-complete`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({item:selected,eventId:claimId.current,devMock:adProvider.mode==='mock'&&__DEV__,googleTestEarned:adProvider.mode==='google_test'})})
   const body=await response.json();if(!response.ok)throw new Error(body.error??'Ad reward unavailable')
   const granted=String(body.itemKey).replaceAll('_',' ').toUpperCase();setGrantedItem(granted);setMessage(`+1 ${granted} ADDED TO INVENTORY`);setTimeout(back,2200)
  }catch(error){claiming.current=false;setMessage(error instanceof Error?error.message:'Ad reward unavailable')}}
 if(!selected)return <View style={s.screen}><Text style={s.title}>Invalid item reward.</Text></View>
 return <View style={s.screen}>{!message?<View style={s.claimPanel}><Text style={s.title}>REFILL {selected.replaceAll('_',' ').toUpperCase()} ×1</Text><GameActionButton label="WATCH AD" variant="prestige" animation="prestige" onPress={finish} style={s.action}/></View>:<View style={s.claimPanel}>{grantedItem?<><Image source={REWARD_FREE_FX} resizeMode="contain" style={s.rewardFx}/><Text style={s.title}>{message}</Text></>:<Text style={s.title}>{message}</Text>}{!claiming.current&&!grantedItem?<GameActionButton label="RETRY CLAIM" onPress={finish} style={s.action}/>:null}</View>}</View>
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#000',alignItems:'center',justifyContent:'center'},claimPanel:{alignItems:'center',gap:18,padding:24},rewardFx:{width:260,height:146},title:{color:'#FFD76A',fontSize:18,fontWeight:'900',textAlign:'center'},action:{width:230}})
