import React from 'react'
import { router } from 'expo-router'
import DoorEntryTransition from '../../../src/components/game/DoorEntryTransition'
import { usePlayerStore } from '../../../src/offline/playerStore'

// Keep the real table unmounted until the cinematic ends — Tier D Solo เล่นออฟไลน์ล้วนแล้ว
// level มาจาก playerStore (local) ไม่ใช่ Supabase profile อีกต่อไป
export default function TierDEntry() {
  const level = usePlayerStore(state => state.profile?.tierDSolo.level ?? 1)
  return <DoorEntryTransition level={level} onFinish={() => router.replace('/game/tier-d')} onHowToPlay={() => router.push('/(auth)/onboarding')} />
}
