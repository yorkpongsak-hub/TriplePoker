import { adProvider } from './adProvider'

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

/** Fail-open transition: policy/provider/network failures never block the next match. */
export async function showProfitableAiInterstitial(ticket: string | undefined, accessToken: string | null): Promise<void> {
  if (!ticket || !accessToken) return
  try {
    const response = await fetch(`${SERVER_URL}/ads/natural-break`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ naturalBreak: 'PROFITABLE_AI_MATCH', ticket }),
    })
    const policy = await response.json()
    if (!response.ok || !policy.showForcedInterstitial) return
    const result = await adProvider.showInterstitial()
    if (result.shown) await fetch(`${SERVER_URL}/ads/forced-complete`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => {})
  } catch {
    // Deliberately fail open at a between-match natural break.
  }
}
