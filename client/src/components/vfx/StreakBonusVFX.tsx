// StreakBonusVFX.tsx
// Full-screen celebration overlay ตอนกด Claim สำเร็จในหน้า Play Streak (app/(home)/streak.tsx)
// Pattern เดียวกับ TierUnlockOverlay.tsx (scrim + gold particle burst, Reanimated ล้วน) แต่ auto-dismiss
// เองหลัง AUTO_DISMISS_MS — ไม่ต้องกดปุ่ม CONTINUE เพราะเป็นแค่ celebration แป๊บเดียวตอนรับโบนัส
// ไม่ใช่ milestone ที่ต้องบันทึกจำแบบ Tier Unlock ตัวเลขโบนัสขยายใหญ่ขึ้นแล้วจางหายไปพร้อมกัน
// (สเปคลุงเยาะ) — scale กับ opacity ผูกกับ container เดียวกันให้ขยาย+จางไปด้วยกัน
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

const GOLD = '#FFD76A'
const PARTICLE_COUNT = 14
const PARTICLE_RADIUS = 130
const AUTO_DISMISS_MS = 2200

export interface StreakBonusVFXProps {
  amount: number
  onFinish: () => void
}

// Particle เดี่ยว - พุ่งออกจากจุดศูนย์กลางแล้วจางหายไป (gold particle burst) — pattern เดียวกับ TierUnlockOverlay.tsx
function Particle({ angle, delay }: { angle: number; delay: number }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const particleStyle = useAnimatedStyle(() => {
    const dist = progress.value * PARTICLE_RADIUS
    return {
      opacity: 1 - progress.value,
      transform: [
        { translateX: Math.cos(angle) * dist },
        { translateY: Math.sin(angle) * dist },
        { scale: 1 - progress.value * 0.5 },
      ] as any,
    }
  })

  return <Animated.View style={[s.particle, particleStyle]} />
}

export function StreakBonusVFX({ amount, onFinish }: StreakBonusVFXProps) {
  const scrimOpacity = useSharedValue(0)
  const textScale = useSharedValue(0.4)
  const textOpacity = useSharedValue(0)

  useEffect(() => {
    // แก้บั๊ก: ห้ามสั่ง .value 2 ครั้งแยกกันแบบนี้ — ครั้งที่ 2 จะทับ/ยกเลิกครั้งแรกทันทีในติ๊กเดียวกัน
    // (scrim ไม่เคยขึ้นเลยเพราะโดนสั่ง fade-out จาก 0 ทับตั้งแต่ยังไม่ทัน fade-in) ต้องรวมเป็น sequence เดียว
    scrimOpacity.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withDelay(AUTO_DISMISS_MS - 300 - 350, withTiming(0, { duration: 350 })),
    )

    // ตัวเลขโบนัส: ป๊อปเข้ามาเบาๆ (spring) ค้างไว้ครู่หนึ่งให้อ่านชัด แล้ว "ขยายใหญ่ขึ้นและจางหาย" ไปพร้อมกัน
    textOpacity.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withDelay(650, withTiming(0, { duration: 900, easing: Easing.in(Easing.cubic) })),
    )
    textScale.value = withSequence(
      withSpring(1.15, { damping: 8, stiffness: 140 }),
      withDelay(650, withTiming(1.75, { duration: 900, easing: Easing.out(Easing.cubic) })),
    )

    const timer = setTimeout(onFinish, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }))
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    // cast เฉพาะจุดนี้ — Reanimated transform tuple typing (pattern เดียวกับ TierUnlockOverlay.tsx)
    transform: [{ scale: textScale.value }] as any,
  }))

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => i)

  return (
    <Animated.View style={[s.scrim, scrimStyle]} pointerEvents="none">
      <View style={s.center}>
        <View style={s.particleField}>
          {particles.map(i => (
            <Particle key={i} angle={(i / PARTICLE_COUNT) * Math.PI * 2} delay={100 + i * 20} />
          ))}
        </View>
        <Animated.View style={textStyle}>
          <Text style={s.amountText}>+{amount.toLocaleString('en-US')}</Text>
          <Text style={s.unitText}>TOKEN</Text>
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  particleField: { position: 'absolute', width: 8, height: 8 },
  particle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
  amountText: {
    fontFamily: 'Cinzel_700Bold',
    color: GOLD,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  unitText: {
    fontFamily: 'Cinzel_700Bold',
    color: '#F5F2E8',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 5,
    textAlign: 'center',
    marginTop: 4,
  },
})

export default StreakBonusVFX
