import React, { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuthStore } from '../../store/authStore'
import { adProvider } from '../../ads/adProvider'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
type Offer = { id:string; itemKey:string; kind:'FREE'|'LUCKY' }
const eventId=()=>`offer-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Optional, presentation-only safe-screen offer. A failure always leaves play available. */
export function TierDItemOfferCard({ placement }: { placement:string }) {
  const token=useAuthStore(state=>state.session?.access_token)
  const [offer,setOffer]=useState<Offer|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string>()
  const claimId=useRef(eventId())
  useEffect(()=>{if(!token)return;let live=true;void fetch(`${SERVER_URL}/tier-d/item-offer?placement=${encodeURIComponent(placement)}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.ok?r.json():null).then(body=>{if(live)setOffer(body?.offer??null)}).catch(()=>{});return()=>{live=false}},[placement,token])
  if(!offer)return null
  const dismiss=async()=>{setOffer(null);if(token)void fetch(`${SERVER_URL}/tier-d/item-offer/dismiss`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({offerId:offer.id})})}
  const claim=async()=>{if(!token||busy)return;setBusy(true);setMessage('LOADING AD…');const ad=await adProvider.showRewarded('RANDOM_ITEM');if(!ad.earned){setBusy(false);setMessage('AD UNAVAILABLE');return}try{const response=await fetch(`${SERVER_URL}/tier-d/item-offer/claim`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({offerId:offer.id,eventId:claimId.current,devMock:adProvider.mode==='mock'&&__DEV__,googleTestEarned:adProvider.mode==='google_test'})});if(!response.ok)throw new Error();setMessage(`+1 ${offer.itemKey.replaceAll('_',' ').toUpperCase()}`);setTimeout(()=>setOffer(null),1200)}catch{setBusy(false);setMessage('CLAIM FAILED — TRY AGAIN')}}
  return <View style={[s.card,offer.kind==='LUCKY'&&s.lucky]}><Text style={s.title}>{offer.kind==='LUCKY'?'LUCKY! ITEM OFFER':'FREE ITEM OFFER'}</Text><Text style={s.item}>{offer.itemKey.replaceAll('_',' ').toUpperCase()} ×1</Text><Text style={s.copy}>{message??'Watch an ad to claim this exact item.'}</Text><View style={s.actions}><Pressable disabled={busy} onPress={claim} style={s.claim}><Text style={s.claimText}>WATCH AD</Text></Pressable><Pressable disabled={busy} onPress={dismiss}><Text style={s.skip}>CONTINUE</Text></Pressable></View></View>
}
const s=StyleSheet.create({card:{position:'absolute',left:12,right:12,bottom:'18%',zIndex:40,alignItems:'center',padding:12,borderWidth:1,borderRadius:12,borderColor:'#ffd76a',backgroundColor:'rgba(5,22,13,.96)'},lucky:{borderColor:'#f2a8ff'},title:{color:'#ffd76a',fontSize:11,fontWeight:'900',letterSpacing:1.2},item:{color:'#fff4bc',fontSize:16,fontWeight:'900',marginTop:4},copy:{color:'#b9ddc5',fontSize:9,marginTop:3},actions:{flexDirection:'row',alignItems:'center',gap:18,marginTop:9},claim:{paddingHorizontal:15,paddingVertical:7,borderRadius:8,backgroundColor:'#ffd76a'},claimText:{color:'#17311f',fontSize:10,fontWeight:'900'},skip:{color:'#c8d7cd',fontSize:10,fontWeight:'800'}})
