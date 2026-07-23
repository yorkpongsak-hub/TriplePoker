// app/(home)/profile.tsx
// Profile Screen -- TriplePoker (Merged: Arena layout + Brand theme colors)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, StatusBar, ScrollView, Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { useBgm } from '../../src/services/bgmService'
import { ActionButton } from '../../src/components/ui/ActionButton'
import { MenuButton } from '../../src/components/ui/MenuButton'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanel, glassPanelDense } from '../../src/ui/glassStyles'
import { getTierFromToken, TierKey } from '../../src/config/tierConfig'
import { supabase } from '../../src/services/supabaseService'
import ProfilePicturePicker from '../../src/components/profile/ProfilePicturePicker'
import SettingsModal from '../../src/components/profile/SettingsModal'
import { AvatarDisplay, PRESET_AVATARS, AvatarConfig } from '../../src/components/profile/AvatarPicker'

// ─── ธีมสีหลัก (Website Theme Spec v1.0) ─────────────────────
const C = {
  bg:          '#0F2418',
  header:      '#163A25',
  surface:     '#163A25',
  card:        '#1C4830',
  card2:       '#214F35',
  border:      '#2A4A34',
  borderHi:    '#3A5A44',
  gold:        '#FFD76A',
  goldDark:    '#FFC857',
  green:       '#8DFFB5',
  blue:        '#38BDF8',
  purple:      '#C084FC',
  red:         '#FF6B6B',
  textPrimary: '#F5F2E8',
  textSec:     '#C8C4B0',
  textDim:     '#7A7A6A',
  white:       '#0F2418',
}

// ─── Fallback ก่อน profile จาก Supabase โหลดเสร็จ ─────────────
const MOCK = {
  name:       'York',
  avatar:     '🐉',
  token:      425_000,
  crown:      12,
  streakDays: 7,
  xpNow:      15_400,
}

// ─── Tier / VIP config ────────────────────────────────────────
const TIER_INFO: Record<string, { label: string; color: string }> = {
  D:  { label: 'DEMO',        color: C.textDim },
  C:  { label: 'INITIATE',    color: C.green   },
  B:  { label: 'ADEPT',       color: C.blue    },
  A:  { label: 'MASTERMIND',  color: C.purple  },
  'A+': { label: 'HIGH NOBLE', color: C.gold    },
  S:  { label: 'ASCENDANT',   color: C.gold    },
  'S+': { label: 'LAST BOSS',  color: C.goldDark },
}

// Map TierKey (คำนวณสดจาก token_balance ใน tierConfig.ts) -> letter grade ของ TIER_INFO ด้านบน
// Ascendant(S)/Last Boss(S+) ไม่อยู่ใน map นี้เพราะไม่ใช่ token-threshold tier (คำนวณสดไม่ได้ — ยัง stub)
const TIER_KEY_LETTER: Record<TierKey, string> = {
  initiate:   'C',
  adept:      'B',
  mastermind: 'A',
  highNoble:  'A+',
}

const VIP_INFO: Record<string, { label: string; color: string } | null> = {
  none:    null,
  vip:     { label: 'VIP',     color: C.gold     },
  vip_pro: { label: 'VIP PRO', color: C.goldDark },
}

// LobbyMatchmaking_Spec_v1_0 §1.3 — key ตรงกับ tier_unlock_celebrated ที่ lobby.tsx เขียนลง DB (server-authoritative)
const TIER_UNLOCK_CONFIG: Record<string, { label: string; letter: string; color: string }> = {
  initiate:   { label: 'Initiate',      letter: 'C',  color: C.green },
  adept:      { label: 'Adept',         letter: 'B',  color: C.blue },
  mastermind: { label: 'Mastermind',    letter: 'A',  color: C.purple },
  high_noble: { label: 'High Noble',    letter: 'A+', color: C.gold }, // letter เดิม 'S' — แก้ให้ตรงกับ Top Bar badge (canon High Noble = A+, S สงวนไว้ให้ Ascendant)
  last_boss:  { label: 'The Last Boss', letter: 'S+', color: C.goldDark },
}

const fmt = (n: number) => n.toLocaleString('en-US')

// Monarch_Spec_v1_3 §4/§5 — Performance Score + Ascendant Gate ปลดล็อคตั้งแต่ Tier A+ (highNoble) ขึ้นไปเท่านั้น
const ASCENDANT_TOKEN_MIN = 600_000
const ASCENDANT_TOKEN_MAX = 999_999

type TabKey = 'stats' | 'bosses' | 'history' | 'social'

export default function ProfileScreen() {
  useBgm() // LobbyMatchmaking_Spec_v1_0 §2 — BGM เล่นต่อเนื่องข้าม Profile/Shop/Lobby/Hall of Fame
  const signOut = useAuthStore(s => s.signOut)
  const profile = useAuthStore(s => s.profile)
  const refreshProfile = useAuthStore(s => s.refreshProfile)
  const authUser = useAuthStore(s => s.user)
  const [activeTab, setActiveTab] = useState<TabKey>('stats')

  // Safety net: token อาจเปลี่ยนนอก flow แมตช์ (admin แก้ DB ตรง, ซื้อ token ใน Shop, ad reward ฯลฯ)
  // refetch ทุกครั้งที่กลับมาโฟกัสหน้านี้ — debounce 3 วิ กันยิงรัวถ้าสลับหน้าเร็วๆ
  const lastFocusFetchRef = useRef(0)
  useFocusEffect(
    useCallback(() => {
      const now = Date.now()
      if (now - lastFocusFetchRef.current < 3000) return
      lastFocusFetchRef.current = now
      refreshProfile()
    }, [refreshProfile])
  )

  // ─── Real data จาก authStore (fallback MOCK เผื่อ profile ยังโหลดไม่เสร็จ) ───
  const displayName = profile?.display_name  || MOCK.name
  const avatar      = profile?.avatar_url    || MOCK.avatar
  const vipStatus   = profile?.vip_status    || 'none'
  const token       = profile?.token_balance ?? MOCK.token
  const crown       = profile?.crown_balance ?? MOCK.crown
  const xpNow       = profile?.xp            ?? MOCK.xpNow
  // Patch (2026-07-17): ยืนยันแล้วว่า streak_count มีอยู่จริงบน live DB (ลุงเช็ค Table Editor
  // ให้แล้ว) — comment เดิมที่บอกว่าคอลัมน์ไม่มีล้าสมัยไปแล้ว ต่อสายเป็นค่าจริงจาก authStore
  const streakDays  = profile?.streak_count ?? MOCK.streakDays

  // Tier คำนวณสดจาก token เสมอ — เลิกอ่าน profile.tier ตรงๆ เพราะคอลัมน์นั้นไม่มี pipeline ไหนอัปเดตจริง
  // (ดูปัญหาเดิม: Top Bar ไม่ตรงกับ Tiers Unlocked) getTierFromToken คืนแค่ 4 tier หลัก ไม่มี crash เพราะ token
  // เป็นตัวเลขเสมอ (fallback MOCK.token ถ้า profile ยังโหลดไม่เสร็จ)
  const liveTier  = getTierFromToken(token)
  const tierLetter = TIER_KEY_LETTER[liveTier]

  // Monarch_Spec_v1_3 §4/§5 — ต้องรัน supabase/migrations/006_monarch_spawn_reward.sql ก่อน คอลัมน์นี้ถึงจะมีค่าจริง
  const careerPS = profile?.performance_score ?? 0   // Career PS — lifetime, ห้ามรีเซ็ต
  const seasonPS = profile?.ps_season ?? 0            // Season PS — เกณฑ์แข่งขัน/Ascendant Star, รีเซ็ตตาม tournament
  const monarchVictories = profile?.monarch_victories ?? 0
  const isPSUnlocked     = liveTier === 'highNoble' // Ascendant/Last Boss ยัง stub — ยังคำนวณสดไม่ได้ (ดู tierConfig.ts)
  const isMonarchSlayer  = monarchVictories >= 1
  const showAscendantHint = isPSUnlocked && !isMonarchSlayer && token >= ASCENDANT_TOKEN_MIN && token <= ASCENDANT_TOKEN_MAX

  const tierInfo = TIER_INFO[tierLetter] ?? TIER_INFO['C']
  const vipInfo  = VIP_INFO[vipStatus]
  const unlockedTiers = profile?.tier_unlock_celebrated ?? []
  const isVip    = vipStatus !== 'none' // VIP Shimmer Effect — ใช้ vip_status ที่มีอยู่แล้ว ไม่สร้าง state/query ใหม่

  // avatar_url อาจเป็น preset key ใหม่ ('wolf', 'avatar_vip_01' ฯลฯ) หรือ emoji ดิบของเก่า (ก่อนระบบ
  // preset) — เช็ค key ที่รู้จักก่อนค่อยเลือก component render ให้ถูก (กัน render "wolf" เป็น text ตรงๆ)
  const isKnownAvatarPreset = !!profile?.avatar_url && PRESET_AVATARS.some(p => p.key === profile.avatar_url)
  const avatarConfig: AvatarConfig = { type: 'preset', presetKey: profile?.avatar_url ?? undefined, frameKey: 'default' }

  // --- Profile Picture (VIP real image) --- เก็บ path ใน DB, ขอ signed URL สดตอน render
  const [picModalVisible, setPicModalVisible] = useState(false)
  // Settings modal จริง — คืนปุ่ม Settings ให้เปิดหน้านี้แทน Onboarding (ย้าย "How to Play" ไปปุ่ม Demo ใน lobby แล้ว)
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [profileImageSignedUrl, setProfileImageSignedUrl] = useState<string | null>(null)
  const profileImagePath = profile?.profile_image_url ?? null
  useEffect(() => {
    let cancelled = false
    if (!isVip || !profileImagePath) {
      setProfileImageSignedUrl(null)
      return
    }
    supabase.storage
      .from('avatars')
      .createSignedUrl(profileImagePath, 3600)
      .then(({ data }) => {
        if (!cancelled) setProfileImageSignedUrl(data?.signedUrl ?? null)
      })
      .catch(() => {
        if (!cancelled) setProfileImageSignedUrl(null)
      })
    return () => { cancelled = true }
  }, [isVip, profileImagePath])

  // ─── Toast: Coming Soon (ปุ่มที่ระบบหลังบ้านยังไม่มี) — pattern เดียวกับ lobby.tsx ───
  const [comingSoonMsg, setComingSoonMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!comingSoonMsg) return
    const id = setTimeout(() => setComingSoonMsg(null), 2500)
    return () => clearTimeout(id)
  }, [comingSoonMsg])
  const handleComingSoon = (label: string) => setComingSoonMsg(`${label} — Coming Soon`)

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleSettings = () => {
    setSettingsModalVisible(true)
  }

  const handleEditProfile = () => {
    setPicModalVisible(true)
  }

  const handlePlay = () => {
    router.push('/(home)/lobby')
  }

  const handleShop = () => {
    router.push('/(home)/shop')
  }

  const handleTableOfLegends = () => {
    // TODO: ยังไม่มีหน้า Table of The Legends — เปิดใช้เมื่อสร้างเสร็จ
    console.log('Table of The Legends — coming soon')
  }

  return (
    <ThemedBackground isVip={isVip}>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ─── Toast: Coming Soon (Friends/Ranking/Legends) — pattern เดียวกับ lobby.tsx ─── */}
      {comingSoonMsg && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{comingSoonMsg}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══════════════ TOP HEADER ═══════════════ */}
        <View style={s.topHeader}>
          <MenuButton icon="settings" label="Settings" size="xs" onPress={handleSettings} vipShimmer={isVip} />
          <View style={s.playerProfileLabel}>
            <LinearGradient
              colors={[C.goldDark, C.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={s.playerProfileLabelText}>Player Profile</Text>
          </View>
          <MenuButton icon="exit" label="Logout" size="xs" onPress={handleLogout} vipShimmer={isVip} />
        </View>

        {/* ═══════════════ HERO PLAYER CARD ═══════════════ */}
        <GoldCard style={s.heroCard}>
          <TouchableOpacity onPress={handleEditProfile} style={s.avatarFrame} activeOpacity={0.85}>
            {profileImageSignedUrl ? (
              <Image
                source={{ uri: profileImageSignedUrl }}
                style={{ width: '100%', height: '100%', borderRadius: 999 }}
              />
            ) : isKnownAvatarPreset ? (
              <AvatarDisplay config={avatarConfig} size={82} showFrame={false} />
            ) : (
              // avatar_url เก่าเป็น emoji ดิบ (ก่อนระบบ preset) — render ตรงๆ เหมือนเดิม ไม่ crash
              <Text style={s.avatarEmoji}>{avatar}</Text>
            )}
            <View style={s.editBubble}>
              <Text style={s.editIcon}>✎</Text>
            </View>
          </TouchableOpacity>

          <ProfilePicturePicker
            visible={picModalVisible}
            onClose={() => setPicModalVisible(false)}
            isVip={isVip}
            userId={authUser?.id ?? ''}
            onUploaded={refreshProfile}
            onChooseAvatar={() => router.push('/(auth)/setup-profile')}
          />

          <SettingsModal
            visible={settingsModalVisible}
            onClose={() => setSettingsModalVisible(false)}
          />

          <View style={s.heroInfo}>
            <Text style={s.userName} numberOfLines={1}>{displayName}</Text>
            <View style={s.badgeRow}>
              <View style={[s.tierBadge, { borderColor: tierInfo.color }]}>
                <Text style={[s.tierBadgeText, { color: tierInfo.color }]}>
                  [{tierLetter}] {tierInfo.label}
                </Text>
              </View>
              {vipInfo && (
                <View style={[s.vipBadge, { borderColor: vipInfo.color, backgroundColor: `${vipInfo.color}22` }]}>
                  <Text style={[s.vipBadgeText, { color: vipInfo.color }]}>{vipInfo.label} ♛</Text>
                </View>
              )}
              {isMonarchSlayer && (
                <View style={[s.vipBadge, { borderColor: C.purple, backgroundColor: `${C.purple}22` }]}>
                  <Text style={[s.vipBadgeText, { color: C.purple }]}>MONARCH SLAYER 👑</Text>
                </View>
              )}
            </View>
            <Text style={s.xpLine}>⭐ {fmt(xpNow)} XP</Text>
          </View>
        </GoldCard>

        {/* ═══════════════ RESOURCE PANEL ═══════════════ */}
        <GoldCard style={s.resourceCard}>
          <ResourceBox icon="🪙" label="TOKEN" value={fmt(token)} valueColor={C.gold} />
          <View style={s.vLine} />
          <ResourceBox icon="👑" label="CROWN" value={`${crown}`} valueColor={C.goldDark} />
          <View style={s.vLine} />
          <ResourceBox icon="💎" label="VIP STATUS" value={vipInfo?.label ?? 'FREE'} valueColor={vipInfo?.color ?? C.textPrimary} />
        </GoldCard>

        {/* ═══════════════ TIERS UNLOCKED (LobbyMatchmaking_Spec_v1_0 §1.3 — ย้ายมาจาก popup ใน Lobby) ═══════════════ */}
        {unlockedTiers.length > 0 && (
          <GoldCard style={s.tiersUnlockedCard}>
            <Text style={s.tiersUnlockedLabel}>TIERS UNLOCKED</Text>
            <View style={s.tiersUnlockedRow}>
              {unlockedTiers.map(t => {
                const cfg = TIER_UNLOCK_CONFIG[t]
                if (!cfg) return null
                return (
                  <View key={t} style={[s.tierUnlockChip, { borderColor: cfg.color, backgroundColor: `${cfg.color}14` }]}>
                    <Text style={[s.tierUnlockChipText, { color: cfg.color }]}>[{cfg.letter}] {cfg.label}</Text>
                  </View>
                )
              })}
            </View>
          </GoldCard>
        )}

        {/* ═══════════════ PERFORMANCE SCORE — Dual-Track (Tier A+ ขึ้นไปเท่านั้น — Monarch_Spec_v1_3 §4) ═══════════════ */}
        {/* Season PS เด่น (เกณฑ์แข่งขัน/Ascendant Star) + Career PS รอง (lifetime, ห้ามรีเซ็ต) — TODO: font JetBrains Mono ตาม spec ยังไม่ได้ load เข้า expo-font ในโปรเจกต์ */}
        {isPSUnlocked && (
          <GoldCard style={s.psCard}>
            <View style={s.psSeasonRow}>
              <Text style={s.psSeasonLabel}>📊 SEASON PS</Text>
              <Text style={s.psSeasonValue}>{fmt(seasonPS)}</Text>
            </View>
            <Text style={s.psCareerValue}>Career PS (lifetime): {fmt(careerPS)}</Text>
          </GoldCard>
        )}

        {/* ═══════════════ ASCENDANT HINT (token 600k-999,999 ผ่าน A+ แต่ยังไม่ชนะ Monarch) ═══════════════ */}
        {showAscendantHint && (
          <View style={s.ascendantHint}>
            <Text style={s.ascendantHintText}>Defeat the Monarch to unlock Ascendant</Text>
          </View>
        )}

        {/* ═══════════════ MAIN ACTIONS ═══════════════ */}
        <View style={s.playHeroWrap}>
          <ActionButton icon="play_royal_flush" label="PLAY" onPress={handlePlay} vipShimmer={isVip} labelStyle={s.playLabel} />
        </View>

        {/* ═══════════════ TABS (ย้ายขึ้นมาต่อจากปุ่ม Play — ผู้เล่นเห็นสถิติง่ายขึ้น) ═══════════════ */}
        <View style={s.tabsRow}>
          <TabButton label="STATS" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
          <TabButton label="BOSSES" active={activeTab === 'bosses'} onPress={() => setActiveTab('bosses')} />
          <TabButton label="HISTORY" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
          <TabButton label="SOCIAL" active={activeTab === 'social'} onPress={() => setActiveTab('social')} />
        </View>

        {activeTab === 'stats' && <StatsPanel streakDays={streakDays} />}
        {activeTab === 'bosses' && (
          <ComingSoonPanel icon="🗿" title="HALL OF BOSSES" sub="The Nine Sentinels are coming in a future update" />
        )}
        {activeTab === 'history' && (
          <ComingSoonPanel icon="📜" title="MATCH HISTORY" sub="Your recent matches will appear here soon" />
        )}
        {activeTab === 'social' && (
          <ComingSoonPanel icon="👥" title="SOCIAL" sub="Following & followers are coming in a future update" />
        )}

        <View style={s.secondaryRow}>
          <MenuButton icon="friends" label="Friends" size="sm" onPress={() => handleComingSoon('Friends')} vipShimmer={isVip} />
          <MenuButton icon="ranking" label="Ranking" size="sm" onPress={() => router.push('/(home)/stats')} vipShimmer={isVip} />
          <MenuButton icon="shop" label="Shop" size="sm" onPress={handleShop} vipShimmer={isVip} />
          <MenuButton icon="hall_of_fame" label="Legends" size="sm" onPress={handleTableOfLegends} vipShimmer={isVip} />
        </View>
      </ScrollView>
    </View>
    </ThemedBackground>
  )
}

function GoldCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.goldCard, style]}>{children}</View>
}

function ResourceBox({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.resourceBox}>
      <Text style={s.resourceIcon}>{icon}</Text>
      <View>
        <Text style={s.resourceLabel}>{label}</Text>
        <Text style={[s.resourceValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      </View>
    </View>
  )
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.tabBtn, active && s.tabBtnActive]} activeOpacity={0.8}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
}

// ── ที่ยังไม่มีระบบหลังบ้านจริง (match history, achievements, bosses conquered, social) ──
function ComingSoonPanel({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <GoldCard style={s.comingSoonPanel}>
      <Text style={s.comingSoonIcon}>{icon}</Text>
      <Text style={s.comingSoonTitle}>{title}</Text>
      <Text style={s.comingSoonSub}>{sub}</Text>
    </GoldCard>
  )
}

function StatsPanel({ streakDays }: { streakDays: number }) {
  return (
    <GoldCard style={s.statsPanel}>
      <StatItem icon="🎯" label="WIN RATE" value="—" sub="COMING SOON" small />
      <View style={s.vLine} />
      <StatItem icon="⚔️" label="MATCHES" value="—" sub="COMING SOON" small />
      <View style={s.vLine} />
      <StatItem icon="♠" label="BEST HAND" value="—" sub="COMING SOON" small />
      <View style={s.vLine} />
      <StatItem icon="🔥" label="STREAK" value={`${streakDays} Days`} sub="CURRENT" small />
    </GoldCard>
  )
}

function StatItem({ icon, label, value, sub, small }: { icon: string; label: string; value: string; sub: string; small?: boolean }) {
  return (
    <View style={s.statItem}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, small && s.statValueSmall]} numberOfLines={1}>{value}</Text>
      <Text style={s.statSub}>{sub}</Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' }, // VipBackground ครอบพื้นหลังแล้ว — Free เห็น C.bg ผ่าน VipBackground fallback
  scroll: { paddingHorizontal: 14, paddingBottom: 34 },

  topHeader: {
    minHeight: 76, // เดิม 92 — Settings/Logout เล็กลง (size xs=48) เพิ่ม Player Profile label panel ตรงกลาง — Feedback B2
    backgroundColor: glassPanel.backgroundColor, // เดิมพื้นทึบ C.header — เหลือแค่ backgroundColor เพราะเป็นแถบเต็มขอบจอ (border/radius เดิมของบาร์ไม่แตะ)
    marginHorizontal: -14,
    paddingHorizontal: 20,
    paddingTop: 12, // เดิม hardcode ชดเชย status bar เอง (16/18) — VipBackground มี SafeAreaView(top) ให้แล้ว เหลือแค่ breathing room ปกติ
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  playerProfileLabel: {
    // Feedback B2 — label header เฉยๆ ระหว่าง Settings/Logout กว้างเต็มพื้นที่ที่เหลือ ไม่มี action
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.goldDark,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playerProfileLabelText: {
    fontFamily: 'Cinzel',
    color: C.bg,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },

  goldCard: {
    ...glassPanel, // เดิมพื้นทึบ C.surface — เปลี่ยนเป็นกระจกฝ้ากลาง (ห้าม hardcode rgba เอง)
  },
  heroCard: {
    marginTop: -20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderColor: C.gold,
  },
  avatarFrame: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.card,
    borderWidth: 3, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 48 },
  editBubble: {
    position: 'absolute', right: -4, bottom: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.gold,
    borderWidth: 2, borderColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  editIcon: { color: C.bg, fontSize: 14, fontWeight: '900' },
  heroInfo: { flex: 1, minWidth: 0 },
  userName: { color: C.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 8 },
  tierBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1.5,
    backgroundColor: 'rgba(255,215,106,0.08)',
  },
  tierBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  vipBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1.5,
  },
  vipBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  xpLine: { color: C.textSec, fontSize: 11, fontWeight: '800' },

  resourceCard: {
    ...glassPanelDense, // Token/Crown bar — ตัวเลขสำคัญ ใช้กระจกทึบกว่า
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resourceBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resourceIcon: { fontSize: 24 },
  resourceLabel: { color: C.textSec, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  resourceValue: { color: C.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 2 },
  vLine: { width: 1, minHeight: 36, backgroundColor: C.border },

  tiersUnlockedCard: {
    marginTop: 10,
    padding: 12,
  },
  tiersUnlockedLabel: { color: C.textSec, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  tiersUnlockedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tierUnlockChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1.5 },
  tierUnlockChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  psCard: {
    marginTop: 10,
    padding: 12,
    borderColor: C.purple,
  },
  psSeasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  psSeasonLabel: { color: C.textSec, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  psSeasonValue: { color: C.purple, fontSize: 20, fontWeight: '900' },
  psCareerValue: { color: C.textDim, fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  ascendantHint: {
    ...glassPanel, // เดิม backgroundColor/borderColor hardcode เอง — เปลี่ยนมาใช้กระจกฝ้ากลาง
    marginTop: 10,
    padding: 12,
    alignItems: 'center',
  },
  ascendantHintText: { color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  playHeroWrap: { marginTop: 16 },
  playLabel: {
    // Feedback B1 — ขยับ "PLAY" ขึ้น 20px + ฟอนต์ใหญ่ขึ้น 25% (16 -> 20) เฉพะปุ่มนี้ ไม่กระทบ ActionButton อื่น (Ready/Auto Sort)
    fontSize: 20,
    transform: [{ translateY: -20 }],
  },
  secondaryRow: {
    // Feedback B3 — เพิ่ม Friends/Ranking นำหน้า Shop/Legends รวม 4 ปุ่ม — ลด size เป็น sm + space-evenly กันล้นจอ
    // marginTop 14 -> 16: ย้ายมาต่อจาก tab content panel (การ์ดมีขอบชัดเจน) แทนปุ่ม Play ลอยๆ เดิม เพิ่มระยะหายใจอีกนิด
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 16,
  },

  tabsRow: { flexDirection: 'row', marginTop: 14 },
  tabBtn: {
    flex: 1,
    backgroundColor: glassPanel.backgroundColor, // เดิม C.surface — radius แบบ top-only เดิมไม่แตะ (ต่อกับ panel ด้านล่าง)
    borderWidth: 1, borderColor: glassPanel.borderColor,
    paddingVertical: 11,
    alignItems: 'center',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginRight: -1,
  },
  tabBtnActive: { backgroundColor: glassPanelDense.backgroundColor, borderColor: C.gold },
  tabText: { color: C.textDim, fontSize: 11, fontWeight: '900' },
  tabTextActive: { color: C.gold },

  comingSoonPanel: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: 24, alignItems: 'center',
  },
  comingSoonIcon: { fontSize: 28, marginBottom: 8, opacity: 0.6 },
  comingSoonTitle: { color: C.textSec, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  comingSoonSub: { color: C.textDim, fontSize: 10, textAlign: 'center' },

  statsPanel: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    paddingVertical: 16, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  statIcon: { fontSize: 18, marginBottom: 4 },
  statLabel: { color: C.textSec, fontSize: 8, fontWeight: '900' },
  statValue: { color: C.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  statValueSmall: { fontSize: 11 },
  statSub: { color: C.textDim, fontSize: 8, fontWeight: '700', marginTop: 4, textAlign: 'center' },

  toastBanner: {
    // Feedback B3 — Coming Soon toast, pattern เดียวกับ lobby.tsx
    position: 'absolute', top: 60, left: 16, right: 16, zIndex: 1000,
    backgroundColor: glassPanel.backgroundColor,
    borderWidth: 1.5, borderColor: C.red, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: C.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
})
