// app/(home)/top10.tsx
// Top10 Leaderboard — highest single-match token win per Tier (มติลุงเยาะ 2026-08-13)
// UI theme/structure copied from stats.tsx (same ThemedBackground + glassStyles + tab pattern),
// data source is match_wins (per-match history) instead of users' cumulative columns — reachable
// from Profile's repurposed "Top10" button.
// The Sage Unicorn Studio Co., Ltd.

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanel, glassPanelDense, textOnGlass } from '../../src/ui/glassStyles'
import { useAuthStore } from '../../src/store/authStore'
import { AvatarDisplay, PRESET_AVATARS, AvatarConfig } from '../../src/components/profile/AvatarPicker'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

// ─── ธีมสีหลัก (Website Theme Spec v1.0 — เหมือน stats.tsx/profile.tsx) ───
const C = {
  bg:          '#0F2418',
  header:      '#163A25',
  card:        '#1C4830',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  red:         '#FF6B6B',
  silver:      '#C8C4B0',
  bronze:      '#CD7F32',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
}

type Top10Tier = 'initiate' | 'adept' | 'mastermind' | 'highNoble'

interface Top10Entry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  tokens_won: number
  won_at: string
  is_triple_sweep: boolean
  rank_before: number | null
  rank_after: number | null
}

const TABS: { key: Top10Tier; label: string }[] = [
  { key: 'initiate',  label: 'C · INITIATE' },
  { key: 'adept',     label: 'B · ADEPT' },
  { key: 'mastermind', label: 'A · MASTERMIND' },
  { key: 'highNoble', label: 'A+ · HIGH NOBLE' },
]

const isTop10Tier = (value: string | undefined): value is Top10Tier =>
  TABS.some(tab => tab.key === value)

function formatTokens(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toLocaleString('en-US')}`
}

function formatWonAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// อันดับ 1-3 = shield badge ทอง/เงิน/ทองแดง — 4-10 ตัวเลขธรรมดา (เหมือน stats.tsx เป๊ะ)
function RankBadge({ rank }: { rank: number }) {
  if (rank > 3) {
    return (
      <View style={s.rankPlain}>
        <Text style={s.rankPlainTxt}>{rank}</Text>
      </View>
    )
  }
  const color = rank === 1 ? C.gold : rank === 2 ? C.silver : C.bronze
  return (
    <View style={[s.rankShield, { borderColor: color, backgroundColor: `${color}22` }]}>
      <Text style={[s.rankShieldTxt, { color }]}>🛡</Text>
      <Text style={[s.rankShieldNum, { color }]}>{rank}</Text>
    </View>
  )
}

// เหมือน stats.tsx's RowAvatar เป๊ะ — avatar_url มีได้ 3 แบบต้องแยก render (preset key / emoji ดิบ / ไม่รู้จัก)
function RowAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  const isKnownPreset = !!avatarUrl && PRESET_AVATARS.some(p => p.key === avatarUrl)
  if (isKnownPreset) {
    const config: AvatarConfig = { type: 'preset', presetKey: avatarUrl as string, frameKey: 'default' }
    return (
      <View style={s.rowAvatarWrap}>
        <AvatarDisplay config={config} size={26} showFrame={false} />
      </View>
    )
  }
  const isEmojiLike = !!avatarUrl && [...avatarUrl].length <= 3
  return <Text style={s.rowAvatarEmoji}>{isEmojiLike ? avatarUrl : '🐉'}</Text>
}

// โชว์เมื่อแถวนี้เป็นสถิติที่ทำให้อันดับเปลี่ยน (rank_after ไม่ null และต่างจาก rank_before) —
// ค้างอยู่จนกว่าผู้เล่นจะทำสถิติใหม่ที่ดีกว่าอีกครั้ง (ไม่มีกลไก "ดูแล้ว" แยกต่างหาก ตามที่ตกลง
// ว่าจะโชว์บนหน้า Top10 เฉยๆ ไม่ทำ real-time toast)
function RankMoveBadge({ before, after }: { before: number | null; after: number }) {
  if (before === null) {
    return (
      <View style={[s.moveBadge, { borderColor: C.gold, backgroundColor: `${C.gold}22` }]}>
        <Text style={[s.moveBadgeTxt, { color: C.gold }]}>NEW · #{after}</Text>
      </View>
    )
  }
  const improved = after < before
  const color = improved ? C.green : C.red
  const arrow = improved ? '▲' : '▼'
  return (
    <View style={[s.moveBadge, { borderColor: color, backgroundColor: `${color}22` }]}>
      <Text style={[s.moveBadgeTxt, { color }]}>{arrow} #{before} → #{after}</Text>
    </View>
  )
}

function Row({ entry }: { entry: Top10Entry }) {
  const handlePress = () => {
    router.push(`/(home)/player/${entry.user_id}`)
  }
  const showMove = entry.rank_after !== null && entry.rank_after !== entry.rank_before
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75} style={s.row}>
      <RankBadge rank={entry.rank} />
      <RowAvatar avatarUrl={entry.avatar_url} />
      <View style={s.rowNameCol}>
        <Text style={s.rowName} numberOfLines={1}>{entry.display_name}</Text>
        <View style={s.rowSubRow}>
          <Text style={s.rowSub} numberOfLines={1}>{formatWonAt(entry.won_at)}</Text>
          {entry.is_triple_sweep && <Text style={s.sweepTag}>SWEEP</Text>}
        </View>
      </View>
      <View style={s.rowValueCol}>
        <Text style={s.rowValue} numberOfLines={1}>{formatTokens(entry.tokens_won)}</Text>
        {showMove && <RankMoveBadge before={entry.rank_before} after={entry.rank_after as number} />}
      </View>
    </TouchableOpacity>
  )
}

export default function Top10Screen() {
  const params = useLocalSearchParams<{ tier?: string | string[] }>()
  const requestedTier = Array.isArray(params.tier) ? params.tier[0] : params.tier
  const profile = useAuthStore(s => s.profile)
  const isVip = (profile?.vip_status ?? 'none') !== 'none'

  const [activeTab, setActiveTab] = useState<Top10Tier>(() =>
    isTop10Tier(requestedTier) ? requestedTier : 'initiate'
  )
  const [entries, setEntries] = useState<Top10Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTop10 = useCallback(async (tier: Top10Tier, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/stats/top10?tier=${tier}`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const json = await res.json()
      setEntries(json.entries ?? [])
    } catch (err) {
      console.error('[Top10] fetchTop10 failed:', err)
      setError('Could not load Top10. Pull down to try again.')
      setEntries([])
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  // Victory → Watch Ad ส่ง ?tier= ของโต๊ะที่เพิ่งชนะมาให้ หน้านี้ต้องเลือกแท็บนั้นทันที
  // เพื่อให้ผู้เล่นเห็นอันดับของตัวเอง ไม่ตกกลับไปแท็บ Initiate ทุกครั้ง
  useEffect(() => {
    if (isTop10Tier(requestedTier)) setActiveTab(requestedTier)
  }, [requestedTier])

  useEffect(() => {
    fetchTop10(activeTab)
  }, [activeTab, fetchTop10])

  const handleRefresh = () => fetchTop10(activeTab, true)

  return (
    <ThemedBackground isVip={isVip}>
      <View style={s.root}>

        {/* ═══════════════ HEADER ═══════════════ */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.replace('/lobby')} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backTxt}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>TOP 10</Text>
            <Text style={s.headerSub}>Highest single-match token win, per Tier</Text>
          </View>
          <View style={{ width: 82 }} />
        </View>

        {/* ═══════════════ TAB BAR ═══════════════ */}
        <View style={s.tabsRow}>
          {TABS.map(t => {
            const active = activeTab === t.key
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setActiveTab(t.key)}
                style={[
                  s.tabBtn,
                  active && {
                    borderColor: C.gold,
                    backgroundColor: glassPanelDense.backgroundColor,
                    shadowColor: C.gold,
                    shadowOpacity: 0.7,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 6,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[s.tabTxt, active && { color: C.gold }]} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ═══════════════ CONTENT ═══════════════ */}
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.gold} colors={[C.gold]} />
          }
        >
          <View style={s.tableCard}>
            <View style={s.tableHeadRow}>
              <Text style={[s.tableHeadTxt, { width: 44 }]}>RANK</Text>
              <Text style={[s.tableHeadTxt, { flex: 1 }]}>PLAYER</Text>
              <Text style={[s.tableHeadTxt, { width: 100, textAlign: 'right' }]}>TOKENS</Text>
            </View>

            {loading ? (
              <View style={s.stateBox}>
                <ActivityIndicator color={C.gold} />
                <Text style={s.stateTxt}>Loading Top10...</Text>
              </View>
            ) : error ? (
              <View style={s.stateBox}>
                <Text style={s.stateIcon}>⚠️</Text>
                <Text style={[s.stateTxt, { color: C.red }]}>{error}</Text>
              </View>
            ) : entries.length === 0 ? (
              <View style={s.stateBox}>
                <Text style={s.stateIcon}>📭</Text>
                <Text style={s.stateTxt}>No match wins recorded for this Tier yet.</Text>
              </View>
            ) : (
              entries.map(entry => (
                <Row key={entry.user_id} entry={entry} />
              ))
            )}
          </View>

          <Text style={s.footerHint}>Tap a player to view their profile</Text>
        </ScrollView>

      </View>
    </ThemedBackground>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────
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
  backBtn: { ...glassPanel, width: 82, paddingVertical: 8, alignItems: 'center' },
  backTxt: { color: C.gold, fontSize: 13, fontWeight: '800', ...textOnGlass },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 17,
    letterSpacing: 1,
    ...textOnGlass,
  },
  headerSub: { color: C.textSec, fontSize: 10, marginTop: 3, ...textOnGlass, textAlign: 'center' },

  tabsRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 6, marginBottom: 10 },
  tabBtn: {
    flex: 1,
    ...glassPanel,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  tabTxt: { color: C.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 0.3, textAlign: 'center' },

  scroll: { paddingHorizontal: 14, paddingBottom: 30 },

  tableCard: { ...glassPanel, padding: 6 },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableHeadTxt: { color: C.textDim, fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  rankPlain: { width: 44, alignItems: 'center' },
  rankPlainTxt: { color: C.textSec, fontSize: 13, fontWeight: '800' },
  rankShield: {
    width: 44, height: 30, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 1,
  },
  rankShieldTxt: { fontSize: 13 },
  rankShieldNum: { fontSize: 10, fontWeight: '900', marginLeft: -2 },

  rowAvatarWrap: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  rowAvatarEmoji: { fontSize: 20, width: 26, textAlign: 'center' },

  rowNameCol: { flex: 1, minWidth: 0 },
  rowName: { color: C.textPrimary, fontSize: 13, fontWeight: '700' },
  rowSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  rowSub: { color: C.textDim, fontSize: 10 },
  sweepTag: {
    color: C.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.5,
    borderWidth: 1, borderColor: C.gold, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
  },

  rowValueCol: { width: 100, alignItems: 'flex-end' },
  rowValue: {
    color: C.gold,
    textAlign: 'right',
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 13,
  },
  moveBadge: {
    marginTop: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
  },
  moveBadgeTxt: { fontSize: 9, fontWeight: '800' },

  stateBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  stateIcon: { fontSize: 28 },
  stateTxt: { color: C.textSec, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  footerHint: {
    color: C.textDim,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 14,
  },
})
