/**
 * GFHandView.tsx — ไพ่ในมือ Human ช่วง Grand Finale (เฉพาะ VIP fan mode)
 *
 * ใช้ vipFanGeometry() ตัวเดียวกับ PlayerHandView เพื่อให้พัดหน้าตาเหมือน arrangement เป๊ะ
 * (มุม 8 องศา / R=100 / pivot-rotation แบบเดียวกัน) ต่างแค่ขนาดไพ่ 62x90 แทน 54x78
 * ตามมติ: ไพ่ไม่ควรหดตอนเข้าจังหวะสำคัญที่สุดของเกม
 *
 * ทำไมไม่ reuse FanCard: FanCard hardcode styles ภายในไว้ ปรับจากนอกไม่ได้ และ Grand Finale
 * ต้องการ state ที่ arrangement ไม่มี (isCalled = border ทอง + glow + ยก, badge ติ๊ก)
 * การยัดเข้า FanCard = แตะ component ที่ arrangement ใช้อยู่ ซึ่งเสี่ยงเกินความจำเป็น
 *
 * มติลุงเยาะ 2026-07-25: ตัด gesture ออกหมด (เดิม แตะซ้ำ = Call / ปัดลง = Fold)
 * component นี้เหลือหน้าที่เดียวคือ "แสดงไพ่ + ให้เลือกใบที่จะหงาย"
 * ส่วน Call/Fold ย้ายไปเป็นปุ่มจริงในไฟล์ Tier ผู้เล่นจะได้เห็นชัดว่ากดอะไรได้บ้าง
 *
 * ขอบเขต: Human + VIP เท่านั้น -- Free ยังใช้ path แถวตรงเดิมในไฟล์ Tier, AI ทุกที่นั่งไม่แตะ
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { CARD_IMG } from './cardAssets'
import { vipFanGeometry, type HandCardData } from './PlayerHandView'

// ขนาดไพ่ Grand Finale -- ตรงกับ CW/CH ในไฟล์ Tier (62x90) ไม่ใช่ VIP_CW/VIP_CH ของ arrangement
const GF_CW = 62
const GF_CH = 90
const SELECT_LIFT = 12  // ใบที่เลือกอยู่ (รอกด Call ซ้ำ)
const CALL_LIFT   = 10  // ใบที่ Call ไปแล้ว -- ตรงกับ translateY -10 ของ path เดิม
const TOP_PAD     = SELECT_LIFT // เผื่อที่ด้านบนกันใบที่เด้งขึ้นโดนตัด

// zIndex: ใบที่ Call/เลือก ต้องอยู่หน้าสุด ไม่งั้น badge กับขอบเรืองแสงโดนใบขวาบัง
// (พัดซ้อนกันแน่น เห็นใบละ ~14px เท่านั้น)
const Z_CALLED   = 200
const Z_SELECTED = 100

export interface GFHandViewProps {
  cards: HandCardData[]            // เรียงมาแล้วจากไฟล์ Tier (ใบที่ Call อยู่ขวาสุด)
  calledKeys: string[]             // key ของใบที่หงายแล้ว
  selectedKey: string | null       // ใบที่เลือกไว้ว่าจะหงาย (ยืนยันด้วยปุ่ม CALL ในไฟล์ Tier)
  isMyTurn: boolean
  onSelect: (key: string) => void
  cardImages?: Record<string, any>

  // มติลุงเยาะ 2026-08-04: ขยายมุมกางพัดไพ่ (default 1 = ไม่กระทบ Tier ที่ไม่ส่ง prop นี้ — opt-in
  // เหมือน handFanAngleScale ของ PlayerHandView.tsx) ส่งต่อเข้า vipFanGeometry() ตัวเดียวกัน
  fanAngleScale?: number
}

const AView = Animated.createAnimatedComponent(View)

// ไพ่ 1 ใบ -- pivot-rotation ชุดเดียวกับ FanCard: translateY(R) -> rotate -> translateY(-R)
// หมุนรอบจุดสมมติใต้กอง ไม่ใช่จุดศูนย์กลางตัวเอง แล้วค่อย lift ตามแกนตัวเองหลังหมุน
const GFFanCard: React.FC<{
  code: string; isCalled: boolean; isSelected: boolean
  onPress?: () => void
  angleDeg: number; R: number; left: number; top: number; zIndex: number
  images: Record<string, any>
}> = ({ code, isCalled, isSelected, onPress, angleDeg, R, left, top, zIndex, images }) => {
  const lift = useSharedValue(0)

  useEffect(() => {
    const target = isCalled ? -CALL_LIFT : isSelected ? -SELECT_LIFT : 0
    lift.value = withTiming(target, { duration: 140 })
  }, [isCalled, isSelected])

  const aStyle = useAnimatedStyle(() => ({
    // RN typing เข้มกับ transform array ที่ปนหลาย key -- cast ผ่าน (ค่าถูกต้องตอน runtime)
    transform: [
      { translateY: R },
      { rotate: `${angleDeg}deg` },
      { translateY: -R },
      { translateY: lift.value },
    ] as any,
  }))

  const box = (
    <View
      style={[
        styles.card,
        isCalled ? styles.cardCalled : isSelected ? styles.cardSelected : styles.cardIdle,
      ]}
    >
      {images[code]
        ? <Image source={images[code]} style={{ width: GF_CW, height: GF_CH }} resizeMode="cover" />
        : <Text style={styles.fallbackTxt}>{code}</Text>}
      {isSelected && !isCalled && (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>OK</Text>
        </View>
      )}
    </View>
  )

  return (
    <AView style={[{ position: 'absolute', left, top, zIndex }, aStyle]}>
      {onPress
        ? <Pressable onPress={onPress}>{box}</Pressable>
        : box}
    </AView>
  )
}

const GFHandView: React.FC<GFHandViewProps> = ({
  cards, calledKeys, selectedKey, isMyTurn,
  onSelect,
  cardImages = CARD_IMG,
  fanAngleScale = 1,
}) => {
  const n = cards.length
  // geometry ชุดเดียวกับ arrangement -- ส่ง cw/ch ของ GF เข้าไป มุมกับ R คงเดิม
  const { maxAngle, R, containerW, containerH } = vipFanGeometry(n, GF_CW, GF_CH, fanAngleScale)
  const center = n > 1 ? (n - 1) / 2 : 0
  const baseLeft = (containerW - GF_CW) / 2

  return (
    <View style={styles.wrap}>
      <View style={{ width: containerW, height: containerH, position: 'relative' }}>
        {cards.map((c, ci) => {
          const isCalled = calledKeys.includes(c.key)
          const isSelected = isMyTurn && !isCalled && c.key === selectedKey
          // t อยู่ช่วง -1..1 (ซ้ายสุด..ขวาสุด)
          const t = center === 0 ? 0 : (ci - center) / center
          // แตะ = เลือกใบที่จะหงายเท่านั้น ไม่ยิง Call เอง (กันกดพลาดเสียเงิน) -- ยืนยันที่ปุ่ม CALL
          const handlePress = (!isMyTurn || isCalled) ? undefined : () => onSelect(c.key)

          return (
            <GFFanCard
              key={c.id}
              code={c.key}
              isCalled={isCalled}
              isSelected={isSelected}
              onPress={handlePress}
              angleDeg={t * maxAngle}
              R={R}
              left={baseLeft}
              top={TOP_PAD}
              zIndex={isCalled ? Z_CALLED + ci : isSelected ? Z_SELECTED : ci}
              images={cardImages}
            />
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center' },
  card: {
    width: GF_CW, height: GF_CH,
    borderRadius: 4, backgroundColor: '#fdfaf3',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cardIdle:     { borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  cardSelected: {
    borderWidth: 2.5, borderColor: '#8DFFB5',
    shadowColor: '#8DFFB5', shadowOpacity: 0.8, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  cardCalled: {
    borderWidth: 2.5, borderColor: '#FFD76A',
    shadowColor: '#FFD76A', shadowOpacity: 0.8, shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  badge: {
    position: 'absolute', top: 2, right: 2,
    paddingHorizontal: 4, height: 18, borderRadius: 9,
    backgroundColor: '#8DFFB5',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 9, color: '#0F2418', fontWeight: '900' },
  fallbackTxt: { fontSize: 8 },
})

export default GFHandView
