import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'

interface ShimmerOverlayProps {
  borderRadius?: number
}

const SWEEP_MS = 1200
const PAUSE_MS = 2800
const BAR_WIDTH_RATIO = 0.3

// แถบแสงวิ่งทแยงสำหรับปุ่ม VIP — pointerEvents none, ไม่บล็อคการกด
export function ShimmerOverlay({ borderRadius = 0 }: ShimmerOverlayProps) {
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const translateX = useSharedValue(0)
  // stagger เริ่มสุ่มต่อ instance กันทุกปุ่มวิ่งพร้อมกันทั้งจอ — สุ่มครั้งเดียวตอน mount
  const [startDelay] = useState(() => 100 + Math.random() * 1900)

  useEffect(() => {
    if (!width) return
    const barWidth = width * BAR_WIDTH_RATIO
    const startX = -barWidth
    const endX = width + barWidth
    translateX.value = startX
    translateX.value = withDelay(
      startDelay,
      withRepeat(
        withSequence(
          withTiming(endX, { duration: SWEEP_MS, easing: Easing.linear }),
          withDelay(PAUSE_MS, withTiming(startX, { duration: 0 })),
        ),
        -1,
        false,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width])

  // translateX ต้องมาก่อน rotate ใน array เดียวกัน (RN compose transform ตามลำดับ) —
  // ไม่งั้นแท่งจะเลื่อนตามแกนที่หมุนแล้วแทนที่จะเลื่อนแนวนอนตรงๆ ตามที่ต้องการ
  const barStyle = useAnimatedStyle(() => ({
    // Reanimated typing บังคับ transform tuple แบบ discriminated union ต่อ shape — cast เฉพาะจุดนี้
    transform: [{ translateX: translateX.value }, { rotate: '20deg' }] as any,
  }))

  const barWidth = Math.max(width * BAR_WIDTH_RATIO, 1)
  // ยืดสูงเกินขอบปุ่ม กัน gap ที่มุมตอนหมุนทแยง 20°
  const barHeight = height * 2

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius }]}
      onLayout={e => {
        setWidth(e.nativeEvent.layout.width)
        setHeight(e.nativeEvent.layout.height)
      }}
    >
      {width > 0 && height > 0 && (
        <Animated.View
          style={[
            { position: 'absolute', top: -height / 2, width: barWidth, height: barHeight },
            barStyle,
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,215,106,0.35)', 'rgba(255,255,255,0.5)', 'rgba(255,215,106,0.35)', 'transparent']}
            locations={[0, 0.35, 0.5, 0.65, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  )
}
