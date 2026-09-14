import React, { useEffect, useRef } from 'react'
import { Animated, Image, ImageSourcePropType, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

const WATERMARK = require('../../../assets/images/triple_poker_icon.png')

export const SharedGameTableFrame: React.FC<React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>> = ({ children, style }) => {
  const isWeb = Platform.OS === 'web'
  return <View style={[styles.root, isWeb && styles.webOuter]}><View style={[styles.frame, isWeb && styles.webFrame, style]}>{children}</View></View>
}

/** Presentation-only felt surface shared by the Tier C controller and Tier D adapter. */
export const SharedGameTableSurface: React.FC<React.PropsWithChildren<{
  backgroundSource: ImageSourcePropType
  style?: StyleProp<ViewStyle>
  watermarkSource?: ImageSourcePropType
  atmosphere?: 'early'|'mid'|'high'
}>> = ({ backgroundSource, watermarkSource = WATERMARK, atmosphere, children, style }) => (
  <View style={[styles.surface, style]}>
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={backgroundSource} style={styles.fill} resizeMode="cover" />
    </View>
    {atmosphere?<TableLeagueAtmosphere tier={atmosphere}/>:null}
    <View style={[StyleSheet.absoluteFill, styles.watermark]} pointerEvents="none">
      <Image source={watermarkSource} style={styles.watermarkImage} resizeMode="contain" />
    </View>
    {children}
  </View>
)

/** Reuses the base felt while giving each League band a light, inexpensive identity. */
function TableLeagueAtmosphere({tier}:{tier:'early'|'mid'|'high'}){
  const pulse=useRef(new Animated.Value(0)).current
  useEffect(()=>{const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:2200,useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:2200,useNativeDriver:true})]));loop.start();return()=>loop.stop()},[pulse])
  const animated={opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.22,.72]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.88,1.18]})}]}
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.atmosphere]}>
    <View style={[StyleSheet.absoluteFill,styles.tint,tier==='early'?styles.earlyTint:tier==='mid'?styles.midTint:styles.highTint]}/>
    <View style={[StyleSheet.absoluteFill,styles.tableFrame,tier==='early'?styles.earlyFrame:tier==='mid'?styles.midFrame:styles.highFrame]}/>
    {tier==='mid'?<><View style={[styles.midRail,styles.midRailLeft]}/><View style={[styles.midRail,styles.midRailRight]}/></>:null}
    {tier==='high'?<><Animated.View style={[styles.highGlow,styles.highGlowTop,animated]}/><Animated.View style={[styles.highGlow,styles.highGlowBottom,animated]}/><View style={[styles.particle,styles.particleOne]}/><View style={[styles.particle,styles.particleTwo]}/><View style={[styles.particle,styles.particleThree]}/></>:null}
  </View>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  webOuter: { alignItems: 'center', justifyContent: 'center' },
  frame: { flex: 1, flexDirection: 'column' },
  webFrame: { width: 390, height: 920, borderRadius: 40, borderWidth: 3, borderColor: '#333', overflow: 'hidden' },
  surface: { flex: 1, backgroundColor: '#6aaf7f', overflow: 'hidden', position: 'relative' },
  fill: { width: '100%', height: '100%' },
  atmosphere:{},
  tint:{backgroundColor:'transparent'},
  earlyTint:{backgroundColor:'rgba(255,171,51,.07)'},
  midTint:{backgroundColor:'rgba(57,121,255,.10)'},
  highTint:{backgroundColor:'rgba(137,67,255,.14)'},
  tableFrame:{margin:8,borderWidth:1,borderRadius:24},
  earlyFrame:{borderColor:'rgba(255,207,112,.55)',shadowColor:'#FFAC36',shadowOpacity:.32,shadowRadius:12},
  midFrame:{borderColor:'rgba(114,226,255,.64)',shadowColor:'#5e83ff',shadowOpacity:.5,shadowRadius:15},
  highFrame:{borderColor:'rgba(240,185,255,.82)',borderWidth:2,shadowColor:'#c75cff',shadowOpacity:.72,shadowRadius:22},
  midRail:{position:'absolute',top:'18%',bottom:'18%',width:2,backgroundColor:'rgba(130,229,255,.36)',shadowColor:'#73dcff',shadowOpacity:.85,shadowRadius:9},
  midRailLeft:{left:11},midRailRight:{right:11},
  highGlow:{position:'absolute',alignSelf:'center',width:220,height:100,borderRadius:110,backgroundColor:'rgba(205,93,255,.22)',shadowColor:'#d36aff',shadowOpacity:1,shadowRadius:30},
  highGlowTop:{top:-34},highGlowBottom:{bottom:-34},
  particle:{position:'absolute',width:4,height:4,borderRadius:2,backgroundColor:'#ffe7ff',shadowColor:'#d571ff',shadowOpacity:1,shadowRadius:7},
  particleOne:{left:'18%',top:'30%'},particleTwo:{right:'17%',top:'47%'},particleThree:{left:'35%',bottom:'22%'},
  watermark: { alignItems: 'center', justifyContent: 'center' },
  watermarkImage: { width: 120, height: 120, opacity: 0.07 },
})
