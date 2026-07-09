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

type TabKey = 'stats' | 'bosses' | 'history' | 'social'

export default function ProfileScreen() {
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

  const tierInfo = TIER_INFO[tier] ?? TIER_INFO['C']
  const vipInfo  = VIP_INFO[vipStatus]

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
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══════════════ TOP HEADER ═══════════════ */}
        <View style={s.topHeader}>
          <TouchableOpacity onPress={handleSettings} style={s.iconBtn}>
            <Text style={s.iconText}>⚙</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleLogout} style={s.iconBtn}>
            <Text style={s.iconText}>🚪</Text>
          </TouchableOpacity>
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

        {/* ═══════════════ MAIN ACTIONS ═══════════════ */}
        <View style={s.actionRow}>
          <ActionButton icon="🂡" title="PLAY" sub="QUICK MATCH" color={C.blue} onPress={handlePlay} />
          <ActionButton icon="👑" title="Shop" sub="SKINS & ITEMS" color={C.gold} darkText onPress={handleShop} />
          <ActionButton icon="🏅" title="Table of The Legends" sub="LEGENDS & RANKING" color={C.card} onPress={handleTableOfLegends} />
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

function ActionButton({ icon, title, sub, color, darkText, onPress }: { icon: string; title: string; sub: string; color: string; darkText?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[s.actionBtn, { backgroundColor: color }]}>
      <Text style={s.actionIcon}>{icon}</Text>
      <Text style={[s.actionTitle, darkText ? { color: C.bg } : null]}>{title}</Text>
      <Text style={[s.actionSub, darkText ? { color: C.header } : null]}>{sub}</Text>
    </TouchableOpacity>
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
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 14, paddingBottom: 34 },

  topHeader: {
    minHeight: 70,
    backgroundColor: C.header,
    marginHorizontal: -14,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 22 : 24,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 18, color: C.textPrimary },

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

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.borderHi,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionTitle: { color: C.textPrimary, fontSize: 12, fontWeight: '900', letterSpacing: 0.3, textAlign: 'center' },
  actionSub: { color: C.textSec, fontSize: 8, fontWeight: '800', marginTop: 2, textAlign: 'center' },

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
