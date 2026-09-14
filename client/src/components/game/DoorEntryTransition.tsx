import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Card from './Card'
import { getReduceMotion } from '../../utils/reduceMotion'
import { useAuthStore } from '../../store/authStore'
import AvatarFrame from './AvatarFrame'
import { AvatarDisplay, PRESET_AVATARS } from '../profile/AvatarPicker'
import { BADGES } from '../../../assets/badges/BADGE_MANIFEST'

const DOOR_IMAGE = require('../../../assets/images/game_entrance.png')
const APP_LOGO = require('../../../assets/images/triple_poker_icon.png')
const ROYAL_FLUSH = [
  { value: '10', rotate: '-10deg', offsetY: 12 },
  { value: 'j', rotate: '-5deg', offsetY: 5 },
  { value: 'q', rotate: '0deg', offsetY: 0 },
  { value: 'k', rotate: '5deg', offsetY: 5 },
  { value: 'a', rotate: '10deg', offsetY: 12 },
] as const
const ENTRY_MESSAGES = [
  'GOOD LUCK. PLAY YOUR BEST HAND.',
  'TRUST YOUR READ. THE TABLE IS READY.',
  'MAY THE CARDS FALL IN YOUR FAVOR.',
  'STAY SHARP AND ENJOY THE GAME.',
  'ONE GREAT HAND CAN CHANGE EVERYTHING.',
  'PLAY CALM. PLAY BOLD.',
  'YOUR NEXT VICTORY STARTS HERE.',
  'READ THE PILES. MAKE YOUR MOVE.',
  'FORTUNE FAVORS A CLEAR MIND.',
  'HAVE FUN AND AIM FOR THE SWEEP.',
] as const

/**
 * Presentation-only Tier D entry.  The image already includes the Rise emblem,
 * so its two clipped halves carry the emblem apart without rendering a duplicate.
 */
export default function DoorEntryTransition({ onFinish, level }: { onFinish: () => void; level?: number }) {
  const { width, height } = useWindowDimensions()
  const profile = useAuthStore(state => state.profile)
  const door = useRef(new Animated.Value(0)).current
  const royal = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)
  const [started, setStarted] = useState(false)
  const [entryMessage] = useState(() => ENTRY_MESSAGES[Math.floor(Math.random() * ENTRY_MESSAGES.length)])
  const finished = useRef(false)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    onFinish()
  }

  useEffect(() => {
    let active = true
    void getReduceMotion().then(value => { if (active) setReducedMotion(value) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!started) return
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms)
      timers.current.push(timer)
    }
    const openDoors = () => {
      if (reducedMotion) {
        door.setValue(1)
        royal.setValue(1)
        later(finish, 450)
        return
      }
      Animated.timing(door, { toValue: 1, duration: 3000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
      later(() => {
        Animated.sequence([
          Animated.timing(royal, { toValue: 1, duration: 470, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
          Animated.timing(royal, { toValue: 0.92, duration: 150, useNativeDriver: true }),
          Animated.timing(royal, { toValue: 1, duration: 130, useNativeDriver: true }),
        ]).start()
      }, 1950)
      // Door finishes at 3000ms; keep the completed table, level and greeting
      // visible for another 1.5 seconds before leaving the transition.
      later(() => Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(({ finished: done }) => { if (done) finish() }), 4500)
    }
    later(openDoors, reducedMotion ? 80 : 500)
    return () => {
      door.stopAnimation(); royal.stopAnimation(); fade.stopAnimation()
      timers.current.forEach(clearTimeout); timers.current = []
    }
  }, [door, fade, reducedMotion, royal, started])

  const halfWidth = width / 2
  const doorStyle = { width, height }
  const leftTranslate = door.interpolate({ inputRange: [0, 1], outputRange: [0, -halfWidth] })
  const rightTranslate = door.interpolate({ inputRange: [0, 1], outputRange: [0, halfWidth] })
  const royalStyle = {
    opacity: royal,
    transform: [
      { translateY: royal.interpolate({ inputRange: [0, 1], outputRange: [24, -8] }) },
      { scale: royal.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.85, 1.05, 1] }) },
    ],
  }
  const entryCopyOpacity = door.interpolate({ inputRange: [0, 0.82, 1], outputRange: [0, 0, 1] })
  const avatarValue = profile?.profile_image_signed_url || profile?.avatar_url || null
  const avatarPreset = avatarValue ? PRESET_AVATARS.find(item => item.key === avatarValue) : undefined
  const equippedBadge = profile?.equipped_badge_key ? (BADGES as Record<string, number>)[profile.equipped_badge_key] : undefined
  const avatar = avatarValue && /^(https?:|data:)/i.test(avatarValue)
    ? <Image source={{ uri: avatarValue }} style={styles.profilePhoto}/>
    : avatarPreset
      ? <AvatarDisplay config={{ type: 'preset', presetKey: avatarPreset.key, frameKey: profile?.vip_status !== 'none' ? 'gold' : 'default' }} size={56} showFrame={false}/>
      : <View style={styles.profileInitial}><Text style={styles.profileInitialText}>{profile?.display_name?.slice(0,1).toUpperCase() ?? '?'}</Text></View>

  return <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="auto">
    <View style={styles.casino}><View style={styles.tableGlow}/></View>
    {!started ? <>
      <View style={styles.playerCard}>
        <View style={styles.honorAvatar}>{equippedBadge ? <Image source={equippedBadge} resizeMode="contain" style={styles.equippedBadge}/> : null}<AvatarFrame size={56} active={false}>{avatar}</AvatarFrame></View>
        <View style={styles.playerIdentity}><Text numberOfLines={1} style={styles.playerName}>{profile?.display_name ?? 'PLAYER'}</Text><Text style={styles.honorLabel}>{profile?.equipped_badge_key ? profile.equipped_badge_key.replaceAll('_',' ').toUpperCase() : 'HONOR FRAME'}</Text></View>
      </View>
      <View style={styles.personalBestBoard}>
        <Text style={styles.personalBestTitle}>PERSONAL BEST</Text>
        <StatRow label="FASTEST TIME" value={formatTime(profile?.tier_d_best_match_time_ms)}/>
        <StatRow label="LONGEST STREAK" value={String(profile?.tier_d_best_win_streak ?? 0)}/>
        <StatRow label="BEST MATCH SCORE" value={String(profile?.tier_d_best_match_score ?? 0)}/>
      </View>
      <View style={styles.readyArea}><Text style={styles.readyLevel}>{level ? `LEVEL ${level}` : 'NEXT LEVEL'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next Level" style={styles.nextLevelButton} onPress={() => setStarted(true)}><Text style={styles.nextLevelText}>NEXT LEVEL</Text></Pressable></View>
    </> : null}
    <Animated.View pointerEvents="none" style={[styles.brand, { opacity: entryCopyOpacity }]}>
      <Image source={APP_LOGO} resizeMode="contain" style={styles.appLogo}/>
      <Text style={styles.appName}>TriplePoker : Rise</Text>
    </Animated.View>
    <Animated.View style={[styles.royal, royalStyle]} pointerEvents="none">
      <View style={styles.royalGlow}/>
      {ROYAL_FLUSH.map((card, index) => <View key={card.value} style={[styles.card, { marginLeft: index ? -19 : 0, transform: [{ rotate: card.rotate }, { translateY: card.offsetY }] }]}>
        <Card variant="face" suit="spade" value={card.value as '10' | 'j' | 'q' | 'k' | 'a'} width={58} height={84}/>
      </View>)}
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.entryCopy, { opacity: entryCopyOpacity }]}>
      <Text style={styles.entryLevel}>{level ? `LEVEL ${level}` : 'NEXT LEVEL'}</Text>
      <Text style={styles.entryMessage}>{entryMessage}</Text>
    </Animated.View>
    <Animated.View style={[styles.half, { width: halfWidth, transform: [{ translateX: leftTranslate }] }]}>
      <Image source={DOOR_IMAGE} resizeMode="cover" style={[styles.doorImage, doorStyle]} onError={finish}/>
    </Animated.View>
    <Animated.View style={[styles.half, { left: halfWidth, width: halfWidth, transform: [{ translateX: rightTranslate }] }]}>
      <Image source={DOOR_IMAGE} resizeMode="cover" style={[styles.doorImage, doorStyle, { left: -halfWidth }]} onError={finish}/>
    </Animated.View>
  </Animated.View>
}

function StatRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.statRow}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>
}

function formatTime(milliseconds?: number | null) {
  if (!milliseconds || milliseconds <= 0) return '—'
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 1000, overflow: 'hidden', backgroundColor: '#030705' },
  casino: { ...StyleSheet.absoluteFill, backgroundColor: '#07150d', alignItems: 'center', justifyContent: 'center' },
  tableGlow: { width: '128%', height: '64%', borderRadius: 999, backgroundColor: '#0d5634', borderWidth: 7, borderColor: '#b9872f', shadowColor: '#e7bf58', shadowOpacity: 0.34, shadowRadius: 34, elevation: 10 },
  half: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  doorImage: { position: 'absolute', top: 0 },
  royal: { position: 'absolute', top: '40%', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 3 },
  brand: { position: 'absolute', top: '8%', left: 24, right: 24, alignItems: 'center', zIndex: 4 },
  appLogo: { width: 99, height: 99, borderRadius: 22 },
  appName: { marginTop: 30, color: '#fff1bb', fontSize: 23, fontWeight: '900', letterSpacing: 1.1, textShadowColor: '#6f4200', textShadowRadius: 11 },
  playerCard: { position: 'absolute', top: '6%', left: 14, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '48%' },
  honorAvatar: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  equippedBadge: { position: 'absolute', width: 68, height: 68, opacity: .92 },
  playerIdentity: { gap: 2, maxWidth: 120 },
  playerName: { color: '#fff6d6', fontSize: 13, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
  honorLabel: { color: '#ffd76a', fontSize: 8, fontWeight: '900', letterSpacing: .6 },
  profilePhoto: { width: 56, height: 56, borderRadius: 28 },
  profileInitial: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#183526', borderWidth: 1, borderColor: '#ffd76a' },
  profileInitialText: { color: '#fff6d6', fontSize: 23, fontWeight: '900' },
  personalBestBoard: { position: 'absolute', top: '15%', right: 14, zIndex: 20, width: 152, padding: 9, borderRadius: 10, backgroundColor: 'rgba(5,17,11,.88)', borderWidth: 1, borderColor: 'rgba(255,215,106,.7)', gap: 4 },
  personalBestTitle: { color: '#ffd76a', fontSize: 9, fontWeight: '900', letterSpacing: .8, textAlign: 'center', marginBottom: 2 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  statLabel: { color: '#bfd7c5', fontSize: 7, fontWeight: '800' },
  statValue: { color: '#fff2b2', fontSize: 8, fontWeight: '900' },
  readyArea: { position: 'absolute', left: 24, right: 24, bottom: '10%', zIndex: 20, alignItems: 'center', gap: 11 },
  readyLevel: { color: '#fff1bb', fontSize: 21, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7b4700', textShadowRadius: 11 },
  nextLevelButton: { minWidth: 200, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 10, backgroundColor: '#ffd76a', borderWidth: 1.5, borderColor: '#fff4bc', shadowColor: '#ffd76a', shadowOpacity: .7, shadowRadius: 12, elevation: 9 },
  nextLevelText: { color: '#17311f', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  entryCopy: { position: 'absolute', top: '59%', left: 24, right: 24, alignItems: 'center', zIndex: 4 },
  entryLevel: { color: '#fff1bb', fontSize: 24, fontWeight: '900', letterSpacing: 2.1, textShadowColor: '#7b4700', textShadowRadius: 12 },
  entryMessage: { marginTop: 8, color: '#e5d4a0', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 7 },
  royalGlow: { position: 'absolute', width: 280, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,213,102,.22)', shadowColor: '#ffe4a0', shadowOpacity: 0.95, shadowRadius: 28, elevation: 12 },
  card: { shadowColor: '#ffe6a3', shadowOpacity: 0.72, shadowRadius: 10, elevation: 12 },
})
