import { useEffect, useRef } from 'react'
import { Animated, Easing, ImageBackground, StyleSheet, useWindowDimensions, View } from 'react-native'

type GameSplashProps = {
  progress: number
  ready: boolean
  onComplete: () => void
}

// Artwork coordinates: splash_screen.png is 740 × 1314. These are mapped through cover below.
const ARTWORK = { width: 740, height: 1314 }
const SPLASH_IMAGE = require('../../../assets/images/splash_screen.png')
const LOADING_BAR = { x: 151, y: 1196, width: 438, height: 11 }

const RAYS = [
  { x: 288, y: 685, width: 9, height: 254, rotate: '-28deg', delay: 0 },
  { x: 323, y: 650, width: 8, height: 286, rotate: '-16deg', delay: 180 },
  { x: 360, y: 628, width: 9, height: 310, rotate: '-5deg', delay: 360 },
  { x: 398, y: 644, width: 8, height: 294, rotate: '9deg', delay: 100 },
  { x: 432, y: 678, width: 9, height: 260, rotate: '22deg', delay: 280 },
  { x: 458, y: 716, width: 7, height: 220, rotate: '33deg', delay: 460 },
]

function getCoverLayout(screenWidth: number, screenHeight: number) {
  const scale = Math.max(screenWidth / ARTWORK.width, screenHeight / ARTWORK.height)
  return {
    scale,
    left: (screenWidth - ARTWORK.width * scale) / 2,
    top: (screenHeight - ARTWORK.height * scale) / 2,
  }
}

/** A visual-only bootstrap screen. It never owns navigation or repeats app initialization. */
export default function GameSplash({ progress, ready, onComplete }: GameSplashProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const displayedProgress = useRef(new Animated.Value(0)).current
  const fadeOut = useRef(new Animated.Value(1)).current
  const completionGlow = useRef(new Animated.Value(0)).current
  const rayPulses = useRef(RAYS.map(() => new Animated.Value(0))).current
  const latestProgress = useRef(0)
  const completed = useRef(false)
  const cover = getCoverLayout(screenWidth, screenHeight)

  useEffect(() => {
    const next = Math.max(latestProgress.current, Math.max(0, Math.min(1, progress)))
    latestProgress.current = next
    Animated.timing(displayedProgress, {
      toValue: next,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [displayedProgress, progress])

  useEffect(() => {
    const animations = rayPulses.map((pulse, index) => Animated.loop(Animated.sequence([
      Animated.delay(RAYS[index].delay),
      Animated.timing(pulse, { toValue: 1, duration: 1080, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1220, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])))
    animations.forEach(animation => animation.start())
    return () => animations.forEach(animation => animation.stop())
  }, [rayPulses])

  useEffect(() => {
    if (!ready || completed.current) return
    completed.current = true
    Animated.timing(displayedProgress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      Animated.sequence([
        Animated.timing(completionGlow, { toValue: 0.5, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(280),
        Animated.parallel([
          Animated.timing(fadeOut, { toValue: 0, duration: 360, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(completionGlow, { toValue: 0, duration: 360, useNativeDriver: true }),
        ]),
      ]).start(({ finished }) => { if (finished) onComplete() })
    })
  }, [completionGlow, displayedProgress, fadeOut, onComplete, ready])

  const mappedBar = {
    left: cover.left + LOADING_BAR.x * cover.scale,
    top: cover.top + LOADING_BAR.y * cover.scale,
    width: LOADING_BAR.width * cover.scale,
    height: LOADING_BAR.height * cover.scale,
  }
  const fillWidth = displayedProgress.interpolate({ inputRange: [0, 1], outputRange: [0, mappedBar.width] })

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeOut }]} pointerEvents="auto">
      <ImageBackground source={SPLASH_IMAGE} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {RAYS.map((ray, index) => {
          const pulse = rayPulses[index]
          return <Animated.View key={index} style={[styles.ray, {
            left: cover.left + ray.x * cover.scale,
            top: cover.top + ray.y * cover.scale,
            width: ray.width * cover.scale,
            height: ray.height * cover.scale,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.055, 0.22] }),
            transform: [
              { rotate: ray.rotate },
              { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) },
            ],
          }]} />
        })}
        <Animated.View style={[styles.completionGlow, {
          left: cover.left + 286 * cover.scale,
          top: cover.top + 795 * cover.scale,
          width: 168 * cover.scale,
          height: 130 * cover.scale,
          borderRadius: 84 * cover.scale,
          opacity: completionGlow,
          transform: [{ scale: completionGlow.interpolate({ inputRange: [0, 0.5], outputRange: [0.85, 1.08] }) }],
        }]} />
      </View>
      <View style={[styles.loadingFillClip, mappedBar]} pointerEvents="none">
        <Animated.View style={[styles.loadingFill, { width: fillWidth }]} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#05080f', zIndex: 1000, elevation: 1000 },
  ray: { position: 'absolute', backgroundColor: '#ffe5a8', borderRadius: 999 },
  completionGlow: { position: 'absolute', backgroundColor: '#ffe0a0' },
  loadingFillClip: { position: 'absolute', overflow: 'hidden', borderRadius: 99 },
  loadingFill: { height: '100%', backgroundColor: '#ffe3a1', opacity: 0.9, borderRadius: 99 },
})
