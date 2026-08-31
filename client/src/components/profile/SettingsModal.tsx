// SettingsModal.tsx
// Settings modal ใหม่ — แยกจาก Onboarding โดยสิ้นเชิง (เดิมปุ่ม Settings ใน profile.tsx repurpose
// ไปเปิด Onboarding ชั่วคราวเพราะยังไม่มีหน้า Settings จริง — ตอนนี้มีแล้ว)
// Toggle แรก: Reduce Motion (Faster Deal Animation) — per-player local เท่านั้น (AsyncStorage)
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useRef, useState } from 'react'
import { Image, Modal, PanResponder, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { getReduceMotion, setReduceMotion } from '../../utils/reduceMotion'
import { TABLE_SKINS, TABLE_SKIN_META } from '../../config/tableSkins'
import { useTableSkins } from '../../hooks/useTableSkins'
import { useAuthStore } from '../../store/authStore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { audio, AudioCategory } from '../../audio'
import { AudioSettings, DEFAULT_AUDIO_SETTINGS } from '../../audio/audioSettings'

const C = {
  bg:      '#0F2418',
  card:    '#1C4830',
  border:  '#2A4A34',
  gold:    '#FFD76A',
  green:   '#8DFFB5',
  text:    '#F5F2E8',
  textSec: '#C8C4B0',
}

interface Props {
  visible: boolean
  onClose: () => void
}

export default function SettingsModal({ visible, onClose }: Props) {
  const [reduceMotion, setReduceMotionState] = useState(false)
  const [characterDialogue, setCharacterDialogue] = useState(true)
  const [selectingSkin, setSelectingSkin] = useState<number | null>(null)
  const [skinError, setSkinError] = useState<string | null>(null)
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS)
  const isVip = useAuthStore(s => (s.profile?.vip_status ?? 'none') !== 'none')
  const { unlockedSkins, activeSkin, loading: skinsLoading, selectSkin } = useTableSkins()

  // โหลดค่าปัจจุบันทุกครั้งที่เปิด modal (กันเคส toggle ถูกแก้จากที่อื่นระหว่างที่ modal ปิดอยู่)
  useEffect(() => {
    if (!visible) return
    getReduceMotion().then(setReduceMotionState)
    AsyncStorage.getItem('settings.characterDialogue').then(value => setCharacterDialogue(value !== 'false'))
    setAudioSettings(audio.getSettings())
  }, [visible])

  useEffect(() => audio.subscribe(setAudioSettings), [])

  const handleToggle = () => {
    const next = !reduceMotion
    setReduceMotionState(next) // optimistic — feel ทันที ไม่ต้องรอ AsyncStorage write
    setReduceMotion(next)
  }

  const handleDialogueToggle = () => {
    const next = !characterDialogue
    setCharacterDialogue(next)
    void AsyncStorage.setItem('settings.characterDialogue', String(next))
  }

  const handleSelectSkin = async (skinId: number) => {
    if (selectingSkin !== null || skinId === activeSkin) return
    setSelectingSkin(skinId)
    setSkinError(null)
    const selected = await selectSkin(skinId)
    if (!selected) setSkinError('Could not update table skin. Please try again.')
    setSelectingSkin(null)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ScrollView style={styles.card} contentContainerStyle={styles.cardContent}>
          <Text style={styles.title}>Settings</Text>

          <TouchableOpacity style={styles.row} onPress={handleToggle} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Reduce Motion</Text>
              <Text style={styles.rowSub}>Faster Deal Animation</Text>
            </View>
            <View style={[styles.toggleTrack, reduceMotion && styles.toggleTrackOn]}>
              <View style={[styles.toggleThumb, reduceMotion && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleDialogueToggle} activeOpacity={0.8}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Character Dialogue</Text>
              <Text style={styles.rowSub}>Lore, reactions and rare table secrets</Text>
            </View>
            <View style={[styles.toggleTrack, characterDialogue && styles.toggleTrackOn]}>
              <View style={[styles.toggleThumb, characterDialogue && styles.toggleThumbOn]} />
            </View>
          </TouchableOpacity>

          <View style={styles.audioSection}>
            <Text style={styles.sectionTitle}>Audio</Text>
            <TouchableOpacity style={styles.row} onPress={() => audio.setMuted(!audioSettings.muted)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Master Sound</Text>
                <Text style={styles.rowSub}>{audioSettings.muted ? 'Off' : 'On'}</Text>
              </View>
              <View style={[styles.toggleTrack, !audioSettings.muted && styles.toggleTrackOn]}>
                <View style={[styles.toggleThumb, !audioSettings.muted && styles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>
            <VolumeControl label="Music" value={audioSettings.categories[AudioCategory.BGM]} onChange={value => audio.setCategoryVolume(AudioCategory.BGM, value)} />
            <VolumeControl label="Sound Effects" value={audioSettings.categories[AudioCategory.GAMEPLAY]} onChange={value => audio.setSfxVolume(value)} />
          </View>

          <View style={styles.skinSection}>
            <Text style={styles.sectionTitle}>Table Skin</Text>
            <Text style={styles.sectionSub}>
              {isVip ? 'VIP rewards unlock as you advance through the tables.' : 'Table skins are rewards for VIP members.'}
            </Text>
            <View style={styles.skinGrid}>
              {TABLE_SKIN_META.map(skin => {
                const unlocked = isVip && (skin.id === 0 || unlockedSkins.includes(skin.id))
                const active = activeSkin === skin.id
                return (
                  <TouchableOpacity
                    key={skin.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${skin.name} table skin${active ? ', active' : ''}`}
                    disabled={!unlocked || skinsLoading || selectingSkin !== null}
                    onPress={() => { void handleSelectSkin(skin.id) }}
                    style={[styles.skinCard, active && styles.skinCardActive, !unlocked && styles.skinCardLocked]}
                  >
                    <Image source={TABLE_SKINS[skin.id]} style={styles.skinImage} resizeMode="cover" />
                    {!unlocked && <View style={styles.skinLock}><Text style={styles.skinLockText}>🔒</Text></View>}
                    {active && <Text style={styles.activeBadge}>ACTIVE</Text>}
                    <Text style={styles.skinName} numberOfLines={1}>{skin.name}</Text>
                    <Text style={styles.skinUnlock}>
                      {selectingSkin === skin.id ? 'Saving…' : active ? 'Using this table' : unlocked ? (skin.id === 0 ? 'Use original table' : 'Unlocked') : skin.unlock}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {skinError && <Text style={styles.skinError}>{skinError}</Text>}
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  // ต้องลากจริง (dx เกิน threshold และแนวนอนมากกว่าแนวตั้ง) ค่าถึงจะขยับ กัน
  // แตะพลาด/สกอลผ่าน ScrollView ของ modal นี้แล้ว volume ถูกเซ็ตค่าทันทีโดยไม่ตั้งใจ
  // (ของเดิมใช้ onPress ครั้งเดียว + หาร locationX ด้วยเลข 280 คงที่ ทั้งที่ track ยืดตามความกว้างจอจริง)
  const trackWidthRef = useRef(0)
  const valueRef = useRef(value)
  const startValueRef = useRef(value)
  valueRef.current = value

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        Math.abs(gestureState.dx) > 4 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: () => { startValueRef.current = valueRef.current },
      onPanResponderMove: (_evt, gestureState) => {
        if (trackWidthRef.current <= 0) return
        onChange(Math.max(0, Math.min(1, startValueRef.current + gestureState.dx / trackWidthRef.current)))
      },
    }),
  ).current

  return (
    <View style={styles.volumeRow}>
      <View style={styles.volumeHeader}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.volumeValue}>{Math.round(value * 100)}%</Text></View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label} volume`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => onChange(Math.max(0, Math.min(1, value + (event.nativeEvent.actionName === 'increment' ? .1 : -.1))))}
        onLayout={event => { trackWidthRef.current = event.nativeEvent.layout.width }}
        style={styles.volumeTrack}
        {...panResponder.panHandlers}
      >
        <View style={[styles.volumeFill, { width: `${value * 100}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: C.gold,
    borderRadius: 16,
    maxHeight: '88%',
  },
  cardContent: { padding: 20 },
  title: {
    color: C.gold,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
  },
  rowLabel: { color: C.text, fontSize: 14, fontWeight: '800' },
  rowSub: { color: C.textSec, fontSize: 11, marginTop: 2 },
  audioSection: { marginTop: 18, gap: 9 },
  volumeRow: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14 },
  volumeHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  volumeValue: { color: C.green, fontSize: 11, fontWeight: '800' },
  volumeTrack: { height: 14, borderRadius: 7, backgroundColor: C.border, overflow: 'hidden' },
  volumeFill: { height: '100%', borderRadius: 7, backgroundColor: C.green },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.border,
    padding: 3,
  },
  toggleTrackOn: { backgroundColor: C.green },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.text,
  },
  toggleThumbOn: { transform: [{ translateX: 20 }] },
  skinSection: { marginTop: 18 },
  sectionTitle: { color: C.gold, fontSize: 14, fontWeight: '900' },
  sectionSub: { color: C.textSec, fontSize: 10, marginTop: 3, marginBottom: 10 },
  skinGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skinCard: { width: '48%', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#081C12', paddingBottom: 7 },
  skinCardActive: { borderColor: C.green, borderWidth: 2 },
  skinCardLocked: { opacity: 0.48 },
  skinImage: { width: '100%', height: 112 },
  skinLock: { ...StyleSheet.absoluteFillObject, bottom: 37, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.48)' },
  skinLockText: { fontSize: 23 },
  activeBadge: { position: 'absolute', top: 5, right: 5, color: '#081C12', backgroundColor: C.green, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, fontSize: 8, fontWeight: '900' },
  skinName: { color: C.text, fontSize: 10, fontWeight: '800', paddingHorizontal: 7, marginTop: 5 },
  skinUnlock: { color: C.textSec, fontSize: 8, paddingHorizontal: 7, marginTop: 2 },
  skinError: { color: '#FF8A8A', fontSize: 10, marginTop: 9, textAlign: 'center' },
  closeBtn: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.gold,
  },
  closeBtnText: { color: C.gold, fontSize: 13, fontWeight: '800' },
})
