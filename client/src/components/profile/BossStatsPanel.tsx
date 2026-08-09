import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native'
import { glassPanel } from '../../ui/glassStyles'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
const MONARCH_AVATAR = require('../../../assets/bosses/boss_Monarch_avatar.png')

interface BossStat {
  boss_id: string
  encounters: number
  victories: number
  first_defeated_at: string | null
  last_encountered_at: string
  last_defeated_at: string | null
  best_hand: { label?: string; rank?: string } | null
}

const BOSS_META: Record<string, { name: string; title: string; image: any }> = {
  monarch: { name: 'MONARCH', title: 'THE SOVEREIGN', image: MONARCH_AVATAR },
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function BossStatsPanel({ userId }: { userId: string }) {
  const [bosses, setBosses] = useState<BossStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/stats/player/${userId}/bosses`)
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const json = await res.json()
      setBosses(json.bosses ?? [])
    } catch (err) {
      console.error('[BossStatsPanel] fetch failed:', err)
      setError('Could not load Boss records. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  if (loading) return <View style={s.state}><ActivityIndicator color="#FFD76A" /><Text style={s.dim}>Loading Boss records...</Text></View>
  if (error) return <View style={s.state}><Text style={s.error}>{error}</Text></View>

  const records = new Map(bosses.map(b => [b.boss_id, b]))
  const visibleBossIds = Array.from(new Set(['monarch', ...bosses.map(b => b.boss_id)]))
  const conquered = bosses.filter(b => b.victories > 0).length

  return (
    <View style={s.panel}>
      <View style={s.header}>
        <Text style={s.headerTitle}>HALL OF BOSSES</Text>
        <Text style={s.headerCount}>{conquered} CONQUERED</Text>
      </View>
      {visibleBossIds.map(bossId => {
        const stat = records.get(bossId)
        // มติลุงเยาะ — ห้ามสปอยล์ชื่อ Monarch ก่อนผู้เล่นเคย "เจอ" บอสตัวนี้เองอย่างน้อย 1 ครั้ง (encounters
        // > 0, มี stat แล้ว) — บอสอื่น (Four Gods ฯลฯ) ไม่ใช่บอสลับ โชว์ชื่อจริงได้เสมอไม่ต้องซ่อน
        const hidden = bossId === 'monarch' && !stat
        const meta = hidden
          ? { name: 'HIDDEN BOSS', title: 'UNKNOWN', image: MONARCH_AVATAR }
          : (BOSS_META[bossId] ?? { name: bossId.replace(/_/g, ' ').toUpperCase(), title: 'BOSS', image: MONARCH_AVATAR })
        const defeated = (stat?.victories ?? 0) > 0
        return (
          <View key={bossId} style={[s.card, defeated && s.cardDefeated]}>
            <Image source={meta.image} style={[s.avatar, !stat && s.avatarLocked]} />
            <View style={s.info}>
              <Text style={s.name}>{meta.name}</Text>
              <Text style={s.title}>{meta.title}</Text>
              <Text style={s.date}>{defeated
                ? stat?.first_defeated_at ? `First defeated: ${formatDate(stat.first_defeated_at)}` : 'Defeated before records began'
                : stat ? 'Not defeated yet' : 'Not encountered yet'}</Text>
            </View>
            <View style={s.numbers}>
              <Text style={s.value}>{stat?.victories ?? 0}</Text>
              <Text style={s.label}>VICTORIES</Text>
              <Text style={s.encounters}>{stat?.encounters ?? 0} encounters</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  panel: { ...glassPanel, padding: 10, gap: 10 },
  state: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  dim: { color: '#C8C4B0', fontSize: 12 },
  error: { color: '#FF6B6B', fontSize: 12, textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#FFD76A', fontSize: 14, fontWeight: '900', letterSpacing: 1.4 },
  headerCount: { color: '#C8C4B0', fontSize: 10, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#2A4A34', borderRadius: 12, padding: 10, backgroundColor: 'rgba(8,28,18,0.72)' },
  cardDefeated: { borderColor: '#FFD76A', backgroundColor: 'rgba(255,215,106,0.07)' },
  avatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: '#FFD76A' },
  avatarLocked: { opacity: 0.35 },
  info: { flex: 1, paddingHorizontal: 10, gap: 2 },
  name: { color: '#F5F2E8', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#FFD76A', fontSize: 9, fontWeight: '700' },
  date: { color: '#7A7A6A', fontSize: 9, marginTop: 3 },
  numbers: { alignItems: 'flex-end' },
  value: { color: '#FFD76A', fontSize: 22, fontWeight: '900' },
  label: { color: '#C8C4B0', fontSize: 7, fontWeight: '800', letterSpacing: 0.7 },
  encounters: { color: '#7A7A6A', fontSize: 8, marginTop: 4 },
})
