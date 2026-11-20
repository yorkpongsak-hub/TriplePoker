import { router } from 'expo-router'
import { useAuthStore } from '../store/authStore'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'
const MAIN_LOBBY = '/(home)/classic-lobby'

export type ClassicAdTier = 'C' | 'B' | 'A' | 'A_PLUS' | 'S'
export type ClassicExitOutcome = 'WIN' | 'LOSS'
export type ClassicExitReason = 'CONTINUE' | 'BACK_TO_LOBBY'

let exitPending = false

function navigateToMainLobby() {
  const isFreeMember = (useAuthStore.getState().profile?.vip_status ?? 'none') === 'none'

  if (isFreeMember) {
    router.replace({ pathname: '/(home)/watch-ad', params: { returnTo: MAIN_LOBBY, mode: 'forced' } } as any)
  } else {
    router.replace(MAIN_LOBBY)
  }

  // Suppress rapid double taps without blocking a later, separate table exit.
  setTimeout(() => { exitPending = false }, 1000)
}

/** The only exit gateway for an active Tier C+ table. */
export function leaveTierCPlusTable() {
  if (exitPending) return
  exitPending = true
  navigateToMainLobby()
}

/** Settlement-aware Tier C+ exit. Every destination is still Main Lobby. */
export async function leaveAfterClassicSettlement(input: {
  accessToken?: string | null
  tier: ClassicAdTier
  outcome: ClassicExitOutcome
  exitReason: ClassicExitReason
}) {
  if (exitPending) return
  exitPending = true
  if (input.accessToken) {
    try {
      const naturalBreak = input.outcome === 'WIN' ? 'CLASSIC_GAME_SETTLED' : 'CLASSIC_POST_SETTLEMENT_EXIT'
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      await fetch(`${SERVER_URL}/ads/natural-break`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.accessToken}` },
        body: JSON.stringify({ naturalBreak, tier: input.tier, outcome: input.outcome, exitReason: input.exitReason }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
    } catch {
      // Telemetry availability must not prevent the required exit flow.
    }
  }
  navigateToMainLobby()
}
