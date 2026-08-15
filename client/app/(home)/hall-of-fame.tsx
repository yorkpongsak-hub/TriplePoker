// app/(home)/hall-of-fame.tsx
// Elites Ranking แสดงผลจัดอันดับ All Matrix พร้อมอันดับและคะแนนดิบที่ใช้คำนวณ

import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AvatarDisplay, AvatarConfig, PRESET_AVATARS } from '../../src/components/profile/AvatarPicker'
import { glassPanel, glassPanelDense, textOnGlass } from '../../src/ui/glassStyles'
import { useBgm } from '../../src/services/bgmService'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const C = {
  gold: '#FFD76A', silver: '#C8C4B0', bronze: '#CD7F32', purple: '#C084FC',
  green: '#8DFFB5', blue: '#60A5FA', red: '#FF6B6B', border: '#2A4A34',
  textPrimary: '#F5F2E8', textSec: '#C8C4B0', textDim: '#7A7A6A',
}

type MetricType = 'ps' | 'winrate' | 'boss_defeats' | 'xp' | 'token'

interface MetricDetail { rank: number; value: number }
interface HallOfFameEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  value: number
  metrics?: Partial<Record<MetricType, MetricDetail>>
}

const METRICS: { key: MetricType; label: string; color: string }[] = [
  { key: 'ps', label: 'PS', color: C.purple },
  { key: 'winrate', label: 'WIN RATE', color: C.green },
  { key: 'boss_defeats', label: 'BOSS', color: C.red },
  { key: 'xp', label: 'XP', color: C.blue },
  { key: 'token', label: 'TOKEN', color: C.gold },
]

function formatMetric(key: MetricType, value: number): string {
  return key === 'winrate' ? `${value.toFixed(1)}%` : value.toLocaleString('en-US')
}

function RowAvatar({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl && PRESET_AVATARS.some(p => p.key === avatarUrl)) {
    const config: AvatarConfig = { type: 'preset', presetKey: avatarUrl, frameKey: 'default' }
    return <View style={s.avatar}><AvatarDisplay config={config} size={34} showFrame={false} /></View>
  }
  const isEmoji = !!avatarUrl && [...avatarUrl].length <= 3
  return <Text style={s.avatarEmoji}>{isEmoji ? avatarUrl : '🐉'}</Text>
}

function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? C.gold : rank === 2 ? C.silver : rank === 3 ? C.bronze : C.textSec
  return (
    <View style={[s.rankBadge, { borderColor: color, backgroundColor: `${color}18` }]}>
      <Text style={[s.rankText, { color }]}>#{rank}</Text>
    </View>
  )
}

function HallRow({ entry }: { entry: HallOfFameEntry }) {
  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.75}
      onPress={() => router.push(`/(home)/player/${entry.user_id}`)}
    >
      <View style={s.playerLine}>
        <RankBadge rank={entry.rank} />
        <RowAvatar avatarUrl={entry.avatar_url} />
        <View style={s.nameWrap}>
          <Text style={s.playerName} numberOfLines={1}>{entry.display_name}</Text>
          <Text style={s.matrixLabel}>ALL MATRIX</Text>
        </View>
        <View style={s.totalWrap}>
          <Text style={s.totalValue}>{entry.value.toLocaleString('en-US')}</Text>
          <Text style={s.totalLabel}>PTS</Text>
        </View>
      </View>

      <View style={s.metricsGrid}>
        {METRICS.map(metric => {
          const detail = entry.metrics?.[metric.key]
          return (
            <View key={metric.key} style={s.metricCell}>
              <Text style={[s.metricLabel, { color: metric.color }]}>{metric.label}</Text>
              <Text style={s.metricRank}>{detail ? `#${detail.rank}` : '—'}</Text>
              <Text style={s.metricValue}>{detail ? formatMetric(metric.key, detail.value) : 'OUTSIDE TOP 10'}</Text>
            </View>
          )
        })}
      </View>
    </TouchableOpacity>
  )
}

export default function HallOfFameScreen() {
  useBgm()
  const [entries, setEntries] = useState<HallOfFameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${SERVER_URL}/stats/leaderboard?type=all_matrix`)
      if (!response.ok) throw new Error(`Server responded ${response.status}`)
      const data = await response.json()
      setEntries(data.entries ?? [])
    } catch (err) {
      console.error('[HallOfFame] load failed:', err)
      setError('Could not load Elites. Pull down to try again.')
      setEntries([])
    } finally {
      refresh ? setRefreshing(false) : setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    // มติลุงเยาะ 2026-08-15 — หน้านี้คือหน้าคัดตัวแทนไปสู้ The Last Boss ต้องโดดเด่นกว่าหน้าอื่น
    // เลยไม่ใช้ ThemedBackground (bg_main_free/vip.png ที่ทุกหน้าใช้ร่วมกัน) แต่ใช้ gradient แดงเข้ม-ดำ
    // ของตัวเองแทน (ยังไม่มี asset ภาพพื้นหลังเฉพาะหน้านี้จริง — ใช้สีแทนตามที่ขอ "เปลี่ยนสีพื้นหลัง")
    <LinearGradient colors={['#2A0808', '#170303', '#0A0202']} style={s.fill}>
      <SafeAreaView style={s.safeArea} edges={['top']}>
      <View style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Text style={s.backText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={s.titleWrap}>
            <Text style={s.title}>ELITES RANKING</Text>
            <Text style={s.subtitle}>THE ALL MATRIX LEGENDS</Text>
          </View>
          <View style={s.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.gold} colors={[C.gold]} />}
        >
          <View style={s.introCard}>
            <Text style={s.introTitle}>TOP 10 ASCENDANTS</Text>
            <Text style={s.introText}>Combined ranking from Performance Score, Win Rate, Boss Defeats, Player XP and Token.</Text>
          </View>

          {loading ? (
            <View style={s.stateBox}><ActivityIndicator color={C.gold} /><Text style={s.stateText}>Loading Elites...</Text></View>
          ) : error ? (
            <View style={s.stateBox}><Text style={[s.stateText, { color: C.red }]}>{error}</Text></View>
          ) : entries.length === 0 ? (
            <View style={s.stateBox}><Text style={s.stateText}>No Elites data yet.</Text></View>
          ) : entries.map(entry => <HallRow key={entry.user_id} entry={entry} />)}

          <Text style={s.hint}>Tap a player to view their profile</Text>
        </ScrollView>
      </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  backBtn: { ...glassPanel, width: 90, paddingVertical: 9, alignItems: 'center' },
  backText: { color: C.gold, fontSize: 15, fontWeight: '800', ...textOnGlass },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { color: C.gold, fontFamily: 'Cinzel_700Bold', fontSize: 24, letterSpacing: 1.2, ...textOnGlass },
  subtitle: { color: C.silver, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, marginTop: 3 },
  headerSpacer: { width: 90 },
  scroll: { paddingHorizontal: 14, paddingBottom: 32, gap: 10 },
  introCard: { ...glassPanelDense, padding: 12, alignItems: 'center', marginBottom: 2 },
  introTitle: { color: C.gold, fontFamily: 'Cinzel_700Bold', fontSize: 16, letterSpacing: 1 },
  introText: { color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 4 },
  row: { ...glassPanel, padding: 10 },
  playerLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankBadge: { width: 48, height: 36, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 15 },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { width: 34, fontSize: 25, textAlign: 'center' },
  nameWrap: { flex: 1 },
  playerName: { color: C.textPrimary, fontSize: 17, fontWeight: '800' },
  matrixLabel: { color: C.textDim, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  totalWrap: { alignItems: 'flex-end' },
  totalValue: { color: C.gold, fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 19 },
  totalLabel: { color: C.textDim, fontSize: 11, fontWeight: '900' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.border },
  metricCell: { width: '31.5%', minWidth: 92, backgroundColor: 'rgba(0,0,0,0.16)', borderRadius: 8, padding: 7 },
  metricLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  metricRank: { color: C.textPrimary, fontFamily: 'JetBrainsMono_600SemiBold', fontSize: 15, marginTop: 2 },
  metricValue: { color: C.textSec, fontSize: 11, marginTop: 1 },
  stateBox: { ...glassPanel, alignItems: 'center', paddingVertical: 42, gap: 9 },
  stateText: { color: C.textSec, fontSize: 15, textAlign: 'center', paddingHorizontal: 20 },
  hint: { color: C.textDim, fontSize: 13, textAlign: 'center', marginTop: 5 },
})
