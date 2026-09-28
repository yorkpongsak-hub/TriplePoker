import React, { useEffect, useMemo, useRef } from 'react'
import { Animated, Dimensions, Image, StyleSheet, Text, View } from 'react-native'
import { CARD_IMG } from '../game/cardAssets'
import { audio } from '../../audio/AudioManager'
import { AudioEvent } from '../../audio/audioEvents'

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
type Props = { eventId: string; playerName: string; suit: Suit; onFinish: () => void }
const SUIT_CODE: Record<Suit, 's' | 'h' | 'd' | 'c'> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' }
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CARD_WIDTH = Math.min(68, SCREEN_WIDTH * .16)
const CARD_HEIGHT = CARD_WIDTH * 1.42
const HOLD_MS = 5_000

export default function GlobalRoyalFlushVFX({ eventId, playerName, suit, onFinish }: Props) {
  const assemble = useRef(new Animated.Value(0)).current
  const shine = useRef(new Animated.Value(0)).current
  const sparkle = useRef(new Animated.Value(0)).current
  const cards = useMemo(() => ['10', 'j', 'q', 'k', 'a'].map(rank => `${rank}${SUIT_CODE[suit]}`), [suit])

  useEffect(() => {
    audio.play(AudioEvent.ROYAL_BRAVO, { dedupeKey: `royal-bravo:${eventId}` })
    Animated.sequence([
      Animated.parallel([
        Animated.spring(assemble, { toValue: 1, speed: 8, bounciness: 7, useNativeDriver: true }),
        Animated.timing(shine, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
      Animated.loop(Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(sparkle, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]), { iterations: 3 }),
    ]).start()
    const timer = setTimeout(onFinish, HOLD_MS)
    return () => { clearTimeout(timer); assemble.stopAnimation(); shine.stopAnimation(); sparkle.stopAnimation() }
  }, [eventId, onFinish])

  return <View style={styles.root} pointerEvents="none">
    <Animated.View style={[styles.aura, { opacity: shine, transform: [{ scale: assemble }] }]} />
    {Array.from({ length: 18 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 18
      const radius = 110 + (index % 3) * 24
      return <Animated.Text key={index} style={[styles.spark, {
        left: SCREEN_WIDTH / 2 - 6, top: SCREEN_HEIGHT / 2 - 70,
        opacity: sparkle.interpolate({ inputRange: [0, 1], outputRange: [.2, 1] }),
        transform: [
          { translateX: assemble.interpolate({ inputRange: [0, 1], outputRange: [Math.cos(angle) * radius * 1.8, Math.cos(angle) * radius] }) },
          { translateY: assemble.interpolate({ inputRange: [0, 1], outputRange: [Math.sin(angle) * radius * 1.8, Math.sin(angle) * radius] }) },
          { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [.5, 1.25] }) },
        ],
      }]}>✦</Animated.Text>
    })}
    <View style={styles.copy}>
      <Text style={styles.kicker}>A ROYAL MOMENT</Text>
      <Text style={styles.title}>ROYAL STRAIGHT FLUSH</Text>
      <Text style={styles.player}>{playerName.toUpperCase()}</Text>
    </View>
    <View style={styles.cards}>
      {cards.map((code, index) => {
        const offset = index - 2
        const startX = offset % 2 === 0 ? offset * 95 : -offset * 120
        const startY = index % 2 === 0 ? -SCREEN_HEIGHT * .42 : SCREEN_HEIGHT * .42
        return <Animated.View key={code} style={[styles.card, {
          left: SCREEN_WIDTH / 2 - CARD_WIDTH / 2 + offset * CARD_WIDTH * .83,
          opacity: assemble,
          transform: [
            { translateX: assemble.interpolate({ inputRange: [0, 1], outputRange: [startX, 0] }) },
            { translateY: assemble.interpolate({ inputRange: [0, 1], outputRange: [startY, 0] }) },
            { rotate: assemble.interpolate({ inputRange: [0, 1], outputRange: [`${offset * 75}deg`, `${offset * 3}deg`] }) },
            { scale: assemble.interpolate({ inputRange: [0, 1], outputRange: [.25, 1] }) },
          ],
        }]}>
          <Image source={CARD_IMG[code]} style={styles.cardImage} resizeMode="cover" fadeDuration={0} />
          <Animated.View style={[styles.goldWash, { opacity: shine.interpolate({ inputRange: [0, 1], outputRange: [0, .32] }) }]} />
        </Animated.View>
      })}
    </View>
    <Animated.Text style={[styles.bravo, { opacity: shine, transform: [{ scale: assemble }] }]}>BRAVOOOOO!</Animated.Text>
  </View>
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 50000, elevation: 50000, backgroundColor: 'rgba(2,3,2,.96)', overflow: 'hidden' },
  aura: { position: 'absolute', alignSelf: 'center', top: '28%', width: 330, height: 330, borderRadius: 165, backgroundColor: '#E7B928', shadowColor: '#FFF1A0', shadowOpacity: 1, shadowRadius: 75, elevation: 20 },
  copy: { position: 'absolute', top: '17%', left: 12, right: 12, alignItems: 'center' },
  kicker: { color: '#F2C94C', fontSize: 11, fontWeight: '900', letterSpacing: 4 },
  title: { color: '#FFF4BF', fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: 1.4, textAlign: 'center', marginTop: 7, textShadowColor: '#B06A00', textShadowRadius: 18 },
  player: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 2.4, marginTop: 8 },
  cards: { ...StyleSheet.absoluteFill },
  card: { position: 'absolute', top: '43%', width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: CARD_WIDTH * .14, overflow: 'hidden', borderWidth: 2, borderColor: '#FFE276', shadowColor: '#FFD84D', shadowOpacity: 1, shadowRadius: 13, elevation: 30 },
  cardImage: { width: '100%', height: '100%' },
  goldWash: { ...StyleSheet.absoluteFill, backgroundColor: '#FFD23F' },
  spark: { position: 'absolute', color: '#FFF0A3', fontSize: 17, fontWeight: '900', textShadowColor: '#FFB000', textShadowRadius: 10 },
  bravo: { position: 'absolute', top: '66%', left: 0, right: 0, color: '#FFE879', fontSize: 30, fontWeight: '900', letterSpacing: 4, textAlign: 'center', textShadowColor: '#CA7200', textShadowRadius: 20 },
})
