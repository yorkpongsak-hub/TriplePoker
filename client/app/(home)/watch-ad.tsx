// app/(home)/watch-ad.tsx
// Standalone Ad screen — reusable from any flow that needs a skippable ad step (มติลุงเยาะ 2026-08-14).
// Extracted out of victory.tsx's inline 'ad' step so Tier Unlock (profile.tsx) can reuse the exact
// same UI/logic without duplicating it — victory.tsx keeps its own inline step untouched (already
// live-tested), this route is for every OTHER entry point going forward.
//
// Patch 2026-08-14 (มติลุงเยาะ): ยังไม่ต่อ AdMob SDK จริง — ระหว่างนี้โชว์ VFX แทนปุ่ม "Watch Ad" ธรรมดา
// ใช้เป็น placeholder + เช็คไปในตัวว่า VFX นี้ยังทำงานถูกต้องอยู่ไหม ปิด VFX แล้วนับเป็น "ดูโฆษณาจบ" เหมือนเดิม
// (ยังเรียก watchAd() แจกรางวัลจริงเหมือนเดิม เปลี่ยนแค่ตัว visual ที่ใช้แทนปุ่มเฉยๆ)
//
// Patch 2026-08-14 (มติลุงเยาะ, รอบ 2): เพิ่ม ?mode=gate — ใช้กับจุดที่ "ต้องดูโฆษณาก่อนถึงจะเล่นได้"
// (ทางเข้า Solo/Multiplayer/Grandmaster) ต่างจาก mode เดิม ('reward', default — ใช้กับ Tier Unlock/
// Victory/Lobby rescue-ad) ตรงที่ gate mode ไม่เรียก watchAd()/ไม่แจก Token เลย แค่บังคับดู VFX ให้ครบ
// แล้วปล่อยผ่านไปยัง returnTo เฉยๆ (ตามมติ: ด่านก่อนเข้าเล่น ไม่ใช่รางวัล กันเป็น loop ปั่น Token)
//
// Patch 2026-08-14 (มติลุงเยาะ, รอบ 3 — VFX test harness convention): หน้านี้ยังไม่มี AdMob จริง
// placeholder slot จึงว่างและเข้าถึงง่ายที่สุดในแอป (ไม่ต้องผ่านเงื่อนไขเกมจริงเลย) — ตกลงกันว่า
// "งาน VFX ไหนทำเสร็จใหม่ล่าสุด ให้เอามาใส่แทนที่ตรงนี้ชั่วคราว" เพื่อเทสเห็นภาพจริงได้ทันทีทุกครั้งที่
// เด้งเข้าหน้าโฆษณา แทนที่จะต้องไล่ trigger เงื่อนไขจริงของ VFX นั้นๆ ทุกรอบ — ของเดิม (RoyalStraightFlushVFX)
// ไฟล์ยังอยู่ครบไม่ได้ลบ แค่เลิกโชว์ตรงนี้ ส่วน "งานหลัก" (TierUnlockOverlay ต่อกับเงื่อนไขปลด Tier จริง)
// ยังคงเดิมที่ profile.tsx ไม่ได้ย้ายมาไว้ที่นี่ — ตรงนี้คือชั้น "โชว์ VFX ซ้ำเพื่อเทส" เท่านั้น
// The Sage Unicorn Studio Co., Ltd.

import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuthStore } from '../../src/store/authStore'
import { watchAd } from '../../src/services/adRewards'
import LegendaryCardVFX from '../../src/components/vfx/LegendaryCardVFX'

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
        <LegendaryCardVFX title="LEGENDARY VICTORY" subtitle="TRIPLE SWEEP" onFinish={handleVfxClose} />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.bgDark, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  msg: { color: C.gold, fontSize: 16, fontWeight: '800', textAlign: 'center' },
})
