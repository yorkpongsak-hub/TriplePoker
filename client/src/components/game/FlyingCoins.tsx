// FlyingCoins.tsx — เหรียญโทเคนบิน (Ante เข้ากองกลาง ตอนเริ่มรอบ / รางวัลออกจากกองกลางไปหาผู้ชนะ
// แต่ละกอง หลังรู้ผลแล้ว) — มติลุงเยาะ 2026-07-26
// ใช้ pattern เดียวกับ dealAnims ใน tier index.tsx ทุก Tier (Animated x/y/opacity/scale ต่อ sprite,
// ตำแหน่งเป็น offset สัมพัทธ์จากจุดศูนย์กลางโต๊ะเดียวกับที่ dealAnims ใช้)
// รูปภาพ 4 แบบ (client/assets/tokens/) — ต่างกันตามจำนวนเหรียญในภาพ ไม่ใช่มูลค่าจริง:
//   ante  = two_tokens.png   (ผู้เล่นทุกคนส่งเข้ากองกลางตอนเริ่มรอบ)
//   pile1 = three_tokens.png (ผู้ชนะกองที่ 1)
//   pile2 = four_tokens.png  (ผู้ชนะกองที่ 2)
//   pile3 = eight_tokens.png (ผู้ชนะกองที่ 3 — กองใหญ่สุด)
//
// The Sage Unicorn Studio Co., Ltd.

import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Animated, StyleSheet } from 'react-native'

const COIN_IMAGES = {
  ante: require('../../../assets/tokens/two_tokens.png'),
  pile1: require('../../../assets/tokens/three_tokens.png'),
  pile2: require('../../../assets/tokens/four_tokens.png'),
  pile3: require('../../../assets/tokens/eight_tokens.png'),
} as const

export type CoinVariant = keyof typeof COIN_IMAGES

export interface Point { x: number; y: number }

export interface FlyingCoinsHandle {
  // ยิงเหรียญ 1 สไปรต์บิน from -> to แล้วจางหายเอง — เรียกซ้ำได้ทันที (ใช้ pool หมุนรอบ)
  fire: (variant: CoinVariant, from: Point, to: Point) => void
}

// pool คงที่ 6 สไปรต์หมุนใช้ซ้ำ — พอสำหรับ Ante (สูงสุด 4 ที่นั่งพร้อมกัน) และ pile1/2/3 ที่อาจ
// ทยอยยิงใกล้ๆ กัน (Simultaneous Showdown) โดยไม่ชนกันเอง
const POOL_SIZE = 8

const FlyingCoins = forwardRef<FlyingCoinsHandle>((_props, ref) => {
  const sprites = useRef(
    Array.from({ length: POOL_SIZE }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.6),
    }))
  ).current
  // เก็บ variant (เลือกรูป) แยกเป็น state เพราะ Animated.Value ไม่ trigger re-render แต่ <Image source>
  // ต้องเปลี่ยนจริงก่อน animate ทุกครั้งที่ pool slot ถูกใช้ซ้ำด้วยรูปคนละแบบ
  const [variants, setVariants] = useState<CoinVariant[]>(Array(POOL_SIZE).fill('ante'))
  const poolIndexRef = useRef(0)

  useImperativeHandle(ref, () => ({
    fire(variant, from, to) {
      const i = poolIndexRef.current
      poolIndexRef.current = (poolIndexRef.current + 1) % POOL_SIZE
      const sp = sprites[i]

      setVariants(prev => {
        if (prev[i] === variant) return prev
        const next = [...prev]
        next[i] = variant
        return next
      })

      sp.x.setValue(from.x)
      sp.y.setValue(from.y)
      sp.opacity.setValue(0)
      sp.scale.setValue(0.6)

      // ความเร็วลดลงครึ่งหนึ่ง (มติลุงเยาะ 2026-07-26) — duration ทุกช่วง ×2 จากเดิม (120/160/550/180)
      Animated.sequence([
        Animated.parallel([
          Animated.timing(sp.opacity, { toValue: 1, duration: 240, useNativeDriver: false }),
          Animated.timing(sp.scale, { toValue: 1, duration: 320, useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(sp.x, { toValue: to.x, duration: 1100, useNativeDriver: false }),
          Animated.timing(sp.y, { toValue: to.y, duration: 1100, useNativeDriver: false }),
        ]),
        Animated.timing(sp.opacity, { toValue: 0, duration: 360, useNativeDriver: false }),
      ]).start()
    },
  }), [sprites])

  // ห้ามห่อด้วย View เพิ่ม (บั๊กเดิม 2026-07-26): StyleSheet.absoluteFill ของ View ห่อจะทำให้ sprite
  // (position:'absolute' ไม่มี top/left) อ้างอิงจากมุมบนซ้ายของ View ที่ขยายเต็มจอ แทนที่จะอ้างจาก
  // ศูนย์กลางที่ wrapper ของ caller (alignItems/justifyContent:'center') ตั้งใจให้ใช้ — ทำให้เหรียญ
  // ดูเหมือนวิ่งจากมุมบนแทนจากศูนย์กลางจริง ต้อง render sprite เป็น child ตรงของ wrapper นั้นเลย
  // เหมือน dealAnims (Animated.View ตรงๆ ไม่มี View ห่อซ้อนอีกชั้น)
  return (
    <>
      {sprites.map((sp, i) => (
        <Animated.Image
          key={i}
          source={COIN_IMAGES[variants[i]]}
          style={[
            styles.coin,
            {
              opacity: sp.opacity,
              transform: [{ translateX: sp.x }, { translateY: sp.y }, { scale: sp.scale }],
            },
          ]}
          resizeMode="contain"
        />
      ))}
    </>
  )
})

const styles = StyleSheet.create({
  // 36->22 (มติลุงเยาะ 2026-07-26): เดิมดูใหญ่เกินไปเทียบกับขนาดไพ่ (25x36) บนโต๊ะเดียวกัน
  coin: { position: 'absolute', width: 22, height: 22 },
})

export default FlyingCoins
