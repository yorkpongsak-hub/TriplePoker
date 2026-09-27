import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

const ENTER_MS = 180
const WIGGLE_LEG_MS = 90
const WIGGLE_MS = WIGGLE_LEG_MS * 3
const WIGGLE_COUNT = 3
const HOLD_MS = 250
const EXIT_MS = 260

export const THUMB_UP_VFX_DURATION_MS =
  ENTER_MS + WIGGLE_MS * WIGGLE_COUNT + HOLD_MS + EXIT_MS

export interface ThumbUpVFXProps {
  visible: boolean
  onFinish: () => void
  /** Optional praise copy for composed contexts; omitted for the icon-only VFX. */
  label?: string
}

/**
 * Brief, touch-through approval VFX for the Rise game table.
 *
 * The component stops rendering itself when its animation completes and calls
 * onFinish so the owner can also clear its `visible` state.
 */
export function ThumbUpVFX({ visible, onFinish, label }: ThumbUpVFXProps) {
  const [finished, setFinished] = useState(false)
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.85)
  const rotation = useSharedValue(0)
  const onFinishRef = useRef(onFinish)

  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  useEffect(() => {
    cancelAnimation(opacity)
    cancelAnimation(scale)
    cancelAnimation(rotation)
    opacity.value = 0
    scale.value = 0.85
    rotation.value = 0
    setFinished(false)

    if (!visible) return

    const easeOut = Easing.out(Easing.cubic)
    const easeInOut = Easing.inOut(Easing.cubic)

    opacity.value = withSequence(
      withTiming(1, { duration: ENTER_MS, easing: easeOut }),
      withDelay(
        WIGGLE_MS * WIGGLE_COUNT + HOLD_MS,
        withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }),
      ),
    )

    rotation.value = withDelay(
      ENTER_MS,
      withSequence(
        ...Array.from({ length: WIGGLE_COUNT }, () => [
          withTiming(-10, { duration: WIGGLE_LEG_MS, easing: easeInOut }),
          withTiming(10, { duration: WIGGLE_LEG_MS, easing: easeInOut }),
          withTiming(0, { duration: WIGGLE_LEG_MS, easing: easeInOut }),
        ]).flat(),
      ),
    )

    scale.value = withSequence(
      withTiming(1, { duration: ENTER_MS, easing: easeOut }),
      ...Array.from({ length: WIGGLE_COUNT }, () => [
        withTiming(1.08, { duration: WIGGLE_MS / 2, easing: easeInOut }),
        withTiming(1, { duration: WIGGLE_MS / 2, easing: easeInOut }),
      ]).flat(),
    )

    const timer = setTimeout(() => {
      setFinished(true)
      onFinishRef.current()
    }, THUMB_UP_VFX_DURATION_MS)

    return () => {
      clearTimeout(timer)
      cancelAnimation(opacity)
      cancelAnimation(scale)
      cancelAnimation(rotation)
    }
  }, [opacity, rotation, scale, visible])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ] as any,
  }))
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }] as any,
  }))

  if (!visible || finished) return null

  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityElementsHidden>
      <Animated.View style={[styles.icon, animatedStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
          <Path
            d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
            stroke="#FFFFFF"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      {label ? <Animated.Text style={[styles.label, labelAnimatedStyle]}>{label}</Animated.Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Sit above the table center without assuming a particular device height.
    transform: [{ translateY: -72 }],
    zIndex: 900,
  },
  icon: {
    width: 144,
    height: 144,
    // Wrist/palm hinge in the SVG viewBox: approximately (7, 20).
    transformOrigin: '29% 83%',
  },
  label: {
    position: 'absolute',
    top: '50%',
    marginTop: 92,
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
})

export default ThumbUpVFX
