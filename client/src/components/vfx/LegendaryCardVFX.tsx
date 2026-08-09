import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { getReduceMotion } from '../../utils/reduceMotion'

const LEGENDARY_CARD = require('../../../assets/vfx/legendary-card/legendary_card.png')

const TOTAL_DURATION = 3600
const SKIP_DELAY = 1000

// A second mounted instance immediately yields instead of stacking another full-screen VFX.
let legendaryCardVfxActive = false

export interface LegendaryCardVFXProps {
  title?: string
  subtitle?: string
  imageSource?: ImageSourcePropType
  onFinish?: () => void
  /** เพิ่มช่วงค้างก่อน fade-out โดยไม่เปลี่ยนจังหวะเปิดตัว */
  extraHoldMs?: number
  /** QA-only override. Production reads the player's persisted preference. */
  reduceMotionOverride?: boolean
}

export default function LegendaryCardVFX({
  title = 'LEGENDARY VICTORY',
  subtitle = 'TRIPLE SWEEP',
  imageSource = LEGENDARY_CARD,
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
  const heroOpacity = useSharedValue(0)
  const heroScale = useSharedValue(0.55)
  const heroRotation = useSharedValue(-5)
  const heroY = useSharedValue(44)
  const floatY = useSharedValue(0)
  const auraOpacity = useSharedValue(0)
  const auraScale = useSharedValue(0.78)
  const flashOpacity = useSharedValue(0)
  const shakeX = useSharedValue(0)
  const shakeY = useSharedValue(0)
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
    ;[
      overlayOpacity, heroOpacity, heroScale, heroRotation, heroY, floatY,
      auraOpacity, auraScale, flashOpacity, shakeX, shakeY, titleOpacity, titleY,
    ].forEach(cancelAnimation)
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
      // Reduced motion ตัดพวก scale/rotate/shake/aura ทิ้งหมด แต่ยังคง fade เบาๆ ไว้
      // กันความรู้สึก "ภาพนิ่งโผล่มาเฉยๆ" ทั้งตอนเข้าและตอนออก
      heroScale.value = 1
      heroRotation.value = 0
      heroY.value = 0
      titleY.value = 0
      overlayOpacity.value = withTiming(0.82, { duration: 260 })
      heroOpacity.value = withTiming(1, { duration: 260 })
      titleOpacity.value = withDelay(120, withTiming(1, { duration: 260 }))
      setCanSkip(true)
      let fadeOutTimer: ReturnType<typeof setTimeout> | null = null
      finishTimer.current = setTimeout(() => {
        overlayOpacity.value = withTiming(0, { duration: 260 })
        heroOpacity.value = withTiming(0, { duration: 260 })
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
    const easeInOut = Easing.inOut(Easing.quad)

    overlayOpacity.value = withSequence(
      withTiming(0.86, { duration: 260, easing: Easing.out(Easing.quad) }),
      withDelay(2640 + extraHoldMs, withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) })),
    )

    heroOpacity.value = withSequence(
      withDelay(90, withTiming(1, { duration: 230 })),
      withDelay(2680 + extraHoldMs, withTiming(0, { duration: 600 })),
    )
    heroScale.value = withSequence(
      withDelay(90, withTiming(1.08, { duration: 520, easing: easeOut })),
      withTiming(1, { duration: 180, easing: easeInOut }),
      withDelay(2110 + extraHoldMs, withTiming(1.16, { duration: 700, easing: Easing.in(Easing.cubic) })),
    )
    heroRotation.value = withSequence(
      withDelay(90, withTiming(1.2, { duration: 520, easing: easeOut })),
      withTiming(0, { duration: 220, easing: easeInOut }),
    )
    heroY.value = withDelay(90, withTiming(0, { duration: 520, easing: easeOut }))

    // Gentle hold motion — วนซ้ำไม่มีที่สิ้นสุดแทนลำดับ 4 ช่วงตายตัวเดิม กัน "ค้างนิ่ง" ตอน
    // extraHoldMs ยาว (เช่น Triple Sweep ของ Initiate ที่ +3000ms — เดิมลำดับเดิมจบที่ ~3.3s แล้วค้างสนิท
    // จนถึง fade out). Exit scale/opacity ยังเป็นคนละ track กัน จึงไม่ชนกัน — cancelAnimation ใน stopAnimations()
    // หยุดการวนซ้ำนี้ให้เองตอน finish()
    floatY.value = withDelay(1050, withRepeat(
      withSequence(
        withTiming(-7, { duration: 650, easing: easeInOut }),
        withTiming(7, { duration: 650, easing: easeInOut }),
      ),
      -1,
      true,
    ))

    // The aura is the exact same bitmap, enlarged and blurred behind the hero.
    auraOpacity.value = withSequence(
      withDelay(560, withTiming(0.48, { duration: 110 })),
      withTiming(0.16, { duration: 780, easing: Easing.out(Easing.quad) }),
      withDelay(1380 + extraHoldMs, withTiming(0, { duration: 650 })),
    )
    auraScale.value = withDelay(560, withTiming(1.34, { duration: 900, easing: Easing.out(Easing.cubic) }))

    flashOpacity.value = withDelay(600, withSequence(
      withTiming(0.9, { duration: 65 }),
      withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }),
    ))
    shakeX.value = withDelay(610, withSequence(
      withTiming(-9, { duration: 35 }), withTiming(8, { duration: 45 }),
      withTiming(-5, { duration: 45 }), withTiming(3, { duration: 45 }),
      withTiming(0, { duration: 55 }),
    ))
    shakeY.value = withDelay(610, withSequence(
      withTiming(4, { duration: 40 }), withTiming(-5, { duration: 45 }),
      withTiming(3, { duration: 45 }), withTiming(0, { duration: 70 }),
    ))

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
  const stageStyle = useAnimatedStyle((): any => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }))
  const heroStyle = useAnimatedStyle((): any => ({
    opacity: heroOpacity.value,
    transform: [
      { translateY: heroY.value + floatY.value },
      { rotate: `${heroRotation.value}deg` },
      { scale: heroScale.value },
    ],
  }))
  const auraStyle = useAnimatedStyle(() => ({
    opacity: auraOpacity.value,
    transform: [{ scale: auraScale.value }],
  }))
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }))
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }))

  if (reduceMotion === null || (legendaryCardVfxActive && !ownsLock.current)) return null

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, overlayStyle]} />

      <Animated.View style={[styles.stage, stageStyle]} pointerEvents="none">
        {!reduceMotion && <Animated.View style={[styles.imageFrame, styles.auraFrame, auraStyle]}>
          <Image source={imageSource} style={styles.image} resizeMode="contain" resizeMethod="resize" fadeDuration={0} blurRadius={24} />
        </Animated.View>}

        <Animated.View style={[styles.imageFrame, heroStyle]}>
          <Image source={imageSource} style={styles.image} resizeMode="contain" resizeMethod="resize" fadeDuration={0} />
        </Animated.View>

        <Animated.View style={[styles.titleBlock, titleStyle]}>
          <Text style={styles.eyebrow}>{subtitle}</Text>
          <Text style={styles.title}>{title}</Text>
        </Animated.View>
      </Animated.View>

      {!reduceMotion && <Animated.View style={[styles.flash, flashStyle]} pointerEvents="none" />}

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
  stage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFrame: {
    position: 'absolute',
    width: '94%',
    height: '68%',
  },
  auraFrame: {
    shadowColor: '#FFD45F',
    shadowOpacity: 0.9,
    shadowRadius: 32,
    elevation: 18,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF3C4',
  },
  titleBlock: {
    position: 'absolute',
    top: '76%',
    alignItems: 'center',
    paddingHorizontal: 20,
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
