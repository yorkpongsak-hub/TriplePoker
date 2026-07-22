/**
 * BossVictoryVFX.tsx — เอฟเฟกต์ชัยชนะบอส 3 ระดับ (Sentinel / Four Gods / Monarch)
 * Patch 2026-07-18 | The Sage Unicorn Studio Co., Ltd.
 *
 * ใช้: <BossVictoryVFX tier="sentinel" onFinish={() => ...} />
 * - tier="sentinel" : Nine Sentinels — glow + sparkle ~2.5s
 * - tier="god"      : Four Gods — shake + flash + รัศมีหมุน ~3.5s
 * - tier="monarch"  : Monarch — dim → ระเบิดแสง → มงกุฎตก + shockwave + ฝนทอง ~5s
 *
 * วินัย animation (กฎ CLAUDE.md): ทุก value เกิดใหม่ต่อ instance (useRef ใน component นี้เอง
 * ไม่ persist ข้าม mount) / ทุก composite เก็บ ref + .stop() ตอน unmount / view bind ค้างตลอด
 * อายุ component ไม่มี conditional-mount ภายใน — ใช้ useNativeDriver:true ได้ปลอดภัยเพราะ
 * node ไม่มีวันถูก re-attach (component ทั้งตัว mount/unmount เป็นก้อนเดียว)
 *
 * เสียง: expo-audio pattern เดียวกับ bgmService.playApplauseSfx — no-op จนกว่าจะมีไฟล์จริง
 * TODO Sound Designer: sfx_victory_sentinel.mp3 (~2.5s) / sfx_victory_god.mp3 (~3.5s)
 *                      / sfx_victory_monarch.mp3 (~5s) → วางที่ client/assets/sounds/
 */

import React, { useEffect, useRef } from 'react'
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native'
import { createAudioPlayer, AudioSource } from 'expo-audio'

// ── มงกุฎ 3 ระดับ glow ต่อ tier (จาก slice ภาพลุงเยาะ — mapping: แถว1/3/4) ──
const CROWNS: Record<VictoryTier, any[]> = {
  sentinel: [
    require('../../../assets/vfx/crowns/crown_tier1_lv1.png'),
    require('../../../assets/vfx/crowns/crown_tier1_lv2.png'),
    require('../../../assets/vfx/crowns/crown_tier1_lv3.png'),
  ],
  god: [
    require('../../../assets/vfx/crowns/crown_tier3_lv1.png'),
    require('../../../assets/vfx/crowns/crown_tier3_lv2.png'),
    require('../../../assets/vfx/crowns/crown_tier3_lv3.png'),
  ],
  monarch: [
    require('../../../assets/vfx/crowns/crown_tier4_lv1.png'),
    require('../../../assets/vfx/crowns/crown_tier4_lv2.png'),
    require('../../../assets/vfx/crowns/crown_tier4_lv3.png'),
  ],
}

// ── เสียงต่อ tier — null = no-op เงียบๆ (pattern SOUND_MANIFEST) ──
const SFX_VICTORY: Record<VictoryTier, AudioSource | null> = {
  sentinel: null, // require('../../../assets/sounds/sfx_victory_sentinel.mp3')
  god:      null, // require('../../../assets/sounds/sfx_victory_god.mp3')
  monarch:  null, // require('../../../assets/sounds/sfx_victory_monarch.mp3')
}

export type VictoryTier = 'sentinel' | 'god' | 'monarch'

const TITLE: Record<VictoryTier, string> = {
  sentinel: 'SENTINEL CONQUERED',
  god:      'GOD VANQUISHED',
  monarch:  'MONARCH SLAIN',
}

const { width: SW, height: SH } = Dimensions.get('window')
const GOLD = '#FFD76A'

interface Props { tier: VictoryTier; onFinish?: () => void }

const PARTICLES: Record<VictoryTier, number> = { sentinel: 12, god: 20, monarch: 35 }
const DURATION:  Record<VictoryTier, number> = { sentinel: 2500, god: 3500, monarch: 5000 }

export const BossVictoryVFX: React.FC<Props> = ({ tier, onFinish }) => {
  // ── Animated values — เกิดใหม่ทุก mount ของ component ──
  const dim        = useRef(new Animated.Value(0)).current           // ฉากหลังมืด
  const flash      = useRef(new Animated.Value(0)).current           // แสงวาบเต็มจอ
  const shake      = useRef(new Animated.Value(0)).current           // จอสั่น (god)
  const crownOp    = useRef(new Animated.Value(0)).current           // มงกุฎ lv1
  const crownGlow2 = useRef(new Animated.Value(0)).current           // crossfade lv2
  const crownGlow3 = useRef(new Animated.Value(0)).current           // crossfade lv3
  const crownScale = useRef(new Animated.Value(tier === 'monarch' ? 1.6 : 0.6)).current
  const crownY     = useRef(new Animated.Value(tier === 'monarch' ? -SH * 0.5 : 0)).current
  const ring1      = useRef(new Animated.Value(0)).current           // shockwave / รัศมี
  const ring2      = useRef(new Animated.Value(0)).current
  const titleOp    = useRef(new Animated.Value(0)).current
  const titleScale = useRef(new Animated.Value(tier === 'monarch' ? 1.8 : 1)).current
  const parts = useRef(
    Array.from({ length: PARTICLES[tier] }, () => ({
      x: new Animated.Value(0), y: new Animated.Value(0),
      op: new Animated.Value(0), rot: new Animated.Value(0),
      seedX: Math.random() * SW, seedDelay: Math.random() * 600,
      seedDur: 1500 + Math.random() * 1500, size: 5 + Math.random() * 7,
      silver: Math.random() < 0.25, // monarch แซมขาวเงิน
    }))
  ).current

  const compositeRef = useRef<Animated.CompositeAnimation | null>(null)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // ── เสียง (no-op ถ้ายังไม่มี asset) ──
    if (SFX_VICTORY[tier]) {
      try { createAudioPlayer(SFX_VICTORY[tier]!).play() } catch {}
    }

    const seq: Animated.CompositeAnimation[] = []

    if (tier === 'sentinel') {
      // glow เข้า + เด้งเบา → ramp lv2/lv3 → sparkle
      seq.push(Animated.parallel([
        Animated.timing(dim,     { toValue: 0.45, duration: 300, useNativeDriver: true }),
        Animated.timing(crownOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(crownScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]))
      seq.push(Animated.stagger(350, [
        Animated.timing(crownGlow2, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(crownGlow3, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]))
      seq.push(Animated.timing(titleOp, { toValue: 1, duration: 350, useNativeDriver: true }))
    }

    if (tier === 'god') {
      // flash + shake → มงกุฎกระแทกเข้า → รัศมีหมุน → title
      seq.push(Animated.parallel([
        Animated.timing(dim,   { toValue: 0.55, duration: 200, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(flash, { toValue: 0.85, duration: 90,  useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0,    duration: 350, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(shake, { toValue: 8,  duration: 40, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 5,  duration: 50, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0,  duration: 60, useNativeDriver: true }),
        ]),
        Animated.timing(crownOp, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(crownScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      ]))
      seq.push(Animated.parallel([
        Animated.timing(ring1, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(ring2, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.stagger(300, [
          Animated.timing(crownGlow2, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(crownGlow3, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]),
        Animated.timing(titleOp, { toValue: 1, duration: 400, delay: 500, useNativeDriver: true }),
      ]))
    }

    if (tier === 'monarch') {
      // มืดวูบ → เงียบ 0.5s → flash ระเบิด → มงกุฎตกกระแทก + shockwave 2 วง → ฝนทอง → title
      seq.push(Animated.timing(dim, { toValue: 0.75, duration: 400, useNativeDriver: true }))
      seq.push(Animated.delay(500))
      seq.push(Animated.parallel([
        Animated.sequence([
          Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
        Animated.timing(crownOp, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(crownY,  { toValue: 0, duration: 450, useNativeDriver: true }), // ตกแบบมีน้ำหนัก
        Animated.timing(crownScale, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]))
      seq.push(Animated.parallel([
        Animated.timing(ring1, { toValue: 1, duration: 900,  useNativeDriver: true }),
        Animated.sequence([Animated.delay(200), Animated.timing(ring2, { toValue: 1, duration: 900, useNativeDriver: true })]),
        Animated.stagger(400, [
          Animated.timing(crownGlow2, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.timing(crownGlow3, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(300),
          Animated.parallel([
            Animated.timing(titleOp,    { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(titleScale, { toValue: 1, duration: 500, useNativeDriver: true }),
          ]),
        ]),
      ]))
    }

    compositeRef.current = Animated.sequence(seq)
    compositeRef.current.start()

    // ── อนุภาค: ยิงแยกชุด (โปรยขึ้น sentinel/god | ฝนตกลง monarch) ──
    parts.forEach(p => {
      p.x.setValue(p.seedX)
      if (tier === 'monarch') { p.y.setValue(-40) } else { p.y.setValue(SH * 0.62) }
      const anim = Animated.sequence([
        Animated.delay((tier === 'monarch' ? 1100 : 500) + p.seedDelay),
        Animated.parallel([
          Animated.timing(p.op,  { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(p.y,   { toValue: tier === 'monarch' ? SH + 40 : SH * 0.25 - Math.random() * 120, duration: p.seedDur, useNativeDriver: true }),
          Animated.timing(p.rot, { toValue: 1, duration: p.seedDur, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(p.seedDur * 0.55),
            Animated.timing(p.op, { toValue: 0, duration: p.seedDur * 0.45, useNativeDriver: true }),
          ]),
        ]),
      ])
      ;(p as any)._anim = anim
      anim.start()
    })

    finishTimerRef.current = setTimeout(() => onFinish?.(), DURATION[tier])

    return () => {
      compositeRef.current?.stop()
      parts.forEach(p => (p as any)._anim?.stop())
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    }
  }, [])

  const crowns = CROWNS[tier]

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* ฉากหลังมืด */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: dim }]} />
      {/* flash เต็มจอ */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: GOLD, opacity: flash }]} />

      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ translateX: shake }] }]}>
        {/* shockwave / รัศมี 2 วง */}
        {[ring1, ring2].map((r, i) => (
          <Animated.View key={i} style={[s.ring, {
            opacity: r.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.8, 0] }),
            transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.3, tier === 'monarch' ? 3.2 : 2.2] }) },
                        ...(tier === 'god' ? [{ rotate: r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', i === 0 ? '90deg' : '-90deg'] }) }] : [])],
          }]} />
        ))}

        {/* มงกุฎ — 3 เลเยอร์ crossfade glow ramp (lv1 ฐาน, lv2/lv3 ซ้อนทับ) */}
        <Animated.View style={{ alignItems: 'center', justifyContent: 'center',
          opacity: crownOp, transform: [{ translateY: crownY }, { scale: crownScale }] }}>
          <Animated.Image source={crowns[0]} style={s.crown} resizeMode="contain" />
          <Animated.Image source={crowns[1]} style={[s.crown, StyleSheet.absoluteFill as any, { opacity: crownGlow2 }]} resizeMode="contain" />
          <Animated.Image source={crowns[2]} style={[s.crown, StyleSheet.absoluteFill as any, { opacity: crownGlow3 }]} resizeMode="contain" />
        </Animated.View>

        {/* Title */}
        <Animated.Text style={[s.title, tier === 'monarch' && s.titleMonarch,
          { opacity: titleOp, transform: [{ scale: titleScale }] }]}>
          {TITLE[tier]}
        </Animated.Text>
      </Animated.View>

      {/* อนุภาคทอง */}
      {parts.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: p.size, height: p.size, borderRadius: p.size / 4,
          backgroundColor: p.silver && tier === 'monarch' ? '#EDEDF2' : GOLD,
          opacity: p.op,
          transform: [{ translateX: p.x }, { translateY: p.y },
                      { rotate: p.rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] }) }],
        }} />
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  ring: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    borderWidth: 2.5, borderColor: GOLD,
  },
  crown: { width: 240, height: 220 },
  title: {
    marginTop: 26, color: GOLD, fontSize: 22, fontWeight: '900', letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  titleMonarch: { fontSize: 28, letterSpacing: 4 },
})

export default BossVictoryVFX
