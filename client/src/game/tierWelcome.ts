import AsyncStorage from '@react-native-async-storage/async-storage'

export type LaunchTierId = 'tier_d' | 'initiate' | 'adept' | 'mastermind' | 'high_noble'

export const TIER_WELCOME_NAMES: Record<LaunchTierId, string> = {
  tier_d: 'D',
  initiate: 'Initiate',
  adept: 'Adept',
  mastermind: 'Mastermind',
  high_noble: 'High Noble',
}

type TierWelcomeSeen = Partial<Record<LaunchTierId, true>>

const keyFor = (playerId: string) => `tierWelcomeSeen:${playerId}`
const claims = new Map<string, Promise<boolean>>()

async function readSeen(playerId: string): Promise<TierWelcomeSeen> {
  const raw = await AsyncStorage.getItem(keyFor(playerId))
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as TierWelcomeSeen : {}
  } catch {
    return {}
  }
}

/** Atomically claims the one-time welcome within this app process. */
export function claimTierWelcome(playerId: string, tierId: LaunchTierId): Promise<boolean> {
  const claimKey = `${playerId}:${tierId}`
  const existing = claims.get(claimKey)
  if (existing) return existing

  const claim = (async () => {
    const seen = await readSeen(playerId)
    if (seen[tierId]) return false
    seen[tierId] = true
    await AsyncStorage.setItem(keyFor(playerId), JSON.stringify(seen))
    return true
  })().finally(() => claims.delete(claimKey))

  claims.set(claimKey, claim)
  return claim
}

export async function resetTierWelcomeForDebug(playerId: string, tierId: LaunchTierId) {
  const seen = await readSeen(playerId)
  delete seen[tierId]
  await AsyncStorage.setItem(keyFor(playerId), JSON.stringify(seen))
}
