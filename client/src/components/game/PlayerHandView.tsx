/**
 * PlayerHandView.tsx — โซนไพ่ในมือผู้เล่น (ไฟล์กลาง ใช้ได้ทุก Tier)
 * แสดง 3 กอง: Pile 1 (3 ใบ) / Pile 2 (3 ใบ) / Pile 3 (5 ใบ)
 *
 * 2 โหมดตาม VIP status:
 *   - Free (isVip=false): กรอบทองแถวเดียว ไพ่ overlap เหลื่อมกันเป็นแถวตรง
 *   - VIP  (isVip=true):  fan จริงแบบเกมไพ่จีน — pivot-rotation (translateY(R)→rotate→translateY(-R))
 *                         หมุนรอบจุดหมุนสมมติใต้กอง ไม่ใช่รอบจุดศูนย์กลางตัวเอง (ดู FanCard/VIP_PIVOT_R)
 *                         จัด 2 แถว: บน=Pile1+Pile2 (เว้นห่างกว่าเดิม), ล่าง=Pile3 ซ้อนทับแถวบน ~30%
 *                         ของความสูงพัด Pile3 + อยู่หน้า (เหมือนถือสำรับไพ่จริง — ดู VIP_ROW_OVERLAP_RATIO)
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
// Free mode (Phase 3.5 Step 1): เป้าหมาย 62×90 (เท่า .bak เดิม) — MIN_EXPOSED ลดจาก 28→22
// (เทสจริงพิสูจน์แล้วว่า VIP โผล่ ~17px ยังกดได้ ปลอดภัยที่จะลดพื้น Free ลงมา)
const FREE_CW = 62; const FREE_CH = 90
const FREE_HARD_MIN_CW = 54 // เพดานล่างสุดตอนจอแคบจริงๆ (ยอมย่อไพ่เป็นทางเลือกสุดท้าย)
const FREE_MIN_EXPOSED = 22 // ส่วนที่โผล่ให้กด ต้องกว้างอย่างน้อยเท่านี้ (touch target)
const MAX_EXPOSED = 40      // ส่วนที่โผล่ต่อใบสูงสุด — กันไพ่ห่างเวิ้งว้าง (ใช้ร่วมกัน)
// VIP mode: ค่าเดิมจาก Phase 2.1 แช่แข็งไว้ตรงนี้ (ห้ามแตะ — "ลงตัวแล้ว") แยกจาก Free เพื่อไม่ให้
// การขยายไพ่ Free ใน Step 1 กระทบพัด VIP โดยไม่ตั้งใจ (เดิมทั้งสองโหมดใช้ค่าตั้งต้นชุดเดียวกัน)
const VIP_CW = 54; const VIP_CH = 78
const VIP_HARD_MIN_CW = 46
const VIP_MIN_EXPOSED = 28
// Free mode เท่านั้น: ขยับกอง 1/3 แนวตั้งให้เหลื่อมขั้นบันได (กอง 2 อยู่ตำแหน่งเดิม)
const FREE_PILE_OFFSET_Y = [-20, 0, 20]
const SELECT_LIFT = 12     // ระยะเด้งขึ้นตอนเลือกไพ่
// VIP pivot-rotation: R = รัศมีจุดหมุนสมมติใต้กอง (px) ต่อจำนวนใบในกอง — R เล็ก = การ์ดใกล้ pivot มาก
// ขึ้น = เหลื่อมกันมากขึ้นที่มุมเท่าเดิม (ดูโค้งกว่า) ค่านี้ simulate bounding-box แล้วว่าพอดีกรอบ
// ที่จอ 360-768px ทั้งกรณีปกติ (3/3/5) และกรณี arrangement_2 ที่ pile อาจมี 4 ใบชั่วคราว
const VIP_PIVOT_R: Record<number, number> = { 3: 100, 4: 125, 5: 150 }
const VIP_TOP_PAD = SELECT_LIFT // เผื่อพื้นที่ด้านบนให้การ์ดที่เด้งขึ้นไม่โดนตัด (riseY จากหมุนเป็นบวกลงล่างเสมอ)
// VIP 2-row layout: แถวบน Pile1+Pile2 (เว้นห่างกว่าเดิมมาก เพราะ Pile3 ย้ายไปแถวล่างแล้ว เหลือที่ว่าง
// เยอะ — simulate แล้วพอเหลือ margin หลักร้อย px ทุกความกว้างจอที่เทส) แถวล่าง Pile3 ซ้อนทับแถวบน
// ~30% ของความสูงพัด Pile3 เอง + อยู่หน้า (zIndex สูงกว่า) เหมือนถือสำรับไพ่จริง
const VIP_TOP_ROW_GAP = 48
const VIP_ROW_OVERLAP_RATIO = 0.30
const PILE_GAP = 8         // ช่องไฟระหว่างกอง
const FRAME_H_PAD = 6      // paddingHorizontal ของกรอบทอง
const FRAME_W_RATIO = 0.98 // กรอบทองกว้าง 98% ของจอ

const AspectView = Animated.createAnimatedComponent(View)

interface LayoutTarget { cw: number; ch: number; hardMinCw: number; minExposed: number; maxExposed: number }

// VIP pivot-rotation: geometry ของพัด 1 กอง (bounding box + R ที่ใช้จริง) — ใช้ร่วมกันทั้ง PileColumn
// (ตำแหน่งใบไพ่แต่ละใบ) และ PlayerHandView (คำนวณ overlap ของแถวล่างที่ทับแถวบน 2-row layout)
function vipFanGeometry(n: number, cw: number, ch: number) {
  const maxAngle = n >= 5 ? 16 : n >= 4 ? 12 : 8
  const R = VIP_PIVOT_R[n] ?? VIP_PIVOT_R[3]
  const maxAngleRad = (maxAngle * Math.PI) / 180
  const spreadX = R * Math.sin(maxAngleRad)       // ระยะห่างแนวนอนของใบขอบสุดจากศูนย์กลาง
  const riseY   = R * (1 - Math.cos(maxAngleRad)) // ระยะห่างแนวตั้งของใบขอบสุด (ลงล่างเสมอ)
  const containerW = Math.ceil(2 * spreadX + cw)
  const containerH = Math.ceil(ch + riseY + VIP_TOP_PAD)
  return { maxAngle, R, containerW, containerH }
}

/**
 * คำนวณ layout responsive จากความกว้างจอ (parameterize ด้วย target เพื่อแยก Free/VIP อิสระจากกัน)
 * ลำดับความสำคัญ (ตามกติกา): คงขนาดไพ่ไว้ก่อน เพิ่ม overlap (ลด exposed) ลงถึง minExposed
 * ถ้าจอแคบจนไม่พอแม้ overlap สุด ค่อยย่อขนาดไพ่เป็นทางเลือกสุดท้าย
 */
function computeLayout(screenW: number, pileSizes: number[], target: LayoutTarget) {
  const { cw: targetCw, ch: targetCh, hardMinCw, minExposed, maxExposed } = target
  const innerW   = screenW * FRAME_W_RATIO - FRAME_H_PAD * 2
  const gapsW    = Math.max(0, pileSizes.length - 1) * PILE_GAP
  const availW   = innerW - gapsW
  const nPiles   = pileSizes.length
  // จำนวนใบที่ซ้อน (ทุกใบยกเว้นใบแรกของแต่ละกอง)
  const overlapSlots = pileSizes.reduce((sum, n) => sum + Math.max(0, n - 1), 0)

  let cw = targetCw
  let ch = targetCh

  if (overlapSlots === 0) {
    return { cw, ch, exposed: cw }
  }

  // exposed ที่ "พอดีกรอบ" ถ้าใช้ไพ่ขนาดเต็ม (แบ่งพื้นที่การ์ดที่เหลือหลังหักใบแรกของทุกกอง)
  let exposed = (availW - nPiles * cw) / overlapSlots
  // clamp บน: ไม่เกิน maxExposed (กันไพ่ห่างเวิ้ง) และไม่เกินความกว้างไพ่
  exposed = Math.min(exposed, maxExposed, cw)

  if (exposed < minExposed) {
    // จอแคบ: ตรึง exposed ที่ขั้นต่ำ (touch target) แล้วย่อไพ่ให้พอดีเป็นทางเลือกสุดท้าย
    exposed = minExposed
    const fittedCw = (availW - overlapSlots * exposed) / nPiles
    cw = Math.max(hardMinCw, Math.min(targetCw, fittedCw))
    ch = Math.round(cw * (targetCh / targetCw))
  }

  // การันตีไม่ล้นกรอบ: ผลรวมความกว้างทุกกอง + gap ต้องไม่เกิน innerW
  // (exposed ถูกหักลงด้วย Math.min ข้างบนแล้ว จุดนี้เป็น assert กันพลาดขอบเคส)
  const totalW = nPiles * cw + overlapSlots * exposed + gapsW
  if (totalW > innerW && overlapSlots > 0) {
    exposed = Math.max(0, (availW - nPiles * cw) / overlapSlots)
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

// ── ไพ่ 1 ใบในโหมด VIP (pivot-rotation fan + เด้งตอนเลือกด้วย Reanimated) ──
// ทุกใบวางที่ตำแหน่ง base เดียวกัน (left/top เท่ากันหมด, ผู้เรียกเป็นคนกึ่งกลางไว้แล้ว) แล้วปล่อยให้
// transform 3 ชั้น (translateY(R) → rotate → translateY(-R)) หมุนรอบจุดหมุนสมมติที่อยู่ R px ใต้ตัวการ์ด
// เป็นตัวกวาดแต่ละใบออกเป็นพัดจริง (แทน marginLeft คงที่ + rotate รอบจุดศูนย์กลางตัวเองแบบเดิม)
const FanCard: React.FC<{
  code: string; selected: boolean; onPress: () => void
  cw: number; ch: number; zIndex: number
  angleDeg: number; R: number; left: number; top: number
  images: Record<string, any>
}> = ({ code, selected, onPress, cw, ch, zIndex, angleDeg, R, left, top, images }) => {
  const lift = useSharedValue(0)
  // เด้งขึ้นตอนถูกเลือก (Reanimated v4 — withTiming)
  useEffect(() => {
    lift.value = withTiming(selected ? -SELECT_LIFT : 0, { duration: 140 })
  }, [selected])

  const aStyle = useAnimatedStyle(() => ({
    // RN typing เข้มกับ transform array ที่ปนหลาย key — cast ผ่าน (ค่าถูกต้องตอน runtime)
    // ลำดับ compose: translateY(-R) ทำงานก่อน (ย้ายไปอ้างอิงจุดหมุน) → rotate → translateY(R) ย้ายกลับ
    // → translateY(lift) ยกขึ้นตามแกนของตัวเอง "หลัง" หมุนแล้ว (ธรรมชาติของการ์ดที่เอียงอยู่แล้ว)
    transform: [
      { translateY: R },
      { rotate: `${angleDeg}deg` },
      { translateY: -R },
      { translateY: lift.value },
    ] as any,
  }))

  return (
    <AspectView
      style={[
        { position: 'absolute', left, top, zIndex },
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
  cards: HandCardData[]; pi: number; isVip: boolean
  selected: { pi: number; ci: number } | null
  onCardPress: (pi: number, ci: number) => void
  cw: number; ch: number; exposed: number
  images: Record<string, any>
}> = ({ cards, pi, isVip, selected, onCardPress, cw, ch, exposed, images }) => {
  const n = cards.length
  const center = n > 1 ? (n - 1) / 2 : 0

  if (isVip) {
    // VIP pivot-rotation: ทุกใบวาง base เดียวกันกึ่งกลาง container แล้วปล่อยให้ transform ของ FanCard
    // กวาดออกเป็นพัดเอง — geometry (R/มุม/bounding box) มาจาก vipFanGeometry() ตัวเดียวกับที่
    // PlayerHandView ใช้คำนวณ overlap ของ 2-row layout ด้านล่าง กันเลขสองจุดขัดกัน
    const { maxAngle, R, containerW, containerH } = vipFanGeometry(n, cw, ch)
    const baseLeft = (containerW - cw) / 2
    const baseTop  = VIP_TOP_PAD

    return (
      <View style={styles.pileGroup}>
        <View style={{ width: containerW, height: containerH, position: 'relative' }}>
          {cards.map((card, ci) => {
            const isSel = selected?.pi === pi && selected?.ci === ci
            // t อยู่ช่วง -1..1 (ซ้ายสุด..ขวาสุด)
            const t = center === 0 ? 0 : (ci - center) / center
            const angleDeg = t * maxAngle
            return (
              <FanCard
                key={card.id}
                code={card.key}
                selected={isSel}
                onPress={() => onCardPress(pi, ci)}
                cw={cw} ch={ch} zIndex={ci}
                angleDeg={angleDeg} R={R}
                left={baseLeft} top={baseTop}
                images={images}
              />
            )
          })}
        </View>
      </View>
    )
  }

  // Free mode — เดิมทุกประการ (ห้ามแตะ): overlap ผ่าน marginLeft คงที่ + offset แนวตั้งขั้นบันได
  const overlapML = -(cw - exposed) // marginLeft ติดลบ = ระยะซ้อน
  return (
    <View style={[styles.pileGroup, { transform: [{ translateY: FREE_PILE_OFFSET_Y[pi] }] }]}>
      <View style={styles.cardRow}>
        {cards.map((card, ci) => {
          const isSel = selected?.pi === pi && selected?.ci === ci
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
  // Free/VIP คำนวณ layout แยกอิสระกันคนละชุดค่าคงที่ — กันการขยายไพ่ Free (Step 1) กระทบพัด VIP
  const layoutTarget: LayoutTarget = isVip
    ? { cw: VIP_CW, ch: VIP_CH, hardMinCw: VIP_HARD_MIN_CW, minExposed: VIP_MIN_EXPOSED, maxExposed: MAX_EXPOSED }
    : { cw: FREE_CW, ch: FREE_CH, hardMinCw: FREE_HARD_MIN_CW, minExposed: FREE_MIN_EXPOSED, maxExposed: MAX_EXPOSED }
  const { cw, ch, exposed } = computeLayout(screenW, pileSizes, layoutTarget)

  const paired = resolvedPiles.map((cards, idx) => ({ cards, pi: shown[idx] }))

  if (isVip) {
    // VIP 2-row layout: แถวบน = Pile1+Pile2 (pi!==2), แถวล่าง = Pile3 (pi===2) ซ้อนทับแถวบน ~30%
    // ของความสูงพัด Pile3 เอง + อยู่หน้า (zIndex สูงกว่า) — ใช้ pi (index จริง) ไม่ใช่ลำดับที่แสดง
    // เผื่อ Fog of War (visiblePiles) ซ่อนบางกองไป แถวที่ไม่มีกองเหลือจะไม่ render เลย
    const topPiles = paired.filter(p => p.pi !== 2)
    const bottomPiles = paired.filter(p => p.pi === 2)
    const bottomN = bottomPiles[0]?.cards.length ?? 0
    const overlapPx = bottomN > 0 ? Math.round(vipFanGeometry(bottomN, cw, ch).containerH * VIP_ROW_OVERLAP_RATIO) : 0

    const renderPile = (p: { cards: HandCardData[]; pi: number }) => (
      <PileColumn
        key={p.pi}
        cards={p.cards}
        pi={p.pi}
        isVip
        selected={selected}
        onCardPress={onCardPress}
        cw={cw} ch={ch} exposed={exposed}
        images={cardImages}
      />
    )

    return (
      <View style={styles.vipFrame}>
        {topPiles.length > 0 && (
          <View style={[styles.vipTopRow, { zIndex: 1 }]}>
            {topPiles.map(renderPile)}
          </View>
        )}
        {bottomPiles.length > 0 && (
          <View style={[styles.vipBottomRow, { marginTop: topPiles.length > 0 ? -overlapPx : 0, zIndex: 2 }]}>
            {bottomPiles.map(renderPile)}
          </View>
        )}
      </View>
    )
  }

  return (
    <View style={styles.frame}>
      {paired.map(({ cards, pi }) => (
        <PileColumn
          key={pi}
          cards={cards}
          pi={pi}
          isVip={false}
          selected={selected}
          onCardPress={onCardPress}
          cw={cw} ch={ch} exposed={exposed}
          images={cardImages}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // กรอบทองครอบ 3 กองแถวเดียว (ดีไซน์เดิม pilesContainerFrame)
  // Phase 3.5 Step 2: paddingVertical 8->14 ให้กรอบสูงขึ้น (ไพ่/พัด centered อัตโนมัติจาก
  // alignItems:'center' ด้านล่างอยู่แล้ว ไม่ต้องแก้เพิ่ม) — ระยะห่างกรอบ-ปุ่ม Auto Sort/Ready
  // เป็นคนละเรื่องกับ paddingVertical ตรงนี้ (ควบคุมโดย userArea.paddingBottom + actionBar.paddingTop
  // ในแต่ละไฟล์ Tier = 4+4 = 8px อยู่แล้ว ตรวจแล้วอยู่ในช่วง 8-12px ที่ต้องการพอดี ไม่ต้องแตะ)
  frame: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '98%',
    paddingVertical: 14,
    paddingHorizontal: FRAME_H_PAD,
    marginTop: 4,
  },
  // VIP 2-row layout: กรอบเดียวกัน (width/padding/marginTop เท่า frame เดิม) แต่เป็น column ของ 2 แถว
  // แทนที่จะเรียงแถวเดียว — แถวล่าง (Pile3) ซ้อนทับแถวบนด้วย marginTop ติดลบ (คำนวณสดใน component)
  vipFrame: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '98%',
    paddingVertical: 14,
    paddingHorizontal: FRAME_H_PAD,
    marginTop: 4,
  },
  vipTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: VIP_TOP_ROW_GAP },
  vipBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pileGroup: { flexDirection: 'column', alignItems: 'center' },
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
