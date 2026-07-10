/**
 * story.tsx — Mastermind Conquest: Sentinel Intro/Story Screen
 * หน้าคั่นก่อนเข้าเกม แสดง portrait เต็มตัว + motto ของ Sentinel ที่เลือก
 * The Sage Unicorn Studio Co., Ltd.
 */

import React from 'react'
import { Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'

interface SentinelStory { name: string; motto: string }

// Patch: Chivalry / War Lord ยังไม่มี motto จาก MasterPlan — ใส่ placeholder รอลุงเยาะเติมทีหลัง (ดู CLAUDE.md pending)
const SENTINEL_STORY: Record<string, SentinelStory> = {
  iron_wall:   { name: 'Iron Wall',   motto: 'No one breaks my defense.' },
  chivalry:    { name: 'Chivalry',    motto: 'Motto coming soon.' },
  war_lord:    { name: 'War Lord',    motto: 'Motto coming soon.' },
  phantom:     { name: 'Phantom',     motto: 'Truth is only what you choose to see.' },
  dark_shark:  { name: 'Dark Shark',  motto: 'Every bet, I set the price.' },
  oracle:      { name: 'Oracle',      motto: 'Probability never lies.' },
  jester:      { name: 'Jester',      motto: "Let's make this fun." },
  phoenix:     { name: 'Phoenix',     motto: 'Every defeat begins a new battle.' },
  black_magic: { name: 'Black Magic', motto: 'Destiny bends to my will.' },
}

const SENTINEL_PORTRAIT: Record<string, any> = {
  iron_wall:   require('../../../assets/bosses/boss_iron_wall.png'),
  chivalry:    require('../../../assets/bosses/boss_chivalry.png'),
  war_lord:    require('../../../assets/bosses/boss_war_lord.png'),
  phantom:     require('../../../assets/bosses/boss_phantom.png'),
  dark_shark:  require('../../../assets/bosses/boss_dark_shark.png'),
  oracle:      require('../../../assets/bosses/boss_oracle.png'),
  jester:      require('../../../assets/bosses/boss_jester.png'),
  phoenix:     require('../../../assets/bosses/boss_phoenix.png'),
  black_magic: require('../../../assets/bosses/boss_black_magic.png'),
}

const MastermindStory: React.FC = () => {
  const insets = useSafeAreaInsets()
  const { bossId } = useLocalSearchParams<{ bossId?: string }>()
  const story = (bossId && SENTINEL_STORY[bossId]) || SENTINEL_STORY.iron_wall
  const portrait = (bossId && SENTINEL_PORTRAIT[bossId]) || SENTINEL_PORTRAIT.iron_wall

  const handleEnter = () => {
    router.push({ pathname: '/game/mastermind', params: { bossId: bossId ?? 'iron_wall' } })
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Text style={s.backTxt}>‹ Back</Text>
      </TouchableOpacity>

      <View style={s.portraitWrap}>
        <Image source={portrait} style={s.portrait} resizeMode="contain" />
      </View>

      <View style={s.infoBox}>
        <Text style={s.name}>{story.name}</Text>
        <Text style={s.motto}>"{story.motto}"</Text>
      </View>

      <TouchableOpacity style={s.enterBtn} onPress={handleEnter}>
        <Text style={s.enterTxt}>ENTER THE DUEL</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F2418', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 32 },
  backBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingTop: 8 },
  backTxt: { color: '#8DFFB5', fontSize: 14 },

  portraitWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  portrait: { width: '85%', height: '90%' },

  infoBox: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 },
  name:    { color: '#FFD76A', fontSize: 26, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
  motto:   { color: '#F5F2E8', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  enterBtn: { backgroundColor: '#FFD76A', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 48 },
  enterTxt: { color: '#0F2418', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
})

export default MastermindStory
