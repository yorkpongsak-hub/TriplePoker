// app/(home)/profile.tsx
// Profile Screen — หน้าหลักหลัง Login
// แสดง: ชื่อ / Token / XP / Level ในกรอบ
// Navigation Links: Lobby / Achievements / Hall of Fame /
//   Last Boss Graveyard (hidden จนมีผู้พิชิต) / Shop / Tutorial / Official Page
// Auth: Supabase Auth — ดึงข้อมูล user จาก session

import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  Linking,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { AvatarDisplay, AvatarConfig } from '../../src/components/profile/AvatarPicker'
import { supabase } from '../../src/services/supabaseService'

const { width: SW, height: SH } = Dimensions.get('window')

// ── สี Dark Premium
const C = {
  bg:          '#080f0a',
  surface:     '#0e1a13',
  card:        '#132019',
  cardHL:      '#172a1f',
  border:      '#1e2e22',
  borderGold:  'rgba(201,168,76,0.4)',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.45)',
  goldGlow:    'rgba(201,168,76,0.10)',
  green:       '#2d6b3c',
  greenDim:    'rgba(45,107,60,0.2)',
  teal:        '#3a7a6a',
  purple:      '#6a4a8a',
  red:         '#8a3030',
  textPrimary: '#e8dfc0',
  textSec:     '#7a8a72',
  textDim:     '#3a4a38',
  vipGold:     'rgba(201,168,76,0.15)',
}

// ── User data structure
interface UserProfile {
  id: string
  display_name: string
  token_balance: number
  xp: number
  level: number
  is_vip: boolean
  tier: 'beginner' | 'pro' | 'boss' | 'last_boss'
  avatar_url?: string
  streak?: number
  avatar_config?: string  // JSON string ของ AvatarConfig
}

// ── Tier config
const TIER_CONFIG = {
  beginner:  { label: 'Beginner',  color: '#4a8a5a', icon: '🟢', minToken: 100 },
  pro:       { label: 'Pro',       color: '#4a6aaa', icon: '🔵', minToken: 20000 },
  boss:      { label: 'Boss',      color: '#8a4a4a', icon: '🔴', minToken: 60000 },
  last_boss: { label: 'Last Boss', color: C.gold,    icon: '👑', minToken: 0 },
}

// ── XP ต่อ level (placeholder — Sprint 8 จะ implement จริง)
function getLevelProgress(xp: number, level: number): number {
  const xpPerLevel = 500
  const currentLevelXp = xp % xpPerLevel
  return currentLevelXp / xpPerLevel
}

// ── Stat Card — ชื่อ / Token / XP / Level
const ProfileCard: React.FC<{ user: UserProfile }> = ({ user }) => {
  const tier = TIER_CONFIG[user.tier] ?? TIER_CONFIG.beginner
  const levelProgress = getLevelProgress(user.xp, user.level)

  return (
    <View style={styles.profileCard}>
      {/* VIP badge */}
      {user.is_vip && (
        <View style={styles.vipBadge}>
          <Text style={styles.vipBadgeText}>♦ VIP</Text>
        </View>
      )}

      {/* Avatar area */}
      <View style={styles.avatarArea}>
        <AvatarDisplay
          config={(() => {
            try {
              return user.avatar_config
                ? JSON.parse(user.avatar_config)
                : { type: 'initial', initial: user.display_name?.charAt(0) ?? '?', frameKey: 'default' }
            } catch {
              return { type: 'initial', initial: user.display_name?.charAt(0) ?? '?', frameKey: 'default' }
            }
          })()}
          size={80}
          showFrame
        />
        <View style={{ height: 8 }} />
        <View style={{ display: 'none' }}>
        {/* Tier badge */}
        <View style={[styles.tierBadge, { backgroundColor: `${tier.color}22`, borderColor: `${tier.color}60` }]}>
          <Text style={styles.tierIcon}>{tier.icon}</Text>
          <Text style={[styles.tierLabel, { color: tier.color }]}>{tier.label}</Text>
        </View>
      </View>

      {/* Display name */}
      <Text style={styles.displayName} numberOfLines={1}>
        {user.display_name ?? 'Unknown Player'}
      </Text>

      {/* Streak */}
      {(user.streak ?? 0) > 0 && (
        <Text style={styles.streakText}>🔥 {user.streak} day streak</Text>
      )}

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Stats row: Token / XP / Level */}
      <View style={styles.statsRow}>
        {/* Token */}
        <View style={styles.statItem}>
          <Text style={styles.statIcon}>🪙</Text>
          <Text style={styles.statValue}>
            {user.token_balance.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>TOKEN</Text>
        </View>

        <View style={styles.statDivider} />

        {/* Level */}
        <View style={styles.statItem}>
          <Text style={styles.statIcon}>⚡</Text>
          <Text style={styles.statValue}>{user.level}</Text>
          <Text style={styles.statLabel}>LEVEL</Text>
        </View>

        <View style={styles.statDivider} />

        {/* XP */}
        <View style={styles.statItem}>
          <Text style={styles.statIcon}>✨</Text>
          <Text style={styles.statValue}>
            {user.xp.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
      </View>

      {/* XP Progress bar */}
      <View style={styles.xpBarContainer}>
        <View style={styles.xpBarBg}>
          <Animated.View
            style={[
              styles.xpBarFill,
              { width: `${Math.min(levelProgress * 100, 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.xpBarLabel}>
          Lv {user.level} → Lv {user.level + 1}
        </Text>
      </View>
    </View>
  )
}

// ── Navigation Link Item
const NavLink: React.FC<{
  icon: string
  label: string
  sublabel?: string
  color?: string
  isLocked?: boolean
  isHighlight?: boolean
  onPress: () => void
}> = ({ icon, label, sublabel, color = C.textPrimary, isLocked, isHighlight, onPress }) => {
  const pressAnim = useRef(new Animated.Value(1)).current

  const onPressIn  = () => Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () => Animated.spring(pressAnim, { toValue: 1,    useNativeDriver: true, speed: 20 }).start()

  if (isLocked) return null // ซ่อน Graveyard ถ้า Last Boss ยังไม่มีผู้พิชิต

  return (
    <Animated.View style={{ transform: [{ scale: pressAnim }] }}>
      <TouchableOpacity
        style={[
          styles.navLink,
          isHighlight && styles.navLinkHighlight,
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.85}
      >
        {/* Icon */}
        <View style={[
          styles.navLinkIcon,
          { backgroundColor: `${color}14` },
        ]}>
          <Text style={styles.navLinkIconText}>{icon}</Text>
        </View>

        {/* Label */}
        <View style={styles.navLinkContent}>
          <Text style={[styles.navLinkLabel, { color }]}>{label}</Text>
          {sublabel && (
            <Text style={styles.navLinkSub}>{sublabel}</Text>
          )}
        </View>

        {/* Arrow */}
        <Text style={[styles.navLinkArrow, { color: `${color}80` }]}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ── Main Component
const ProfileScreen: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [hasLastBossBeenDefeated, setHasLastBossBeenDefeated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      // ดึง session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/(auth)/login')
        return
      }

      // ดึงข้อมูล user จาก DB
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, display_name, token_balance, xp, level, is_vip, tier, streak, avatar_config')
        .eq('id', session.user.id)
        .single()

      if (error || !userData) {
        router.replace('/(auth)/login')
        return
      }

      setUser(userData as UserProfile)

      // ตรวจสอบว่า Last Boss ถูกพิชิตแล้วหรือยัง (ดู graveyard table)
      const { data: graveyardData } = await supabase
        .from('graveyard')
        .select('id')
        .limit(1)
        .single()

      setHasLastBossBeenDefeated(!!graveyardData)

    } catch (e) {
      console.error('Profile load error:', e)
    } finally {
      setIsLoading(false)
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start()
    }
  }

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut()
            router.replace('/(auth)/login')
          },
        },
      ]
    )
  }

  if (isLoading || !user) {
    return (
      <View style={[styles.container, styles.loadingState]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* ── Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>TRIPLE<Text style={styles.headerAccent}>POKER</Text></Text>
            <TouchableOpacity onPress={handleSignOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.signOutBtn}>Sign out</Text>
            </TouchableOpacity>
          </View>

          {/* ── Profile Card */}
          <ProfileCard user={user} />

          {/* ── Navigation Links */}
          <View style={styles.navSection}>
            <Text style={styles.navSectionTitle}>NAVIGATE</Text>

            {/* 1. Lobby */}
            <NavLink
              icon="🎮"
              label="Enter Arena"
              sublabel="Find a game and play"
              color={C.gold}
              isHighlight
              onPress={() => router.push('/(game)/table')}
            />

            {/* 2. สถิติ & เหรียญ */}
            <NavLink
              icon="🏅"
              label="Stats & Medals"
              sublabel="Your achievements and honor"
              color="#7a9aaa"
              onPress={() => router.push('/(home)/achievements')}
            />

            {/* 3. Hall of Fame */}
            <NavLink
              icon="🏆"
              label="Hall of Fame"
              sublabel={`Season Top 10 Rankings`}
              color={C.gold}
              onPress={() => router.push('/(home)/hall-of-fame')}
            />

            {/* 4. Last Boss Graveyard — ซ่อนจนมีผู้พิชิต */}
            <NavLink
              icon="⚰️"
              label="The Last Boss Graveyard"
              sublabel="Those who dared to challenge"
              color="#8a6aaa"
              isLocked={!hasLastBossBeenDefeated}
              onPress={() => router.push('/(home)/graveyard')}
            />

            {/* 5. Shop */}
            <NavLink
              icon="🛒"
              label="Shop"
              sublabel="Items, Loot Box, Token Packs"
              color="#6a9a7a"
              onPress={() => router.push('/(home)/shop')}
            />

            {/* 6. Tutorial / วิธีเล่น */}
            <NavLink
              icon="📖"
              label="How to Play"
              sublabel="Rules, tips and tutorial"
              color="#8a8a6a"
              onPress={() => router.push('/(home)/tutorial')}
            />

            {/* 7. Official Page */}
            <NavLink
              icon="🌐"
              label="Official Page"
              sublabel="News, updates and community"
              color={C.textSec}
              onPress={() => Linking.openURL('https://sagunicorn.com')}
            />
          </View>

          {/* ── Last Boss Graveyard hint (ถ้ายังไม่มีผู้พิชิต) */}
          {!hasLastBossBeenDefeated && (
            <View style={styles.graveyardHint}>
              <Text style={styles.graveyardHintText}>
                ⚰️  The Last Boss Graveyard will appear{'\n'}
                once a champion defeats The Last Boss
              </Text>
            </View>
          )}

          {/* ── VIP Upgrade banner (Free member เท่านั้น) */}
          {!user.is_vip && (
            <TouchableOpacity
              style={styles.vipBanner}
              onPress={() => router.push('/(home)/shop')}
              activeOpacity={0.85}
            >
              <Text style={styles.vipBannerIcon}>♦</Text>
              <View style={styles.vipBannerContent}>
                <Text style={styles.vipBannerTitle}>Upgrade to VIP</Text>
                <Text style={styles.vipBannerSub}>
                  No ads · +300 tokens/day · All Competitive Items
                </Text>
              </View>
              <Text style={styles.vipBannerArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* Padding ล่าง */}
          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>
    </View>
  )
}

// ── Styles
const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: C.bg,
  },
  loadingState: {
    justifyContent: 'center',
    alignItems:     'center',
  },
  loadingText: {
    color:    C.textSec,
    fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop:        Platform.OS === 'ios' ? 56 : 24,
  },

  // Header
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginBottom:    24,
  },
  headerTitle: {
    color:        C.textSec,
    fontSize:     18,
    fontWeight:   '900',
    letterSpacing: 3,
  },
  headerAccent: {
    color: C.gold,
  },
  signOutBtn: {
    color:    C.textSec,
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // Profile Card
  profileCard: {
    backgroundColor: C.card,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     C.borderGold,
    padding:         20,
    marginBottom:    24,
    position:        'relative',
    overflow:        'hidden',
  },
  vipBadge: {
    position:        'absolute',
    top:             12,
    right:           12,
    backgroundColor: C.vipGold,
    borderRadius:    12,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:     1,
    borderColor:     C.goldDim,
  },
  vipBadgeText: {
    color:       C.gold,
    fontSize:    10,
    fontWeight:  '800',
    letterSpacing: 1,
  },
  avatarArea: {
    alignItems:   'center',
    marginBottom: 12,
  },
  avatarRing: {
    width:        80,
    height:       80,
    borderRadius: 40,
    borderWidth:  2,
    justifyContent:'center',
    alignItems:   'center',
    marginBottom: 10,
  },
  avatarInner: {
    width:           70,
    height:          70,
    borderRadius:    35,
    backgroundColor: C.surface,
    justifyContent:  'center',
    alignItems:      'center',
  },
  avatarInitial: {
    color:      C.gold,
    fontSize:   28,
    fontWeight: '800',
  },
  tierBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             5,
    paddingHorizontal: 12,
    paddingVertical:   4,
    borderRadius:    12,
    borderWidth:     1,
  },
  tierIcon:  { fontSize: 12 },
  tierLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  displayName: {
    color:       C.textPrimary,
    fontSize:    22,
    fontWeight:  '800',
    textAlign:   'center',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  streakText: {
    color:       '#e07a30',
    fontSize:    12,
    textAlign:   'center',
    marginBottom: 8,
    fontWeight:  '600',
  },
  cardDivider: {
    height:          1,
    backgroundColor: C.border,
    marginVertical:  16,
  },

  // Stats row
  statsRow: {
    flexDirection:  'row',
    justifyContent: 'space-around',
    marginBottom:   16,
  },
  statItem: {
    flex:      1,
    alignItems:'center',
    gap:       3,
  },
  statDivider: {
    width:           1,
    backgroundColor: C.border,
    marginVertical:  4,
  },
  statIcon:  { fontSize: 16 },
  statValue: {
    color:      C.textPrimary,
    fontSize:   17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statLabel: {
    color:        C.textSec,
    fontSize:     9,
    letterSpacing: 1.5,
    fontWeight:   '700',
  },

  // XP bar
  xpBarContainer: {
    gap: 5,
  },
  xpBarBg: {
    height:          5,
    backgroundColor: C.border,
    borderRadius:    3,
    overflow:        'hidden',
  },
  xpBarFill: {
    height:          5,
    backgroundColor: C.gold,
    borderRadius:    3,
  },
  xpBarLabel: {
    color:    C.textSec,
    fontSize: 9,
    textAlign:'right',
    letterSpacing: 0.5,
  },

  // Nav section
  navSection: {
    marginBottom: 16,
    gap:          8,
  },
  navSectionTitle: {
    color:        C.textDim,
    fontSize:     9,
    letterSpacing: 3,
    fontWeight:   '700',
    marginBottom: 8,
    paddingLeft:  4,
  },
  navLink: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.card,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         14,
    gap:             14,
  },
  navLinkHighlight: {
    borderColor:     C.goldDim,
    backgroundColor: C.cardHL,
  },
  navLinkIcon: {
    width:         42,
    height:        42,
    borderRadius:  10,
    justifyContent:'center',
    alignItems:    'center',
  },
  navLinkIconText: { fontSize: 20 },
  navLinkContent: {
    flex: 1,
    gap:  2,
  },
  navLinkLabel: {
    fontSize:     14,
    fontWeight:   '700',
    letterSpacing: 0.3,
  },
  navLinkSub: {
    color:    C.textSec,
    fontSize: 11,
  },
  navLinkArrow: {
    fontSize: 22,
    fontWeight:'300',
  },

  // Graveyard hint
  graveyardHint: {
    backgroundColor: 'rgba(106,74,170,0.08)',
    borderWidth:     1,
    borderColor:     'rgba(106,74,170,0.25)',
    borderRadius:    12,
    padding:         16,
    alignItems:      'center',
    marginBottom:    16,
  },
  graveyardHintText: {
    color:      '#8a6aaa',
    fontSize:   12,
    textAlign:  'center',
    lineHeight: 18,
    letterSpacing: 0.3,
  },

  // VIP Banner
  vipBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.goldGlow,
    borderWidth:     1,
    borderColor:     C.goldDim,
    borderRadius:    14,
    padding:         16,
    gap:             14,
    marginBottom:    8,
  },
  vipBannerIcon: {
    color:    C.gold,
    fontSize: 24,
  },
  vipBannerContent: { flex: 1 },
  vipBannerTitle: {
    color:      C.gold,
    fontSize:   14,
    fontWeight: '800',
    marginBottom: 3,
    letterSpacing: 0.5,
  },
  vipBannerSub: {
    color:    C.textSec,
    fontSize: 11,
    lineHeight:16,
  },
  vipBannerArrow: {
    color:    C.goldDim,
    fontSize: 22,
  },
})

export default ProfileScreen
