// app/(home)/profile.tsx
// Profile Screen -- TriplePoker (Merged: Arena layout + Brand theme colors)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Pressable,
  StyleSheet, StatusBar, ScrollView, Image, Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { useBgm } from '../../src/services/bgmService'
import { ActionButton } from '../../src/components/ui/ActionButton'
import { MenuButton } from '../../src/components/ui/MenuButton'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanel, glassPanelDense } from '../../src/ui/glassStyles'
import { getAuthoritativeDisplayTier, TierKey } from '../../src/config/tierConfig'
import { supabase } from '../../src/services/supabaseService'
import ProfilePicturePicker from '../../src/components/profile/ProfilePicturePicker'
import SettingsModal from '../../src/components/profile/SettingsModal'
import { AvatarDisplay, PRESET_AVATARS, AvatarConfig } from '../../src/components/profile/AvatarPicker'
import { TierUnlockOverlay } from '../../src/components/vfx/TierUnlockOverlay'
import LegendaryCardVFX from '../../src/components/vfx/LegendaryCardVFX'
import BeyondPathChoice, { BeyondPath } from '../../src/components/vfx/BeyondPathChoice'
import MatchHistoryList from '../../src/components/profile/MatchHistoryList'
import BossStatsPanel from '../../src/components/profile/BossStatsPanel'
import LorePanel from '../../src/components/profile/LorePanel'
import { Image as ExpoImage } from 'expo-image'
import MyCollectiblesPanel from '../../src/components/profile/MyCollectiblesPanel'
import MyBadgesPanel from '../../src/components/profile/MyBadgesPanel'
import { BADGES } from '../../assets/badges/BADGE_MANIFEST'
import AvatarFrame from '../../src/components/game/AvatarFrame'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

// Tier Unlock Ceiling Model - ต้องตรงกับ TIER_ORDER ใน server/src/game/tierUnlockService.ts เป๊ะ (camelCase)
const TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const

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
  name:   'Player',
  avatar: '🐉',
}

// ─── Tier / VIP config ────────────────────────────────────────
const TIER_INFO: Record<string, { label: string; color: string }> = {
  D:  { label: 'DEMO',        color: C.textDim },
  C:  { label: 'INITIATE',    color: C.green   },
  B:  { label: 'ADEPT',       color: C.blue    },
  A:  { label: 'MASTERMIND',  color: C.purple  },
  'A+': { label: 'HIGH NOBLE', color: C.gold    },
  S:  { label: 'GRANDMASTER', color: C.gold    },
  'S+': { label: 'SOVEREIGN', color: C.goldDark },
}

// Map TierKey (คำนวณสดจาก token_balance ใน tierConfig.ts) -> letter grade ของ TIER_INFO ด้านบน
// Ascendant(S)/Last Boss(S+) ไม่อยู่ใน map นี้เพราะไม่ใช่ token-threshold tier (คำนวณสดไม่ได้ — ยัง stub)
const TIER_KEY_LETTER: Record<TierKey, string> = {
  initiate:   'C',
  adept:      'B',
  mastermind: 'A',
  highNoble:  'A+',
  grandmaster: 'S',
}

const VIP_INFO: Record<string, { label: string; color: string } | null> = {
  none:    null,
  vip:     { label: 'VIP',     color: C.gold     },
  vip_pro: { label: 'VIP PRO', color: C.goldDark },
}

const fmt = (n: number) => n.toLocaleString('en-US')

const formatLastVisited = (value: string | null | undefined) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'

  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// Monarch_Spec_v1_3 §4/§5 — Performance Score + Ascendant Gate ปลดล็อคตั้งแต่ Tier A+ (highNoble) ขึ้นไปเท่านั้น
const ASCENDANT_TOKEN_MIN = 600_000
const ASCENDANT_TOKEN_MAX = 999_999

type TabKey = 'stats' | 'bosses' | 'history' | 'lore'

export default function ProfileScreen() {
  useBgm() // LobbyMatchmaking_Spec_v1_0 §2 — BGM เล่นต่อเนื่องข้าม Profile/Shop/Lobby/Hall of Fame
  const signOut = useAuthStore(s => s.signOut)
  const profile = useAuthStore(s => s.profile)
  const refreshProfile = useAuthStore(s => s.refreshProfile)
  const authUser = useAuthStore(s => s.user)
  const session = useAuthStore(s => s.session) // ใช้แนบ Bearer token ตอน POST /profile/celebrate-tier
  const [activeTab, setActiveTab] = useState<TabKey>('stats')

  // บันทึกเวลาเข้า Profile ก่อน แล้วจึง refetch เพื่อให้หน้าจอเห็นค่าล่าสุดจากฐานข้อมูล
  useFocusEffect(
    useCallback(() => {
      let isActive = true

      const syncProfileVisit = async () => {
        const accessToken = session?.access_token
        if (accessToken) {
          try {
            const response = await fetch(`${SERVER_URL}/profile/touch-last-login`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!response.ok) console.error('[Profile] last_login update HTTP', response.status)
          } catch (error) {
            console.error('[Profile] last_login update failed:', error)
          }
        }

        if (isActive) await refreshProfile()
      }

      void syncProfileVisit()
      return () => { isActive = false }
    }, [refreshProfile, session?.access_token])
  )

  // ─── Real data จาก authStore (fallback MOCK เผื่อ profile ยังโหลดไม่เสร็จ) ───
  const displayName = profile?.display_name  || MOCK.name
  const avatar      = profile?.avatar_url    || MOCK.avatar
  const vipStatus   = profile?.vip_status    || 'none'
  const token       = profile?.token_balance ?? 0
  const crown       = profile?.crown_balance ?? 0
  const xpNow       = profile?.xp            ?? 0
  // Patch (2026-07-17): ยืนยันแล้วว่า streak_count มีอยู่จริงบน live DB (ลุงเช็ค Table Editor
  // ให้แล้ว) — comment เดิมที่บอกว่าคอลัมน์ไม่มีล้าสมัยไปแล้ว ต่อสายเป็นค่าจริงจาก authStore
  const streakDays  = profile?.streak_count ?? 0
  const hasSevenDayBadge = profile?.streak_7days_badge ?? false

  // Badge Shop — badge ที่ equip อยู่ตอนนี้ (ดู MyBadgesPanel.tsx สำหรับ UI เลือก equip)
  const equippedBadgeKey = profile?.equipped_badge_key ?? null
  const equippedBadgeSource = equippedBadgeKey ? (BADGES as Record<string, any>)[equippedBadgeKey] : null

  // Tier คำนวณสดจาก token เสมอ — เลิกอ่าน profile.tier ตรงๆ เพราะคอลัมน์นั้นไม่มี pipeline ไหนอัปเดตจริง
  // (ดูปัญหาเดิม: Top Bar ไม่ตรงกับ Tiers Unlocked) getTierFromToken คืนแค่ 4 tier หลัก ไม่มี crash เพราะ token
  // เป็นตัวเลขเสมอ (fallback 0 ถ้า profile ยังโหลดไม่เสร็จ — ห้ามใช้ค่าปลอมที่ดูสมจริง)
  const liveTier  = getAuthoritativeDisplayTier(token, profile?.tier_unlocked_max)
  const tierLetter = TIER_KEY_LETTER[liveTier]

  // Monarch_Spec_v1_3 §4/§5 — ต้องรัน supabase/migrations/006_monarch_spawn_reward.sql ก่อน คอลัมน์นี้ถึงจะมีค่าจริง
  const careerPS = profile?.performance_score ?? 0   // Career PS — lifetime, ห้ามรีเซ็ต
  const seasonPS = profile?.ps_season ?? 0            // Season PS — เกณฑ์แข่งขัน/Ascendant Star, รีเซ็ตตาม tournament
  const monarchVictories = profile?.monarch_victories ?? 0
  const isPSUnlocked     = liveTier === 'highNoble' || liveTier === 'grandmaster'
  const isMonarchSlayer  = monarchVictories >= 1
  const showAscendantHint = isPSUnlocked && !isMonarchSlayer && token >= ASCENDANT_TOKEN_MIN && token <= ASCENDANT_TOKEN_MAX

  const tierInfo = TIER_INFO[tierLetter] ?? TIER_INFO['C']
  const vipInfo  = VIP_INFO[vipStatus]
  const isVip    = vipStatus !== 'none' // VIP Shimmer Effect — ใช้ vip_status ที่มีอยู่แล้ว ไม่สร้าง state/query ใหม่
  // Batch 2 (VIP-02) — สิทธิ์เข้า VIP Plus ต้องเป็น vip_pro เท่านั้น ห้ามใช้ isVip เดิม (นั่นคือ !== 'none'
  // กว้างเกินไป จะทำให้ VIP ธรรมดาเห็นปุ่มด้วย) เก็บ selector แยกต่างหากจากของเดิมทั้งหมด
  const isVipPlusEligible = vipStatus === 'vip_pro'

  // ─── Tier Unlock Celebration (Ceiling Model) — เด้ง VFX ที่ Profile ตอนเปิดแอป ───
  // tier_unlocked_max = single source of truth (server เขียนผ่าน checkTierUnlock() ใน settleEscrow)
  // เทียบกับ tier_unlock_celebrated (array ที่เคยฉลองแล้ว) หา tier ที่ยังค้าง — โชว์แค่ tier สูงสุดตัวเดียว
  // แต่ POST mark ครบทุกตัวที่ค้างตอนปิด overlay (เผื่อข้ามหลายชั้นพร้อมกัน)
  const [overlayTier, setOverlayTier] = useState<string | null>(null)
  const [tierUnlockVfxStage, setTierUnlockVfxStage] = useState<'legendary' | 'original' | 'path'>('legendary')
  // celebratingRef: true ระหว่างโชว์ overlay/รอ POST เสร็จ — กัน useFocusEffect ยิง refreshProfile ซ้ำ
  // แล้ว trigger useEffect ด้านล่างซ้ำก่อน mark celebrated เสร็จ (bug class เดียวกับ lobby.tsx เดิม)
  const celebratingRef = useRef(false)
  const pendingCelebrateRef = useRef<string[]>([])

  useEffect(() => {
    if (!profile || celebratingRef.current) return
    const maxIdx = (TIER_ORDER as readonly string[]).indexOf(profile.tier_unlocked_max ?? 'D')
    if (maxIdx <= 0) return // 'D' หรือค่าที่ไม่รู้จัก (indexOf = -1) — ไม่มีอะไรให้ฉลอง
    const celebrated = new Set(profile.tier_unlock_celebrated ?? [])
    const pending = TIER_ORDER.slice(1, maxIdx + 1).filter(t => !celebrated.has(t))
    if (pending.length === 0) return
    celebratingRef.current = true
    pendingCelebrateRef.current = pending
    setTierUnlockVfxStage('legendary')
    setOverlayTier(pending[pending.length - 1]) // TIER_ORDER เรียงต่ำ→สูงอยู่แล้ว ตัวท้ายคือสูงสุด
  }, [profile])

  const handleCloseTierUnlock = async () => {
    setOverlayTier(null)
    const toMark = pendingCelebrateRef.current
    pendingCelebrateRef.current = []
    const accessToken = session?.access_token
    // ไม่มี token = mark ไม่ได้เลย ต้อง log ไม่งั้นพังเงียบ (VFX จะเด้งซ้ำรอบหน้า)
    if (!accessToken) console.error('[Profile] celebrate-tier skipped: no token | pending:', toMark)
    if (accessToken) {
      for (const tier of toMark) {
        try {
          const res = await fetch(`${SERVER_URL}/profile/celebrate-tier`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ tier }),
          })
          // fetch ไม่ throw เมื่อ HTTP error (400/401/500) — ต้องเช็ค res.ok เอง ไม่งั้นพังเงียบ
          if (!res.ok) {
            const body = await res.text()
            console.error('[Profile] celebrate-tier HTTP', res.status, '| tier:', tier, '| body:', body)
          } else {
            console.log('[Profile] celebrate-tier OK:', tier)
          }
        } catch (e) {
          console.error('[Profile] celebrate-tier network error:', e, '| tier:', tier)
        }
      }
      await refreshProfile()
    }
    celebratingRef.current = false
  }

  const handleOriginalTierUnlockClose = async () => {
    if (overlayTier === 'grandmaster' && !profile?.beyond_path) {
      setTierUnlockVfxStage('path')
      return
    }
    await handleCloseTierUnlock()
    // Free members (ไม่ใช่ VIP/VIP Pro) เจอโฆษณาทันทีหลังปิด Tier Unlock (มติลุงเยาะ 2026-08-14)
    // VIP ทุกระดับข้ามโฆษณาเสมอ — ใช้ isVip เดิม (vipStatus !== 'none') ไม่สร้าง selector ใหม่
    if (!isVip) {
      router.push({ pathname: '/(home)/watch-ad', params: { returnTo: '/(home)/profile' } } as any)
    }
  }

  const handleChooseBeyondPath = async (path: BeyondPath) => {
    const accessToken = session?.access_token
    if (!accessToken) throw new Error('Your session expired. Please sign in again.')
    const res = await fetch(`${SERVER_URL}/profile/beyond-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ path }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok && body?.error !== 'PATH_ALREADY_CHOSEN') throw new Error(body?.error ?? 'Could not save your path.')
    await handleCloseTierUnlock()
  }

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

  const confirmLogout = async () => {
    await signOut()
    router.replace('/(auth)/login')
  }

  const handleLogout = () => {
    Alert.alert(
      'Log out?',
      'Are you sure you want to log out of this account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: () => void confirmLogout() },
      ],
    )
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
    // Graveyard of the Legends — สุสาน AI Boss ของ The Arena (teaser, ยังไม่มีข้อมูลจริงจนกว่า Arena เปิด)
    router.push('/(home)/legends')
  }

  return (
    <ThemedBackground isVip={isVip}>
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ─── Tier Unlock Celebration — เด้งตอนเปิดแอปถ้ามี Tier ที่ยังไม่เคยฉลอง ─── */}
      {overlayTier && tierUnlockVfxStage === 'legendary' && (
        <LegendaryCardVFX
          title="TIER UNLOCKED"
          subtitle={`${TIER_INFO[TIER_KEY_LETTER[overlayTier as TierKey]]?.label ?? overlayTier.toUpperCase()} • TIER ${TIER_KEY_LETTER[overlayTier as TierKey] ?? ''}`}
          onFinish={() => setTierUnlockVfxStage('original')}
        />
      )}
      {overlayTier && tierUnlockVfxStage === 'original' && (
        <TierUnlockOverlay tier={overlayTier} onClose={handleOriginalTierUnlockClose} />
      )}
      {overlayTier === 'grandmaster' && tierUnlockVfxStage === 'path' && (
        <BeyondPathChoice onChoose={handleChooseBeyondPath} />
      )}

      {/* ─── Toast: Coming Soon (Friends/Ranking/Legends) — pattern เดียวกับ lobby.tsx ─── */}
      {comingSoonMsg && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{comingSoonMsg}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══════════════ TOP HEADER ═══════════════ */}
        <View style={s.topHeader}>
          <MenuButton icon="settings" label="Settings" size="sm" onPress={handleSettings} vipShimmer={isVip} />
          <View style={s.playerProfileLabel}>
            <LinearGradient
              colors={[C.goldDark, C.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={s.playerProfileLabelText}>Player Profile</Text>
          </View>
          <MenuButton icon="exit" label="Logout" size="sm" onPress={handleLogout} vipShimmer={isVip} />
        </View>

        {/* ═══════════════ HERO PLAYER CARD ═══════════════ */}
        <GoldCard style={s.heroCard}>
          <TouchableOpacity onPress={handleEditProfile} style={s.avatarFrame} activeOpacity={0.85}>
            {/* Badge Shop — equipped badge โผล่หลัง Avatar (มติลุงเยาะ 2026-08-15: Z-order ต่ำกว่า
                Avatar/กรอบเสมอ, Avatar ทับด้านล่างของ badge ไม่เกิน ~20% ของความสูง badge — render
                ก่อนเสมอที่นี่เพื่อให้อยู่ชั้นล่าง ไม่ต้องพึ่ง zIndex) */}
            {equippedBadgeSource && (
              <ExpoImage source={equippedBadgeSource} style={s.equippedBadgeImg} contentFit="contain" pointerEvents="none" />
            )}
            {(() => {
              const avatarVisual = profileImageSignedUrl ? (
                <Image
                  source={{ uri: profileImageSignedUrl }}
                  style={{ width: 82, height: 82, borderRadius: 999 }}
                />
              ) : isKnownAvatarPreset ? (
                <AvatarDisplay config={avatarConfig} size={82} showFrame={false} />
              ) : (
                // avatar_url เก่าเป็น emoji ดิบ (ก่อนระบบ preset) — render ตรงๆ เหมือนเดิม ไม่ crash
                <Text style={s.avatarEmoji}>{avatar}</Text>
              )
              // Gold Radiance frame (มติลุงเยาะ 2026-07-26) — reuse กรอบเดียวกับที่ใช้ในหน้าเล่นเกม
              // (buy-in tables, active turn) เฉพาะสมาชิก VIP เท่านั้น — active=false เพราะไม่มีแนวคิด "ถึงตา" ที่นี่
              return isVip ? <AvatarFrame size={82} active={false}>{avatarVisual}</AvatarFrame> : avatarVisual
            })()}
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
            <View style={[s.tierBadge, s.tierBadgeAboveName, { borderColor: tierInfo.color }]}>
              <Text style={[s.tierBadgeText, { color: tierInfo.color }]}>
                [{tierLetter}] {tierInfo.label}
              </Text>
            </View>
            <Text style={s.userName} numberOfLines={1}>{displayName}</Text>
            <View style={s.badgeRow}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={[s.tierBadge, s.tierBadgePlaceholder, { borderColor: tierInfo.color }]}
              >
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
              {hasSevenDayBadge && (
                <View style={[s.vipBadge, { borderColor: '#ff8a3d', backgroundColor: 'rgba(255,138,61,0.14)' }]}>
                  <Text style={[s.vipBadgeText, { color: '#ffb36b' }]}>SEVEN-DAY FLAME 🔥</Text>
                </View>
              )}
            </View>
            <Text style={s.xpLine}>⭐ {fmt(xpNow)} XP</Text>
            <Text style={s.lastVisited}>Last visited: {formatLastVisited(profile?.last_login)}</Text>
          </View>
        </GoldCard>

        {/* ═══════════════ TOKEN / CROWN + PERFORMANCE SCORE — รวมคอนเทนเนอร์เดียว (มติลุงเยาะ
            2026-08-15 — เดิมแยก resourceCard/psCard 2 กล่อง) Season PS เด่น (เกณฑ์แข่งขัน/
            Ascendant Star) + Career PS รอง (lifetime, ห้ามรีเซ็ต) โชว์เฉพาะ Tier A+ ขึ้นไป —
            TODO: font JetBrains Mono ตาม spec ยังไม่ได้ load เข้า expo-font ในโปรเจกต์ ═══════════════ */}
        <GoldCard style={s.statsCard}>
          <View style={s.resourceRow}>
            <ResourceBox icon="🪙" label="TOKEN" value={fmt(token)} valueColor={C.gold} />
            <View style={s.vLine} />
            <ResourceBox icon="👑" label="CROWN" value={fmt(crown)} valueColor={C.goldDark} />
          </View>
          {isPSUnlocked && (
            <>
              <View style={s.statsDivider} />
              <View style={s.psSeasonRow}>
                <Text style={s.psSeasonLabel}>📊 SEASON PS</Text>
                <Text style={s.psSeasonValue}>{fmt(seasonPS)}</Text>
              </View>
              <Text style={s.psCareerValue}>Career PS (lifetime): {fmt(careerPS)}</Text>
            </>
          )}
        </GoldCard>

        {/* ═══════════════ ASCENDANT HINT (token 600k-999,999 ผ่าน A+ แต่ยังไม่ชนะ Monarch) ═══════════════ */}
        {/* มติลุงเยาะ — คนเห็น hint นี้คือคนที่ยังไม่เคยชนะ Monarch มาก่อนเสมอ (เงื่อนไข showAscendantHint) ห้ามสปอยล์ชื่อ */}
        {showAscendantHint && (
          <View style={s.ascendantHint}>
            <Text style={s.ascendantHintText}>Defeat the Hidden Boss to unlock Ascendant</Text>
          </View>
        )}

        {/* ═══════════════ VIP PLUS ENTRY (Batch 2, VIP-02) — vip_pro เท่านั้น ไม่ render อะไรเลยถ้าไม่ผ่าน ═══════════════ */}
        {isVipPlusEligible && (
          <TouchableOpacity style={s.vipPlusEntryBtn} onPress={() => router.push('/game/vipPlus' as any)}>
            <Text style={s.vipPlusEntryText}>VIP PLUS TABLE</Text>
            <Text style={s.vipPlusEntrySub}>VIP Pro Exclusive · 3–5 Human Players</Text>
            {/* มติลุงเยาะ — บรรทัดต่อท้ายบอกว่ากติกา VIP Plus (HOLDEM_G3 ฯลฯ) เป็นส่วนหนึ่งของการทดลอง "Beyond the Rules" */}
            <Text style={s.vipPlusEntrySub}>Beyond the Rules (Beta test)</Text>
          </TouchableOpacity>
        )}

        {/* ═══════════════ MAIN ACTIONS ═══════════════ */}
        <View style={s.playHeroWrap}>
          <ActionButton
            icon="play_royal_flush"
            label={'♠ ♥ ♦ ♣\nPLAY\nTriplePoker : Rise'}
            onPress={handlePlay}
            vipShimmer={isVip}
            labelStyle={s.playLabel}
          />
        </View>

        {/* ═══════════════ TABS (ย้ายขึ้นมาต่อจากปุ่ม Play — ผู้เล่นเห็นสถิติง่ายขึ้น) ═══════════════ */}
        <View style={s.tabsRow}>
          <TabButton label="STATS" active={activeTab === 'stats'} onPress={() => setActiveTab('stats')} />
          <TabButton label="BOSSES" active={activeTab === 'bosses'} onPress={() => setActiveTab('bosses')} />
          <TabButton label="VICTORY" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
          <TabButton label="LORE" active={activeTab === 'lore'} onPress={() => setActiveTab('lore')} />
        </View>

        {activeTab === 'stats' && (
          <>
            <StatsPanel streakDays={streakDays} streakShields={profile?.streak_shields ?? 0} gamesPlayed={profile?.games_played ?? 0} gamesWon={profile?.games_won ?? 0} bestHands={profile?.best_hands ?? null} />
            <MyCollectiblesPanel userId={profile?.user_id ?? authUser?.id ?? ''} />
            <MyBadgesPanel
              accessToken={session?.access_token}
              equippedBadgeKey={profile?.equipped_badge_key ?? null}
              onEquipChanged={refreshProfile}
            />
          </>
        )}
        {activeTab === 'bosses' && (
          <BossStatsPanel userId={profile?.user_id ?? authUser?.id ?? ''} />
        )}
        {activeTab === 'history' && (
          <MatchHistoryList userId={profile?.user_id ?? authUser?.id ?? ''} />
        )}
        {activeTab === 'lore' && (
          <LorePanel userId={profile?.user_id ?? authUser?.id ?? ''} tierUnlockedMax={profile?.tier_unlocked_max ?? null} monarchVictories={profile?.monarch_victories ?? 0} />
        )}

        <View style={s.secondaryRow}>
          <MenuButton icon="friends" label="Top10" size="sm" onPress={() => router.push('/(home)/top10')} vipShimmer={isVip} />
          <MenuButton icon="ranking" label="Ranking" size="sm" onPress={() => router.push('/(home)/stats')} vipShimmer={isVip} />
          <MenuButton icon="shop" label="Shop" size="sm" onPress={handleShop} vipShimmer={isVip} />
          <MenuButton icon="hall_of_fame" label="Legends" size="sm" onPress={handleTableOfLegends} vipShimmer={isVip} />
        </View>

        {/* TEMP DEV LINK (มติลุงเยาะ 2026-08-14) — ทางลัดเข้า /test/vfx ("VFX QA LAB") จากหน้าโปรไฟล์
            โดยตรง ไม่ต้องพิมพ์ URL เอง ตั้งใจให้หน้าตาแตกต่างจากปุ่มเมนูจริงชัดเจน (ข้อความเล็ก จาง)
            กันสับสนว่าเป็นฟีเจอร์จริง — ลบทิ้งก่อน launch ตุลาคม 2026 */}
        <TouchableOpacity onPress={() => router.push('/test/vfx' as any)} style={s.devVfxLink} activeOpacity={0.6}>
          <Text style={s.devVfxLinkText}>🧪 VFX QA Lab (dev only — remove before launch)</Text>
        </TouchableOpacity>
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
      {/* resourceTextWrap: ต้องมี flexShrink+minWidth:0 ไม่งั้นตัวเลขยาวจะดันตัวเองล้นไปทับ box ข้างๆ แทนที่จะหด */}
      <View style={s.resourceTextWrap}>
        <Text style={s.resourceLabel} numberOfLines={1}>{label}</Text>
        <Text
          style={[s.resourceValue, valueColor ? { color: valueColor } : null]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {value}
        </Text>
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

function StatsPanel({ streakDays, streakShields, gamesPlayed, gamesWon, bestHands }: {
  streakDays: number
  streakShields: number
  gamesPlayed: number
  gamesWon: number
  bestHands: Record<string, any> | null
}) {
  // Win rate — กัน division by zero ตอนผู้เล่นใหม่ยังไม่เคยเล่น
  const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : null
  // best_hands เก็บแยกตาม tier — หา score สูงสุดข้ามทุก tier
  let bestLabel: string | null = null
  if (bestHands) {
    let topScore = -1
    for (const entry of Object.values(bestHands)) {
      const e = entry as any
      if (e && typeof e.score === 'number' && e.score > topScore) {
        topScore = e.score
        bestLabel = e.rank ?? e.label ?? null
      }
    }
  }
  return (
    <GoldCard style={s.statsPanel}>
      <StatItem icon="🎯" label="WIN RATE" value={winRate !== null ? `${winRate}%` : '—'} sub={winRate !== null ? `${gamesWon} WINS` : 'NO DATA'} small />
      <View style={s.hLine} />
      <StatItem icon="⚔️" label="MATCHES" value={`${gamesPlayed}`} sub="PLAYED" small />
      <View style={s.hLine} />
      <StatItem icon="♠" label="BEST HAND" value={bestLabel ?? '—'} sub={bestLabel ? 'ALL TIME' : 'NO DATA'} small />
      <View style={s.hLine} />
      {/* มติลุงเยาะ 2026-08-14: แถวเดิมหน้าตาเหมือน stat แถวอื่นทุกอย่าง (ต่างแค่ "›" ต่อท้ายค่าที่เล็ก
          มาก) ไม่มีใครรู้ว่ากดได้ — ทำเป็นปุ่มจริงแยกออกจากแถว stat ธรรมดา: กรอบทอง+พื้นหลังทองจางๆ+
          ป้าย "BONUS STREAK" ชัดเจน+ลูกศรใหญ่ท้ายแถว เปลี่ยนสีจริงตอนกด (ตาม pattern เดียวกับปุ่ม Arena) */}
      <Pressable
        onPress={() => router.push('/(home)/streak')}
        hitSlop={6}
        style={({ pressed }) => [s.streakBtn, pressed && s.streakBtnPressed]}
      >
        {({ pressed }) => (
          <>
            <View style={s.statRowLeft}>
              <Text style={s.statIcon}>🔥</Text>
              <View>
                <Text style={[s.streakBtnLabel, pressed && s.streakBtnTextPressed]}>BONUS STREAK</Text>
                <Text style={[s.streakBtnSub, pressed && s.streakBtnTextPressed]}>{streakShields} SHIELD{streakShields === 1 ? '' : 'S'}</Text>
              </View>
            </View>
            <View style={s.statRowLeft}>
              <Text style={[s.streakBtnValue, pressed && s.streakBtnTextPressed]}>{streakDays}/7 Days</Text>
              <Text style={[s.streakBtnChevron, pressed && s.streakBtnTextPressed]}>›</Text>
            </View>
          </>
        )}
      </Pressable>
    </GoldCard>
  )
}

function StatItem({ icon, label, value, sub, small }: { icon: string; label: string; value: string; sub: string; small?: boolean }) {
  return (
    <View style={s.statRow}>
      <View style={s.statRowLeft}>
        <Text style={s.statIcon}>{icon}</Text>
        <Text style={s.statLabel}>{label}</Text>
      </View>
      <View style={s.statRowRight}>
        <Text style={[s.statValue, small && s.statValueSmall]} numberOfLines={1}>{value}</Text>
        <Text style={s.statSub}>{sub}</Text>
      </View>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' }, // VipBackground ครอบพื้นหลังแล้ว — Free เห็น C.bg ผ่าน VipBackground fallback
  scroll: { paddingHorizontal: 14, paddingBottom: 34 },

  topHeader: {
    minHeight: 92, // Settings/Logout ขยายเป็น size sm=64 ให้กดง่ายขึ้น — Player Profile label หดความกว้างอัตโนมัติ (flex:1)
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
    fontFamily: 'Cinzel_700Bold',
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
    // paddingTop สูงกว่าด้านอื่นตั้งใจ (มติลุงเยาะ 2026-08-15) — ดันทั้งแถว avatarFrame+heroInfo ลงมา
    // ให้ equippedBadgeImg (โผล่เหนือ avatarFrame ~77px, ดู equippedBadgeImg comment) มีที่พอ ไม่ล้น
    // ขอบบนของการ์ดเหมือนเดิม ใช้ paddingTop ที่ตัว heroCard แทนการแก้ avatarFrame โดยตรง เพราะ
    // marginTop บน flex child เดี่ยวจะไปรบกวน alignItems:'center' ระหว่าง avatarFrame กับ heroInfo
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
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
  // Badge Shop equipped badge — 96x96 อยู่หลัง Avatar (render ก่อน Avatar เสมอ = Z-order ต่ำกว่า)
  // avatarFrame กว้าง/สูง 88 — top = -0.8*96 = -76.8 ทำให้ overlap เหลือแค่ 96-76.8=19.2 (~20% ของ
  // ความสูง badge) เป็นส่วนที่ถูก Avatar ทับด้านล่าง ที่เหลือ (~80%) โผล่พ้นด้านบน/ข้างเห็นชัด
  equippedBadgeImg: { position: 'absolute', width: 96, height: 96, top: -77, left: -4 },
  editBubble: {
    position: 'absolute', right: -4, bottom: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.gold,
    borderWidth: 2, borderColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  editIcon: { color: C.bg, fontSize: 14, fontWeight: '900' },
  heroInfo: { flex: 1, minWidth: 0, position: 'relative' },
  userName: { color: C.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 8 },
  tierBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1.5,
    backgroundColor: 'rgba(255,215,106,0.08)',
  },
  tierBadgeAboveName: { position: 'absolute', top: -28, left: 0 },
  tierBadgePlaceholder: { opacity: 0 },
  tierBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  vipBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1.5,
  },
  vipBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  xpLine: { color: C.textSec, fontSize: 11, fontWeight: '800' },
  lastVisited: { color: C.textDim, fontSize: 10, fontWeight: '600', marginTop: 4 },

  // Token/Crown + Season PS/Career PS รวมคอนเทนเนอร์เดียว (มติลุงเยาะ 2026-08-15 — เดิมแยก
  // resourceCard/psCard 2 กล่อง) statsDivider คั่นระหว่าง 2 ส่วนเฉพาะตอน PS ปลดล็อคแล้ว (Tier A+ ขึ้นไป)
  statsCard: {
    ...glassPanelDense, // ตัวเลขสำคัญ ใช้กระจกทึบกว่า
    marginTop: 12,
    padding: 14,
  },
  resourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  resourceBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resourceTextWrap: { flexShrink: 1, minWidth: 0 },
  resourceIcon: { fontSize: 24, flexShrink: 0 },
  resourceLabel: { color: C.textSec, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  resourceValue: { color: C.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 2 },
  vLine: { width: 1, minHeight: 36, backgroundColor: C.border },

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
  // Batch 2 (VIP-02) — ปุ่มใหม่ทั้งหมด ไม่แตะ style เดิมของปุ่มอื่น
  vipPlusEntryBtn: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: C.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,106,0.08)',
  },
  vipPlusEntryText: { fontFamily: 'Cinzel_700Bold', color: C.gold, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  vipPlusEntrySub: { color: C.gold, fontSize: 10, marginTop: 3, opacity: 0.85 },
  playLabel: {
    // Feedback B1 — ขยับ "PLAY" ขึ้น 20px + ฟอนต์ใหญ่ขึ้น 25% (16 -> 20) เฉพะปุ่มนี้ ไม่กระทบ ActionButton อื่น (Ready/Auto Sort)
    // label หลักตอนนี้เป็น 3 บรรทัด "ดอกไพ่ 4 สัญลักษณ์\nPLAY\nTriplePoker : Rise" ทั้งหมดอยู่บล็อกเดียวกัน กึ่งกลาง
    // เคยลองสีแดง (C.red) ตามคำขอ แต่ไม่เข้ากับปุ่มสีทอง — กลับไปใช้สีทองเดิม (inherit จาก ActionButton styles.label)
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

  // TEMP DEV LINK — จางกว่าปุ่มเมนูจริงตั้งใจ (opacity ต่ำ, ไม่มีกรอบ/ไอคอนแบบ MenuButton) กันดูเหมือนฟีเจอร์จริง
  devVfxLink: { alignItems: 'center', marginTop: 18, paddingVertical: 6 },
  devVfxLinkText: { color: C.textDim, fontSize: 10, fontWeight: '700' },

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

  statsPanel: {
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    paddingVertical: 4, paddingHorizontal: 14,
    flexDirection: 'column',
  },
  hLine: { height: 1, backgroundColor: C.border },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  statRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statRowRight: { alignItems: 'flex-end' },
  statIcon: { fontSize: 18 },
  statLabel: { color: C.textSec, fontSize: 8, fontWeight: '900' },
  statValue: { color: C.textPrimary, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  statValueSmall: { fontSize: 11 },
  statSub: { color: C.textDim, fontSize: 8, fontWeight: '700', marginTop: 2, textAlign: 'right' },

  // Bonus Streak — ปุ่มจริง แยกสายตาจากแถว stat ธรรมดาข้างบน (มติลุงเยาะ 2026-08-14)
  streakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,215,106,0.12)',
    borderWidth: 1.5,
    borderColor: C.gold,
  },
  streakBtnPressed: { backgroundColor: C.gold },
  streakBtnLabel: { color: C.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  streakBtnSub: { color: C.textSec, fontSize: 8, fontWeight: '700', marginTop: 2 },
  streakBtnValue: { color: C.textPrimary, fontSize: 13, fontWeight: '900' },
  streakBtnChevron: { color: C.gold, fontSize: 18, fontWeight: '900', marginLeft: 6 },
  streakBtnTextPressed: { color: C.bg },

  toastBanner: {
    // Feedback B3 — Coming Soon toast, pattern เดียวกับ lobby.tsx
    position: 'absolute', top: 60, left: 16, right: 16, zIndex: 1000,
    backgroundColor: glassPanel.backgroundColor,
    borderWidth: 1.5, borderColor: C.red, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: C.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
})
