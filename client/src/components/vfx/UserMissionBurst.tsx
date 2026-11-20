import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { getReduceMotion } from '../../utils/reduceMotion'

/** Wrap the existing human reveal row; never evaluates cards or changes scores. */
export default function UserMissionBurst({ eventKey, success, children }: {
  eventKey: string; success: boolean; children: React.ReactNode
}) {
  const blink = useRef(new Animated.Value(1)).current
  const burst = useRef(new Animated.Value(0)).current
  const played = useRef(new Set<string>())
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    if (!success || played.current.has(eventKey)) return
    let active = true
    let animation: Animated.CompositeAnimation | undefined
    void getReduceMotion().then(reduce => {
      if (!active) return
      setReduced(reduce)
      blink.setValue(1); burst.setValue(0)
      animation = reduce ? Animated.delay(300) : Animated.sequence(Array.from({ length: 3 }, () =>
        Animated.sequence([
          Animated.timing(blink, { toValue: .45, duration: 180, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 180, useNativeDriver: true }),
        ])))
      animation.start(({ finished }) => {
        if (!finished || !active) return
        played.current.add(eventKey)
        setVisible(true)
        animation = Animated.timing(burst, { toValue: 1, duration: reduce ? 350 : 600, useNativeDriver: true })
        animation.start(({ finished: done }) => { if (done && active) setVisible(false) })
      })
    })
    return () => { active = false; animation?.stop(); blink.setValue(1); setVisible(false) }
  }, [eventKey, success, blink, burst])
  const opacity = burst.interpolate({ inputRange: [0, .15, .7, 1], outputRange: [0, 1, 1, 0] })
  return <View style={s.row}>
    <Animated.View style={{ opacity: blink, transform: [{ scale: reduced ? 1 : burst.interpolate({ inputRange: [0, .2, 1], outputRange: [1, 1.11, 1] }) }] }}>{children}</Animated.View>
    {visible ? <View pointerEvents="none" style={s.overlay} accessibilityLabel="Mission complete">
      <Animated.View style={[s.glow, { opacity, transform: [{ scale: reduced ? 1 : burst.interpolate({ inputRange: [0, 1], outputRange: [.4, 1.8] }) }] }]} />
      {!reduced ? Array.from({ length: 16 }, (_, i) => {
        const angle = i * Math.PI * 2 / 16
        const distance = 45 + (i % 3) * 18
        return <Animated.View key={i} style={[s.particle, { backgroundColor: i % 2 ? '#fff7d1' : '#ffd76a', opacity, transform: [
          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] }) },
          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] }) },
          { rotate: `${i * 37}deg` },
        ] }]} />
      }) : null}
      <Animated.Text style={[s.label, { opacity }]}>MISSION COMPLETE!</Animated.Text>
    </View> : null}
  </View>
}
const s = StyleSheet.create({
  row: { width: '100%', zIndex: 12 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  glow: { position: 'absolute', width: 100, height: 70, borderRadius: 50, borderWidth: 2, borderColor: '#ffe6a1', backgroundColor: 'rgba(255,215,106,.22)' },
  particle: { position: 'absolute', width: 4, height: 9, borderRadius: 1 },
  label: { color: '#fff2b0', fontSize: 18, fontWeight: '900', textShadowColor: '#633900', textShadowRadius: 7 },
})
