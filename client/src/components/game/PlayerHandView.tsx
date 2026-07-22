/**
 * PlayerHandView.tsx — โซนไพ่ในมือผู้เล่น (ไฟล์กลาง ใช้ได้ทุก Tier)
 * แสดง 3 กอง ในกรอบทองแถวเดียว: Pile 1 (3 ใบ) / Pile 2 (3 ใบ) / Pile 3 (5 ใบ)
 *
 * 2 โหมดตาม VIP status:
 *   - Free (isVip=false): ไพ่ overlap เหลื่อมกันเป็นแถวตรง
 *   - VIP  (isVip=true):  fan arc แบบเกมไพ่จีน (rotate + arc translateY)
 *                         ใบที่เลือกเด้งขึ้น -12px ด้วย Reanimated v4
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect } from 'react'
import {
  Image, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native'
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated'
import { CARD_IMG } from './cardAssets'

// ── Types ──
export interface HandCardData { id: string; key: string }

export interface PlayerHandViewProps {
  // ไพ่ 3 กอง (Pile 1 / Pile 2 / Pile 3)
  piles: [HandCardData[], HandCardData[], HandCardData[]]
  // ไพ่ที่ถูกเลือกเพื่อสลับ (null = ยังไม่เลือก)
  selected: { pi: number; ci: number } | null
  onCardPress: (pi: number, ci: number) => void
  isVip: boolean

  // ── Optional (เผื่อ mastermind/highNoble ใน Phase 3 — initiate ยังไม่ส่ง) ──
  // index กองที่จะแสดง (default [0,1,2]) — ใช้ซ่อน Pile1/2 หลัง Fog of War
  visiblePiles?: number[]
  // ไพ่หงายแทน interactive (per-pile) — ใช้ตอน reveal/showdown ของ Tier บน
  revealedCards?: Record<number, string[]>
  // map รูปไพ่ (default = CARD_IMG กลาง) — เผื่อ skin อื่นในอนาคต
  cardImages?: Record<string, any>
}

// ── ค่าคงที่ layout ──
const MIN_CW = 54          // ความกว้างไพ่ขั้นต่ำ (ห้ามเล็กกว่านี้ ยกเว้นจอแคบสุดๆ)
const MIN_CH = 78          // ความสูงไพ่ขั้นต่ำ
const HARD_MIN_CW = 46     // เพดานล่างสุดตอนจอแคบจริงๆ (ยอมย่อไพ่เป็นทางเลือกสุดท้าย)
const MIN_EXPOSED = 28     // ส่วนที่โผล่ให้กด ต้องกว้างอย่างน้อยเท่านี้ (touch target)
const SELECT_LIFT = 12     // ระยะเด้งขึ้นตอนเลือกไพ่
const PILE_GAP = 8         // ช่องไฟระหว่างกอง
const FRAME_H_PAD = 6      // paddingHorizontal ของกรอบทอง
const FRAME_W_RATIO = 0.98 // กรอบทองกว้าง 98% ของจอ

const PILE_LABELS = ['PILE 1', 'PILE 2', 'PILE 3']
const AspectView = Animated.createAnimatedComponent(View)

/**
 * คำนวณ layout responsive จากความกว้างจอ
 * ลำดับความสำคัญ (ตามกติกา): คงขนาดไพ่ไว้ก่อน เพิ่ม overlap (ลด exposed) ลงถึง MIN_EXPOSED
 * ถ้าจอแคบจนไม่พอแม้ overlap สุด ค่อยย่อขนาดไพ่เป็นทางเลือกสุดท้าย
 */
function computeLayout(screenW: number, pileSizes: number[]) {
  const innerW   = screenW * FRAME_W_RATIO - FRAME_H_PAD * 2
  const gapsW    = Math.max(0, pileSizes.length - 1) * PILE_GAP
  const availW   = innerW - gapsW
  const nPiles   = pileSizes.length
  // จำนวนใบที่ซ้อน (ทุกใบยกเว้นใบแรกของแต่ละกอง)
  const overlapSlots = pileSizes.reduce((sum, n) => sum + Math.max(0, n - 1), 0)

  let cw = MIN_CW
  let ch = MIN_CH

  if (overlapSlots === 0) {
    return { cw, ch, exposed: cw }
  }

  // exposed ที่พอดีจอถ้าใช้ไพ่ขนาดเต็ม
  let exposed = (availW - nPiles * cw) / overlapSlots
  // ไม่ให้กว้างกว่าความกว้างไพ่ (ไม่มีการเว้นเกินใบ)
  if (exposed > cw) exposed = cw

  if (exposed < MIN_EXPOSED) {
    // จอแคบ: ตรึง exposed ที่ขั้นต่ำ แล้วย่อไพ่ให้พอดี (ทางเลือกสุดท้าย)
    exposed = MIN_EXPOSED
    const fittedCw = (availW - overlapSlots * exposed) / nPiles
    cw = Math.max(HARD_MIN_CW, Math.min(MIN_CW, fittedCw))
    ch = Math.round(cw * (MIN_CH / MIN_CW))
  }

  return { cw, ch, exposed }
}

// ── ไพ่ 1 ใบในโหมด Free (แถวตรง overlap) ──
const FreeCard: React.FC<{
  code: string; first: boolean; selected: boolean; onPress: () => void
  cw: number; ch: number; overlapML: number; zIndex: number
  images: Record<string, any>
}> = ({ code, first, selected, onPress, cw, ch, overlapML, zIndex, images }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.card,
      { width: cw, height: ch },
      !first && { marginLeft: overlapML },
      selected && styles.cardSel,
      { zIndex },
    ]}
  >
    {images[code]
      ? <Image source={images[code]} style={{ width: cw, height: ch }} resizeMode="cover" />
      : <Text style={styles.fallbackTxt}>{code}</Text>}
  </Pressable>
)

// ── ไพ่ 1 ใบในโหมด VIP (fan arc + เด้งตอนเลือกด้วย Reanimated) ──
const FanCard: React.FC<{
  code: string; first: boolean; selected: boolean; onPress: () => void
  cw: number; ch: number; overlapML: number; zIndex: number
  angleDeg: number; arcY: number
  images: Record<string, any>
}> = ({ code, first, selected, onPress, cw, ch, overlapML, zIndex, angleDeg, arcY, images }) => {
  const lift = useSharedValue(0)
  // เด้งขึ้นตอนถูกเลือก (Reanimated v4 — withTiming)
  useEffect(() => {
    lift.value = withTiming(selected ? -SELECT_LIFT : 0, { duration: 140 })
  }, [selected])

  const aStyle = useAnimatedStyle(() => ({
    // RN typing เข้มกับ transform array ที่ปนหลาย key — cast ผ่าน (ค่าถูกต้องตอน runtime)
    transform: [
      { translateY: arcY + lift.value },
      { rotate: `${angleDeg}deg` },
    ] as any,
  }))

  return (
    <AspectView
      style={[
        { marginLeft: first ? 0 : overlapML, zIndex },
        aStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.card,
          { width: cw, height: ch },
          selected && styles.cardSelVip,
        ]}
      >
        {images[code]
          ? <Image source={images[code]} style={{ width: cw, height: ch }} resizeMode="cover" />
          : <Text style={styles.fallbackTxt}>{code}</Text>}
      </Pressable>
    </AspectView>
  )
}

// ── 1 กอง (Free หรือ VIP) ──
const PileColumn: React.FC<{
  cards: HandCardData[]; pi: number; label: string; isVip: boolean
  selected: { pi: number; ci: number } | null
  onCardPress: (pi: number, ci: number) => void
  cw: number; ch: number; exposed: number
  images: Record<string, any>
}> = ({ cards, pi, label, isVip, selected, onCardPress, cw, ch, exposed, images }) => {
  const overlapML = -(cw - exposed) // marginLeft ติดลบ = ระยะซ้อน
  const n = cards.length
  const center = n > 1 ? (n - 1) / 2 : 0
  // มุมพัด/ความโค้งตามจำนวนไพ่ (3 ใบ ≈ ±8°, 5 ใบ ≈ ±16°)
  const maxAngle = n >= 5 ? 16 : n >= 4 ? 12 : 8
  const arcRise  = n >= 5 ? 18 : n >= 4 ? 13 : 9

  return (
    <View style={styles.pileGroup}>
      <Text style={styles.pileLabel}>{label}</Text>
      <View style={styles.cardRow}>
        {cards.map((card, ci) => {
          const isSel = selected?.pi === pi && selected?.ci === ci
          if (!isVip) {
            return (
              <FreeCard
                key={card.id}
                code={card.key}
                first={ci === 0}
                selected={isSel}
                onPress={() => onCardPress(pi, ci)}
                cw={cw} ch={ch} overlapML={overlapML} zIndex={ci}
                images={images}
              />
            )
          }
          // VIP fan: t อยู่ช่วง -1..1 (ซ้ายสุด..ขวาสุด)
          const t = center === 0 ? 0 : (ci - center) / center
          const angleDeg = t * maxAngle
          const arcY     = arcRise * (t * t) // ขอบต่ำ กลางสูง = โค้งเป็นพัด
          return (
            <FanCard
              key={card.id}
              code={card.key}
              first={ci === 0}
              selected={isSel}
              onPress={() => onCardPress(pi, ci)}
              cw={cw} ch={ch} overlapML={overlapML} zIndex={ci}
              angleDeg={angleDeg} arcY={arcY}
              images={images}
            />
          )
        })}
      </View>
    </View>
  )
}

const PlayerHandView: React.FC<PlayerHandViewProps> = ({
  piles, selected, onCardPress, isVip,
  visiblePiles = [0, 1, 2],
  revealedCards,
  cardImages = CARD_IMG,
}) => {
  const { width: screenW } = useWindowDimensions()

  // กองที่จะแสดงจริง (รองรับ Fog of War ของ Tier บนใน Phase 3)
  const shown = [0, 1, 2].filter(i => visiblePiles.includes(i))

  // ถ้ามี revealedCards ให้ใช้แทนไพ่ interactive (ไพ่หงาย reveal)
  const resolvedPiles: HandCardData[][] = shown.map(i => {
    if (revealedCards && revealedCards[i]) {
      return revealedCards[i].map((k, ci) => ({ id: `rev-${i}-${ci}-${k}`, key: k }))
    }
    return piles[i] ?? []
  })

  const pileSizes = resolvedPiles.map(p => p.length)
  const { cw, ch, exposed } = computeLayout(screenW, pileSizes)

  return (
    <View style={styles.frame}>
      {resolvedPiles.map((cards, idx) => {
        const pi = shown[idx]
        return (
          <PileColumn
            key={pi}
            cards={cards}
            pi={pi}
            label={PILE_LABELS[pi]}
            isVip={isVip}
            selected={selected}
            onCardPress={onCardPress}
            cw={cw} ch={ch} exposed={exposed}
            images={cardImages}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // กรอบทองครอบ 3 กองแถวเดียว (ดีไซน์เดิม pilesContainerFrame)
  frame: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '98%',
    paddingVertical: 8,
    paddingHorizontal: FRAME_H_PAD,
    backgroundColor: 'rgba(0, 30, 15, 0.65)',
    borderWidth: 1.5,
    borderColor: '#c9a84c',
    borderRadius: 14,
    marginTop: 4,
  },
  pileGroup: { flexDirection: 'column', alignItems: 'center' },
  pileLabel: {
    fontSize: 9, color: '#FFD76A', fontWeight: '800',
    letterSpacing: 1, marginBottom: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  card: {
    borderRadius: 4, backgroundColor: '#fdfaf3',
    borderWidth: 1, borderColor: 'rgba(201,168,76,.65)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  cardSel:    { borderColor: '#6ec87a', borderWidth: 2, transform: [{ translateY: -10 }] },
  cardSelVip: { borderColor: '#6ec87a', borderWidth: 2 }, // เด้งทำผ่าน Reanimated แทน transform static
  fallbackTxt: { fontSize: 8 },
})

export default PlayerHandView
