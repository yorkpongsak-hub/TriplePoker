// TierUnlockOverlay.tsx
// Full-screen celebration overlay ตอนปลด Tier ใหม่ (tier_unlocked_max ceiling model)
// Code animation ล้วนด้วย Reanimated (ห้าม Lottie, ห้าม sprite sheet)
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

export interface TierUnlockOverlayProps {
  tier: string
  onClose: () => void
}

// ธีมสีตาม TriplePoker_WebsiteTheme_Spec_v1_0
const C = {
  bgDark: '#0F2418',
  bgPanel: '#163A25',
  gold: '#FFD76A',
  goldDark: '#FFC857',
  text: '#F5F2E8',
  border: '#2A4A34',
}

// Tier key (camelCase) -> ชื่อแสดงผลบนการ์ด (UI text ภาษาอังกฤษทั้งหมด)
const TIER_LABELS: Record<string, string> = {
  initiate: 'INITIATE',
  adept: 'ADEPT',
  mastermind: 'MASTERMIND',
  highNoble: 'HIGH NOBLE',
}

const PARTICLE_COUNT = 12
const PARTICLE_RADIUS = 110
const BADGE_SIZE = 120

// Particle เดี่ยว - พุ่งออกจากจุดศูนย์กลาง badge ตามมุมที่กำหนด แล้วจางหายไป (gold particle burst)
function Particle({ angle, delay }: { angle: number; delay: number }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    )
    // เริ่มครั้งเดียวตอน mount เท่านั้น - ไม่ผูก dependency กับ progress เอง (กัน loop ซ้ำ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const particleStyle = useAnimatedStyle(() => {
    const dist = progress.value * PARTICLE_RADIUS
    return {
      opacity: 1 - progress.value,
      // Reanimated typing บังคับ transform tuple แบบ discriminated union ต่อ shape - cast เฉพาะจุดนี้ (pattern เดียวกับ ShimmerOverlay.tsx)
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - progress.value * 0.5 },
      ] as any,
    }
  })

  return <Animated.View style={[s.particle, particleStyle]} />
}

// Overlay หลัก - เด้งตอนเปิดแอปที่ profile.tsx เมื่อมี Tier ที่ยังไม่เคยฉลอง
// Sequence: scrim fade in -> badge scale+rotate -> gold particle burst -> text fade in -> CONTINUE button
// ปิดได้เฉพาะกดปุ่ม CONTINUE เท่านั้น (ห้าม auto-dismiss)
export function TierUnlockOverlay({ tier, onClose }: TierUnlockOverlayProps) {
  const scrimOpacity = useSharedValue(0)
  const badgeScale = useSharedValue(0)
  const badgeRotate = useSharedValue(-180)
  const titleOpacity = useSharedValue(0)
  const tierLabelOpacity = useSharedValue(0)
  const buttonOpacity = useSharedValue(0)

  useEffect(() => {
    scrimOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    badgeScale.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 120 }))
    badgeRotate.value = withDelay(250, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }))
    titleOpacity.value = withDelay(900, withTiming(1, { duration: 400 }))
    tierLabelOpacity.value = withDelay(1100, withTiming(1, { duration: 400 }))
    buttonOpacity.value = withDelay(1400, withTiming(1, { duration: 300 }))
    // Sequence เริ่มครั้งเดียวตอน mount - eslint-disable กัน warning เรื่อง shared value ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }))
  const badgeStyle = useAnimatedStyle(() => ({
    // cast เดียวกับ particleStyle ด้านบน - Reanimated transform tuple typing
    transform: [{ scale: badgeScale.value }, { rotate: `${badgeRotate.value}deg` }] as any,
  }))
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }))
  const tierLabelStyle = useAnimatedStyle(() => ({ opacity: tierLabelOpacity.value }))
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }))

  const tierLabel = TIER_LABELS[tier] ?? tier.toUpperCase()
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => i)

  return (
    <Animated.View style={[s.scrim, scrimStyle]}>
      <View style={s.center}>
        <View style={s.badgeWrap}>
          <View style={s.particleField}>
            {particles.map(i => (
              <Particle key={i} angle={(i / PARTICLE_COUNT) * Math.PI * 2} delay={650 + i * 25} />
            ))}
          </View>
          <Animated.View style={[s.badge, badgeStyle]}>
            <Text style={s.badgeIcon}>{'\u{1F451}'}</Text>
          </Animated.View>
        </View>

        <Animated.Text style={[s.title, titleStyle]}>TIER UNLOCKED</Animated.Text>
        <Animated.Text style={[s.tierLabel, tierLabelStyle]}>{tierLabel}</Animated.Text>

        <Animated.View style={buttonStyle}>
          <TouchableOpacity style={s.button} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.buttonText}>CONTINUE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  badgeWrap: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  particleField: {
    position: 'absolute',
    width: BADGE_SIZE,
    height: BADGE_SIZE,
  },
  particle: {
    position: 'absolute',
    left: BADGE_SIZE / 2 - 4,
    top: BADGE_SIZE / 2 - 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: C.bgPanel,
    borderWidth: 3,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIcon: { fontSize: 56 },
  title: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 8,
    textAlign: 'center',
  },
  tierLabel: {
    fontFamily: 'Cinzel_700Bold',
    color: C.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 32,
    textAlign: 'center',
  },
  button: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderWidth: 1.5,
    borderColor: C.goldDark,
  },
  buttonText: {
    color: C.bgDark,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
})
