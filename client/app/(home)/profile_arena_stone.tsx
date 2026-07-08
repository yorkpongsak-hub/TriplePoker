// app/(home)/profile.tsx
// Profile Screen -- TriplePoker (Bright Stone Arena version, Mock Data)
// ลุงเยาะตรวจ UI ก่อน ค่อยเชื่อม DB ทีหลังในครั้งเดียว
// The Sage Unicorn Studio Co., Ltd.

import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, StatusBar, ScrollView,
} from 'react-native'
import { router } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'

// ─── Bright Stone Arena Theme ───────────────────────────────
const C = {
  bg:          '#E9DEC9',
  sky:         '#9FD2F4',
  stone:       '#F5EFE3',
  stone2:      '#E7D9C3',
  stone3:      '#D2C1A8',
  border:      '#B7A388',
  borderDark:  '#8C785F',
  ink:         '#2E2E2E',
  inkSoft:     '#585044',
  inkDim:      '#7C715F',
  gold:        '#D6A52E',
  goldDark:    '#8B6417',
  blue:        '#2E6FA8',
  green:       '#5D9A4A',
  purple:      '#7C4FC7',
  red:         '#C84C3E',
  white:       '#FFFDF7',
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
  debt:           1_500,
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
}

// ─── Tier config ─────────────────────────────────────────────
const TIER_INFO: Record<string, { label: string; color: string }> = {
  D: { label: 'DEMO',       color: C.inkDim },
  C: { label: 'INITIATE',   color: C.green  },
  B: { label: 'ADEPT',      color: C.blue   },
  A: { label: 'MASTERMIND', color: C.purple },
  S: { label: 'HIGH NOBLE', color: C.gold   },
}

const VIP_INFO: Record<string, { label: string; color: string } | null> = {
  free: null,
  vip:  { label: 'VIP',     color: C.gold   },
  pro:  { label: 'VIP PRO', color: C.purple },
}

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = Math.round((MOCK.xpNow / MOCK.xpNext) * 100)

type TabKey = 'stats' | 'bosses' | 'history' | 'social'

export default function ProfileScreen() {
  const signOut = useAuthStore(s => s.signOut)
  const [activeTab, setActiveTab] = useState<TabKey>('stats')

  const tierInfo = TIER_INFO[MOCK.tier]
  const vipInfo  = VIP_INFO[MOCK.vipStatus]
  const conqueredCount = MOCK.bossesConquered.filter(b => b.conquered).length

  const handleLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleSettings = () => {
    console.log('Settings pressed')
  }

  //const handleEditProfile = () => {
//    router.push('/(auth)/setup-profile')
 // }

  const handlePlay = () => {
    router.push('/(home)/lobby')
  }

  const handleShop = () => {
    // TODO: เปลี่ยน path ให้ตรงกับหน้า shop จริงของลุง
    router.push('/(home)/shop')
  }

  const handleHallOfFame = () => {
    // TODO: เปลี่ยน path ให้ตรงกับหน้า Hall of Fame จริงของลุง
    router.push('/(home)/hall-of-fame')
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.sky} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.skyHeader}>
          <TouchableOpacity onPress={handleSettings} style={s.iconBtn}>
            <Text style={s.iconText}>⚙</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.iconBtn}>
            <Text style={s.iconText}>🔔</Text>
            <View style={s.notifyDot}>
              <Text style={s.notifyText}>2</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={s.iconBtn}>
            <Text style={s.iconText}>🚪</Text>
          </TouchableOpacity>
        </View>

        {/* ═══════════════ HERO PLAYER CARD ═══════════════ */}
        <StoneCard style={s.heroCard}>
          <TouchableOpacity onPress={handleEditProfile} style={s.avatarFrame} activeOpacity={0.85}>
            <Text style={s.avatarEmoji}>{MOCK.avatar}</Text>
            <View style={s.editBubble}>
              <Text style={s.editIcon}>✎</Text>
            </View>
          </TouchableOpacity>

          <View style={s.heroInfo}>
            <Text style={s.userName} numberOfLines={1}>{MOCK.name}</Text>
            <View style={s.badgeRow}>
              <View style={[s.tierBadge, { borderColor: tierInfo.color }]}> 
                <Text style={s.tierShield}>{MOCK.tier}</Text>
                <Text style={[s.badgeText, { color: C.ink }]}>{tierInfo.label}</Text>
              </View>
              {vipInfo && (
                <View style={[s.vipBadge, { borderColor: vipInfo.color }]}> 
                  <Text style={[s.badgeText, { color: vipInfo.color }]}>{vipInfo.label} ♛</Text>
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
            <Text style={s.progressSub}>{fmt(MOCK.xpNow)} / {fmt(MOCK.xpNext)} XP to Mythic</Text>
          </View>
        </StoneCard>

        {/* ═══════════════ RESOURCE PANEL ═══════════════ */}
        <StoneCard style={s.resourceCard}>
          <ResourceBox icon="🪙" label="TOKEN" value={fmt(MOCK.token)} />
          <View style={s.vLine} />
          <ResourceBox icon="👑" label="CROWN" value={`${MOCK.crown}`} />
          <View style={s.vLine} />
          <ResourceBox icon="💎" label="VIP STATUS" value={vipInfo?.label ?? 'FREE'} valueColor={vipInfo?.color ?? C.ink} />
        </StoneCard>

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
          <ActionButton icon="👑" title="Treasury" sub="DECKS & ITEMS" color={C.green} onPress={handleShop} />
          <ActionButton icon="🏅" title="Path of Ascendants" sub="LEGENDS & RANKING" color={C.gold} darkText onPress={handleHallOfFame} />
        </View>

        {/* ═══════════════ TABS ═══════════════ */}
        <View style={s.tabsRow}>
          <TabButton label="STATS" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
          <TabButton label="BOSSES" active={activeTab === 'bosses'} onPress={() => setActiveTab('bosses')} />
          <TabButton label="HISTORY" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
          <TabButton label="SOCIAL" active={activeTab === 'social'} onPress={() => setActiveTab('social')} />
        </View>

        {activeTab === 'stats' && <StatsPanel />}
        {activeTab === 'bosses' && <BossesPanel conqueredCount={conqueredCount} />}
        {activeTab === 'history' && <HistoryPanel />}
        {activeTab === 'social' && <SocialPanel />}

        {/* Show compact lower panels on Stats tab like the mockup */}
        {activeTab === 'stats' && (
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

function StoneCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.stoneCard, style]}>{children}</View>
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
      <Text style={[s.actionTitle, darkText ? { color: C.ink } : null]}>{title}</Text>
      <Text style={[s.actionSub, darkText ? { color: C.inkSoft } : null]}>{sub}</Text>
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

function StatsPanel() {
  return (
    <StoneCard style={s.statsPanel}>
      <StatItem icon="🎯" label="WIN RATE" value={`${MOCK.winRate}%`} sub="TOP 22%" />
      <View style={s.vLine} />
      <StatItem icon="⚔️" label="MATCHES" value={`${MOCK.totalMatches}`} sub="TOTAL PLAYED" />
      <View style={s.vLine} />
      <StatItem icon="♠" label="BEST HAND" value={MOCK.bestHand} sub="HIGHEST" small />
      <View style={s.vLine} />
      <StatItem icon="🔥" label="STREAK" value={`${MOCK.streakDays} Days`} sub="CURRENT" small />
    </StoneCard>
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
    <StoneCard style={s.listPanel}>
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
    </StoneCard>
  )
}

function AchievementsPanel() {
  return (
    <StoneCard style={s.listPanel}>
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
    </StoneCard>
  )
}

function BossesPanel({ compact, conqueredCount }: { compact?: boolean; conqueredCount: number }) {
  return (
    <StoneCard style={compact ? s.bossPanelCompact : s.bossPanel}>
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
    </StoneCard>
  )
}

function HistoryPanel() {
  return <RecentActivityPanel />
}

function SocialPanel() {
  return (
    <StoneCard style={s.socialPanel}>
      <StatItem icon="👥" label="FOLLOWING" value="24" sub="PLAYERS" />
      <View style={s.vLine} />
      <StatItem icon="🌟" label="FOLLOWERS" value="8" sub="FANS" />
    </StoneCard>
  )
}

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 14, paddingBottom: 34 },
  skyHeader: {
    minHeight: 96,
    backgroundColor: C.sky,
    marginHorizontal: -14,
    paddingHorizontal: 20,
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconBtn: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: C.stone,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  iconText: { fontSize: 22 },
  notifyDot: {
    position: 'absolute', right: -6, top: -6,
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.white,
  },
  notifyText: { color: C.white, fontSize: 11, fontWeight: '900' },

  stoneCard: {
    backgroundColor: C.stone,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  heroCard: {
    marginTop: -26,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarFrame: {
    width: 116, height: 116, borderRadius: 58,
    backgroundColor: '#D9EAF2',
    borderWidth: 5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 64 },
  editBubble: {
    position: 'absolute', right: -4, bottom: 2,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.stone2,
    borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  editIcon: { color: C.ink, fontSize: 18, fontWeight: '900' },
  heroInfo: { flex: 1, minWidth: 0 },
  userName: { color: C.ink, fontSize: 34, fontWeight: '900', letterSpacing: 0.4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3B332B',
    borderRadius: 7, borderWidth: 2,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  tierShield: { color: C.gold, fontSize: 18, fontWeight: '900' },
  vipBadge: {
    backgroundColor: '#EFE2FF',
    borderRadius: 7, borderWidth: 2,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  badgeText: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rankIcon: { fontSize: 20 },
  rankLabel: { color: C.inkSoft, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  rankValue: { color: C.purple, fontSize: 26, fontWeight: '900', marginLeft: 4 },
  progressTrack: {
    height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: C.borderDark,
    backgroundColor: C.stone3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 7 },
  progressSub: { color: C.inkSoft, fontSize: 13, marginTop: 7, fontWeight: '600' },

  resourceCard: {
    marginTop: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resourceBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resourceIcon: { fontSize: 34 },
  resourceLabel: { color: C.ink, fontSize: 12, fontWeight: '900' },
  resourceValue: { color: C.ink, fontSize: 23, fontWeight: '900', marginTop: 2 },
  vLine: { width: 1, minHeight: 50, backgroundColor: C.stone3 },

  debtBadge: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#F7D8D3',
    borderWidth: 2,
    borderColor: C.red,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debtTitle: { color: C.red, fontWeight: '900', fontSize: 12 },
  debtSub: { color: C.inkSoft, flex: 1, fontSize: 11 },
  debtBtn: { backgroundColor: C.red, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  debtBtnText: { color: C.white, fontWeight: '900', fontSize: 11 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: C.borderDark,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: { fontSize: 28, marginBottom: 4 },
  actionTitle: { color: C.white, fontSize: 21, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  actionSub: { color: '#F8F3E9', fontSize: 10, fontWeight: '800', marginTop: 2, textAlign: 'center' },

  tabsRow: { flexDirection: 'row', marginTop: 14 },
  tabBtn: {
    flex: 1,
    backgroundColor: C.stone,
    borderWidth: 2,
    borderColor: C.border,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    marginRight: -1,
  },
  tabBtnActive: { backgroundColor: '#66605A', borderColor: C.borderDark },
  tabText: { color: C.inkSoft, fontSize: 15, fontWeight: '900' },
  tabTextActive: { color: C.white },

  statsPanel: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingVertical: 18,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statIcon: { fontSize: 24, marginBottom: 4 },
  statLabel: { color: C.inkSoft, fontSize: 11, fontWeight: '900' },
  statValue: { color: C.ink, fontSize: 24, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  statValueSmall: { fontSize: 15 },
  statSub: { color: C.inkDim, fontSize: 10, fontWeight: '700', marginTop: 5, textAlign: 'center' },

  twoColumnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  listPanel: { flex: 1, padding: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  panelTitle: { flex: 1, color: C.ink, fontSize: 13, fontWeight: '900' },
  viewAll: { color: C.blue, fontSize: 11, fontWeight: '900' },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.stone3,
  },
  enemyCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.stone2,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  enemyIcon: { fontSize: 22 },
  activityTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  activityTime: { color: C.inkDim, fontSize: 10, marginTop: 2 },
  resultText: { fontSize: 11, fontWeight: '900' },
  deltaText: { fontSize: 13, fontWeight: '900', marginTop: 3 },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.stone3,
  },
  achievementIcon: { fontSize: 30 },
  achievementName: { color: C.ink, fontSize: 13, fontWeight: '900' },
  achievementDate: { color: C.inkDim, fontSize: 10, marginTop: 2 },
  checkIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#E4F1DD',
    color: C.green,
    borderWidth: 1,
    borderColor: C.border,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 18,
    fontWeight: '900',
  },

  bossPanel: { marginTop: 12, padding: 14 },
  bossPanelCompact: { marginTop: 12, padding: 14 },
  conqueredText: { color: C.inkSoft, fontSize: 12, fontWeight: '900' },
  bossScroll: { gap: 8, paddingTop: 4, paddingRight: 8 },
  bossCard: {
    width: 78,
    minHeight: 100,
    backgroundColor: C.stone2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  bossLocked: { opacity: 0.48 },
  bossIcon: { fontSize: 34 },
  bossStatus: {
    position: 'absolute', right: 4, top: 4,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  bossStatusWin: { backgroundColor: C.green },
  bossStatusLock: { backgroundColor: C.inkDim },
  bossStatusText: { color: C.white, fontSize: 12, fontWeight: '900' },
  bossName: { color: C.ink, fontSize: 10, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  socialPanel: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
})
