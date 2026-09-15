import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'

export type MissionRailState={missions:{pile:1|2|3;status:string;provisional:boolean;negative:boolean;label:string}[];title:string;detail:string;failed:boolean;risk:boolean;intro:string}

/** แสดงข้อมูลจาก Server เท่านั้น ไม่คำนวณคะแนนหรือผลภารกิจใน UI */
export default function MissionRail({state,matchKey,ready}:{state?:MissionRailState;matchKey:string;ready:boolean}){
  const [intro,setIntro]=useState(false)
  const shown=useRef('')
  const motion=useRef(new Animated.Value(0)).current
  useEffect(()=>{
    if(!ready||!state?.missions.length||shown.current===matchKey)return
    shown.current=matchKey;setIntro(true);motion.setValue(0)
    Animated.timing(motion,{toValue:1,duration:1200,useNativeDriver:true}).start(()=>setIntro(false))
    return()=>{motion.stopAnimation();setIntro(false)}
  },[ready,matchKey,state?.missions.length,motion])
  if(!state?.missions.length)return null
  // Do not draw the three empty pending circles during the initial deal. They
  // read like stuck white pixels before any mission has actually resolved.
  const resolvedMissions=state.missions.filter(m=>m.status!=='pending')
  return <View pointerEvents="none" style={s.wrap} accessibilityLabel={`${state.title}. ${state.detail}`}>
    <View style={[s.rail,state.failed&&s.missed]}>
      <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit>{state.risk?'⚠':'◎'} {state.title}</Text>
      {resolvedMissions.length>0?<View style={s.markers}>{resolvedMissions.map(m=><Text key={m.pile} accessibilityLabel={`G${m.pile}: ${m.provisional?'provisional ':''}${m.status}`} style={[s.marker,m.status==='success'&&s.success,m.status==='failed'&&s.failure,m.provisional&&s.provisional]}>{m.status==='success'?'●':'✕'}<Text style={s.index}>{m.pile}</Text></Text>)}</View>:null}
      <Text style={s.detail} numberOfLines={1} adjustsFontSizeToFit>{state.detail}</Text>
    </View>
    {intro?<Animated.View style={[s.intro,{opacity:motion.interpolate({inputRange:[0,.12,.75,1],outputRange:[0,1,1,0]}),transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[-12,0]})},{scale:motion.interpolate({inputRange:[0,1],outputRange:[1.06,1]})}]}]}><Text style={s.introTitle}>{state.missions.length===1?'MISSION!':`${state.missions.length} MISSIONS!`}</Text><Text style={s.introText}>{state.intro}</Text></Animated.View>:null}
  </View>
}
const s=StyleSheet.create({wrap:{position:'absolute',left:0,right:0,bottom:'100%',paddingBottom:5,zIndex:10},rail:{height:27,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:6,borderRadius:7,borderWidth:1,borderColor:'#8f793d',backgroundColor:'rgba(5,26,17,.94)'},missed:{opacity:.65,borderColor:'#8c6565'},title:{color:'#ffe195',fontSize:11,fontWeight:'800',flexShrink:1},detail:{color:'#ffe195',fontSize:11,fontWeight:'700',flex:1,textAlign:'right'},markers:{flexDirection:'row',gap:4},marker:{color:'#e4d9b7',fontSize:14},index:{fontSize:8},success:{color:'#88f5ac'},failure:{color:'#ff9292'},provisional:{opacity:.5},intro:{position:'absolute',left:0,right:0,bottom:0,borderRadius:8,backgroundColor:'#092218',padding:8,alignItems:'center',borderWidth:1,borderColor:'#dcc276'},introTitle:{color:'#ffe195',fontSize:18,fontWeight:'900'},introText:{color:'#fff4ca',fontSize:12,textAlign:'center'}})
