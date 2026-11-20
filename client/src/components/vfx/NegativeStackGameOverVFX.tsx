import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native'
import { audio } from '../../audio/AudioManager'
import { AudioEvent } from '../../audio/audioEvents'
import { getReduceMotion } from '../../utils/reduceMotion'

const { width: W, height: H } = Dimensions.get('window')
const DISPLAY_MS = 4_000
const SUITS = ['♠', '♥', '♦', '♣'] as const

export default function NegativeStackGameOverVFX({ eventKey, onFinish }: { eventKey: string; onFinish: () => void }) {
  const motion = useRef(new Animated.Value(0)).current
  const fragments = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const angle = Math.PI * 2 * index / 28 + (index % 4) * .1
    return { angle, distance: 130 + (index % 6) * 28, rotate: (index % 2 ? -1 : 1) * (120 + index * 19) }
  }), [])

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined
    let alive = true
    audio.play(AudioEvent.GAME_OVER_TRY_AGAIN, { dedupeKey: `negative-stack:${eventKey}` })
    void getReduceMotion().then(reduced => {
      if (!alive) return
      animation = Animated.timing(motion, { toValue: 1, duration: reduced ? 700 : 2_200, useNativeDriver: true })
      animation.start()
    })
    const timer = setTimeout(onFinish, DISPLAY_MS)
    return () => { alive = false; clearTimeout(timer); animation?.stop(); motion.stopAnimation() }
  }, [eventKey, onFinish, motion])

  const burst = motion.interpolate({ inputRange: [0, .15, 1], outputRange: [0, 0, 1] })
  const cardFade = motion.interpolate({ inputRange: [0, .12, .56, 1], outputRange: [1, 1, .55, 0] })
  const copy = motion.interpolate({ inputRange: [0, .18, .34, 1], outputRange: [0, 0, 1, 1] })
  return <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal accessibilityLabel="Game over. Try again.">
    <Animated.View style={[styles.flash, { opacity: motion.interpolate({ inputRange: [0, .12, .3, 1], outputRange: [0, .7, .1, 0] }) }]} />
    <Animated.View style={[styles.card, { opacity: cardFade, transform: [{ scale: motion.interpolate({ inputRange: [0, .12, 1], outputRange: [.72, 1.08, .9] }) }] }]}>
      <Text style={styles.cardRank}>A</Text><Text style={styles.cardSuit}>♠</Text>
      {Array.from({ length: 8 }, (_, index) => <View key={index} style={[styles.crack, { transform: [{ rotate: `${index * 43}deg` }] }]} />)}
    </Animated.View>
    {fragments.map((fragment, index) => <Animated.View key={index} style={[styles.fragment, {
      left: W / 2 - 7, top: H / 2 - 12,
      backgroundColor: index % 3 === 0 ? '#9ca3af' : '#f2ead5',
      opacity: cardFade,
      transform: [
        { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(fragment.angle) * fragment.distance] }) },
        { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(fragment.angle) * fragment.distance + 50] }) },
        { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${fragment.rotate}deg`] }) },
        { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, .25] }) },
      ],
    }]}><Text style={styles.fragmentSuit}>{SUITS[index % 4]}</Text></Animated.View>)}
    <Animated.View style={[styles.copy, { opacity: copy, transform: [{ scale: motion.interpolate({ inputRange: [0, .2, .38, 1], outputRange: [1.7, 1.7, 1, 1] }) }] }]}>
      <Text style={styles.title}>GAME OVER</Text>
      <Text style={styles.subtitle}>TRY AGAIN</Text>
    </Animated.View>
  </View>
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 60000, elevation: 60000, backgroundColor: 'rgba(2,3,5,.96)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: '#dbeafe' },
  card: { position: 'absolute', width: 116, height: 164, borderRadius: 12, backgroundColor: '#f5edda', borderWidth: 3, borderColor: '#667085', padding: 10, alignItems: 'center', justifyContent: 'center' },
  cardRank: { position: 'absolute', top: 7, left: 9, color: '#18202b', fontSize: 25, fontWeight: '900' },
  cardSuit: { color: '#18202b', fontSize: 67 },
  crack: { position: 'absolute', width: 3, height: 115, backgroundColor: '#27313d' },
  fragment: { position: 'absolute', width: 15, height: 24, borderRadius: 2, borderWidth: 1, borderColor: '#364152', alignItems: 'center', justifyContent: 'center' },
  fragmentSuit: { color: '#1f2937', fontSize: 8, fontWeight: '900' },
  copy: { alignItems: 'center', zIndex: 60002, marginTop: 36 },
  title: { color: '#ff6666', fontSize: 47, lineHeight: 56, fontWeight: '900', letterSpacing: 3, textShadowColor: '#7f1d1d', textShadowRadius: 19 },
  subtitle: { color: '#f4f1e8', fontSize: 17, fontWeight: '900', letterSpacing: 6, marginTop: 7 },
})
