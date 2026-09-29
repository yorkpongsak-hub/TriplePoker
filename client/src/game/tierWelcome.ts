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
export type TierEntryGreeting = 'welcome' | 'cheer' | 'none'

const keyFor = (playerId: string) => `tierWelcomeSeen:${playerId}`
const lastTierKeyFor = (playerId: string) => `tierWelcomeLastTier:${playerId}`
const entries = new Map<string, Promise<TierEntryGreeting>>()

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

/** Registers table entry and chooses the one-time welcome or tier-switch cheer. */
export function registerTierEntry(playerId: string, tierId: LaunchTierId): Promise<TierEntryGreeting> {
  const existing = entries.get(playerId)
  if (existing) return existing

  const entry = (async () => {
    const [seen, lastTier] = await Promise.all([
      readSeen(playerId),
      AsyncStorage.getItem(lastTierKeyFor(playerId)),
    ])

    if (!seen[tierId]) {
      seen[tierId] = true
      await AsyncStorage.multiSet([
        [keyFor(playerId), JSON.stringify(seen)],
        [lastTierKeyFor(playerId), tierId],
      ])
      return 'welcome'
    }

    await AsyncStorage.setItem(lastTierKeyFor(playerId), tierId)
    return lastTier && lastTier !== tierId ? 'cheer' : 'none'
  })().finally(() => entries.delete(playerId))

  entries.set(playerId, entry)
  return entry
}

export async function resetTierWelcomeForDebug(playerId: string, tierId: LaunchTierId) {
  const seen = await readSeen(playerId)
  delete seen[tierId]
  await AsyncStorage.setItem(keyFor(playerId), JSON.stringify(seen))
}
