// src/components/onboarding/GuideOverlay.tsx
// GuideOverlay -- กล่องคำแนะนำแบบ one-time ทับหน้าเกม (ใช้ใน Initiate tier)
// โชว์ครั้งแรกครั้งเดียวต่อ phase ผ่าน AsyncStorage flag แยกราย key
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { UI_THEME } from '../../ui/theme'

interface GuideOverlayProps {
  visible: boolean        // เงื่อนไข anchor จาก parent (เช่น phase === 'arrangement')
  storageKey: string      // AsyncStorage flag เช่น 'guide_arrangement_seen'
  message: string
  onDismiss?: () => void  // เรียกหลังกด Got it (ใช้ต่อคิว guide ถัดไปได้)
}

export function GuideOverlay({ visible, storageKey, message, onDismiss }: GuideOverlayProps) {
  // null = ยังเช็ค AsyncStorage ไม่เสร็จ, false = ยังไม่เคยเห็น, true = เคยเห็นแล้ว
  const [seen, setSeen] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    setSeen(null)
    AsyncStorage.getItem(storageKey).then(val => {
      if (mounted) setSeen(val === '1')
    })
    return () => { mounted = false }
  }, [storageKey])

  const handleGotIt = async () => {
    setSeen(true)
    onDismiss?.()
    await AsyncStorage.setItem(storageKey, '1')
  }

  if (!visible || seen !== false) return null

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={handleGotIt}>
          <Text style={styles.buttonText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 90,
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(22,58,37,0.94)',
    borderWidth: 1.5,
    borderColor: UI_THEME.gold.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  message: {
    color: UI_THEME.text.primary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  button: {
    backgroundColor: UI_THEME.gold.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: UI_THEME.bg.darkest,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
})
