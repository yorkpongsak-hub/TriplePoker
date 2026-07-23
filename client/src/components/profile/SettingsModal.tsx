// SettingsModal.tsx
// Settings modal ใหม่ — แยกจาก Onboarding โดยสิ้นเชิง (เดิมปุ่ม Settings ใน profile.tsx repurpose
// ไปเปิด Onboarding ชั่วคราวเพราะยังไม่มีหน้า Settings จริง — ตอนนี้มีแล้ว)
// Toggle แรก: Reduce Motion (Faster Deal Animation) — per-player local เท่านั้น (AsyncStorage)
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { getReduceMotion, setReduceMotion } from '../../utils/reduceMotion'

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

  // โหลดค่าปัจจุบันทุกครั้งที่เปิด modal (กันเคส toggle ถูกแก้จากที่อื่นระหว่างที่ modal ปิดอยู่)
  useEffect(() => {
    if (!visible) return
    getReduceMotion().then(setReduceMotionState)
  }, [visible])

  const handleToggle = () => {
    const next = !reduceMotion
    setReduceMotionState(next) // optimistic — feel ทันที ไม่ต้องรอ AsyncStorage write
    setReduceMotion(next)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
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

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    padding: 20,
  },
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
