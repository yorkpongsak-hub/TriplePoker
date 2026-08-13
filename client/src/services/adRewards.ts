// services/adRewards.ts
// Ad-Watch Bonus client helper — shared between Lobby's insufficient-token rescue button and the
// Post-Match Victory Screen's ad step, both calling the same server/src/routes/rewards.ts endpoint
// (temporary test button, no real AdMob SDK yet — see that route's own header comment).
// The Sage Unicorn Studio Co., Ltd.

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001'

export type WatchAdResult =
  | { ok: true; tokensAwarded: number; newTokenBalance: number | null }
  | { ok: false; reason: 'cooldown'; retryAfterSeconds: number }
  | { ok: false; reason: 'error' }

export async function watchAd(accessToken: string | null): Promise<WatchAdResult> {
  if (!accessToken) return { ok: false, reason: 'error' }
  try {
    const res = await fetch(`${SERVER_URL}/rewards/watch-ad`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const json = await res.json()
    if (res.status === 429) {
      return { ok: false, reason: 'cooldown', retryAfterSeconds: json.retryAfterSeconds ?? 0 }
    }
    if (!res.ok) {
      return { ok: false, reason: 'error' }
    }
    return { ok: true, tokensAwarded: json.tokensAwarded, newTokenBalance: json.newTokenBalance ?? null }
  } catch (err) {
    console.error('[adRewards] watchAd failed:', err)
    return { ok: false, reason: 'error' }
  }
}
