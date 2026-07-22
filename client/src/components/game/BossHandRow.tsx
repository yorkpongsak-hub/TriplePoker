/**
 * BossHandRow.tsx — ไพ่ของ Boss/AI แถวตรง (ไฟล์กลาง ใช้ได้ทุก Tier)
 * แสดง 3 กอง label "P1 / P2 / P3" เป็นแถวตรง (ไม่ทำพัด)
 *   - ปกติ (ยังไม่ showdown): ไพ่คว่ำ (card back) ทั้งหมด
 *   - ตอน showdown: ส่ง revealed มา จะหงายเป็นหน้าไพ่ (ใบที่ยังไม่รู้คงคว่ำ)
 * แทนที่ pattern AIPiles เดิมในไฟล์ Tier
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { CARD_IMG, CARD_BACK_IMG } from './cardAssets'

export interface BossHandRowProps {
  // ไพ่ที่รู้แล้ว เรียงต่อกัน p1(3) + p2(3) + p3(5) — ใบที่เป็น undefined/ไม่รู้ = คว่ำ
  revealed?: string[]
  // จำนวนไพ่แต่ละกอง (default 3/3/5)
  pileSizes?: [number, number, number]
  cardImages?: Record<string, any>
  cardBack?: any
  // ขนาดไพ่ (default 24×34 ตามดีไซน์ aiPilesFrame เดิม)
  cardW?: number
  cardH?: number
  overlap?: number
}

const BossHandRow: React.FC<BossHandRowProps> = ({
  revealed = [],
  pileSizes = [3, 3, 5],
  cardImages = CARD_IMG,
  cardBack = CARD_BACK_IMG,
  cardW = 24,
  cardH = 34,
  overlap = -16,
}) => {
  // offset เริ่มต้นของแต่ละกองใน array revealed แบบ flatten
  const startIdx = [0, pileSizes[0], pileSizes[0] + pileSizes[1]]

  return (
    <View style={styles.frame}>
      {pileSizes.map((cnt, pi) => (
        <View key={pi} style={styles.pileGroup}>
          <Text style={styles.pileLabel}>P{pi + 1}</Text>
          <View style={styles.row}>
            {Array.from({ length: cnt }).map((_, ci) => {
              const code = revealed[startIdx[pi] + ci]
              const ml = ci === 0 ? 0 : overlap
              const faceUp = !!(code && cardImages[code])
              return (
                <View
                  key={`${pi}-${ci}-${code ?? 'back'}`}
                  style={[
                    styles.card,
                    { width: cardW, height: cardH, borderRadius: cardW * 0.14, marginLeft: ml },
                  ]}
                >
                  <Image
                    source={faceUp ? cardImages[code as string] : cardBack}
                    style={{ width: cardW, height: cardH }}
                    resizeMode="cover"
                  />
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // ดีไซน์เดิม aiPilesFrame
  frame: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0, 30, 15, 0.45)',
    borderWidth: 1.2,
    borderColor: '#c9a84c',
    borderRadius: 10,
  },
  pileGroup: { alignItems: 'center' },
  pileLabel: { fontSize: 8, color: '#FFD76A', fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row' },
  card: {
    backgroundColor: '#091808',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,.5)',
    overflow: 'hidden',
  },
})

export default BossHandRow
