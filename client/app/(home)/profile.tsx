// app/(home)/profile.tsx
// Profile Screen -- TriplePoker (Merged: Arena layout + Brand theme colors)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, Platform, StatusBar, ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { useBgm } from '../../src/services/bgmService'
import { ActionButton } from '../../src/components/ui/ActionButton'
import { MenuButton } from '../../src/components/ui/MenuButton'
import { VipBackground } from '../../src/components/common/VipBackground'

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
  tier:       'S' as 'D' | 'C' | 'B' | 'A' | 'S',
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

const VIP_INFO: Record<string, { label: string; color: string } | null> = {
  none:    null,
  vip:     { label: 'VIP',     color: C.gold     },
  vip_pro: { label: 'VIP PRO', color: C.goldDark },
}

const fmt = (n: number) => n.toLocaleString('en-US')

// Monarch_Spec_v1_3 §4/§5 — Performance Score + Ascendant Gate ปลดล็อคตั้งแต่ Tier A+ ขึ้นไปเท่านั้น
const PS_UNLOCKED_TIERS = new Set(['A+', 'S', 'S+'])
const ASCENDANT_TOKEN_MIN = 600_000
const ASCENDANT_TOKEN_MAX = 999_999

type TabKey = 'stats' | 'bosses' | 'history' | 'social'

export default function ProfileScreen() {
  useBgm() // LobbyMatchmaking_Spec_v1_0 §2 — BGM เล่นต่อเนื่องข้าม Profile/Shop/Lobby/Hall of Fame
  const signOut = useAuthStore(s => s.signOut)
  const profile = useAuthStore(s => s.profile)
  const [activeTab, setActiveTab] = useState<TabKey>('stats')

  // ─── Real data จาก authStore (fallback MOCK เผื่อ profile ยังโหลดไม่เสร็จ) ───
  const displayName = profile?.display_name  || MOCK.name
  const avatar      = profile?.avatar_url    || MOCK.avatar
  const tier        = profile?.tier          || MOCK.tier
  const vipStatus   = profile?.vip_status    || 'none'
  const token       = profile?.token_balance ?? MOCK.token
  const crown       = profile?.crown_balance ?? MOCK.crown
  const xpNow       = profile?.xp            ?? MOCK.xpNow
  // streak_count ยังไม่มีคอลัมน์จริงบน Supabase (live schema ไม่มี แม้ migration file จะ define ไว้)
  // ใช้ MOCK จนกว่าจะรัน migration เพิ่มคอลัมน์ — ดู supabase/migrations/004_add_streak_count.sql
  const streakDays  = MOCK.streakDays

  // Monarch_Spec_v1_3 §4/§5 — ต้องรัน supabase/migrations/006_monarch_spawn_reward.sql ก่อน คอลัมน์นี้ถึงจะมีค่าจริง
  const careerPS = profile?.performance_score ?? 0   // Career PS — lifetime, ห้ามรีเซ็ต
  const seasonPS = profile?.ps_season ?? 0            // Season PS — เกณฑ์แข่งขัน/Ascendant Star, รีเซ็ตตาม tournament
  const monarchVictories = profile?.monarch_victories ?? 0
  const isPSUnlocked     = PS_UNLOCKED_TIERS.has(tier)
  const isMonarchSlayer  = monarchVictories >= 1
  const showAscendantHint = isPSUnlocked && !isMonarchSlayer && token >= ASCENDANT_TOKEN_MIN && token <= ASCENDANT_TOKEN_MAX

  const tierInfo = TIER_INFO[tier] ?? TIER_INFO['C']
  const vipInfo  = VIP_INFO[vipStatus]
  const isVip    = vipStatus !== 'none' // VIP Shimmer Effect — ใช้ vip_status ที่มีอยู่แล้ว ไม่สร้าง state/query ใหม่

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleSettings = () => {
    console.log('Settings pressed')
  }

  const handleEditProfile = () => {
    router.push('/(auth)/setup-profile')
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
    <VipBackground isVip={isVip}>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══════════════ TOP HEADER ═══════════════ */}
        <View style={s.topHeader}>
          <MenuButton icon="settings" label="Settings" size="sm" onPress={handleSettings} vipShimmer={isVip} />
          <View style={{ flex: 1 }} />
          <MenuButton icon="exit" label="Logout" size="sm" onPress={handleLogout} vipShimmer={isVip} />
        </View>

        {/* ═══════════════ HERO PLAYER CARD ═══════════════ */}
        <GoldCard style={s.heroCard}>
          <TouchableOpacity onPress={handleEditProfile} style={s.avatarFrame} activeOpacity={0.85}>
            <Text style={s.avatarEmoji}>{avatar}</Text>
            <View style={s.editBubble}>
              <Text style={s.editIcon}>✎</Text>
            </View>
          </TouchableOpacity>

          <View style={s.heroInfo}>
            <Text style={s.userName} numberOfLines={1}>{displayName}</Text>
            <View style={s.badgeRow}>
              <View style={[s.tierBadge, { borderColor: tierInfo.color }]}>
                <Text style={[s.tierBadgeText, { color: tierInfo.color }]}>
                  [{tier}] {tierInfo.label}
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
          <ActionButton icon="play_royal_flush" label="PLAY" onPress={handlePlay} vipShimmer={isVip} />
        </View>
        <View style={s.secondaryRow}>
          <MenuButton icon="shop" label="Shop" size="md" onPress={handleShop} vipShimmer={isVip} />
          <MenuButton icon="hall_of_fame" label="Legends" size="md" onPress={handleTableOfLegends} vipShimmer={isVip} />
        </View>

        {/* ═══════════════ TABS ═══════════════ */}
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
      </ScrollView>
    </View>
    </VipBackground>
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
    minHeight: 92,
    backgroundColor: C.header,
    marginHorizontal: -14,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  goldCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.borderHi,
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
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.gold,
    backgroundColor: 'rgba(255,215,106,0.08)',
    alignItems: 'center',
  },
  ascendantHintText: { color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  playHeroWrap: { marginTop: 16 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 14 },

  tabsRow: { flexDirection: 'row', marginTop: 14 },
  tabBtn: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 11,
    alignItems: 'center',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginRight: -1,
  },
  tabBtnActive: { backgroundColor: C.card, borderColor: C.gold },
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
})
