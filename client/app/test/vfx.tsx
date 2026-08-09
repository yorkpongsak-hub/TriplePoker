import React, { useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import LegendaryCardVFX from '../../src/components/vfx/LegendaryCardVFX'
import BossVictoryVFX, { VictoryTier } from '../../src/components/vfx/BossVictoryVFX'

type ActiveVfx = 'legendary' | VictoryTier | null

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
      <QaButton label="Legendary Triple Sweep" color="#E8B94C" onPress={() => setActive('legendary')} />
      <QaButton label="Sentinel Victory" color="#6DD58C" onPress={() => setActive('sentinel')} />
      <QaButton label="Four Gods Victory" color="#6CA8FF" onPress={() => setActive('god')} />
      <QaButton label="Monarch Victory" color="#C68CFF" onPress={() => setActive('monarch')} />
      <QaButton label="Remount Legendary" color="#FF7D7D" onPress={() => { setActive(null); setTimeout(() => setActive('legendary'), 20) }} />
    </ScrollView>
    {active === 'legendary' && <LegendaryCardVFX reduceMotionOverride={reduceMotion} onFinish={finish} />}
    {active && active !== 'legendary' && <BossVictoryVFX tier={active} reduceMotionOverride={reduceMotion} onFinish={finish} />}
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
