// app/(home)/stats.tsx
// Player Stats — Leaderboard (Token / Performance Score / Win Rate)
// UI theme เดียวกับ profile.tsx: ThemedBackground + glassStyles
// The Sage Unicorn Studio Co., Ltd.

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanel, glassPanelDense, textOnGlass } from '../../src/ui/glassStyles'
import { useAuthStore } from '../../src/store/authStore'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

// ─── ธีมสีหลัก (Website Theme Spec v1.0 — เหมือน profile.tsx) ─────────────
const C = {
  bg:          '#0F2418',
  header:      '#163A25',
  card:        '#1C4830',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  purple:      '#C084FC',
  red:         '#FF6B6B',
  silver:      '#C8C4B0',
  bronze:      '#CD7F32',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
}

type LeaderboardType = 'token' | 'ps' | 'winrate'

interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  value: number
}

const TABS: { key: LeaderboardType; label: string; accent: string }[] = [
  { key: 'token',   label: 'TOKEN',              accent: C.gold },
  { key: 'ps',      label: 'PERFORMANCE SCORE',  accent: C.purple },
  { key: 'winrate', label: 'WIN RATE',           accent: C.green },
]

function formatValue(type: LeaderboardType, value: number): string {
  if (type === 'winrate') return `${value.toFixed(1)}%`
  return value.toLocaleString('en-US')
}

function valueColor(type: LeaderboardType): string {
  if (type === 'ps') return C.purple
  if (type === 'winrate') return C.green
  return C.gold
}

// อันดับ 1-3 = shield badge ทอง/เงิน/ทองแดง — 4-10 ตัวเลขธรรมดา
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

function Row({ entry, type }: { entry: LeaderboardEntry; type: LeaderboardType }) {
  const handlePress = () => {
    // TODO: ยังไม่มีหน้า public profile viewer — เปิดใช้เมื่อสร้างเสร็จ (router.push(`/(home)/player/${entry.user_id}`))
    console.log('View profile — coming soon:', entry.user_id)
  }
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75} style={s.row}>
      <RankBadge rank={entry.rank} />
      <Text style={s.rowAvatar}>{entry.avatar_url || '🐉'}</Text>
      <Text style={s.rowName} numberOfLines={1}>{entry.display_name}</Text>
      <Text style={[s.rowValue, { color: valueColor(type) }]} numberOfLines={1}>
        {formatValue(type, entry.value)}
      </Text>
    </TouchableOpacity>
  )
}

export default function StatsScreen() {
  const profile = useAuthStore(s => s.profile)
  const isVip = (profile?.vip_status ?? 'none') !== 'none'

  const [activeTab, setActiveTab] = useState<LeaderboardType>('token')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchLeaderboard = useCallback(async (type: LeaderboardType, isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/stats/leaderboard?type=${type}`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const json = await res.json()
      setEntries(json.entries ?? [])
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[Stats] fetchLeaderboard failed:', err)
      setError('Could not load leaderboard. Pull down to try again.')
      setEntries([])
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeaderboard(activeTab)
  }, [activeTab, fetchLeaderboard])

  const handleRefresh = () => fetchLeaderboard(activeTab, true)

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <ThemedBackground isVip={isVip}>
      <View style={s.root}>

        {/* ═══════════════ HEADER ═══════════════ */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backTxt}>‹ Back</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>PLAYER STATS</Text>
            <Text style={s.headerSub}>Last updated: {lastUpdatedLabel}</Text>
          </View>
          {/* spacer เท่าความกว้าง backBtn โดยประมาณ — กัน title เอียงซ้าย */}
          <View style={{ width: 62 }} />
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
                    borderColor: t.accent,
                    backgroundColor: glassPanelDense.backgroundColor,
                    shadowColor: t.accent,
                    shadowOpacity: 0.7,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 0 },
                    elevation: 6, // Android glow — shadowColor เฉยๆ ไม่พอ
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text style={[s.tabTxt, active && { color: t.accent }]} numberOfLines={1}>{t.label}</Text>
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
            {/* Table header */}
            <View style={s.tableHeadRow}>
              <Text style={[s.tableHeadTxt, { width: 44 }]}>RANK</Text>
              <Text style={[s.tableHeadTxt, { flex: 1 }]}>PLAYER</Text>
              <Text style={[s.tableHeadTxt, { width: 80, textAlign: 'right' }]}>VALUE</Text>
            </View>

            {loading ? (
              <View style={s.stateBox}>
                <ActivityIndicator color={C.gold} />
                <Text style={s.stateTxt}>Loading leaderboard...</Text>
              </View>
            ) : error ? (
              <View style={s.stateBox}>
                <Text style={s.stateIcon}>⚠️</Text>
                <Text style={[s.stateTxt, { color: C.red }]}>{error}</Text>
              </View>
            ) : entries.length === 0 ? (
              <View style={s.stateBox}>
                <Text style={s.stateIcon}>📭</Text>
                <Text style={s.stateTxt}>
                  {activeTab === 'winrate'
                    ? 'No players have reached 10 games yet.'
                    : 'No leaderboard data yet.'}
                </Text>
              </View>
            ) : (
              entries.map(entry => (
                <Row key={entry.user_id} entry={entry} type={activeTab} />
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
  backBtn: { ...glassPanel, paddingHorizontal: 12, paddingVertical: 8 },
  backTxt: { color: C.gold, fontSize: 13, fontWeight: '800', ...textOnGlass },
  headerTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 17,
    letterSpacing: 1,
    ...textOnGlass,
  },
  headerSub: { color: C.textSec, fontSize: 10, marginTop: 3, ...textOnGlass },

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

  rowAvatar: { fontSize: 20, width: 26, textAlign: 'center' },
  rowName: { flex: 1, color: C.textPrimary, fontSize: 13, fontWeight: '700' },
  rowValue: {
    width: 80,
    textAlign: 'right',
    fontFamily: 'JetBrainsMono_600SemiBold',
    fontSize: 13,
  },

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
