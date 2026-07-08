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

// ─── Mock data (เปลี่ยนเป็น real data ตอนเชื่อม DB) ──────────
const MOCK = {
  name:           'York',
  avatar:         '🐉',
  tier:           'S' as 'D' | 'C' | 'B' | 'A' | 'S',
  vipStatus:      'pro' as 'free' | 'vip' | 'pro',
  token:          425_000,
  crown:          12,
  streakDays:     7,
  rank:           12,
  debt:           0,
  xpNow:          15_400,
  xpNext:         18_000,
  winRate:        68,
  totalMatches:   142,
  bestHand:       'Royal Flush',
  recentMatches: [
    { id: 1, result: 'win',  opponent: 'Reaper',     delta: +850,  ago: '5m ago'     },
    { id: 2, result: 'lose', opponent: 'Crag',       delta: -200,  ago: '1h ago'     },
    { id: 3, result: 'win',  opponent: 'Adept Bot',  delta: +1200, ago: 'yesterday'  },
  ],
  achievements: [
    { id: 1, icon: '🏆', name: 'First Win',       date: 'May 12, 2026' },
    { id: 2, icon: '🃏', name: 'Royal Flush',     date: 'Jun 03, 2026' },
    { id: 3, icon: '🔥', name: '30-day Streak',   date: 'Jun 15, 2026' },
  ],
  bossesConquered: [
    { id: 'iron_wall',   name: 'Iron Wall',   icon: '🛡️', conquered: true  },
    { id: 'chivalry',    name: 'Chivalry',    icon: '⚔️', conquered: true  },
    { id: 'war_lord',    name: 'War Lord',    icon: '👹', conquered: true  },
    { id: 'phantom',     name: 'Phantom',     icon: '👤', conquered: false },
    { id: 'dark_shark',  name: 'Dark Shark',  icon: '🦈', conquered: false },
    { id: 'oracle',      name: 'Oracle',      icon: '🔮', conquered: false },
    { id: 'jester',      name: 'Jester',      icon: '🃏', conquered: false },
    { id: 'phoenix',     name: 'Phoenix',     icon: '🔥', conquered: false },
    { id: 'black_magic', name: 'Black Magic', icon: '🧙', conquered: false },
  ],
  following: 24,
  followers: 8,
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
  const displayName = profile?.display_name || MOCK.name
  const avatar      = profile?.avatar_url   || MOCK.avatar
  const tier        = profile?.tier         || MOCK.tier
  const vipStatus   = profile?.vip_status   || 'none'
  const token       = profile?.token_balance ?? MOCK.token
  const crown       = profile?.crown_balance ?? MOCK.crown
  const xpNow       = profile?.xp           ?? MOCK.xpNow

  const pct = Math.round((xpNow / MOCK.xpNext) * 100)

  const tierInfo = TIER_INFO[tier] ?? TIER_INFO['C']
  const vipInfo  = VIP_INFO[vipStatus]
  const isVip    = vipStatus !== 'none'
  const conqueredCount = MOCK.bossesConquered.filter(b => b.conquered).length

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

            <View style={s.rankRow}>
              <Text style={s.rankIcon}>🏆</Text>
              <Text style={s.rankLabel}>GLOBAL RANK</Text>
              <Text style={s.rankValue}>#{MOCK.rank}</Text>
            </View>

            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={s.progressSub}>{fmt(xpNow)} / {fmt(MOCK.xpNext)} XP to Mythic</Text>
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

        {/* ═══════════════ DEBT BADGE ═══════════════ */}
        {MOCK.debt > 0 && (
          <View style={s.debtBadge}>
            <Text style={s.debtTitle}>⚠ DEBT {fmt(MOCK.debt)} TOKEN</Text>
            <Text style={s.debtSub}>Auto-deduct 20% from pot wins</Text>
            <TouchableOpacity style={s.debtBtn}>
              <Text style={s.debtBtnText}>PAY</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {activeTab === 'stats' && (
          isVip ? <StatsPanel /> : <VipLockedPanel onUpgrade={() => router.push('/(home)/shop')} />
        )}
        {activeTab === 'bosses' && <BossesPanel conqueredCount={conqueredCount} />}
        {activeTab === 'history' && <RecentActivityPanel />}
        {activeTab === 'social' && <SocialPanel />}

        {activeTab === 'stats' && isVip && (
          <>
            <View style={s.twoColumnRow}>
              <RecentActivityPanel />
              <AchievementsPanel />
            </View>
            <BossesPanel compact conqueredCount={conqueredCount} />
          </>
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

function VipLockedPanel({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <GoldCard style={s.vipLockedPanel}>
      <Text style={s.vipLockedIcon}>🔒</Text>
      <Text style={s.vipLockedTitle}>MATCH STATS — VIP ONLY</Text>
      <Text style={s.vipLockedSub}>Unlock win rate, match history, and best hand tracking</Text>
      <TouchableOpacity style={s.unlockVipBtn} onPress={onUpgrade}>
        <Text style={s.unlockVipText}>UNLOCK WITH VIP →</Text>
      </TouchableOpacity>
    </GoldCard>
  )
}

function StatsPanel() {
  return (
    <GoldCard style={s.statsPanel}>
      <StatItem icon="🎯" label="WIN RATE" value={`${MOCK.winRate}%`} sub="TOP 22%" />
      <View style={s.vLine} />
      <StatItem icon="⚔️" label="MATCHES" value={`${MOCK.totalMatches}`} sub="TOTAL PLAYED" />
      <View style={s.vLine} />
      <StatItem icon="♠" label="BEST HAND" value={MOCK.bestHand} sub="HIGHEST" small />
      <View style={s.vLine} />
      <StatItem icon="🔥" label="STREAK" value={`${MOCK.streakDays} Days`} sub="CURRENT" small />
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

function RecentActivityPanel() {
  return (
    <GoldCard style={s.listPanel}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>RECENT ACTIVITY</Text>
        <Text style={s.viewAll}>VIEW ALL ›</Text>
      </View>
      {MOCK.recentMatches.map(m => (
        <View key={m.id} style={s.activityRow}>
          <View style={s.enemyCircle}><Text style={s.enemyIcon}>{m.result === 'win' ? '☠️' : '👹'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.activityTitle}>vs {m.opponent}</Text>
            <Text style={s.activityTime}>{m.ago}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.resultText, { color: m.result === 'win' ? C.green : C.red }]}>{m.result.toUpperCase()}</Text>
            <Text style={[s.deltaText, { color: m.delta > 0 ? C.green : C.red }]}>{m.delta > 0 ? '+' : ''}{fmt(m.delta)}</Text>
          </View>
        </View>
      ))}
    </GoldCard>
  )
}

function AchievementsPanel() {
  return (
    <GoldCard style={s.listPanel}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>ACHIEVEMENTS</Text>
        <Text style={s.viewAll}>VIEW ALL ›</Text>
      </View>
      {MOCK.achievements.map(a => (
        <View key={a.id} style={s.achievementRow}>
          <Text style={s.achievementIcon}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.achievementName}>{a.name}</Text>
            <Text style={s.achievementDate}>{a.date}</Text>
          </View>
          <Text style={s.checkIcon}>✓</Text>
        </View>
      ))}
    </GoldCard>
  )
}

function BossesPanel({ compact, conqueredCount }: { compact?: boolean; conqueredCount: number }) {
  return (
    <GoldCard style={compact ? s.bossPanelCompact : s.bossPanel}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>HALL OF BOSSES</Text>
        <Text style={s.conqueredText}>{conqueredCount} / {MOCK.bossesConquered.length} CONQUERED</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bossScroll}>
        {MOCK.bossesConquered.map(b => (
          <View key={b.id} style={[s.bossCard, !b.conquered && s.bossLocked]}>
            <Text style={s.bossIcon}>{b.conquered ? b.icon : '🗿'}</Text>
            <View style={[s.bossStatus, b.conquered ? s.bossStatusWin : s.bossStatusLock]}>
              <Text style={s.bossStatusText}>{b.conquered ? '✓' : '🔒'}</Text>
            </View>
            <Text style={s.bossName} numberOfLines={1}>{b.name}</Text>
          </View>
        ))}
      </ScrollView>
    </GoldCard>
  )
}

function SocialPanel() {
  return (
    <GoldCard style={s.socialPanel}>
      <StatItem icon="👥" label="FOLLOWING" value={`${MOCK.following}`} sub="PLAYERS" />
      <View style={s.vLine} />
      <StatItem icon="🌟" label="FOLLOWERS" value={`${MOCK.followers}`} sub="FANS" />
    </GoldCard>
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
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  rankIcon: { fontSize: 14 },
  rankLabel: { color: C.textSec, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  rankValue: { color: C.gold, fontSize: 15, fontWeight: '900', marginLeft: 2 },
  progressTrack: {
    height: 8, borderRadius: 4,
    borderWidth: 1, borderColor: C.border,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 4 },
  progressSub: { color: C.textDim, fontSize: 10, marginTop: 5, fontWeight: '600' },

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

  debtBadge: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderWidth: 1.5,
    borderColor: C.red,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debtTitle: { color: C.red, fontWeight: '900', fontSize: 11 },
  debtSub: { color: C.textSec, flex: 1, fontSize: 10 },
  debtBtn: { backgroundColor: C.red, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  debtBtnText: { color: '#fff', fontWeight: '900', fontSize: 10 },

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

  vipLockedPanel: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: 20, alignItems: 'center', borderColor: C.gold,
  },
  vipLockedIcon: { fontSize: 28, marginBottom: 6 },
  vipLockedTitle: { color: C.gold, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  vipLockedSub: { color: C.textSec, fontSize: 10, textAlign: 'center', marginBottom: 12 },
  unlockVipBtn: {
    backgroundColor: 'rgba(255,215,106,0.10)',
    borderWidth: 1.5, borderColor: C.gold, borderStyle: 'dashed',
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20,
  },
  unlockVipText: { color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

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

  twoColumnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  listPanel: { flex: 1, padding: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  panelTitle: { flex: 1, color: C.textPrimary, fontSize: 11, fontWeight: '900' },
  viewAll: { color: C.gold, fontSize: 10, fontWeight: '900' },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border,
  },
  enemyCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  enemyIcon: { fontSize: 16 },
  activityTitle: { color: C.textPrimary, fontSize: 11, fontWeight: '800' },
  activityTime: { color: C.textDim, fontSize: 9, marginTop: 2 },
  resultText: { fontSize: 9, fontWeight: '900' },
  deltaText: { fontSize: 11, fontWeight: '900', marginTop: 3 },
  achievementRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border,
  },
  achievementIcon: { fontSize: 22 },
  achievementName: { color: C.textPrimary, fontSize: 11, fontWeight: '900' },
  achievementDate: { color: C.textDim, fontSize: 9, marginTop: 2 },
  checkIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(141,255,181,0.15)',
    color: C.green, borderWidth: 1, borderColor: C.green,
    textAlign: 'center', lineHeight: 20, fontSize: 14, fontWeight: '900',
  },

  bossPanel: { marginTop: 12, padding: 14 },
  bossPanelCompact: { marginTop: 12, padding: 14 },
  conqueredText: { color: C.textSec, fontSize: 10, fontWeight: '900' },
  bossScroll: { gap: 8, paddingTop: 4, paddingRight: 8 },
  bossCard: {
    width: 70, minHeight: 88,
    backgroundColor: C.card,
    borderRadius: 10, borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', paddingTop: 8, paddingHorizontal: 4,
  },
  bossLocked: { opacity: 0.45 },
  bossIcon: { fontSize: 28 },
  bossStatus: {
    position: 'absolute', right: 4, top: 4,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  bossStatusWin: { backgroundColor: C.green },
  bossStatusLock: { backgroundColor: C.textDim },
  bossStatusText: { color: C.bg, fontSize: 9, fontWeight: '900' },
  bossName: { color: C.textPrimary, fontSize: 9, fontWeight: '800', marginTop: 6, textAlign: 'center' },

  socialPanel: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: 16, flexDirection: 'row', alignItems: 'center',
  },
})
