// PreGameCountdown.tsx
// Pre-Game Countdown 5-4-3-2-1 — TriplePoker_LobbyMatchmaking_Spec_v1_0 §7.1
// เล่นครั้งเดียวตอนเริ่มแมตช์เท่านั้น (ไม่เล่นซ้ำทุก Round / ไม่เล่นตอน Rematch)
// ตัวเลข scale ขยายใหญ่ทุกจังหวะ + เปลี่ยนสี Gold #FFD76A -> Red #FF6B6B ที่เลข 1
// คนละ event กับ 3-2-1 dramatic pause ของ Simultaneous Showdown (GameFlow v1.2 §3) — ห้ามใช้แทนกัน
// The Sage Unicorn Studio Co., Ltd.

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { playCountdownTick } from '../services/bgmService'

const GOLD = '#FFD76A'
const RED = '#FF6B6B'
const COUNT_SEQUENCE = [5, 4, 3, 2, 1]
const TICK_MS = 800

interface PreGameCountdownProps {
  visible: boolean
  onComplete: () => void
}

export default function PreGameCountdown({ visible, onComplete }: PreGameCountdownProps) {
  const [count, setCount] = useState(COUNT_SEQUENCE[0])
  const scale = useRef(new Animated.Value(0.5)).current
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!visible) return

    const runTick = (value: number) => {
      setCount(value)
      playCountdownTick()
      scale.setValue(0.5)
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 60 }).start()
    }

    let idx = 0
    runTick(COUNT_SEQUENCE[idx])
    const intervalId = setInterval(() => {
      idx++
      if (idx >= COUNT_SEQUENCE.length) {
        clearInterval(intervalId)
        onCompleteRef.current()
        return
      }
      runTick(COUNT_SEQUENCE[idx])
    }, TICK_MS)

    return () => clearInterval(intervalId)
  }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null
  const color = count === 1 ? RED : GOLD

  return (
    <View style={s.overlay}>
      <Animated.Text style={[s.number, { color, transform: [{ scale }] }]}>{count}</Animated.Text>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 997,
    backgroundColor: 'rgba(5,10,8,0.85)', alignItems: 'center', justifyContent: 'center',
  },
  number: { fontSize: 120, fontWeight: '900' },
})
