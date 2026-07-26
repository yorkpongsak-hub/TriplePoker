// app/(home)/player/[userId].tsx
// Player Profile Viewer — เปิดจากการแตะชื่อ/Avatar ใน Top 10 leaderboard (stats.tsx)
// มติลุงเยาะ 2026-07-26: ตอนนี้โชว์แค่สถิติพื้นฐานแบบ plain list ยังไม่จัด layout —
// รอลุงออกแบบหน้าตาจริงทีหลัง ห้ามถือว่า UI นี้เป็นตัวจบ

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ThemedBackground } from '../../../src/components/ui/ThemedBackground'
import { glassPanel, textOnGlass } from '../../../src/ui/glassStyles'
import { AvatarDisplay, PRESET_AVATARS, AvatarConfig } from '../../../src/components/profile/AvatarPicker'
import { useAuthStore } from '../../../src/store/authStore'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const C = {
  gold:        '#FFD76A',
  green:       '#8DFFB5',
  purple:      '#C084FC',
  red:         '#FF6B6B',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  border:      '#2A4A34',
}

// ceiling model เดียวกับ profile.tsx/ShopScreen.tsx — 'D' = ยังไม่เคยปลด Tier ไหนเลย
const TIER_LABEL: Record<string, string> = {
  D: 'Unranked',
  initiate: 'Initiate (C)',
  adept: 'Adept (B)',
  mastermind: 'Mastermind (A)',
  highNoble: 'High Noble (A+)',
}

interface PlayerStats {
  user_id: string
  display_name: string
  avatar_url: string | null
  tier_unlocked_max: string | null
  token_balance: number
  performance_score: number
  games_played: number
  games_won: number
  win_rate: number
}

// เหมือน RowAvatar ใน stats.tsx — avatar_url มีได้ 3 แบบ (preset key / emoji ดิบ / ค่าที่ไม่รู้จัก)
function PlayerAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const isKnownPreset = !!avatarUrl && PRESET_AVATARS.some(p => p.key === avatarUrl)
  if (isKnownPreset) {
    const config: AvatarConfig = { type: 'preset', presetKey: avatarUrl as string, frameKey: 'default' }
    return <AvatarDisplay config={config} size={64} showFrame={false} />
  }
  const isEmojiLike = !!avatarUrl && [...avatarUrl].length <= 3
  return <Text style={s.avatarEmoji}>{isEmojiLike ? avatarUrl : '🐉'}</Text>
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  )
}

export default function PlayerProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  // ThemedBackground ผูกกับ VIP status ของ "ผู้ที่กำลังดูหน้านี้" (viewer) ไม่ใช่ผู้เล่นที่ถูกดู —
  // ตาม pattern เดียวกับ stats.tsx/shop.tsx
  const viewerIsVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')
  const [player, setPlayer] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlayer = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/stats/player/${userId}`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const json = await res.json()
      setPlayer(json.player ?? null)
    } catch (err) {
      console.error('[PlayerProfile] fetch failed:', err)
      setError('Could not load this player. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchPlayer() }, [fetchPlayer])

  return (
    <ThemedBackground isVip={viewerIsVip}>
      <View style={s.root}>

        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backTxt}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>PLAYER PROFILE</Text>
          <View style={{ width: 62 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={s.stateBox}>
              <ActivityIndicator color={C.gold} />
              <Text style={s.stateTxt}>Loading player...</Text>
            </View>
          ) : error || !player ? (
            <View style={s.stateBox}>
              <Text style={s.stateIcon}>⚠️</Text>
              <Text style={[s.stateTxt, { color: C.red }]}>{error ?? 'Player not found.'}</Text>
            </View>
          ) : (
            <>
              <View style={s.identityCard}>
                <PlayerAvatar avatarUrl={player.avatar_url} />
                <Text style={s.displayName}>{player.display_name}</Text>
                <Text style={s.tierLabel}>{TIER_LABEL[player.tier_unlocked_max ?? 'D'] ?? 'Unranked'}</Text>
              </View>

              {/* Plain stat list — layout จริงรอลุงออกแบบทีหลัง */}
              <View style={s.statsCard}>
                <StatRow label="Games Played" value={player.games_played.toLocaleString('en-US')} />
                <StatRow label="Games Won" value={player.games_won.toLocaleString('en-US')} />
                <StatRow label="Win Rate" value={`${player.win_rate.toFixed(1)}%`} color={C.green} />
                <StatRow label="Token Balance" value={player.token_balance.toLocaleString('en-US')} color={C.gold} />
                <StatRow label="Performance Score" value={player.performance_score.toLocaleString('en-US')} color={C.purple} />
              </View>
            </>
          )}
        </ScrollView>

      </View>
    </ThemedBackground>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
  },
  backBtn: { ...glassPanel, paddingHorizontal: 12, paddingVertical: 8 },
  backTxt: { color: C.gold, fontSize: 13, fontWeight: '800', ...textOnGlass },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 17,
    letterSpacing: 1,
    ...textOnGlass,
  },

  scroll: { paddingHorizontal: 14, paddingBottom: 30 },

  stateBox: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  stateIcon: { fontSize: 28 },
  stateTxt: { color: C.textSec, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  identityCard: { ...glassPanel, alignItems: 'center', padding: 20, marginTop: 10, marginBottom: 14, gap: 6 },
  avatarEmoji: { fontSize: 48 },
  displayName: { color: C.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 6 },
  tierLabel: { color: C.textSec, fontSize: 11, letterSpacing: 0.5 },

  statsCard: { ...glassPanel, padding: 6 },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  statLabel: { color: C.textDim, fontSize: 12, fontWeight: '700' },
  statValue: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.textPrimary, fontSize: 13 },
})
