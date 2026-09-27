import React, { useEffect, useRef } from 'react'
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { GameActionButton } from '../ui/GameActionButton'
import { DuelSettlementBreakdown, type DuelSettlement } from './TierDSoloResult'

const YOU_WIN = require('../../../assets/fx/vfx_you_win.webp')
type PerfectPlay = { actual: number; best: number }

/** Presentation-only bridge between an authoritative level clear and its result. */
export function TierDLevelWinCelebration({ onContinue, perfectPlay, duelSettlement, analysisActionLabel, onOpenAnalysis }: { onContinue: () => void; perfectPlay?: PerfectPlay; duelSettlement?: DuelSettlement; analysisActionLabel?: string; onOpenAnalysis?: () => void }) {
  const motion = useRef(new Animated.Value(0)).current
  useEffect(() => { motion.setValue(0); const animation = Animated.timing(motion, { toValue: 1, duration: 300, useNativeDriver: true }); animation.start(); return () => animation.stop() }, [motion])
  return <View style={s.overlay} accessibilityLiveRegion="polite">
    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} bounces={false}>
      <ExpoImage source={YOU_WIN} contentFit="contain" autoplay style={s.vfx}/>
      <Animated.Text style={[s.title, { opacity: motion, transform: [{ scale: motion.interpolate({ inputRange: [0, .55, 1], outputRange: [.7, 1.1, 1] }) }] }]}>GREAT JOB!</Animated.Text>
      {duelSettlement?<View style={s.settlement}><DuelSettlementBreakdown value={duelSettlement} compact/></View>:null}
      {perfectPlay ? <View style={s.perfectPlay}><Text style={s.perfectTitle}>PERFECT PLAY FOUND</Text><Text style={s.perfectScore}>Your Score: {perfectPlay.actual}   Possible: {perfectPlay.best}</Text><Text style={s.perfectGain}>{perfectPlay.best > perfectPlay.actual ? `YOU MISSED +${perfectPlay.best - perfectPlay.actual} POINTS` : 'PERFECT EXECUTION'}</Text></View> : null}
    </ScrollView>
    <View style={s.actions}>{analysisActionLabel && onOpenAnalysis ? <GameActionButton fitContent size="small" variant="secondary" label={analysisActionLabel} onPress={onOpenAnalysis}/> : null}<GameActionButton fitContent label="CONTINUE" onPress={onContinue}/></View>
  </View>
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 200, elevation: 200, backgroundColor: 'rgba(2,12,5,.72)' }, scroll:{...StyleSheet.absoluteFill}, content: { alignItems: 'center', paddingTop: 112, paddingHorizontal: 18, paddingBottom: 132 }, vfx: { width: '100%', height: 330, flexShrink: 0 }, title: { marginTop: -42, color: '#fff3a3', fontSize: 43, lineHeight: 50, fontWeight: '900', letterSpacing: 2, textShadowColor: '#b76d00', textShadowRadius: 18 },
  perfectPlay: { width: '100%', maxWidth: 430, alignItems: 'center', gap: 2, marginTop: 7, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#FFD76A', borderRadius: 10, backgroundColor: 'rgba(17,37,24,.94)' }, perfectTitle: { color: '#FFD76A', fontSize: 12, lineHeight: 15, fontWeight: '900', letterSpacing: .7 }, perfectScore: { color: '#F5F2E8', fontSize: 9, lineHeight: 12, fontWeight: '800' }, perfectGain: { color: '#8DFFB5', fontSize: 10, lineHeight: 13, fontWeight: '900' }, settlement:{width:'100%',maxWidth:430,marginTop:8},actions: { position:'absolute',left:18,right:18,bottom:24,alignItems:'center',gap:7 },
})
