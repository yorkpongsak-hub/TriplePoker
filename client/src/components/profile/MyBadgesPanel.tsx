// MyBadgesPanel.tsx
// My Badges — โชว์ badge ที่ผู้เล่นซื้อแล้วจาก Badge Shop (Shop > BADGES tab) + แตะเพื่อ equip/ถอด
// วางต่อจาก MyCollectiblesPanel ในหน้า Profile (มติลุงเยาะ 2026-08-15 — "ตำแหน่ง collectible")
//
// equip ได้ทีละ 1 ใบ แตะใบที่ equip อยู่ซ้ำเพื่อถอด — badge ที่ equip แล้วไปโชว์หลัง Hero Avatar
// (ดู profile.tsx's equippedBadgeSource) หลัง POST /badges/equip สำเร็จ เรียก onEquipChanged() ให้
// parent refreshProfile() เอง (equipped_badge_key มาจาก users row โดยตรง ไม่ได้เก็บ state ซ้ำที่นี่)
// The Sage Unicorn Studio Co., Ltd.

import React, { useCallback, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect } from 'expo-router'
import { BADGES } from '../../../assets/badges/BADGE_MANIFEST'

// ขนาด badge ตามราคาที่ซื้อ (มติลุงเยาะ 2026-08-15) — ต่ำกว่า 5,000 = S, 5,000-20,000 = M, แพงกว่า 20,000 = L
function badgeSizePx(price: number): number {
  if (price < 5000) return 40
  if (price <= 20000) return 56
  return 76
}

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const C = {
  card:        '#161320',
  card2:       '#1D1926',
  border:      'rgba(255,215,106,0.35)',
  borderHi:    'rgba(255,215,106,0.65)',
  gold:        '#FFD76A',
  green:       '#8DFFB5',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
}

interface BadgeStatusEntry {
  key: string
  name: string
  category: 'tier' | 'achievement'
  price: number
  hint: string
  unlocked: boolean
  owned: boolean
}

export default function MyBadgesPanel({
  accessToken, equippedBadgeKey, onEquipChanged,
}: {
  accessToken: string | undefined
  equippedBadgeKey: string | null
  onEquipChanged: () => void
}) {
  const [badges, setBadges] = useState<BadgeStatusEntry[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken ?? ''}`,
  }), [accessToken])

  const fetchBadges = useCallback(async () => {
    if (!accessToken) return
    try {
      const res = await fetch(`${SERVER_URL}/badges/status`, { headers: authHeaders() })
      const data = await res.json()
      if (data.success) setBadges(data.badges)
    } catch { /* เงียบ — panel นี้ไม่ critical ต่อการโหลดหน้า Profile */ }
  }, [accessToken, authHeaders])

  // useFocusEffect (ไม่ใช่ useEffect เฉยๆ) — บั๊กที่ลุงเยาะเจอ: ซื้อ badge ในแท็บ Shop แล้วกลับมาหน้า
  // Profile ไม่เห็นอัปเดต เพราะ expo-router เก็บ Profile screen instance เดิมไว้ (ไม่ remount ตอน
  // navigate กลับมา) fetchBadges เดิมยิงแค่ตอน mount ครั้งแรกเท่านั้น ไม่รู้ว่ามีการซื้อใหม่ระหว่างทาง
  // — pattern เดียวกับ profile.tsx's syncProfileVisit ที่ใช้ useFocusEffect อยู่แล้วเพราะปัญหาเดียวกัน
  useFocusEffect(useCallback(() => { fetchBadges() }, [fetchBadges]))

  const handleToggleEquip = async (badgeKey: string) => {
    const nextKey = equippedBadgeKey === badgeKey ? null : badgeKey
    setBusyKey(badgeKey)
    try {
      const res = await fetch(`${SERVER_URL}/badges/equip`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ badgeKey: nextKey }),
      })
      const data = await res.json()
      if (data.success) onEquipChanged()
    } catch { /* no-op — ปุ่มกลับมากดใหม่ได้ */ } finally {
      setBusyKey(null)
    }
  }

  const owned = (badges ?? []).filter(b => b.owned)

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>MY BADGES</Text>
      </View>

      {badges === null ? (
        <ActivityIndicator color={C.gold} style={{ marginVertical: 12 }} />
      ) : owned.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No badges yet.</Text>
          <Text style={styles.emptyLink}>Earn a badge, then buy it in the Shop ›</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {owned.map(b => {
            const equipped = equippedBadgeKey === b.key
            const imgSize = badgeSizePx(b.price)
            return (
              <TouchableOpacity
                key={b.key}
                style={[styles.badgeCard, equipped && styles.badgeCardEquipped]}
                activeOpacity={0.85}
                disabled={busyKey === b.key}
                onPress={() => handleToggleEquip(b.key)}
              >
                <Image
                  source={(BADGES as Record<string, any>)[b.key]}
                  style={[styles.badgeImg, { width: imgSize, height: imgSize }]}
                  contentFit="contain"
                />
                <Text style={styles.badgeName} numberOfLines={1}>{b.name}</Text>
                <Text style={equipped ? styles.equippedTag : styles.equipHint}>
                  {busyKey === b.key ? '...' : equipped ? '✓ EQUIPPED' : 'Tap to equip'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: C.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },

  emptyCard: {
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    backgroundColor: C.card, padding: 16, alignItems: 'center',
  },
  emptyText: { color: C.textDim, fontSize: 12 },
  emptyLink: { color: C.gold, fontSize: 12, fontWeight: '700', marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  badgeCard: {
    width: '30%', minWidth: 96,
    borderWidth: 1, borderColor: C.border, borderRadius: 14,
    backgroundColor: C.card2, paddingVertical: 12, alignItems: 'center',
  },
  badgeCardEquipped: { borderColor: C.green, backgroundColor: 'rgba(141,255,181,0.10)' },
  badgeImg: { marginBottom: 6 }, // ขนาดจริง (S/M/L) กำหนดทับตาม badgeSizePx() ตอน render เสมอ
  badgeName: { color: C.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center', paddingHorizontal: 4 },
  equipHint: { color: C.textDim, fontSize: 9, marginTop: 4 },
  equippedTag: { color: C.green, fontSize: 9, fontWeight: '800', marginTop: 4 },
})
