/**
 * AvatarFrame.tsx - กรอบ Gold Radiance รอบ avatar (ไฟล์กลาง ใช้ได้ทุก Tier)
 *
 * แนวทาง HYBRID: PNG static เป็นภาพฐาน + Reanimated animate เฉพาะ pulse/glow ตอนถึงตา
 *   - ไม่ใช้ Lottie / sprite sheet (ตาม spec)
 *   - ใช้เฉพาะโต๊ะที่มี buy-in (Adept ขึ้นไป) และเฉพาะที่นั่งของผู้เล่นเอง - ฝั่ง caller เป็นคน gate
 *
 * วิธีใช้: ห่อ AvatarBubble เดิมไว้ข้างใน ไม่ต้องแก้ AvatarBubble เลย
 *   <AvatarFrame size={40} active={isMyTurn}><AvatarBubble ... size={40} /></AvatarFrame>
 *
 * เหตุผลที่ต้องเป็น wrapper ไม่ใช่ prop ของ AvatarBubble:
 *   AvatarBubble ถูกนิยามใหม่ทุก render (อยู่ใน body ของ GameTableLive) React จึงมองเป็น
 *   component คนละตัวทุกครั้งและ remount subtree ทิ้ง - shared value ของ pulse จะถูกรีเซ็ต
 *   ตลอดจน animate ไม่ติด ไฟล์นี้ import ที่ module scope จึงมี identity คงที่ pulse วิ่งต่อเนื่องได้
 *
 * เหตุผลที่ต้องใช้ negative margin:
 *   AvatarBubble มี overflow:'hidden' + borderRadius กรอบที่วางข้างในจะโดน clip เป็นวงกลมทันที
 *   จึงต้องวางกรอบไว้นอก bubble โดยให้ wrapper กว้าง F (ใหญ่กว่า avatar) แล้วหักด้วย margin ลบ
 *   ให้ footprint กลับมาเท่า size เดิมเป๊ะ - layout ของ seat เดิมไม่ขยับแม้แต่ px เดียว
 *   (ไม่พึ่ง overflow:'visible' ซึ่งไม่การันตีบน Android)
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { getReduceMotion } from '../../utils/reduceMotion'

const FRAME_IMG = require('../../../assets/frames/frame_gold_radiance.png')

/**
 * วัดจากไฟล์ PNG จริง (256x256): รูโปร่งใสตรงกลาง = 69.9% ของภาพ, วงนอกสุด = 96.9%
 * ตั้ง scale ให้รูตรงกลางเหลือ ~92% ของ avatar เพื่อให้ขอบกรอบ "ทับ" ขอบทองเดิมพอดี
 * ไม่มีช่องว่างคั่น (มติลุงเยาะ 2026-07-25: เอา PNG ทับ border+shadow เดิม ไม่ต้องถอดของเดิม)
 *   0.92 / 0.699 = 1.316
 */
const FRAME_SCALE = 1.32
const HOLE_RATIO = 0.699 // สัดส่วนรูตรงกลางของไฟล์ PNG - export ไว้เผื่อ caller ต้องคำนวณต่อ

// Active Turn Pulse
const PULSE_SCALE = 1.06
const PULSE_MS = 900
const IDLE_OPACITY = 0.88
const ACTIVE_OPACITY = 1

export interface AvatarFrameProps {
  /** ขนาด avatar (ค่าเดียวกับ prop size ของ AvatarBubble) */
  size: number
  /** true = ถึงตาที่นั่งนี้ -> scale 1.0->1.06 + glow เข้มขึ้นแบบวนซ้ำ */
  active?: boolean
  children: React.ReactNode
}

const AvatarFrame: React.FC<AvatarFrameProps> = ({ size, active = false, children }) => {
  // Reduce Motion เป็น per-player local (AsyncStorage) - อ่านครั้งเดียวตอน mount เหมือน Tier อื่น
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    let alive = true
    getReduceMotion().then(v => { if (alive) setReduceMotion(v) })
    return () => { alive = false }
  }, [])

  // 0 = นิ่ง, 1 = สุดจังหวะ pulse
  const pulse = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(pulse)
    if (active && !reduceMotion) {
      pulse.value = withRepeat(
        withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,    // วนไม่จำกัด
        true,  // ไป-กลับ (yoyo) ไม่กระตุกตอนวนรอบใหม่
      )
    } else {
      // กลับสู่สถานะนิ่งแบบนุ่ม ไม่ snap
      pulse.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) })
    }
    return () => cancelAnimation(pulse)
  }, [active, reduceMotion])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (PULSE_SCALE - 1) * pulse.value }],
    opacity: IDLE_OPACITY + (ACTIVE_OPACITY - IDLE_OPACITY) * pulse.value,
  }))

  const F = size * FRAME_SCALE
  const inset = -(F - size) / 2 // หัก footprint กลับมาเท่า size เดิม

  return (
    <View
      style={{
        width: F,
        height: F,
        margin: inset,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill as any,
          { alignItems: 'center', justifyContent: 'center' },
          animStyle,
        ]}
      >
        <Image source={FRAME_IMG} style={{ width: F, height: F }} resizeMode="contain" />
      </Animated.View>
    </View>
  )
}

export { FRAME_SCALE, HOLE_RATIO }
export default AvatarFrame
