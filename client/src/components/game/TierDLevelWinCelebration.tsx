import React, { useEffect, useRef } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native'

const YOU_WIN = require('../../../assets/fx/vfx_you_win.webp')

type PerfectPlay = { actual: number; best: number; actionLabel: string }

/** Presentation-only bridge between an authoritative level clear and its result. */
export function TierDLevelWinCelebration({ onComplete, perfectPlay, onOpenAnalysis }: { onComplete: () => void; perfectPlay?: PerfectPlay; onOpenAnalysis?: () => void }) {
  const motion = useRef(new Animated.Value(0)).current
  const completeRef = useRef(onComplete)
  const hasPerfectPlay = !!perfectPlay
  completeRef.current = onComplete
  useEffect(() => {
    motion.setValue(0)
    const animation = Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(hasPerfectPlay ? 2600 : 1050),
      Animated.timing(motion, { toValue: 0, duration: 320, useNativeDriver: true }),
    ])
    animation.start(({ finished }) => { if (finished) completeRef.current() })
    return () => animation.stop()
  }, [motion, hasPerfectPlay])
  return <View style={s.overlay} accessibilityLiveRegion="polite">
    <Image source={YOU_WIN} resizeMode="contain" style={s.vfx}/>
    {perfectPlay && onOpenAnalysis ? <Pressable accessibilityRole="button" accessibilityLabel="Perfect play found. Open card analysis." onPress={onOpenAnalysis} style={s.perfectPlay}>
      <Text style={s.perfectTitle}>PERFECT PLAY FOUND</Text>
      <Text style={s.perfectScore}>Your Score: {perfectPlay.actual}   Possible: {perfectPlay.best}</Text>
      <Text style={s.perfectGain}>YOU MISSED +{perfectPlay.best - perfectPlay.actual} POINTS</Text>
      <Text style={s.perfectAction}>{perfectPlay.actionLabel}</Text>
    </Pressable> : null}
    <Animated.Text style={[s.title, { opacity: motion, transform: [{ scale: motion.interpolate({ inputRange: [0, .55, 1], outputRange: [.7, 1.1, 1] }) }] }]}>GREAT JOB!</Animated.Text>
  </View>
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 200, elevation: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,12,5,.35)' },
  vfx: { position: 'absolute', width: '100%', height: '62%' },
  title: { color: '#fff3a3', fontSize: 43, fontWeight: '900', letterSpacing: 2, textShadowColor: '#b76d00', textShadowRadius: 18 },
  perfectPlay: { position: 'absolute', top: '17%', left: 24, right: 24, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#FFD76A', borderRadius: 12, backgroundColor: 'rgba(17,37,24,.94)' },
  perfectTitle: { color: '#FFD76A', fontSize: 15, fontWeight: '900', letterSpacing: .8 },
  perfectScore: { color: '#F5F2E8', fontSize: 11, fontWeight: '800' },
  perfectGain: { color: '#8DFFB5', fontSize: 12, fontWeight: '900' },
  perfectAction: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: .4, marginTop: 2 },
})
