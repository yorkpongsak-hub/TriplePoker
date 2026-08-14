// app/(home)/watch-ad.tsx
// Standalone Ad screen — reusable from any flow that needs a skippable ad step (มติลุงเยาะ 2026-08-14).
// Extracted out of victory.tsx's inline 'ad' step so Tier Unlock (profile.tsx) can reuse the exact
// same UI/logic without duplicating it — victory.tsx keeps its own inline step untouched (already
// live-tested), this route is for every OTHER entry point going forward.
//
// Patch 2026-08-14 (มติลุงเยาะ): ยังไม่ต่อ AdMob SDK จริง — ระหว่างนี้โชว์ RoyalStraightFlushVFX
// (สร้างไว้แล้ว commit 706bcdd แต่ไม่เคย merge เข้า branch นี้) แทนที่ปุ่ม "Watch Ad" ธรรมดา ใช้เป็น
// placeholder + เช็คไปในตัวว่า VFX นี้ยังทำงานถูกต้องอยู่ไหม ปิด VFX แล้วนับเป็น "ดูโฆษณาจบ" เหมือนเดิม
// (ยังเรียก watchAd() แจกรางวัลจริงเหมือนเดิม เปลี่ยนแค่ตัว visual ที่ใช้แทนปุ่มเฉยๆ)
//
// Patch 2026-08-14 (มติลุงเยาะ, รอบ 2): เพิ่ม ?mode=gate — ใช้กับจุดที่ "ต้องดูโฆษณาก่อนถึงจะเล่นได้"
// (ทางเข้า Solo/Multiplayer/Grandmaster) ต่างจาก mode เดิม ('reward', default — ใช้กับ Tier Unlock/
// Victory/Lobby rescue-ad) ตรงที่ gate mode ไม่เรียก watchAd()/ไม่แจก Token เลย แค่บังคับดู VFX ให้ครบ
// แล้วปล่อยผ่านไปยัง returnTo เฉยๆ (ตามมติ: ด่านก่อนเข้าเล่น ไม่ใช่รางวัล กันเป็น loop ปั่น Token)
// The Sage Unicorn Studio Co., Ltd.

import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { watchAd } from '../../src/services/adRewards'
import RoyalStraightFlushVFX from '../../src/components/vfx/RoyalStraightFlushVFX'

// ธีมสีหลัก (Website Theme Spec v1.0) — เหมือนกับ victory.tsx
const C = {
  bgDark: '#0F2418',
  gold: '#FFD76A',
}

export default function WatchAdScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; mode?: string }>()
  const returnTo = params.returnTo ?? '/(home)/profile'
  const isGateMode = params.mode === 'gate'

  const accessToken = useAuthStore(s => s.session?.access_token ?? null)
  const displayName = useAuthStore(s => s.profile?.display_name ?? undefined)
  const [msg, setMsg] = useState<string | null>(null)

  const goBack = () => router.replace(returnTo as any)

  // Gate mode: แค่ดูจบแล้วปล่อยผ่าน ไม่มีรางวัล | Reward mode (default): เรียก watchAd() แจก Token จริง
  const handleVfxClose = async () => {
    if (isGateMode) { goBack(); return }
    const result = await watchAd(accessToken)
    if (result.ok === false) {
      setMsg(result.reason === 'cooldown' ? `Try again in ~${Math.ceil(result.retryAfterSeconds / 60)} min` : 'Something went wrong.')
      setTimeout(goBack, 1200)
      return
    }
    setMsg(`+${result.tokensAwarded} Token!`)
    setTimeout(goBack, 1200)
  }

  return (
    <View style={s.scrim}>
      {msg ? (
        <View style={s.center}>
          <Text style={s.msg}>{msg}</Text>
        </View>
      ) : (
        <RoyalStraightFlushVFX playerName={displayName} onClose={handleVfxClose} />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.bgDark, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  msg: { color: C.gold, fontSize: 16, fontWeight: '800', textAlign: 'center' },
})
