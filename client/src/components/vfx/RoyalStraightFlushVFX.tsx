import React, { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { CARD_IMG } from '../game/cardAssets'
import { getReduceMotion } from '../../utils/reduceMotion'

const CARDS = ['10s', 'js', 'qs', 'ks', 'as'] as const
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const CARD_WIDTH = Math.min(92, SCREEN_WIDTH * 0.19)
const CARD_HEIGHT = CARD_WIDTH * 1.42

// One calm, ceremonial breathing cycle: spread 750ms, hold 450ms,
// close 550ms, hold 250ms. It loops until the player closes the VFX.
const SPREAD_MS = 750
const SPREAD_HOLD_MS = 450
const CLOSE_MS = 550
const CLOSE_HOLD_MS = 250

// Patch 2026-08-14 (มติลุงเยาะ): ต้องดู VFX อย่างน้อย 15 วิ ก่อนจะกด Skip/Close ได้ — กันกดข้ามทันที
const SKIP_DELAY_MS = 15000

interface Props {
  playerName?: string
  onClose: () => void
  reduceMotionOverride?: boolean
}

export default function RoyalStraightFlushVFX({ playerName = 'PLAYER', onClose, reduceMotionOverride }: Props) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(reduceMotionOverride ?? null)
  const [canClose, setCanClose] = useState(false)
  const backdrop = useRef(new Animated.Value(0)).current
  const reveal = useRef(new Animated.Value(0)).current
  const fan = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0.35)).current
  const loopRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    if (reduceMotionOverride !== undefined) { setReduceMotion(reduceMotionOverride); return }
    let alive = true
    void getReduceMotion().then(value => { if (alive) setReduceMotion(value) })
    return () => { alive = false }
  }, [reduceMotionOverride])

  useEffect(() => {
    if (reduceMotion === null) return
    const skipTimer = setTimeout(() => setCanClose(true), SKIP_DELAY_MS)
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0.88, duration: 280, useNativeDriver: true }),
      Animated.timing(reveal, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start()
    if (reduceMotion) { fan.setValue(1); glow.setValue(0.7); return () => clearTimeout(skipTimer) }

    loopRef.current = Animated.loop(Animated.sequence([
      Animated.timing(fan, { toValue: 1, duration: SPREAD_MS, useNativeDriver: true }),
      Animated.delay(SPREAD_HOLD_MS),
      Animated.timing(fan, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
      Animated.delay(CLOSE_HOLD_MS),
    ]))
    loopRef.current.start()
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.85, duration: 900, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ])).start()
    return () => { clearTimeout(skipTimer); loopRef.current?.stop(); backdrop.stopAnimation(); reveal.stopAnimation(); fan.stopAnimation(); glow.stopAnimation() }
  }, [reduceMotion])

  if (reduceMotion === null) return null

  return <View style={styles.root}>
    <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
    <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow }]} />
    <Animated.View style={[styles.content, { opacity: reveal, transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) }] }]}>
      <Text style={styles.eyebrow}>AN EXTRAORDINARY HAND</Text>
      <Text style={styles.title}>ROYAL STRAIGHT FLUSH</Text>
      <Text style={styles.player}>{playerName.toUpperCase()}</Text>

      <View style={styles.fan}>
        {CARDS.map((code, index) => {
          const offset = index - 2
          const spreadX = offset * CARD_WIDTH * 0.72
          const spreadY = Math.abs(offset) * 13
          const spreadRotation = offset * 11
          return <Animated.View key={code} style={[styles.card, {
            zIndex: index,
            transform: [
              { translateX: fan.interpolate({ inputRange: [0, 1], outputRange: [offset * 7, spreadX] }) },
              { translateY: fan.interpolate({ inputRange: [0, 1], outputRange: [0, spreadY] }) },
              { rotate: fan.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${spreadRotation}deg`] }) },
            ],
          }]}>
            <Image source={CARD_IMG[code]} style={styles.cardImage} resizeMode="contain" fadeDuration={0} />
          </Animated.View>
        })}
      </View>
      <Text style={styles.message}>A legendary combination has been completed.</Text>
    </Animated.View>

    {canClose && (
      <Pressable accessibilityRole="button" accessibilityLabel="Skip Royal Straight Flush celebration" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
        <Text style={styles.closeText}>SKIP</Text>
      </Pressable>
    )}
  </View>
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 1200, elevation: 1200, alignItems: 'center', justifyContent: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#020805' },
  glow: { position: 'absolute', width: 330, height: 330, borderRadius: 165, backgroundColor: '#E8B94C', shadowColor: '#FFD76A', shadowOpacity: 1, shadowRadius: 60, elevation: 28 },
  content: { alignItems: 'center', width: '100%', paddingHorizontal: 18, marginTop: -30 },
  eyebrow: { color: '#E8B94C', fontSize: 11, fontWeight: '900', letterSpacing: 4, marginBottom: 8 },
  title: { color: '#FFF4CA', fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: 1.8, textAlign: 'center', textShadowColor: '#B66B08', textShadowRadius: 18 },
  player: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 2.5, marginTop: 9 },
  fan: { width: '100%', height: CARD_HEIGHT + 92, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  card: { position: 'absolute', width: CARD_WIDTH, height: CARD_HEIGHT, shadowColor: '#FFD76A', shadowOpacity: 0.75, shadowRadius: 12, elevation: 14 },
  cardImage: { width: '100%', height: '100%' },
  message: { color: '#D8C99A', fontSize: 13, textAlign: 'center', letterSpacing: 0.5 },
  close: { position: 'absolute', bottom: 44, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 24, borderWidth: 1.5, borderColor: '#E8B94C', backgroundColor: 'rgba(7, 21, 13, 0.94)' },
  closePressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  closeText: { color: '#FFF0B8', fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
})
