import type { Server } from 'socket.io'
import type { Card } from './deck'

export const GLOBAL_ROYAL_FLUSH_EVENT = 'royal_flush:global_celebration'

export type GlobalRoyalFlushEvent = {
  eventId: string
  playerId: string
  playerName: string
  suit: Card['suit']
  occurredAt: number
}

/**
 * Transient, process-local fan-out only. The caller must pass an authoritative
 * human Royal Flush; this helper deliberately performs no persistence/replay.
 */
export function broadcastHumanRoyalFlush(
  io: Pick<Server, 'emit'>,
  input: { eventId: string; playerId: string; playerName: string; cards: readonly Card[] },
): GlobalRoyalFlushEvent | null {
  const royal = input.cards.find(card => card.value === 14)
  if (!royal || ![10, 11, 12, 13, 14].every(value => input.cards.some(card => card.value === value && card.suit === royal.suit))) return null
  const event: GlobalRoyalFlushEvent = {
    eventId: input.eventId,
    playerId: input.playerId,
    playerName: input.playerName.trim() || 'PLAYER',
    suit: royal.suit,
    occurredAt: Date.now(),
  }
  io.emit(GLOBAL_ROYAL_FLUSH_EVENT, event)
  return event
}
