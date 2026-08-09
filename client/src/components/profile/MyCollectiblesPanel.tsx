// MyCollectiblesPanel.tsx
// My Collectibles - โชว์ Official Collectibles ที่ผู้เล่นซื้อแล้ว (จาก app/(home)/collectibles.tsx)
// The Sage Unicorn Studio Co., Ltd.
//
// สถานะ: mock ทั้งหมด - อ่านจาก AsyncStorage key `collectibles_owned_${userId}` ที่ CollectiblesScreen.tsx
// เขียนไว้ตอนสั่งซื้อสำเร็จ ยังไม่มี backend/DB จริง (รอเวอร์ชัน Full System)
//
// "3D preview" เป็นแค่ placeholder หมุนไอคอน 2D ด้วย Reanimated - ไม่ใช่ 3D model จริง
// จนกว่าจะมีไฟล์ .glb และเลือก library viewer จริง

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'

const C = {
  card:        '#161320',
  card2:       '#1D1926',
  border:      'rgba(255,215,106,0.35)',
  borderHi:    'rgba(255,215,106,0.65)',
  gold:        '#FFD76A',
  purple:      '#C084FC',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
}

type ProductKey = 'tshirt' | 'tier_s_coin' | 'caelum_trophy'
type DigitalKey = 'tier_s_coin' | 'caelum_trophy'

const COLLECTIBLE_META: Record<DigitalKey, { name: string; icon: string }> = {
  tier_s_coin:    { name: 'Tier S Commemorative Coin', icon: '🪙' },
  caelum_trophy:  { name: 'The last boss Champion Trophy', icon: '🏆' },
}

function isDigitalKey(key: ProductKey): key is DigitalKey {
  return key === 'tier_s_coin' || key === 'caelum_trophy'
}

export default function MyCollectiblesPanel({ userId }: { userId: string }) {
  const [owned, setOwned] = useState<ProductKey[]>([])

  useEffect(() => {
    if (!userId) return
    let isActive = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(`collectibles_owned_${userId}`)
        if (isActive && raw) setOwned(JSON.parse(raw))
      } catch { /* AsyncStorage อ่านล้มเหลว - ปล่อย state ว่างเดิม ไม่ crash หน้า Profile */ }
    })()
    return () => { isActive = false }
  }, [userId])

  const digitalOwned = owned.filter(isDigitalKey)
  const isVerifiedOwner = digitalOwned.length > 0

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>MY COLLECTIBLES</Text>
        {isVerifiedOwner && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText}>Verified Physical Owner</Text>
          </View>
        )}
      </View>

      {digitalOwned.length === 0 ? (
        <TouchableOpacity
          style={styles.emptyCard}
          onPress={() => router.push('/(home)/collectibles' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.emptyText}>No collectibles yet.</Text>
          <Text style={styles.emptyLink}>Visit Official Collectibles ›</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.grid}>
          {digitalOwned.map(key => (
            <DigitalCollectibleCard key={key} meta={COLLECTIBLE_META[key]} />
          ))}
        </View>
      )}
    </View>
  )
}

function DigitalCollectibleCard({ meta }: { meta: { name: string; icon: string } }) {
  const rotate = useSharedValue(0)

  const handlePress = () => {
    rotate.value = 0
    rotate.value = withTiming(360, { duration: 900, easing: Easing.inOut(Easing.quad) })
  }

  const aStyle = useAnimatedStyle(() => ({
    // Reanimated typing บังคับ transform tuple แบบ discriminated union ต่อ shape - cast เฉพาะจุดนี้
    // (pattern เดียวกับ ShimmerOverlay.tsx / TierUnlockOverlay.tsx)
    transform: [{ perspective: 500 }, { rotateY: `${rotate.value}deg` }] as any,
  }))

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress} style={styles.digiCard}>
      <Animated.View style={aStyle}>
        <Text style={styles.digiIcon}>{meta.icon}</Text>
      </Animated.View>
      <Text style={styles.digiName} numberOfLines={2}>{meta.name}</Text>
      <Text style={styles.digiHint}>Tap to preview</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: C.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  verifiedBadge: {
    borderWidth: 1, borderColor: C.borderHi, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(192,132,252,0.15)',
  },
  verifiedBadgeText: { color: C.purple, fontSize: 9, fontWeight: '800' },

  emptyCard: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    backgroundColor: C.card, padding: 16, alignItems: 'center',
  },
  emptyText: { color: C.textDim, fontSize: 12 },
  emptyLink: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 4 },

  grid: { flexDirection: 'row', gap: 12 },
  digiCard: {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 14,
    backgroundColor: C.card2, paddingVertical: 16, alignItems: 'center',
  },
  digiIcon: { fontSize: 40 },
  digiName: { color: C.textPrimary, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8, paddingHorizontal: 6 },
  digiHint: { color: C.textDim, fontSize: 9, marginTop: 4 },
})
