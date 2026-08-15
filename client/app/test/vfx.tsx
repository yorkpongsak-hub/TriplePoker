import React, { useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import LegendaryCardVFX from '../../src/components/vfx/LegendaryCardVFX'
import BossVictoryVFX, { VictoryTier } from '../../src/components/vfx/BossVictoryVFX'
import RoyalStraightFlushVFX from '../../src/components/vfx/RoyalStraightFlushVFX'
import { TierUnlockOverlay } from '../../src/components/vfx/TierUnlockOverlay'
import { StreakBonusVFX } from '../../src/components/vfx/StreakBonusVFX'

// มติลุงเยาะ 2026-08-14 — ขยาย QA lab เดิม (เคยมีแค่ Legendary/BossVictory) ให้ครอบคลุมทุก VFX เต็มจอ
// ในโปรเจคที่ trigger ได้ง่ายด้วย prop ล้วน (ไม่ต้องเล่นเกมจริง) — discriminated union แทน union แบนเดิม
// เพราะ TierUnlockOverlay ต้องการ prop เพิ่ม (tier: string) ที่ BossVictoryVFX/RoyalStraightFlushVFX ไม่มี
// ตั้งใจไม่รวม BeyondPathChoice: ไม่ใช่ VFX ตกแต่งเฉยๆ แต่เป็นหน้าเลือก beyond_path จริงที่ผูก backend
// ถาวร ("Your choice is permanent") เทสผ่านหน้านี้เสี่ยงเผลอ set ค่าจริงให้บัญชีทดสอบโดยไม่ตั้งใจ
type ActiveVfx =
  | { kind: 'legendary' }
  | { kind: 'boss'; tier: VictoryTier; titleOverride?: string }
  | { kind: 'royal' }
  | { kind: 'tierUnlock'; tier: string }
  | { kind: 'streakBonus'; amount: number }
  | null

/** Development QA harness: trigger every full-screen victory effect without completing a match. */
export default function VfxQaScreen() {
  const [active, setActive] = useState<ActiveVfx>(null)
  const [reduceMotion, setReduceMotion] = useState(false)
  const [completed, setCompleted] = useState(0)
  const finish = () => { setActive(null); setCompleted(value => value + 1) }

  return <View style={s.root}>
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ BACK</Text></TouchableOpacity>
      <Text style={s.title}>VFX QA LAB</Text>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.note}>Test animation, skip, safe area, orientation and repeated mount/unmount on a real device.</Text>
      <View style={s.setting}><Text style={s.label}>Simulate Reduce Motion</Text><Switch value={reduceMotion} onValueChange={setReduceMotion} /></View>
      <Text style={s.counter}>Completed cleanly: {completed}</Text>
      <QaButton label="Legendary Triple Sweep" color="#E8B94C" onPress={() => setActive({ kind: 'legendary' })} />
      <QaButton label="Sentinel Victory" color="#6DD58C" onPress={() => setActive({ kind: 'boss', tier: 'sentinel' })} />
      <QaButton label="Four Gods Victory" color="#6CA8FF" onPress={() => setActive({ kind: 'boss', tier: 'god' })} />
      <QaButton label="Monarch Victory" color="#C68CFF" onPress={() => setActive({ kind: 'boss', tier: 'monarch' })} />
      <QaButton label="Soren Vanquished (Grandmaster)" color="#C68CFF" onPress={() => setActive({ kind: 'boss', tier: 'monarch', titleOverride: 'SOREN VANQUISHED' })} />
      <QaButton label="Royal Straight Flush (Watch-Ad)" color="#FFD76A" onPress={() => setActive({ kind: 'royal' })} />
      <QaButton label="Tier Unlocked · Initiate" color="#8DFFB5" onPress={() => setActive({ kind: 'tierUnlock', tier: 'initiate' })} />
      <QaButton label="Tier Unlocked · Grandmaster (longest label)" color="#8DFFB5" onPress={() => setActive({ kind: 'tierUnlock', tier: 'grandmaster' })} />
      <QaButton label="Streak Bonus Claim (+300)" color="#FFD76A" onPress={() => setActive({ kind: 'streakBonus', amount: 300 })} />
      <QaButton label="Streak Bonus Claim (+1000, longest number)" color="#FFD76A" onPress={() => setActive({ kind: 'streakBonus', amount: 1000 })} />
      <QaButton label="Remount Legendary" color="#FF7D7D" onPress={() => { setActive(null); setTimeout(() => setActive({ kind: 'legendary' }), 20) }} />
    </ScrollView>
    {active?.kind === 'legendary' && <LegendaryCardVFX reduceMotionOverride={reduceMotion} onFinish={finish} />}
    {active?.kind === 'boss' && <BossVictoryVFX tier={active.tier} titleOverride={active.titleOverride} reduceMotionOverride={reduceMotion} onFinish={finish} />}
    {active?.kind === 'royal' && <RoyalStraightFlushVFX playerName="QA TESTER" reduceMotionOverride={reduceMotion} onClose={finish} />}
    {active?.kind === 'tierUnlock' && <TierUnlockOverlay tier={active.tier} onClose={finish} />}
    {active?.kind === 'streakBonus' && <StreakBonusVFX amount={active.amount} onFinish={finish} />}
  </View>
}

function QaButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" style={[s.button, { borderColor: color }]} onPress={onPress}>
    <Text style={[s.buttonText, { color }]}>{label}</Text>
  </TouchableOpacity>
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07150d', paddingTop: 46 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#294632' },
  back: { color: '#FFD76A', fontWeight: '800', width: 80 },
  title: { color: '#FFF4CA', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  content: { padding: 20, gap: 12 },
  note: { color: '#A9B5AA', lineHeight: 20, marginBottom: 4 },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#10291a', padding: 14, borderRadius: 10 },
  label: { color: '#F5F2E8', fontWeight: '700' },
  counter: { color: '#8DFFB5', textAlign: 'center', marginVertical: 8 },
  button: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 15, alignItems: 'center', backgroundColor: '#0D2015' },
  buttonText: { fontWeight: '900', letterSpacing: 1 },
})
