import React, { useState } from 'react'
import { ActivityIndicator, Image, ImageSourcePropType, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export type BeyondPath = 'CAELUM' | 'SOREN' | 'MONARCH'

// มติลุงเยาะ — ห้ามแสดงคำว่า "Caelum" ที่ไหนในแอปเลย ใช้ "The last boss" แทน — id ยังเป็น 'CAELUM' เดิม
// (ใช้จับคู่กับ beyond_path จริงที่ server validate/เก็บไว้ ห้ามแก้) แก้แค่ boss (label ที่แสดงบนการ์ด)
// มติลุงเยาะ (รอบ 2) — "Soren" ห้ามมีใครเห็นชื่อนี้เลยในแอปภาคแรกนี้ (จะเปิดเผยเฉพาะแอปภาคจบ Beyond the
// Rules เท่านั้น) ใช้ "UNKNOWN BOSS" แทนทั้ง boss label และ copy (เดิม copy เอ่ยชื่อ "Soren" ตรงๆ ด้วย
// ต้องเขียนใหม่ทั้งประโยค) — id ยังเป็น 'SOREN' เดิมเหมือน CAELUM ไม่แตะ
const PATHS: Array<{ id: BeyondPath; boss: string; title: string; copy: string; image: ImageSourcePropType }> = [
  { id: 'CAELUM', boss: 'THE LAST BOSS', title: 'THE FIRMAMENT', copy: 'Follow the architect of celestial law. Beyond the Rules, perfection may prove to be the oldest prison.', image: require('../../../assets/bosses/boss_beyond_path_01.png') },
  { id: 'SOREN', boss: 'UNKNOWN BOSS', title: 'THE EXILE', copy: 'Walk beside the mortal who rejected every throne. Freedom has a price—and no one has revealed who must pay it.', image: require('../../../assets/bosses/boss_beyond_path_02.png') },
  { id: 'MONARCH', boss: 'MONARCH', title: 'THE CROWN', copy: 'Carry the burden of the ruler who crossed the final boundary. Some crowns command kingdoms; this one commands endings.', image: require('../../../assets/bosses/boss_beyond_path_03.png') },
]

export default function BeyondPathChoice({ onChoose }: { onChoose: (path: BeyondPath) => Promise<void> }) {
  const [selected, setSelected] = useState<BeyondPath | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    if (!selected || saving) return
    setSaving(true); setError(null)
    try { await onChoose(selected) } catch (e: any) { setError(e?.message ?? 'Could not seal this path. Please try again.'); setSaving(false) }
  }
  return (
    <View style={s.overlay}>
      <Text style={s.eyebrow}>TIER S • STORY CROSSROADS</Text>
      <Text style={s.title}>CHOOSE YOUR PATH</Text>
      <Text style={s.intro}>Three shadows wait beyond the known game. Your choice is permanent and will shape your road into Beyond the Rules.</Text>
      <ScrollView horizontal contentContainerStyle={s.row} showsHorizontalScrollIndicator={false}>
        {PATHS.map(path => (
          <TouchableOpacity key={path.id} onPress={() => setSelected(path.id)} style={[s.card, selected === path.id && s.cardSelected]}>
            <View style={s.imageWrap}>
              <Image source={path.image} blurRadius={7} style={s.image} resizeMode="cover" />
              <View style={s.veil} />
              <Text style={s.boss}>{path.boss}</Text>
            </View>
            <Text style={s.pathTitle}>{path.title}</Text>
            <Text style={s.copy}>{path.copy}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity disabled={!selected || saving} onPress={() => void confirm()} style={[s.confirm, (!selected || saving) && s.disabled]}>
        {/* มติลุงเยาะ — ห้ามโชว์ "CAELUM" ดิบๆ ผ่าน selected id เลย ใช้ boss label ที่แก้แล้วจาก PATHS แทน
            (boss ของ CAELUM path เป็น "THE LAST BOSS" มี "THE" ในตัวอยู่แล้ว เช็ค startsWith กันคำว่า "THE"
            ซ้อนกัน 2 รอบ — SOREN/MONARCH ไม่มี "THE" นำหน้าอยู่แล้วเลย prefix "THE " ให้ตามปกติ) */}
        {saving ? <ActivityIndicator color="#0F2418" /> : <Text style={s.confirmText}>{selected ? (() => {
          const boss = PATHS.find(path => path.id === selected)?.boss ?? selected
          return `SEAL ${boss.startsWith('THE ') ? boss : `THE ${boss}`} PATH`
        })() : 'SELECT A PATH'}</Text>}
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 20000, backgroundColor: '#07110ccc', alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  eyebrow: { color: '#8DFFB5', fontSize: 10, fontWeight: '900', letterSpacing: 2 }, title: { color: '#FFD76A', fontSize: 24, fontWeight: '900', letterSpacing: 2, marginTop: 5 },
  intro: { color: '#C8C4B0', maxWidth: 660, paddingHorizontal: 24, textAlign: 'center', fontSize: 11, lineHeight: 17, marginVertical: 14 },
  row: { gap: 12, paddingHorizontal: 18, alignItems: 'stretch' }, card: { width: 210, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#2A4A34', backgroundColor: '#163A25', paddingBottom: 12 },
  cardSelected: { borderColor: '#FFD76A', borderWidth: 2, transform: [{ translateY: -4 }] }, imageWrap: { height: 190 }, image: { width: '100%', height: '100%' }, veil: { ...StyleSheet.absoluteFillObject, backgroundColor: '#02070477' },
  boss: { position: 'absolute', bottom: 10, alignSelf: 'center', color: '#F5F2E8', fontSize: 17, fontWeight: '900', letterSpacing: 2, textShadowColor: '#000', textShadowRadius: 8 },
  pathTitle: { color: '#FFD76A', fontSize: 12, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 10 }, copy: { color: '#C8C4B0', fontSize: 10, lineHeight: 15, paddingHorizontal: 12, marginTop: 6, textAlign: 'center' },
  confirm: { minWidth: 260, height: 44, marginTop: 16, borderRadius: 10, backgroundColor: '#FFD76A', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.4 }, confirmText: { color: '#0F2418', fontSize: 12, fontWeight: '900', letterSpacing: 1 }, error: { color: '#FF6B6B', fontSize: 10, marginTop: 10 },
})
