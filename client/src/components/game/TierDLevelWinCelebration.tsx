import React, { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet, Text, View } from 'react-native'

const YOU_WIN = require('../../../assets/fx/vfx_you_win.webp')

/** Presentation-only bridge between an authoritative level clear and its result. */
export function TierDLevelWinCelebration({ onComplete }: { onComplete: () => void }) {
  const motion = useRef(new Animated.Value(0)).current
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  useEffect(() => {
    motion.setValue(0)
    const animation = Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1050),
      Animated.timing(motion, { toValue: 0, duration: 320, useNativeDriver: true }),
    ])
    animation.start(({ finished }) => { if (finished) completeRef.current() })
    return () => animation.stop()
  }, [motion])
  return <View pointerEvents="none" style={s.overlay} accessibilityLiveRegion="polite">
    <Image source={YOU_WIN} resizeMode="contain" style={s.vfx}/>
    <Animated.Text style={[s.title, { opacity: motion, transform: [{ scale: motion.interpolate({ inputRange: [0, .55, 1], outputRange: [.7, 1.1, 1] }) }] }]}>GREAT JOB!</Animated.Text>
  </View>
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 200, elevation: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,12,5,.35)' },
  vfx: { position: 'absolute', width: '100%', height: '62%' },
  title: { color: '#fff3a3', fontSize: 43, fontWeight: '900', letterSpacing: 2, textShadowColor: '#b76d00', textShadowRadius: 18 },
})
