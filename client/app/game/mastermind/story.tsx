/**
 * story.tsx — Mastermind Conquest: Sentinel Intro/Story Screen
 * หน้าคั่นก่อนเข้าเกม แสดง portrait เต็มตัว + motto ของ Sentinel ที่เลือก
 * Patch 2026-07-18: เพิ่มเอฟเฟกต์ 🅔 = Fade-in Sequence (portrait→ชื่อ→motto) + Golden Glow Pulse รอบรูป
 *   วินัย animation: ทุก value ใน useRef / bind ค้างตลอด (ไม่ conditional-mount) / เก็บ composite
 *   ใน ref + .stop() ตอน unmount — pattern เดียวกับ Adept กัน "Animated node already attached"
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef } from 'react'
import { Animated, Image, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'

interface SentinelStory { name: string; motto: string }

// Patch 2026-07-18: motto ครบทั้ง 9 ตัวแล้ว (Chivalry/War Lord เติมตามมติลุงเยาะ — War Lord ใช้ตาม text ในภาพ art)
const SENTINEL_STORY: Record<string, SentinelStory> = {
  iron_wall:   { name: 'Iron Wall',   motto: 'No one breaks my defense.' },
  chivalry:    { name: 'Chivalry',    motto: 'Honor above all.' },
  war_lord:    { name: 'War Lord',    motto: 'Victory belongs to the fearless.' },
  phantom:     { name: 'Phantom',     motto: 'Truth is only what you choose to see.' },
  dark_shark:  { name: 'Dark Shark',  motto: 'Every bet, I set the price.' },
  oracle:      { name: 'Oracle',      motto: 'Probability never lies.' },
  jester:      { name: 'Jester',      motto: "Let's make this fun." },
  phoenix:     { name: 'Phoenix',     motto: 'Every defeat begins a new battle.' },
  black_magic: { name: 'Black Magic', motto: 'Destiny bends to my will.' },
}

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

const MastermindStory: React.FC = () => {
  const insets = useSafeAreaInsets()
  const { bossId } = useLocalSearchParams<{ bossId?: string }>()
  const story = (bossId && SENTINEL_STORY[bossId]) || SENTINEL_STORY.iron_wall
  const portrait = (bossId && SENTINEL_PORTRAIT[bossId]) || SENTINEL_PORTRAIT.iron_wall

  // ── Animated values (ทุกตัวใน useRef — ไม่สร้างใหม่ตอน re-render) ──
  const portraitFade = useRef(new Animated.Value(0)).current
  const nameFade     = useRef(new Animated.Value(0)).current
  const mottoFade    = useRef(new Animated.Value(0)).current
  const glowPulse    = useRef(new Animated.Value(0.35)).current
  // เก็บ composite ไว้ .stop() ตอน unmount — ห้ามปล่อย loop วิ่งค้างหลังออกจากหน้า
  const introRef = useRef<Animated.CompositeAnimation | null>(null)
  const glowRef  = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    // Fade-in sequence: portrait → ชื่อ → motto ไล่จังหวะกัน
    introRef.current = Animated.parallel([
      Animated.timing(portraitFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(nameFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(mottoFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ])
    introRef.current.start()

    // Golden glow pulse: วนลูปหายใจช้าๆ รอบ portrait
    glowRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.9,  duration: 1200, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.35, duration: 1200, useNativeDriver: true }),
      ])
    )
    glowRef.current.start()

    return () => {
      // cleanup: หยุดทุก animation ตอนออกจากหน้า (กด back / เข้าเกม)
      introRef.current?.stop()
      glowRef.current?.stop()
    }
  }, [])

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
        {/* Glow layer — bind ค้างตลอด อยู่หลัง portrait */}
        <Animated.View style={[s.glowFrame, { opacity: glowPulse }]} pointerEvents="none" />
        <Animated.View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: portraitFade }}>
          <Image source={portrait} style={s.portrait} resizeMode="contain" />
        </Animated.View>
      </View>

      <View style={s.infoBox}>
        <Animated.Text style={[s.name, { opacity: nameFade }]}>{story.name}</Animated.Text>
        <Animated.Text style={[s.motto, { opacity: mottoFade }]}>"{story.motto}"</Animated.Text>
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
  // Patch 2026-07-18: กรอบเรืองแสงทอง — ใช้ border+shadow สีทองธีมหลัก (#FFD76A)
  glowFrame: {
    position: 'absolute',
    width: '88%', height: '92%',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFD76A',
    shadowColor: '#FFD76A',
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },

  infoBox: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 24 },
  name:    { color: '#FFD76A', fontSize: 26, fontWeight: '900', letterSpacing: 1, marginBottom: 10 },
  motto:   { color: '#F5F2E8', fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  enterBtn: { backgroundColor: '#FFD76A', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 48 },
  enterTxt: { color: '#0F2418', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
})

export default MastermindStory
