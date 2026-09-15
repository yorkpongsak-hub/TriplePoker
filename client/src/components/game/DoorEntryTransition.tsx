import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router } from 'expo-router'
import Card from './Card'
import { getReduceMotion } from '../../utils/reduceMotion'
import { useAuthStore } from '../../store/authStore'
import AvatarFrame from './AvatarFrame'
import { AvatarDisplay, PRESET_AVATARS } from '../profile/AvatarPicker'
import { BADGES } from '../../../assets/badges/BADGE_MANIFEST'
import { TierDLeagueLeaderboard } from './TierDLeagueLeaderboard'
import { TierDRecordsBoard } from './TierDRecordsBoard'

const DOOR_IMAGE = require('../../../assets/images/game_entrance.png')
const APP_LOGO = require('../../../assets/images/triple_poker_icon.png')
const TROPHY_SHOWCASE = require('../../../assets/images/trophy_showcase.png')
const LEAGUE_MEDAL = require('../../../assets/images/triplepoker_coin.png')
const ENTRY_ICON_SHEET_1 = require('../../../assets/images/Item_Icon3.png')
const ENTRY_ICON_SHEET_2 = require('../../../assets/images/Item_Icon4.png')
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
type LeagueAward = { league_id: string; award_type: 'medal' | 'trophy' }
type TrophyLeague = { id: string; trophy: ImageSourcePropType }
const TROPHY_LEAGUES: TrophyLeague[] = [
  { id: 'bronze', trophy: require('../../../assets/league/Bronze League Trophy.png') },
  { id: 'silver', trophy: require('../../../assets/league/Silver League Trophy.png') },
  { id: 'gold', trophy: require('../../../assets/league/Gold League Trophy.png') },
  { id: 'platinum', trophy: require('../../../assets/league/Platinum League Trophy.png') },
  { id: 'diamond', trophy: require('../../../assets/league/Diamond League Trophy.png') },
  { id: 'elite', trophy: require('../../../assets/league/Elite League Trophy.png') },
  { id: 'master', trophy: require('../../../assets/league/Master League Trophy.png') },
  { id: 'grandmaster', trophy: require('../../../assets/league/Grandmaster League Trophy.png') },
  { id: 'legend', trophy: require('../../../assets/league/Legend League Trophy.png') },
  { id: 'mythic', trophy: require('../../../assets/league/Champion League Trophy.png') },
]
const TROPHY_CASES = [
  [0.16, 0.765], [0.50, 0.765], [0.84, 0.765],
  [0.16, 0.595], [0.50, 0.595], [0.84, 0.595],
  [0.16, 0.425], [0.50, 0.425], [0.84, 0.425],
  [0.16, 0.255],
] as const
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
  const user = useAuthStore(state => state.user)
  const accessToken = useAuthStore(state => state.session?.access_token)
  const door = useRef(new Animated.Value(0)).current
  const royal = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)
  const [started, setStarted] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [recordsBoard, setRecordsBoard] = useState<'pb'|'streak'|null>(null)
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

  if (leaderboardOpen && accessToken && user?.id) return <TierDLeagueLeaderboard serverUrl={SERVER_URL} accessToken={accessToken} userId={user.id} level={level ?? 1} previousRank={null} onClose={() => setLeaderboardOpen(false)}/>
  if (recordsBoard && accessToken) return <TierDRecordsBoard serverUrl={SERVER_URL} accessToken={accessToken} board={recordsBoard} onClose={() => setRecordsBoard(null)}/>

  return <Animated.View style={[styles.root, { opacity: fade }]} pointerEvents="auto">
    <View style={styles.casino}><View style={styles.tableGlow}/></View>
    {!started ? <>
      <Pressable accessibilityRole="button" accessibilityLabel="Change profile picture" style={styles.playerCard} onPress={() => router.push({ pathname: '/(home)/profile', params: { editAvatar: '1' } })}>
        <EntryIcon source={ENTRY_ICON_SHEET_1} index={0} style={styles.profileIcon}/>
        <View style={styles.honorAvatar}>{equippedBadge ? <Image source={equippedBadge} resizeMode="contain" style={styles.equippedBadge}/> : null}<AvatarFrame size={56} active={false}>{avatar}</AvatarFrame></View>
        <View style={styles.playerIdentity}><Text numberOfLines={1} style={styles.playerName}>{profile?.display_name ?? 'PLAYER'}</Text><Text style={styles.honorLabel}>{profile?.equipped_badge_key ? profile.equipped_badge_key.replaceAll('_',' ').toUpperCase() : 'HONOR FRAME'}</Text><Text style={styles.changeAvatarLink}>✎ CHANGE AVATAR</Text></View>
      </Pressable>
      <View style={styles.personalBestBoard}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Personal Best Top 50" style={styles.personalBestTitleRow} onPress={() => setRecordsBoard('pb')}><EntryIcon source={ENTRY_ICON_SHEET_2} index={1} style={styles.boardIcon}/><Text style={styles.personalBestTitle}>PERSONAL BEST</Text></Pressable>
        <StatRow label="FASTEST TIME" value={formatTime(profile?.tier_d_best_match_time_ms)}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Open longest streak Top 50" style={styles.streakRow} onPress={() => setRecordsBoard('streak')}><EntryIcon source={ENTRY_ICON_SHEET_2} index={0} style={styles.streakIcon}/><StatRow label="LONGEST STREAK" value={String(profile?.tier_d_best_win_streak ?? 0)}/></Pressable>
        <StatRow label="BEST MATCH SCORE" value={String(profile?.tier_d_best_match_score ?? 0)}/>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open league Top 20" style={styles.top20Button} onPress={() => setLeaderboardOpen(true)}><EntryIcon source={ENTRY_ICON_SHEET_1} index={2} style={styles.entryButtonIcon}/></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your trophy showcase" style={styles.showcaseMark} onPress={() => router.push('/(home)/profile')}><EntryIcon source={ENTRY_ICON_SHEET_2} index={2} style={styles.entryButtonIcon}/></Pressable>
      <Text style={styles.readyLevel}>{level ? `LEVEL ${level}` : 'NEXT LEVEL'}</Text>
      <View style={styles.readyArea}><Pressable accessibilityRole="button" accessibilityLabel="Start Level" style={styles.nextLevelButton} onPress={() => setStarted(true)}><Text style={styles.nextLevelText}>GO GO GO</Text></Pressable></View>
    </> : null}
    {started ? <><LeagueTrophyCabinet side="left"/><LeagueTrophyCabinet side="right"/></> : null}
    <Animated.View pointerEvents="none" style={[styles.brand, { opacity: entryCopyOpacity }]}>
      <Image source={APP_LOGO} resizeMode="contain" style={styles.appLogo}/>
      <Text style={styles.appName}>TriplePoker : Rise</Text>
      <Text style={styles.brandLevel}>{level ? `LEVEL ${level}` : 'NEXT LEVEL'}</Text>
    </Animated.View>
    <Animated.View style={[styles.royal, royalStyle]} pointerEvents="none">
      <View style={styles.royalGlow}/>
      {ROYAL_FLUSH.map((card, index) => <View key={card.value} style={[styles.card, { marginLeft: index ? -19 : 0, transform: [{ rotate: card.rotate }, { translateY: card.offsetY }] }]}>
        <Card variant="face" suit="spade" value={card.value as '10' | 'j' | 'q' | 'k' | 'a'} width={58} height={84}/>
      </View>)}
    </Animated.View>
    <Animated.View pointerEvents="none" style={[styles.entryCopy, { opacity: entryCopyOpacity }]}>
      <Text style={styles.entryMessage}>"{entryMessage}"</Text>
    </Animated.View>
    <Animated.View style={[styles.half, { width: halfWidth, transform: [{ translateX: leftTranslate }] }]}>
      <Image source={DOOR_IMAGE} resizeMode="cover" style={[styles.doorImage, doorStyle]} onError={finish}/>
    </Animated.View>
    <Animated.View style={[styles.half, { left: halfWidth, width: halfWidth, transform: [{ translateX: rightTranslate }] }]}>
      <Image source={DOOR_IMAGE} resizeMode="cover" style={[styles.doorImage, doorStyle, { left: -halfWidth }]} onError={finish}/>
    </Animated.View>
    {!started ? <DoorPortalVfx reducedMotion={reducedMotion}/> : null}
  </Animated.View>
}

/** A living glow in the small opening between the two closed door leaves. */
function DoorPortalVfx({ reducedMotion }: { reducedMotion: boolean }) {
  const spin = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reducedMotion) {
      spin.setValue(0)
      pulse.setValue(.5)
      return
    }
    spin.setValue(0)
    pulse.setValue(0)
    const animation = Animated.parallel([
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6200, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    ])
    animation.start()
    return () => animation.stop()
  }, [pulse, reducedMotion, spin])

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const flashOpacity = pulse.interpolate({ inputRange: [0, .42, .72, 1], outputRange: [.2, .76, .32, .88] })
  const coreOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [.42, .9] })

  return <View pointerEvents="none" accessibilityElementsHidden style={styles.portalVfx}>
    <Animated.View style={[styles.portalBloom, { opacity: coreOpacity }]}/>
    <Animated.View style={[styles.portalCore, { opacity: coreOpacity }]}/>
    <Animated.View style={[styles.portalRing, { transform: [{ rotate: rotation }] }]}>
      <View style={styles.portalRune}/><View style={[styles.portalRune, styles.portalRuneOpposite]}/>
    </Animated.View>
    <Animated.View style={[styles.doorSeam, { opacity: flashOpacity }]}/>
    <Animated.View style={[styles.doorSeamHot, { opacity: flashOpacity, transform: [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [.64, 1.14] }) }] }]}/>
  </View>
}

function StatRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.statRow}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>
}

function formatTime(milliseconds?: number | null) {
  if (!milliseconds || milliseconds <= 0) return '—'
  const seconds = Math.floor(milliseconds / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Each supplied image is a three-icon horizontal sheet; crop one compact tile. */
function EntryIcon({ source, index, style }: { source: ImageSourcePropType; index: 0 | 1 | 2; style?: any }) {
  const dimensions = StyleSheet.flatten(style)
  const width = dimensions?.width ?? 48
  const height = dimensions?.height ?? 38
  return <View pointerEvents="none" style={[styles.entryIconCrop, { width, height }, style]}><Image source={source} resizeMode="stretch" style={[styles.entryIconSprite, { left: -index * width, width: width * 3, height }]}/></View>
}

function LeagueTrophyCabinet({ side }: { side: 'left' | 'right' }) {
  const accessToken = useAuthStore(state => state.session?.access_token)
  const [awards, setAwards] = useState<LeagueAward[]>([])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    void fetch(`${SERVER_URL}/tier-d/awards`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(response => response.ok ? response.json() : { awards: [] })
      .then(payload => { if (active) setAwards(payload.awards ?? []) })
      .catch(() => { if (active) setAwards([]) })
    return () => { active = false }
  }, [accessToken])

  const earned = new Map<string, Set<LeagueAward['award_type']>>()
  for (const award of awards) {
    const types = earned.get(award.league_id) ?? new Set<LeagueAward['award_type']>()
    types.add(award.award_type)
    earned.set(award.league_id, types)
  }

  return <View pointerEvents="none" accessibilityElementsHidden style={[cabinetStyles.cabinet, side === 'left' ? cabinetStyles.leftCabinet : cabinetStyles.rightCabinet]}>
    <Image source={TROPHY_SHOWCASE} resizeMode="stretch" style={[cabinetStyles.showcase, side === 'right' && cabinetStyles.mirroredShowcase]}/>
    {TROPHY_LEAGUES.map((league, index) => {
      const prize = earned.get(league.id)
      if (!prize) return null
      const [left, top] = TROPHY_CASES[index]
      const mirroredLeft = side === 'right' ? 1 - left : left
      return <View key={league.id} style={[cabinetStyles.casePrize, { left: `${mirroredLeft * 100}%`, top: `${top * 100}%` }]}>
        {prize.has('trophy') ? <Image source={league.trophy} resizeMode="contain" style={cabinetStyles.trophy}/> : null}
        {prize.has('medal') ? <Image source={LEAGUE_MEDAL} resizeMode="contain" style={cabinetStyles.medal}/> : null}
      </View>
    })}
  </View>
}

const cabinetStyles = StyleSheet.create({
  // Keep the cabinet beneath the player card, with its top edge below the central door emblem.
  cabinet: { position: 'absolute', top: '43%', width: 62, height: 126, transform: [{ translateY: -20 }], zIndex: 2 },
  leftCabinet: { right: '50%', marginRight: 50 },
  rightCabinet: { left: '50%', marginLeft: 50 },
  showcase: { ...StyleSheet.absoluteFill },
  mirroredShowcase: { transform: [{ scaleX: -1 }] },
  casePrize: { position: 'absolute', width: 19, height: 20, marginLeft: -9.5, marginTop: -10, alignItems: 'center', justifyContent: 'center' },
  trophy: { width: 17, height: 17 },
  medal: { position: 'absolute', right: -2, bottom: -2, width: 8, height: 8 },
})

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 1000, overflow: 'hidden', backgroundColor: '#030705' },
  casino: { ...StyleSheet.absoluteFill, backgroundColor: '#07150d', alignItems: 'center', justifyContent: 'center' },
  tableGlow: { width: '128%', height: '64%', borderRadius: 999, backgroundColor: '#0d5634', borderWidth: 7, borderColor: '#b9872f', shadowColor: '#e7bf58', shadowOpacity: 0.34, shadowRadius: 34, elevation: 10 },
  half: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', zIndex: 3 },
  doorImage: { position: 'absolute', top: 0 },
  portalVfx: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  portalBloom: { position: 'absolute', width: 108, height: '71%', borderRadius: 54, backgroundColor: 'rgba(255,181,64,.14)', shadowColor: '#ffe28a', shadowOpacity: 1, shadowRadius: 34, elevation: 9 },
  portalCore: { position: 'absolute', width: 13, height: '72%', borderRadius: 8, backgroundColor: 'rgba(255,239,155,.62)', shadowColor: '#ffe58c', shadowOpacity: 1, shadowRadius: 19, elevation: 10 },
  portalRing: { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: 'rgba(255,218,119,.75)', alignItems: 'center', justifyContent: 'center', shadowColor: '#ffe28a', shadowOpacity: .9, shadowRadius: 13, elevation: 11 },
  portalRune: { position: 'absolute', width: 8, height: 28, borderRadius: 5, backgroundColor: '#fff2ac', shadowColor: '#ffe49a', shadowOpacity: 1, shadowRadius: 8 },
  portalRuneOpposite: { transform: [{ rotate: '90deg' }] },
  doorSeam: { position: 'absolute', width: 4, height: '88%', borderRadius: 3, backgroundColor: '#fff0a6', shadowColor: '#ffe08a', shadowOpacity: 1, shadowRadius: 14, elevation: 12 },
  doorSeamHot: { position: 'absolute', width: 1.5, height: '94%', borderRadius: 2, backgroundColor: '#fffdf0', shadowColor: '#fff1ae', shadowOpacity: 1, shadowRadius: 7, elevation: 13 },
  royal: { position: 'absolute', top: '40%', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', zIndex: 3 },
  brand: { position: 'absolute', top: '8%', left: 24, right: 24, alignItems: 'center', zIndex: 4 },
  appLogo: { width: 99, height: 99, borderRadius: 22 },
  appName: { marginTop: 30, color: '#fff1bb', fontSize: 23, fontWeight: '900', letterSpacing: 1.1, textShadowColor: '#6f4200', textShadowRadius: 11 },
  brandLevel: { marginTop: 6, color: '#fff1bb', fontSize: 18, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7b4700', textShadowRadius: 11 },
  playerCard: { position: 'absolute', top: '6%', left: 14, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '48%' },
  profileIcon: { width: 35, height: 34, marginRight: -5 },
  honorAvatar: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  equippedBadge: { position: 'absolute', width: 68, height: 68, opacity: .92 },
  playerIdentity: { gap: 2, maxWidth: 120 },
  playerName: { color: '#fff6d6', fontSize: 13, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 6 },
  honorLabel: { color: '#ffd76a', fontSize: 8, fontWeight: '900', letterSpacing: .6 },
  changeAvatarLink: { color: '#9deac0', fontSize: 8, fontWeight: '900', letterSpacing: .45, marginTop: 2, textDecorationLine: 'underline' },
  profilePhoto: { width: 56, height: 56, borderRadius: 28 },
  profileInitial: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#183526', borderWidth: 1, borderColor: '#ffd76a' },
  profileInitialText: { color: '#fff6d6', fontSize: 23, fontWeight: '900' },
  personalBestBoard: { position: 'absolute', top: '15%', right: 14, zIndex: 20, width: 152, padding: 9, borderRadius: 10, backgroundColor: 'rgba(5,17,11,.88)', borderWidth: 1, borderColor: 'rgba(255,215,106,.7)', gap: 4 },
  personalBestTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  personalBestTitle: { color: '#ffd76a', fontSize: 9, fontWeight: '900', letterSpacing: .8, textAlign: 'center', marginBottom: 2 },
  boardIcon: { width: 24, height: 19, marginRight: 2 },
  streakRow: { flexDirection: 'row', alignItems: 'center' },
  streakIcon: { width: 20, height: 16, marginRight: 2 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  statLabel: { color: '#bfd7c5', fontSize: 7, fontWeight: '800' },
  statValue: { color: '#fff2b2', fontSize: 8, fontWeight: '900' },
  readyArea: { position: 'absolute', left: 24, right: 24, bottom: '6.5%', zIndex: 20, alignItems: 'center' },
  readyLevel: { position: 'absolute', top: '59%', left: 24, right: 24, zIndex: 20, color: '#fff1bb', fontSize: 21, fontWeight: '900', letterSpacing: 2, textAlign: 'center', textShadowColor: '#7b4700', textShadowRadius: 11 },
  nextLevelButton: { minWidth: 200, alignItems: 'center', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 10, backgroundColor: '#ffd76a', borderWidth: 1.5, borderColor: '#fff4bc', shadowColor: '#ffd76a', shadowOpacity: .7, shadowRadius: 12, elevation: 9 },
  nextLevelText: { color: '#17311f', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  top20Button: { position: 'absolute', top: '6%', right: 14, zIndex: 21, width: 48, height: 38, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,215,106,.72)', backgroundColor: 'rgba(5,17,11,.8)' },
  showcaseMark: { position: 'absolute', top: '38%', right: 14, zIndex: 20, opacity: .92 },
  entryButtonIcon: { width: 48, height: 38 },
  entryIconCrop: { width: 48, height: 38, overflow: 'hidden' },
  entryIconSprite: { position: 'absolute', top: 0, width: 144, height: 38 },
  // The opened showcase legs end around 60% of the portrait screen; keep the encouragement below them.
  entryCopy: { position: 'absolute', top: '85%', left: 14, right: '50%', alignItems: 'flex-start', zIndex: 4 },
  entryMessage: { marginTop: 8, color: '#e5d4a0', fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: .7, textAlign: 'left', textShadowColor: '#000', textShadowRadius: 7 },
  royalGlow: { position: 'absolute', width: 280, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,213,102,.22)', shadowColor: '#ffe4a0', shadowOpacity: 0.95, shadowRadius: 28, elevation: 12 },
  card: { shadowColor: '#ffe6a3', shadowOpacity: 0.72, shadowRadius: 10, elevation: 12 },
})
