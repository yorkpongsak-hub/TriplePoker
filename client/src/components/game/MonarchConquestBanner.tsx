/**
 * MonarchConquestBanner.tsx — แบนเนอร์เลื่อนลงจากขอบบนจอ ประกาศให้ผู้เล่นที่กำลังเล่นโต๊ะอื่นเห็นว่า
 * มีคนพิชิต Boss Monarch ได้ (ไฟล์กลาง reuse ทุก Tier เหมือน PlayerHandView) — สูงไม่เกิน 1/3 จอ,
 * โชว์รวมไม่เกิน 7 วิ (slide in + hold + slide out) แล้วเลื่อนกลับขึ้น ไม่บัง gameplay ด้านล่าง
 * (absolute + pointerEvents box-none กันดัก touch)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef } from 'react'
import { Animated, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

const CARD_ART = require('../../../assets/badges/card_monarch_conquered.png')

const SLIDE_MS = 400
const HOLD_MS = 6200 // slide(400) + hold(6200) + slide(400) = 7000ms รวมพอดี

export interface MonarchConquestBannerProps {
  winnerName: string | null
  onHidden?: () => void
}

const MonarchConquestBanner: React.FC<MonarchConquestBannerProps> = ({ winnerName, onHidden }) => {
  const { height: screenH } = useWindowDimensions()
  const bannerH = Math.min(screenH / 3, 220)
  const cardH = bannerH - 28
  const translateY = useRef(new Animated.Value(-(bannerH + 20))).current

  useEffect(() => {
    if (!winnerName) return
    translateY.setValue(-(bannerH + 20))
    const seq = Animated.sequence([
      Animated.timing(translateY, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }),
      Animated.delay(HOLD_MS),
      Animated.timing(translateY, { toValue: -(bannerH + 20), duration: SLIDE_MS, useNativeDriver: true }),
    ])
    seq.start(({ finished }) => { if (finished) onHidden?.() })
    return () => seq.stop()
  }, [winnerName])

  if (!winnerName) return null

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.container, { height: bannerH, transform: [{ translateY }] }]}
    >
      <View style={[styles.card, { height: cardH }]}>
        <Image source={CARD_ART} style={{ width: cardH - 20, height: cardH - 20 }} resizeMode="contain" />
        <View style={styles.textWrap}>
          {/* มติลุงเยาะ — banner นี้ broadcast ให้ทุกคนทุก Tier เห็น (แม้ยังไม่เคยเจอบอสตัวนี้เอง) ห้ามสปอยล์ชื่อ */}
          <Text style={styles.title}>👑 HIDDEN BOSS CONQUERED</Text>
          <Text style={styles.winnerName} numberOfLines={1}>{winnerName}</Text>
          <Text style={styles.subtitle}>has defeated the Hidden Boss</Text>
        </View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#163A25', borderColor: '#FFD76A', borderWidth: 2, borderRadius: 14,
    paddingVertical: 10, paddingHorizontal: 16, marginTop: 8,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  textWrap: { flexShrink: 1, marginLeft: 14 },
  title: { color: '#FFD76A', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  winnerName: { color: '#F5F2E8', fontSize: 20, fontWeight: '700', marginTop: 2 },
  subtitle: { color: '#C8C4B0', fontSize: 12, marginTop: 2 },
})

export default MonarchConquestBanner
