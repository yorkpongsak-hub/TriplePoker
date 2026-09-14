import React from 'react'
import { router } from 'expo-router'
import DoorEntryTransition from '../../../src/components/game/DoorEntryTransition'
import { useAuthStore } from '../../../src/store/authStore'

// Keep the real table unmounted until the cinematic ends: its existing socket
// resume/start effect remains the sole source of Tier D game state.
export default function TierDEntry() {
  const level = useAuthStore(state => state.profile?.tier_d_solo_level ?? undefined)
  return <DoorEntryTransition level={level} onFinish={() => router.replace('/game/tier-d')} />
}
