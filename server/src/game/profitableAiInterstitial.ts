import { randomUUID } from 'node:crypto'

const TICKET_TTL_MS = 10 * 60_000
const GAME_MEMORY_TTL_MS = 6 * 60 * 60_000
const tickets = new Map<string, { userId: string; expiresAt: number }>()
const issuedGames = new Set<string>()

/** Server-only capability: one ticket per game, issued from an authoritative positive settlement. */
export function issueProfitableAiInterstitialTicket(input: { tier: string; gameId: string; userId: string; tokenDelta: number; now?: number }): string | undefined {
  if (!['tier_d', 'initiate', 'mastermind'].includes(input.tier) || !(input.tokenDelta > 0)) return undefined
  const gameKey = `${input.tier}:${input.gameId}:${input.userId}`
  if (issuedGames.has(gameKey)) return undefined
  issuedGames.add(gameKey)
  const ticket = randomUUID()
  tickets.set(ticket, { userId: input.userId, expiresAt: (input.now ?? Date.now()) + TICKET_TTL_MS })
  const ticketCleanup = setTimeout(() => tickets.delete(ticket), TICKET_TTL_MS)
  const gameCleanup = setTimeout(() => issuedGames.delete(gameKey), GAME_MEMORY_TTL_MS)
  ticketCleanup.unref?.(); gameCleanup.unref?.()
  return ticket
}

/** Single-use even on no-fill, ensuring play continues without retries or ad debt. */
export function consumeProfitableAiInterstitialTicket(ticket: string, userId: string, now = Date.now()): boolean {
  const claim = tickets.get(ticket)
  if (!claim) return false
  tickets.delete(ticket)
  return claim.userId === userId && claim.expiresAt >= now
}

export function resetProfitableAiInterstitialTicketsForTest(): void {
  tickets.clear(); issuedGames.clear()
}
