/**
 * select.tsx — Mastermind Conquest: The Nine Sentinels Boss Selection
 * Grid 9 บอส + Conquest progress + ✕💀 overlay ถาวรถ้าพิชิตแล้ว (เล่นซ้ำได้เพื่อฟาร์ม token)
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useState } from 'react'
import {
  Image, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../../../src/services/supabaseService'
import { useUserStore } from '../../../src/store/userStore'

// ── Nine Sentinels data (id ตรงกับชื่อไฟล์ asset boss_[id].png)
interface SentinelData { id: string; name: string; concept: string }

const NINE_SENTINELS: SentinelData[] = [
  { id: 'iron_wall',   name: 'Iron Wall',   concept: 'The Unbreakable Defender' },
  { id: 'chivalry',    name: 'Chivalry',    concept: 'The Noble Duelist' },
  { id: 'war_lord',    name: 'War Lord',    concept: 'The Relentless Conqueror' },
  { id: 'phantom',     name: 'Phantom',     concept: 'The Deceptive Illusionist' },
  { id: 'dark_shark',  name: 'Dark Shark',  concept: 'The Ruthless Predator' },
  { id: 'oracle',      name: 'Oracle',      concept: 'The Calculating Seer' },
  { id: 'jester',      name: 'Jester',      concept: 'The Unpredictable Trickster' },
  { id: 'phoenix',     name: 'Phoenix',     concept: 'The Eternal Reborn' },
  { id: 'black_magic', name: 'Black Magic', concept: 'The Fate Manipulator' },
]

const SENTINEL_PORTRAIT: Record<string, any> = {
  iron_wall:   require('../../../assets/sentinels/boss_iron_wall.png'),
  chivalry:    require('../../../assets/sentinels/boss_chivalry.png'),
  war_lord:    require('../../../assets/sentinels/boss_war_lord.png'),
  phantom:     require('../../../assets/sentinels/boss_phantom.png'),
  dark_shark:  require('../../../assets/sentinels/boss_dark_shark.png'),
  oracle:      require('../../../assets/sentinels/boss_oracle.png'),
  jester:      require('../../../assets/sentinels/boss_jester.png'),
  phoenix:     require('../../../assets/sentinels/boss_phoenix.png'),
  black_magic: require('../../../assets/sentinels/boss_black_magic.png'),
}

const MastermindSelect: React.FC = () => {
  const insets = useSafeAreaInsets()
  const userId = useUserStore(s => s.userId)
  const [conquered, setConquered] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadConquered = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('conquered_sentinels')
          .eq('user_id', userId)
          .single()
        // Patch: ถ้า migration 005_nine_sentinels.sql ยังไม่ได้รันบน Supabase คอลัมน์นี้จะยังไม่มี
        // — กันพัง ด้วยการ fallback เป็น [] เงียบๆ แทนการ throw
        if (!error && data?.conquered_sentinels) {
          setConquered(data.conquered_sentinels as string[])
        }
      } catch {
        setConquered([])
      } finally {
        setLoading(false)
      }
    }
    if (userId) loadConquered()
    else setLoading(false)
  }, [userId])

  const handleSelect = (bossId: string) => {
    router.push({ pathname: '/game/mastermind/story', params: { bossId } })
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.push('/lobby')}>
          <Text style={s.backTxt}>‹ Lobby</Text>
        </TouchableOpacity>
        <Text style={s.title}>THE NINE SENTINELS</Text>
        <Text style={s.progressTxt}>{conquered.length} / 9 Conquered</Text>
      </View>

      <ScrollView contentContainerStyle={s.scrollBody}>
        <Text style={s.subtitle}>Choose your challenger. Win Rank #1 across 5 rounds to conquer them.</Text>

        <View style={s.grid}>
          {NINE_SENTINELS.map(boss => {
            const isConquered = conquered.includes(boss.id)
            return (
              <TouchableOpacity
                key={boss.id}
                style={s.card}
                activeOpacity={0.8}
                onPress={() => handleSelect(boss.id)}
              >
                <View style={s.portraitWrap}>
                  <Image source={SENTINEL_PORTRAIT[boss.id]} style={s.portrait} resizeMode="cover" />
                  {isConquered && (
                    <View style={s.conquestOverlay}>
                      <Text style={s.conquestIcon}>✕💀</Text>
                    </View>
                  )}
                </View>
                <Text style={s.bossName} numberOfLines={1}>{boss.name}</Text>
                <Text style={s.bossConcept} numberOfLines={2}>{boss.concept}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {!loading && conquered.length === 9 && (
          <View style={s.allConqueredBanner}>
            <Text style={s.allConqueredTxt}>ALL SENTINELS CONQUERED — THE PATH TO HIGH NOBLE IS OPEN</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: '#0F2418' },
  header:   { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#2A4A34' },
  backTxt:  { color: '#8DFFB5', fontSize: 14, marginBottom: 8 },
  title:    { color: '#FFD76A', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  progressTxt: { color: '#C8C4B0', fontSize: 12, marginTop: 4 },

  scrollBody: { padding: 16, paddingBottom: 40 },
  subtitle:   { color: '#7A7A6A', fontSize: 12, marginBottom: 16, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, // Patch: gap+space-between ซ้อนกันทำให้แถวล้น ตกเป็น 2 คอลัมน์ — คุมระยะแนวตั้งด้วย marginBottom ของ card แทน
  card: {
    width: '31%', marginBottom: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#2A4A34',
    backgroundColor: '#163A25', overflow: 'hidden', paddingBottom: 8,
  },
  portraitWrap: { width: '100%', height: 120, position: 'relative' },
  portrait:     { width: '100%', height: '100%' },
  conquestOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center',
  },
  conquestIcon: { fontSize: 22 },

  bossName:    { color: '#F5F2E8', fontSize: 11, fontWeight: '700', marginTop: 6, paddingHorizontal: 6 },
  bossConcept: { color: '#C8C4B0', fontSize: 8, marginTop: 2, paddingHorizontal: 6 },

  allConqueredBanner: {
    marginTop: 20, padding: 14, borderRadius: 10, backgroundColor: 'rgba(255,215,106,0.12)',
    borderWidth: 1, borderColor: '#FFD76A',
  },
  allConqueredTxt: { color: '#FFD76A', fontSize: 12, fontWeight: '700', textAlign: 'center' },
})

export default MastermindSelect
