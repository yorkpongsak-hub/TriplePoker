// app/(home)/streak.tsx
// Play Streak — Streak Milestone Bonus (มติลุงเยาะ 2026-08-14). แทนที่ระบบ Daily Play Streak เดิม
// (แจก Token อัตโนมัติทุกวัน 1-7 ไม่มีหน้าเฉพาะ) ด้วยระบบ milestone วันที่ 3/5/7 (วันที่ 1 ไม่มีรางวัล)
// ที่ต้องกด Claim เอง — สมาชิกฟรีดูโฆษณาก่อน (ผ่านหน้า /watch-ad?mode=gate) VIP ข้ามได้เลย เข้าถึงหน้านี้
// ได้ตลอดเวลาจาก Profile — แต่ "นับวันสำเร็จ" ยังคงต้องเล่นจบแมตช์ก่อนเสมอ (matchStatsService.ts เดิม
// ไม่เปลี่ยน) ครบ 7 วันวนรอบใหม่ (streak_claimed_milestone รีเซ็ตเป็น 0 เองฝั่ง server)
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { StreakBonusVFX } from '../../src/components/vfx/StreakBonusVFX'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

// asset ล่าสุดที่ลุงเยาะเพิ่ม 2026-08-14 (320x180 animated WebP) — banner ต่อจาก subtitle ก่อนกล่อง progress
const streakCountdownFx = require('../../assets/fx/streak_countdown.webp')

const C = {
  bg: '#0F2418',
  surface: '#163A25',
  card: '#1C4830',
  border: '#2A4A34',
  gold: '#FFD76A',
  goldDark: '#FFC857',
  green: '#8DFFB5',
  textPrimary: '#F5F2E8',
  textSec: '#C8C4B0',
  textDim: '#7A7A6A',
}

// พอร์ตตรงจาก server/src/game/matchStatsService.ts's getClaimableStreakMilestone() — pure function
// เล็กมาก คัดลอกไว้ฝั่ง client เพื่อคำนวณ UI state เฉยๆ (คำตัดสินจริงเช็คซ้ำที่ server เสมอตอน claim)
const STREAK_MILESTONES = [3, 5, 7] as const
const MILESTONE_REWARDS: Record<number, number> = { 3: 300, 5: 500, 7: 1000 }
function getClaimableMilestone(streakCount: number, claimedMilestone: number): number | null {
  const eligible = STREAK_MILESTONES.filter(day => streakCount >= day && day > claimedMilestone)
  return eligible.length > 0 ? Math.max(...eligible) : null
}

export default function StreakScreen() {
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ autoClaim?: string }>()

  const streakCount = useAuthStore(s => s.profile?.streak_count ?? 0)
  const claimedMilestone = useAuthStore(s => s.profile?.streak_claimed_milestone ?? 0)
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')
  const accessToken = useAuthStore(s => s.session?.access_token ?? null)

  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<{ milestone: number; tokensAwarded: number } | null>(null)
  const [bonusVfx, setBonusVfx] = useState<{ amount: number } | null>(null)

  const claimable = getClaimableMilestone(streakCount, claimedMilestone)

  const doClaim = async () => {
    if (!accessToken) { setError('Session expired. Please sign in again.'); return }
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/profile/claim-streak-reward`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error === 'NOTHING_TO_CLAIM' ? 'Nothing to claim right now.' : 'Could not claim reward. Please try again.')
        return
      }
      setJustClaimed({ milestone: json.milestone, tokensAwarded: json.tokensAwarded })
      setBonusVfx({ amount: json.tokensAwarded })
      await useAuthStore.getState().refreshProfile()
    } catch (e) {
      setError('Could not claim reward. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  // กลับมาจาก /watch-ad?mode=gate แล้ว (ดูโฆษณาจบ) — claim อัตโนมัติทันทีครั้งเดียว
  useEffect(() => {
    if (params.autoClaim === '1') {
      router.setParams({ autoClaim: undefined } as any)
      void doClaim()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoClaim])

  const handleClaimPress = () => {
    if (!claimable) return
    if (isVip) { void doClaim(); return }
    router.push({ pathname: '/(home)/watch-ad', params: { returnTo: '/(home)/streak?autoClaim=1', mode: 'gate' } } as any)
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.title}>PLAY STREAK</Text>
        <View style={s.backBtn} />
      </View>

      <Text style={s.subtitle}>Play a match every day to earn Token bonuses</Text>

      <View style={s.brandBlock}>
        <Image source={streakCountdownFx} style={s.bannerFx} contentFit="contain" autoplay />
        <Text style={s.brandTitle}>TriplePoker Winning Streak Bonus</Text>
      </View>

      <View style={s.progressCard}>
        <Text style={s.progressLabel}>DAY {streakCount} / 7</Text>
        <View style={s.trackRow}>
          {[1, 3, 5, 7].map(day => {
            const reached = streakCount >= day
            const claimed = day <= claimedMilestone
            const isClaimable = claimable === day
            return (
              <View key={day} style={s.milestoneNode}>
                <View style={[
                  s.nodeCircle,
                  reached && s.nodeCircleReached,
                  isClaimable && s.nodeCircleClaimable,
                ]}>
                  <Text style={[s.nodeDayText, reached && s.nodeDayTextReached]}>{claimed ? '✓' : day}</Text>
                </View>
                <Text style={s.nodeReward}>{MILESTONE_REWARDS[day] ? `+${MILESTONE_REWARDS[day]}` : 'Start'}</Text>
              </View>
            )
          })}
        </View>
      </View>

      {justClaimed ? (
        <View style={s.resultCard}>
          <Text style={s.resultText}>+{justClaimed.tokensAwarded} Token claimed!</Text>
        </View>
      ) : claimable ? (
        <TouchableOpacity style={s.claimBtn} onPress={handleClaimPress} disabled={claiming} activeOpacity={0.85}>
          {claiming
            ? <ActivityIndicator color={C.bg} />
            : <Text style={s.claimBtnText}>CLAIM +{MILESTONE_REWARDS[claimable]} TOKEN</Text>
          }
        </TouchableOpacity>
      ) : (
        <Text style={s.noClaimText}>
          {streakCount >= 7 ? 'All milestones claimed for this cycle — come back after your next reset!' : 'Keep playing to reach the next milestone.'}
        </Text>
      )}

      {error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>⚠ {error}</Text>
        </View>
      )}

      {bonusVfx && (
        <StreakBonusVFX amount={bonusVfx.amount} onFinish={() => setBonusVfx(null)} />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  // มติลุงเยาะ (รอบแก้ไขที่ 2) — ต่อจาก subtitle เลย ก่อนกล่อง progressCard (ไม่ปักไว้ล่างสุดจอแล้ว
  // เพราะรอบแรกอยู่ต่ำเกินไป)
  brandBlock: { alignItems: 'center', marginBottom: 16 },
  // แบนเนอร์ assets/fx/streak_countdown.webp (320x180 เนทีฟ) — เต็มความกว้างจอ รักษา aspect ratio เป๊ะ
  // (ไม่ใช้ paddingHorizontal ของ container เพราะต้องเต็มขอบซ้าย-ขวาจริงๆ ตาม "banner เด่น")
  bannerFx: { width: '100%', aspectRatio: 320 / 180, marginHorizontal: -20 },
  brandTitle: {
    fontFamily: 'Cinzel_700Bold', color: C.gold, fontSize: 22, fontWeight: '900',
    letterSpacing: 1, textAlign: 'center', marginTop: 10, paddingHorizontal: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: C.gold, fontSize: 26, fontWeight: '900' },
  title: { color: C.gold, fontSize: 16, fontWeight: '900', letterSpacing: 2 },

  subtitle: { color: C.textSec, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 20 },

  progressCard: {
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', marginBottom: 20,
  },
  progressLabel: { color: C.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 16 },
  trackRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  milestoneNode: { alignItems: 'center', gap: 6 },
  nodeCircle: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.border,
    backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
  },
  nodeCircleReached: { borderColor: C.green, backgroundColor: 'rgba(141,255,181,0.12)' },
  nodeCircleClaimable: { borderColor: C.gold, backgroundColor: 'rgba(255,215,106,0.18)' },
  nodeDayText: { color: C.textDim, fontSize: 15, fontWeight: '800' },
  nodeDayTextReached: { color: C.green },
  nodeReward: { color: C.textSec, fontSize: 10, fontWeight: '700' },

  claimBtn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: C.goldDark,
  },
  claimBtnText: { color: C.bg, fontSize: 14, fontWeight: '900', letterSpacing: 1 },

  resultCard: {
    backgroundColor: 'rgba(141,255,181,0.12)', borderRadius: 14, borderWidth: 1, borderColor: C.green,
    paddingVertical: 14, alignItems: 'center',
  },
  resultText: { color: C.green, fontSize: 14, fontWeight: '800' },

  noClaimText: { color: C.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },

  errorBox: {
    marginTop: 16, backgroundColor: 'rgba(255,107,107,0.15)', borderWidth: 1, borderColor: 'rgba(255,107,107,0.4)',
    borderRadius: 10, padding: 10,
  },
  errorText: { color: '#FF6B6B', fontSize: 12, textAlign: 'center' },
})
