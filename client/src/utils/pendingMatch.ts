import AsyncStorage from '@react-native-async-storage/async-storage'

export const PENDING_MATCH_KEY = 'triplepoker_pending_match'

export interface PendingMatch {
  tier: string
  startedAt: string
}

export async function markPendingMatch(tier: string): Promise<void> {
  const existing = await AsyncStorage.getItem(PENDING_MATCH_KEY)
  if (existing) {
    console.log('[ESCROW] pending match marker already exists')
    return
  }
  const pending: PendingMatch = { tier, startedAt: new Date().toISOString() }
  await AsyncStorage.setItem(PENDING_MATCH_KEY, JSON.stringify(pending))
  console.log('[ESCROW] pending match marked:', tier, pending.startedAt)
}

export async function clearPendingMatch(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_MATCH_KEY)
  console.log('[ESCROW] pending match marker cleared')
}
