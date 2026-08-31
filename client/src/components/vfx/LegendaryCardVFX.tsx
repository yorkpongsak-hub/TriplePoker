import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { getReduceMotion } from '../../utils/reduceMotion'

// มติลุงเยาะ 2026-08-14 — แทนที่ hero card (legendary_card.png, static, 3.7MB) + choreography เดิม
// (aura/shake/flash/scale/rotate ทั้งชุด) ด้วย animated WebP ตัวเดียว (320x180/60เฟรม/15fps/4วิ/
// วนลูปไม่จำกัด — สเปคเดียวกับ assets/fx/tier_unlocked.webp เป๊ะ) ตามที่ขอ "แทนทั้งหมด เรียบง่ายกว่า"
// legendary_card.png ลบทิ้งแล้ว (ยืนยันไม่มีที่อ้างอิงเหลือ) เพื่อลดขนาด bundle ก่อน Launch
const TRIPLE_SWEEP_FX = require('../../../assets/fx/tripple_sweep.webp')

const TOTAL_DURATION = 3600
const SKIP_DELAY = 1000

// A second mounted instance immediately yields instead of stacking another full-screen VFX.
let legendaryCardVfxActive = false

export interface LegendaryCardVFXProps {
  title?: string
  subtitle?: string
  onFinish?: () => void
  /** เพิ่มช่วงค้างก่อน fade-out โดยไม่เปลี่ยนจังหวะเปิดตัว */
  extraHoldMs?: number
  /** QA-only override. Production reads the player's persisted preference. */
  reduceMotionOverride?: boolean
}

export default function LegendaryCardVFX({
  title = 'LEGENDARY VICTORY',
  subtitle = 'TRIPLE SWEEP',
  onFinish,
  extraHoldMs = 0,
  reduceMotionOverride,
}: LegendaryCardVFXProps) {
  const [canSkip, setCanSkip] = useState(false)
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(reduceMotionOverride ?? null)
  const ownsLock = useRef(false)
  const finished = useRef(false)
  const mounted = useRef(true)
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const overlayOpacity = useSharedValue(0)
  const fxOpacity = useSharedValue(0)
  const fxScale = useSharedValue(0.85)
  const titleOpacity = useSharedValue(0)
  const titleY = useSharedValue(26)

  useEffect(() => {
    if (reduceMotionOverride !== undefined) {
      setReduceMotion(reduceMotionOverride)
      return
    }
    let alive = true
    void getReduceMotion().then(value => { if (alive) setReduceMotion(value) })
    return () => { alive = false }
  }, [reduceMotionOverride])

  const stopAnimations = useCallback(() => {
    ;[overlayOpacity, fxOpacity, fxScale, titleOpacity, titleY].forEach(cancelAnimation)
  }, [])

  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    if (finishTimer.current) clearTimeout(finishTimer.current)
    if (skipTimer.current) clearTimeout(skipTimer.current)
    stopAnimations()
    if (ownsLock.current) {
      legendaryCardVfxActive = false
      ownsLock.current = false
    }
    onFinish?.()
  }, [onFinish, stopAnimations])

  useEffect(() => {
    if (reduceMotion === null) return
    if (legendaryCardVfxActive) {
      // Let the parent clear its trigger state; never leave an invisible mounted instance behind.
      const blockedTimer = setTimeout(() => onFinish?.(), 0)
      return () => clearTimeout(blockedTimer)
    }

    legendaryCardVfxActive = true
    ownsLock.current = true

    if (reduceMotion) {
      // Reduced motion ตัด scale เข้าทิ้ง แต่ยังคง fade เบาๆ ไว้ กันความรู้สึก "ภาพนิ่งโผล่มาเฉยๆ"
      fxScale.value = 1
      titleY.value = 0
      overlayOpacity.value = withTiming(0.82, { duration: 260 })
      fxOpacity.value = withTiming(1, { duration: 260 })
      titleOpacity.value = withDelay(120, withTiming(1, { duration: 260 }))
      setCanSkip(true)
      let fadeOutTimer: ReturnType<typeof setTimeout> | null = null
      finishTimer.current = setTimeout(() => {
        overlayOpacity.value = withTiming(0, { duration: 260 })
        fxOpacity.value = withTiming(0, { duration: 260 })
        titleOpacity.value = withTiming(0, { duration: 200 })
        fadeOutTimer = setTimeout(finish, 260)
      }, 1400 + extraHoldMs)
      return () => {
        mounted.current = false
        if (finishTimer.current) clearTimeout(finishTimer.current)
        if (fadeOutTimer) clearTimeout(fadeOutTimer)
        stopAnimations()
        if (ownsLock.current) { legendaryCardVfxActive = false; ownsLock.current = false }
      }
    }

    const easeOut = Easing.bezier(0.16, 1, 0.3, 1)

    overlayOpacity.value = withSequence(
      withTiming(0.86, { duration: 260, easing: Easing.out(Easing.quad) }),
      withDelay(2640 + extraHoldMs, withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) })),
    )

    fxOpacity.value = withSequence(
      withDelay(120, withTiming(1, { duration: 400, easing: easeOut })),
      withDelay(2360 + extraHoldMs, withTiming(0, { duration: 600 })),
    )
    fxScale.value = withDelay(120, withTiming(1, { duration: 500, easing: easeOut }))

    titleOpacity.value = withSequence(
      withDelay(850, withTiming(1, { duration: 360, easing: easeOut })),
      withDelay(1730 + extraHoldMs, withTiming(0, { duration: 550 })),
    )
    titleY.value = withDelay(850, withTiming(0, { duration: 420, easing: easeOut }))

    skipTimer.current = setTimeout(() => {
      if (mounted.current && !finished.current) setCanSkip(true)
    }, SKIP_DELAY)
    finishTimer.current = setTimeout(finish, TOTAL_DURATION + extraHoldMs)

    return () => {
      mounted.current = false
      if (finishTimer.current) clearTimeout(finishTimer.current)
      if (skipTimer.current) clearTimeout(skipTimer.current)
      stopAnimations()
      if (ownsLock.current) {
        legendaryCardVfxActive = false
        ownsLock.current = false
      }
    }
  }, [reduceMotion, extraHoldMs])

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }))
  const fxStyle = useAnimatedStyle(() => ({
    opacity: fxOpacity.value,
    transform: [{ scale: fxScale.value }] as any,
  }))
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }))

  if (reduceMotion === null || (legendaryCardVfxActive && !ownsLock.current)) return null

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, overlayStyle]} />

      {/* Full-screen animated VFX background */}
      <View style={styles.vfxLayer} pointerEvents="none">
        <Animated.View style={[styles.fxFrame, fxStyle]}>
          <Image
            source={TRIPLE_SWEEP_FX}
            style={styles.fxImage}
            contentFit="cover"
            autoplay
          />
        </Animated.View>
      </View>

      {/* Foreground title — always above the VFX */}
      <View style={styles.stage} pointerEvents="none">
        <Animated.View style={[styles.titleBlock, titleStyle]}>
          <Text style={styles.eyebrow}>{subtitle}</Text>
          <Text style={styles.title}>{title}</Text>
        </Animated.View>
      </View>

      {canSkip && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip legendary card animation"
          hitSlop={12}
          onPress={finish}
          style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
        >
          <Text style={styles.skipText}>SKIP</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  // Full-screen animated WebP background.
  vfxLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },

  fxFrame: {
    ...StyleSheet.absoluteFillObject,
  },

  fxImage: {
    width: '100%',
    height: '100%',
  },

  // Foreground text layer.
  stage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 18,
  },
  eyebrow: {
    color: '#E8B94C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 5,
    marginBottom: 7,
  },
  title: {
    color: '#FFF4CA',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2.5,
    textAlign: 'center',
    textShadowColor: '#C98616',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  skip: {
    position: 'absolute',
    zIndex: 2,
    top: 54,
    right: 20,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 231, 164, 0.55)',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  skipPressed: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  skipText: {
    color: '#FFE7A4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
})
