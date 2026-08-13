// app/(home)/victory.tsx
// Post-Match Victory Screen — shown only to the match's #1 finisher, right after "back to lobby"
// (มติลุงเยาะ 2026-08-13). Flow: Victory (VFX + stats) -> Ad step (skippable) -> that Tier's Top10.
// A single shared route parameterized by ?tier=, mirroring top10.tsx's own precedent — this is a
// tier-agnostic post-game summary, not a gameplay screen, so CLAUDE.md's "no dynamic [tier] route"
// rule (which governs the game tables themselves) does not apply here.
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { useAuthStore } from '../../src/store/authStore'
import { watchAd } from '../../src/services/adRewards'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
const tokenDropGif = require('../../assets/fx/token_drop.gif')

// ธีมสีหลัก (Website Theme Spec v1.0) — โทนหรูหรา/ราชวงศ์ตามที่ลุงเยาะเลือก
const C = {
  bgDark: '#0F2418',
  bgPanel: '#163A25',
  gold: '#FFD76A',
  goldDark: '#FFC857',
  green: '#8DFFB5',
  text: '#F5F2E8',
  textSec: '#C8C4B0',
  border: '#2A4A34',
}

// อันดับ 1-3 ของ Top10 ปัจจุบัน (Tier นี้) ได้ % ตายตัว นอกนั้นสุ่มโชว์เฉยๆ ไม่ใช่ค่าจริง (มติลุงเยาะ)
const TOP3_PERCENTILE = [99.29, 99.19, 99.09]

function randomPercentile(): number {
  return Math.round((Math.random() * (98 - 85) + 85) * 100) / 100
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VictoryScreen() {
  const params = useLocalSearchParams<{
    tier?: string
    tokensWon?: string
    matchDurationSec?: string
    bestHandLabel?: string
  }>()
  const tier = params.tier ?? 'initiate'
  const tokensWon = Number(params.tokensWon ?? 0)
  const matchDurationSec = Number(params.matchDurationSec ?? 0)
  const bestHandLabel = params.bestHandLabel && params.bestHandLabel !== 'null' ? params.bestHandLabel : null

  const accessToken = useAuthStore(s => s.session?.access_token ?? null)
  const isGuest = useAuthStore(s => s.session?.user?.is_anonymous === true)

  const [step, setStep] = useState<'victory' | 'ad'>('victory')
  const [loaded, setLoaded] = useState(false)
  const [percentile, setPercentile] = useState<number>(0)
  const [xp, setXp] = useState<number>(0)
  const [adBusy, setAdBusy] = useState(false)
  const [adMsg, setAdMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let settled = false
    const finish = (pct: number, xpValue: number) => {
      if (cancelled || settled) return
      settled = true
      setPercentile(pct)
      setXp(xpValue)
      setLoaded(true)
    }
    // Patch 2026-08-13: ลุงเยาะรายงานว่าหน้านี้ค้างหมุนไม่หยุด — refreshProfile()/fetch ด้านล่างเป็น
    // network call ที่ไม่มี timeout ในตัว ถ้าค้างจริง (ไม่ throw ด้วยซ้ำ) โค้ดเดิมจะไม่มีวันเรียก
    // setLoaded(true) เลย ใส่เพดานเวลา 8 วิ กันไม่ให้หน้าจอค้างตลอดไป — โผล่ด้วยค่า default แทน
    const timeoutId = setTimeout(() => finish(randomPercentile(), 0), 8000)

    ;(async () => {
      let pct = randomPercentile()
      let xpValue = 0
      try {
        await useAuthStore.getState().refreshProfile()
        const profile = useAuthStore.getState().profile
        xpValue = profile?.xp ?? 0
        try {
          const res = await fetch(`${SERVER_URL}/stats/top10?tier=${tier}`)
          const json = await res.json()
          const myEntry = (json.entries ?? []).find((e: any) => e.user_id === profile?.user_id)
          if (myEntry && myEntry.rank >= 1 && myEntry.rank <= 3) {
            pct = TOP3_PERCENTILE[myEntry.rank - 1]
          }
        } catch (err) {
          console.error('[Victory] top10 percentile lookup failed:', err)
        }
      } catch (err) {
        console.error('[Victory] profile refresh failed:', err)
      }
      clearTimeout(timeoutId)
      finish(pct, xpValue)
    })()

    return () => { cancelled = true; clearTimeout(timeoutId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reanimated entrance sequence — เริ่มหลังโหลดข้อมูลเสร็จเท่านั้น (pattern เดียวกับ TierUnlockOverlay) ──
  const scrimOpacity = useSharedValue(0)
  const vfxScale = useSharedValue(0.6)
  const headlineOpacity = useSharedValue(0)
  const statsOpacity = useSharedValue(0)
  const buttonOpacity = useSharedValue(0)

  useEffect(() => {
    if (!loaded) return
    scrimOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    vfxScale.value = withDelay(150, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }))
    headlineOpacity.value = withDelay(550, withTiming(1, { duration: 400 }))
    statsOpacity.value = withDelay(850, withTiming(1, { duration: 400 }))
    buttonOpacity.value = withDelay(1250, withTiming(1, { duration: 300 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }))
  const vfxStyle = useAnimatedStyle(() => ({ transform: [{ scale: vfxScale.value }] as any, opacity: vfxScale.value }))
  const headlineStyle = useAnimatedStyle(() => ({ opacity: headlineOpacity.value }))
  const statsStyle = useAnimatedStyle(() => ({ opacity: statsOpacity.value }))
  const buttonStyle = useAnimatedStyle(() => ({ opacity: buttonOpacity.value }))

  const goToTop10 = () => router.replace(`/(home)/top10?tier=${tier}` as any)

  const handleWatchAdPress = async () => {
    setAdBusy(true)
    const result = await watchAd(accessToken)
    setAdBusy(false)
    if (result.ok === false) {
      setAdMsg(result.reason === 'cooldown' ? `Try again in ~${Math.ceil(result.retryAfterSeconds / 60)} min` : 'Something went wrong.')
      setTimeout(goToTop10, 1200)
      return
    }
    setAdMsg(`+${result.tokensAwarded} Token!`)
    setTimeout(goToTop10, 1200)
  }

  if (!loaded) {
    return (
      <View style={[s.scrim, s.loadingCenter]}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    )
  }

  return (
    <Animated.View style={[s.scrim, scrimStyle]}>
      <View style={s.center}>
        {step === 'victory' ? (
          <>
            <Animated.View style={vfxStyle}>
              <Image source={tokenDropGif} style={s.vfxGif} contentFit="contain" autoplay />
            </Animated.View>

            <Animated.Text style={[s.headline, headlineStyle]}>ชัยชนะอันสมบูรณ์แบบ!</Animated.Text>

            <Animated.View style={[s.statsCard, statsStyle]}>
              <Text style={s.statsLine}>
                {'⏱'} {formatDuration(matchDurationSec)}{'   '}
                <Text style={{ color: C.green }}>+{tokensWon.toLocaleString('en-US')} Token</Text>
                {bestHandLabel ? <>{'   🂡 '}{bestHandLabel}</> : null}
              </Text>
              <Text style={s.percentileLine}>ชนะผู้เล่น {percentile}% ของโต๊ะนี้!</Text>
              <Text style={s.xpLine}>XP สะสม: {xp.toLocaleString('en-US')}</Text>
            </Animated.View>

            <Animated.View style={buttonStyle}>
              <TouchableOpacity style={s.button} onPress={() => setStep('ad')} activeOpacity={0.85}>
                <Text style={s.buttonText}>ต่อไป</Text>
              </TouchableOpacity>
              {isGuest && (
                // Guest Play (มติลุงเยาะ 2026-08-13) — เชิญชวนสมัครสมาชิกหลังทำผลงานได้ดี (ชนะ)
                // เป็นแค่คำเชิญ ไม่บังคับ — เล่นต่อแบบ guest ได้เรื่อยๆ ถ้ายังไม่อยากสมัคร
                <TouchableOpacity style={s.registerButton} onPress={() => router.push('/(auth)/setup-profile')} activeOpacity={0.7}>
                  <Text style={s.registerButtonText}>ลงทะเบียนเพื่อบันทึกสถิติการเล่น</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </>
        ) : (
          <>
            <Text style={s.adTitle}>รับโทเคนเพิ่มด้วยการดูโฆษณา</Text>
            {adMsg ? (
              <Text style={s.adMsg}>{adMsg}</Text>
            ) : (
              <>
                <TouchableOpacity style={s.button} onPress={handleWatchAdPress} activeOpacity={0.85} disabled={adBusy}>
                  {adBusy ? <ActivityIndicator color={C.bgDark} /> : <Text style={s.buttonText}>ดูโฆษณา</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.skipButton} onPress={goToTop10} activeOpacity={0.7} disabled={adBusy}>
                  <Text style={s.skipButtonText}>ข้าม</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: C.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCenter: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  vfxGif: { width: 220, height: 220, marginBottom: 8 },

  headline: {
    fontFamily: 'Cinzel_700Bold',
    color: C.gold,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 20,
  },

  statsCard: {
    backgroundColor: C.bgPanel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 28,
    minWidth: 260,
  },
  statsLine: { color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  percentileLine: { color: C.gold, fontSize: 15, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  xpLine: { color: C.textSec, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  button: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderWidth: 1.5,
    borderColor: C.goldDark,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: { color: C.bgDark, fontSize: 15, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },

  registerButton: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 },
  registerButtonText: { color: C.green, fontSize: 12, fontWeight: '700', textAlign: 'center', textDecorationLine: 'underline' },

  adTitle: {
    fontFamily: 'Cinzel_700Bold',
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
  },
  adMsg: { color: C.gold, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  skipButton: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 },
  skipButtonText: { color: C.textSec, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
})
