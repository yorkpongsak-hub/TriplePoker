// MatchHistoryList.tsx — ประวัติชนะอันดับ 1 ล่าสุด 20 รายการ (มติลุงเยาะ 2026-07-26)
// ไฟล์กลาง ใช้ร่วมทั้งหน้า Player Profile Viewer (player/[userId].tsx) และแท็บ HISTORY
// ของหน้า Profile ตัวเอง (profile.tsx) — ดึงจาก GET /stats/player/:userId/history ตัวเดียวกัน
// The Sage Unicorn Studio Co., Ltd.

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { glassPanel } from '../../ui/glassStyles'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

const C = {
  gold:     '#FFD76A',
  textPrimary: '#F5F2E8',
  textSec:  '#C8C4B0',
  textDim:  '#7A7A6A',
  red:      '#FF6B6B',
  border:   '#2A4A34',
}

// ceiling model เดียวกับ profile.tsx/ShopScreen.tsx/player/[userId].tsx
const TIER_LABEL: Record<string, string> = {
  initiate: 'Initiate (C)',
  adept: 'Adept (B)',
  mastermind: 'Mastermind (A)',
  highNoble: 'High Noble (A+)',
}

interface MatchWinOpponent {
  name: string
  isHuman: boolean
}

interface BestHandInfo {
  label: string
}

interface MatchWinEntry {
  tier: string
  mode: 'solo' | 'multiplayer'
  won_at: string
  tokens_won: number
  is_triple_sweep: boolean
  best_hand: BestHandInfo | null
  opponents: MatchWinOpponent[]
}

function HistoryRow({ entry }: { entry: MatchWinEntry }) {
  const date = new Date(entry.won_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  const opponentNames = entry.opponents.map(o => o.name).join(', ')
  return (
    <View style={s.row}>
      <View style={s.topLine}>
        <Text style={s.tier}>{TIER_LABEL[entry.tier] ?? entry.tier}</Text>
        <Text style={s.tokens}>+{entry.tokens_won.toLocaleString('en-US')} 🪙</Text>
      </View>
      <Text style={s.date}>{date} · {entry.mode === 'solo' ? 'Solo' : 'Multiplayer'}</Text>
      {opponentNames.length > 0 && (
        <Text style={s.opponents} numberOfLines={1}>Beat: {opponentNames}</Text>
      )}
      <View style={s.tagRow}>
        {entry.is_triple_sweep && (
          <View style={s.tag}><Text style={s.tagTxt}>🔥 Triple Sweep</Text></View>
        )}
        {entry.best_hand && (
          <View style={s.tag}><Text style={s.tagTxt}>🃏 {entry.best_hand.label}</Text></View>
        )}
      </View>
    </View>
  )
}

export default function MatchHistoryList({ userId }: { userId: string }) {
  const [history, setHistory] = useState<MatchWinEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/stats/player/${userId}/history`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const json = await res.json()
      setHistory(json.history ?? [])
    } catch (err) {
      console.error('[MatchHistoryList] fetch failed:', err)
      setError('Could not load match history. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  if (loading) {
    return (
      <View style={s.stateBox}>
        <ActivityIndicator color={C.gold} />
        <Text style={s.stateTxt}>Loading match history...</Text>
      </View>
    )
  }
  if (error) {
    return (
      <View style={s.stateBox}>
        <Text style={[s.stateTxt, { color: C.red }]}>{error}</Text>
      </View>
    )
  }
  if (history.length === 0) {
    return (
      <View style={s.stateBox}>
        <Text style={s.stateTxt}>No wins recorded yet.</Text>
      </View>
    )
  }
  return (
    <View style={s.card}>
      {history.map((entry, i) => <HistoryRow key={i} entry={entry} />)}
    </View>
  )
}

const s = StyleSheet.create({
  card: { ...glassPanel, padding: 6 },
  stateBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  stateTxt: { color: C.textSec, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  row: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 3,
  },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tier: { color: C.textPrimary, fontSize: 13, fontWeight: '800' },
  tokens: { fontFamily: 'JetBrainsMono_600SemiBold', color: C.gold, fontSize: 12 },
  date: { color: C.textDim, fontSize: 10 },
  opponents: { color: C.textSec, fontSize: 11 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  tag: { backgroundColor: 'rgba(255,215,106,0.10)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt: { color: C.gold, fontSize: 9, fontWeight: '700' },
})
