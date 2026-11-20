import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useAuthStore } from '../../store/authStore'
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
type Award = { league_id: string; award_type: 'medal' | 'trophy'; final_rank: number; final_points: number; league_name: string }
export default function LeagueAwardsPanel() {
  const token = useAuthStore(s => s.session?.access_token); const [awards, setAwards] = useState<Award[]>([])
  useEffect(() => { if (!token) return; fetch(`${SERVER_URL}/tier-d/awards`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { awards: [] }).then(x => setAwards(x.awards ?? [])).catch(() => {}) }, [token])
  const medals = awards.filter(a => a.award_type === 'medal'); const trophies = awards.filter(a => a.award_type === 'trophy')
  return <View style={s.wrap}><Text style={s.title}>LEAGUE MEDALS</Text><Text style={s.items}>{medals.length ? medals.map(a => `◉ ${a.league_name}`).join('  ') : 'No League Medals yet.'}</Text><Text style={s.title}>LEAGUE TROPHIES</Text><Text style={s.items}>{trophies.length ? trophies.map(a => `🏆 #${a.final_rank} ${a.league_name}`).join('  ') : 'No League Trophies yet.'}</Text></View>
}
const s = StyleSheet.create({ wrap: { marginTop: 16, gap: 6 }, title: { color: '#FFD76A', fontWeight: '900', fontSize: 12, letterSpacing: 1 }, items: { color: '#F5F2E8', fontSize: 12, lineHeight: 18 } })
