import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native'
import { getReduceMotion } from '../../utils/reduceMotion'

type Kind = 'COMBO' | 'SUPER_COMBO'
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const SUITS = ['♠', '♥', '♦', '♣'] as const

/** Native port of DummyX's Combo/Super Combo card-explosion language. */
export default function ComboCardBurst({ eventKey, kind, bonus }: { eventKey: string; kind: Kind; bonus: number }) {
  const motion = useRef(new Animated.Value(0)).current
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(true)
  const superCombo = kind === 'SUPER_COMBO'
  const cards = useMemo(() => Array.from({ length: superCombo ? 12 : 8 }, (_, index) => {
    const angle = Math.PI * 2 * index / (superCombo ? 12 : 8) - Math.PI / 2
    const distance = (superCombo ? 230 : 155) + (index % 3) * 22
    return { angle, distance, suit: SUITS[index % 4], rank: ['A', 'K', 'Q', 'J', '10'][index % 5] }
  }), [superCombo])
  const particles = useMemo(() => Array.from({ length: superCombo ? 36 : 24 }, (_, index) => {
    const angle = Math.PI * 2 * index / (superCombo ? 36 : 24) + (index % 4) * .08
    return { angle, distance: (superCombo ? 255 : 180) * (.68 + (index % 5) * .08) }
  }), [superCombo])

  useEffect(() => {
    let active = true
    let animation: Animated.CompositeAnimation | undefined
    motion.setValue(0); setVisible(true)
    void getReduceMotion().then(value => {
      if (!active) return
      setReduced(value)
      animation = Animated.sequence([
        Animated.delay(superCombo && !value ? 220 : 40),
        Animated.timing(motion, { toValue: 1, duration: value ? 650 : superCombo ? 2050 : 1350, useNativeDriver: true }),
      ])
      animation.start(({ finished }) => { if (finished && active) setVisible(false) })
    })
    return () => { active = false; animation?.stop(); setVisible(false) }
  }, [eventKey, motion, superCombo])

  if (!visible) return null
  const burst = motion.interpolate({ inputRange: [0, .12, 1], outputRange: [0, 0, 1] })
  const fade = motion.interpolate({ inputRange: [0, .08, .72, 1], outputRange: [0, 1, 1, 0] })
  const flash = motion.interpolate({ inputRange: [0, .08, .18, 1], outputRange: [0, superCombo ? .82 : .58, 0, 0] })
  const waveScale = motion.interpolate({ inputRange: [0, .12, .76, 1], outputRange: [.12, .12, superCombo ? 5.2 : 3.7, superCombo ? 6 : 4.4] })
  return <View pointerEvents="none" accessibilityLabel={`${kind.replace('_', ' ')} plus ${bonus}`} style={styles.overlay}>
    <Animated.View style={[styles.flash, { opacity: flash }]} />
    <Animated.View style={[styles.wave, superCombo && styles.waveSuper, { opacity: fade, transform: [{ scale: waveScale }] }]} />
    {!reduced && cards.map((card, index) => {
      const red = card.suit === '♥' || card.suit === '♦'
      return <Animated.View key={`card-${index}`} style={[styles.card, superCombo && styles.cardSuper, {
        opacity: fade,
        transform: [
          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(card.angle) * card.distance] }) },
          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(card.angle) * card.distance + 105] }) },
          { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(index % 2 ? -1 : 1) * (150 + index * 21)}deg`] }) },
          { scale: burst.interpolate({ inputRange: [0, .15, 1], outputRange: [.25, 1, .82] }) },
        ],
      }]}><Text style={[styles.cardRank, red && styles.red]}>{card.rank}</Text><Text style={[styles.cardSuit, red && styles.red]}>{card.suit}</Text></Animated.View>
    })}
    {!reduced && particles.map((particle, index) => <Animated.View key={`particle-${index}`} style={[styles.particle, superCombo && styles.particleSuper, {
      opacity: fade,
      transform: [
        { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(particle.angle) * particle.distance] }) },
        { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(particle.angle) * particle.distance] }) },
        { rotate: `${index * 31}deg` },
      ],
    }]} />)}
    <Animated.View style={[styles.copy, { opacity: fade, transform: [{ scale: motion.interpolate({ inputRange: [0, .18, .32, 1], outputRange: [superCombo ? 1.8 : .55, superCombo ? 1.8 : 1.18, 1, 1] }) }] }]}>
      {superCombo ? <Text style={styles.anticipation}>GOOD JOB</Text> : null}
      <Text style={[styles.title, superCombo && styles.titleSuper]}>{kind.replace('_', ' ')}!</Text>
      <Text style={[styles.bonus, superCombo && styles.bonusSuper]}>+{bonus}</Text>
    </Animated.View>
  </View>
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 40000, elevation: 40000, alignItems: 'center', justifyContent: 'center' },
  flash: { ...StyleSheet.absoluteFill, backgroundColor: '#e9fdff' },
  wave: { position: 'absolute', width: 105, height: 105, borderRadius: 60, borderWidth: 5, borderColor: '#40e9ff', shadowColor: '#40e9ff', shadowOpacity: 1, shadowRadius: 18 },
  waveSuper: { borderColor: '#ffdf4d', shadowColor: '#ff315f', borderWidth: 7 },
  card: { position: 'absolute', left: SCREEN_W / 2 - 23, top: SCREEN_H / 2 - 34, width: 46, height: 66, borderRadius: 6, padding: 4, backgroundColor: '#fff9e9', borderWidth: 2, borderColor: '#40e9ff', shadowColor: '#40e9ff', shadowOpacity: 1, shadowRadius: 11, elevation: 40001 },
  cardSuper: { borderColor: '#ffdf4d', shadowColor: '#ff315f' },
  cardRank: { color: '#11182a', fontSize: 13, lineHeight: 14, fontWeight: '900' },
  cardSuit: { color: '#11182a', fontSize: 21, lineHeight: 24, textAlign: 'center' },
  red: { color: '#d62942' },
  particle: { position: 'absolute', width: 5, height: 15, borderRadius: 2, backgroundColor: '#40e9ff', shadowColor: '#fe4dff', shadowOpacity: 1, shadowRadius: 6 },
  particleSuper: { width: 6, height: 19, backgroundColor: '#ffdf4d', shadowColor: '#ff315f' },
  copy: { alignItems: 'center', zIndex: 40003 },
  anticipation: { color: '#fff7cf', fontSize: 15, fontWeight: '900', letterSpacing: 5, textShadowColor: '#ff315f', textShadowRadius: 12 },
  title: { color: '#eaffff', fontSize: 40, lineHeight: 48, fontWeight: '900', letterSpacing: 2, textShadowColor: '#19cfe8', textShadowRadius: 16 },
  titleSuper: { color: '#fff3a1', fontSize: 46, lineHeight: 54, textShadowColor: '#ff315f', textShadowRadius: 20 },
  bonus: { color: '#fe9cff', fontSize: 29, fontWeight: '900', textShadowColor: '#46136b', textShadowRadius: 9 },
  bonusSuper: { color: '#ffffff', fontSize: 34, textShadowColor: '#ff315f', textShadowRadius: 12 },
})
