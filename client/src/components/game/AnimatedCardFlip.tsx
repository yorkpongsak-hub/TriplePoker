import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, StyleSheet, View, type ViewStyle } from 'react-native'
import Card, { type Suit, type Value } from './Card'
import { CARD_BACK_IMG } from './cardAssets'

export function AnimatedCardFlip({ cardKey, delay = 0, width = 48, height = 70, style, startOffset }: { cardKey: string; delay?: number; width?: number; height?: number; style?: ViewStyle; startOffset?: { x: number; y: number } }) {
  const motion = useRef(new Animated.Value(0)).current; const [faceUp, setFaceUp] = useState(false)
  const suitByKey: Record<string, Suit> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' }
  const suit = suitByKey[cardKey.slice(-1)] ?? 'spade'; const value = cardKey.slice(0, -1).toLowerCase() as Value
  useEffect(() => {
    setFaceUp(false); motion.setValue(0)
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(motion, { toValue: .5, duration: 250, useNativeDriver: true }),
      Animated.timing(motion, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(motion, { toValue: .92, duration: 75, useNativeDriver: true }),
      Animated.timing(motion, { toValue: 1, duration: 75, useNativeDriver: true }),
    ])
    const listener = motion.addListener(({ value: progress }) => { if (progress >= .5) setFaceUp(true) })
    animation.start(); return () => { animation.stop(); motion.removeListener(listener) }
  }, [cardKey, delay, motion])
  // Flip in two halves. Returning to 0° after swapping the rendered face at
  // 90° avoids Android hiding/mirroring the new face at a 180° transform.
  const rotateY = motion.interpolate({ inputRange: [0, .5, 1], outputRange: ['0deg', '90deg', '0deg'] })
  const lift = motion.interpolate({ inputRange: [0, .18, .82, 1], outputRange: [0, -9, -2, 0] })
  const scale = motion.interpolate({ inputRange: [0, .82, .92, 1], outputRange: [1, 1, 1.07, 1] })
  const enterX = motion.interpolate({ inputRange: [0, 1], outputRange: [startOffset?.x ?? 0, 0] })
  // The middle control point creates the short card-table arc used for cards
  // joining a resolved hand, rather than a flat slide across the felt.
  const enterY = motion.interpolate({ inputRange: [0, .46, 1], outputRange: [startOffset?.y ?? 0, -18, 0] })
  return <Animated.View style={[s.card, style, { transform: [{ perspective: 900 }, { translateX: enterX }, { translateY: enterY }, { translateY: lift }, { rotateY }, { scale }] }]}>{faceUp ? <Card variant="face" suit={suit} value={value} width={width} height={height} /> : <Image source={CARD_BACK_IMG} resizeMode="cover" style={{ width, height, borderRadius: Math.round(width * .14) }}/>}</Animated.View>
}
const s = StyleSheet.create({ card: { backfaceVisibility: 'hidden' } })
