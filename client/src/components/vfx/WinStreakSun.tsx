import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { getReduceMotion } from '../../utils/reduceMotion'

/** Table-local celebration: only the rays rotate; the count stays readable. */
export default function WinStreakSun({ count, onFinish }: { count: number; onFinish: () => void }) {
  const rotation = useRef(new Animated.Value(0)).current
  const shimmer = useRef(new Animated.Value(0)).current
  const [reduced, setReduced] = useState(true)
  const finish = useRef(onFinish); finish.current = onFinish
  useEffect(() => {
    let alive = true
    void getReduceMotion().then(value => { if (alive) setReduced(value) })
    const timer = setTimeout(() => finish.current(), 3000)
    return () => { alive = false; clearTimeout(timer) }
  }, [])
  useEffect(() => {
    if (reduced) return
    const spin = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 9000, useNativeDriver: true }))
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]))
    spin.start(); pulse.start()
    return () => { spin.stop(); pulse.stop() }
  }, [reduced, rotation, shimmer])
  return <View style={s.overlay} accessibilityLabel={`Win streak: ${count} matches`}>
    <View style={s.sun}>
      <View style={s.halo}/>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        {[52, 27, 39, 31, 48, 25, 43, 29, 54, 30, 40, 24, 49, 28, 45, 32].map((length, i) => <View key={i} style={[s.rayAxis, { transform: [{ rotate: `${i * 22.5}deg` }] }]}><View style={[s.ray, { height: length, opacity: length > 45 ? 1 : .82 }]}/></View>)}
      </Animated.View>
      <LinearGradient colors={['#fff7b0', '#ffd642', '#f7a910']} style={s.disc}>
        <Text style={s.label}>WIN STREAK</Text><Text adjustsFontSizeToFit numberOfLines={1} style={s.count}>{count}</Text><Text style={s.label}>MATCHES</Text>
      </LinearGradient>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: reduced ? 1 : shimmer.interpolate({ inputRange: [0, 1], outputRange: [.35, 1] }) }]}>
        {[[-5, 42], [194, 18], [214, 169], [12, 203]].map(([left, top], i) => <Text key={i} style={[s.spark, { left, top }]}>✦</Text>)}
      </Animated.View>
    </View>
  </View>
}
const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 900, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  sun: { width: 248, height: 248, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 230, height: 230, borderRadius: 115, backgroundColor: '#ffbe1825', shadowColor: '#ffc400', shadowOpacity: .9, shadowRadius: 32 },
  rayAxis: { position: 'absolute', width: 12, height: 248, left: 118, top: 0 },
  ray: { width: 12, height: 40, borderRadius: 6, backgroundColor: '#ffd54a' },
  disc: { width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff2a0' },
  label: { color: '#000', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  count: { color: '#000', fontSize: 68, fontWeight: '900', lineHeight: 78, width: 145, textAlign: 'center' },
  spark: { position: 'absolute', color: '#fff5b8', fontSize: 30 },
})
