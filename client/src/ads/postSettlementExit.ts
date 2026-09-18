import { router } from 'expo-router'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
export type ClassicAdTier = 'C' | 'B' | 'A' | 'A_PLUS'
export type ClassicExitOutcome = 'WIN' | 'LOSS'
export type ClassicExitReason = 'CONTINUE' | 'BACK_TO_LOBBY'

// Navigation can be tapped twice before a screen unmounts. Keep this separate
// from the server's durable ad policy: it only serializes one local exit.
const pendingExitKeys = new Set<string>()

/**
 * The sole client gateway for a completed Tier C–A+ Match exit. It never runs
 * while a Match is active; callers invoke it only from settled result screens.
 */
export async function leaveAfterClassicSettlement(input: {
  accessToken?: string | null
  tier: ClassicAdTier
  outcome: ClassicExitOutcome
  exitReason: ClassicExitReason
  returnTo: string
}) {
  const key = `${input.tier}:${input.outcome}:${input.exitReason}:${input.returnTo}`
  if (pendingExitKeys.has(key)) return
  pendingExitKeys.add(key)
  const continueToDestination = () => router.push(input.returnTo as any)
  try {
    if (input.accessToken) {
      // Wins retain the existing Victory opportunity. Loss exits use the new,
      // equally post-settlement point; the server owns all probability/cooldowns.
      const naturalBreak = input.outcome === 'WIN' ? 'CLASSIC_GAME_SETTLED' : 'CLASSIC_POST_SETTLEMENT_EXIT'
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const response = await fetch(`${SERVER_URL}/ads/natural-break`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify({ naturalBreak, tier: input.tier, outcome: input.outcome, exitReason: input.exitReason }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
      const policy = await response.json()
      if (response.ok && policy.showForcedInterstitial) {
        router.push({ pathname: '/(home)/watch-ad', params: { returnTo: input.returnTo, mode: 'forced' } } as any)
        setTimeout(() => pendingExitKeys.delete(key), 1000)
        return
      }
    }
  } catch {
    // A no-fill, transport failure, or unavailable policy must never block exit.
  }
  continueToDestination()
  // Route transitions are asynchronous; cover rapid repeated taps without
  // permanently blocking a later, genuinely separate Match exit.
  setTimeout(() => pendingExitKeys.delete(key), 1000)
}
