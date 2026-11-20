import type { Card } from '../../src/game/deck'
import { broadcastHumanRoyalFlush, GLOBAL_ROYAL_FLUSH_EVENT } from '../../src/game/royalFlushBroadcast'

const card = (value: number, suit: Card['suit']): Card => ({ value, suit, rank: (value === 14 ? 'A' : value === 13 ? 'K' : value === 12 ? 'Q' : value === 11 ? 'J' : String(value)) as Card['rank'] })

describe('transient Royal Flush broadcast', () => {
  test('broadcasts the authoritative player name and suit for a real Royal Flush', () => {
    const emit = jest.fn()
    const cards = [10, 11, 12, 13, 14].map(value => card(value, 'hearts'))
    const event = broadcastHumanRoyalFlush({ emit } as any, { eventId: 'match:1:g3', playerId: 'p1', playerName: 'Aurora', cards })

    expect(event).toMatchObject({ eventId: 'match:1:g3', playerId: 'p1', playerName: 'Aurora', suit: 'hearts' })
    expect(emit).toHaveBeenCalledWith(GLOBAL_ROYAL_FLUSH_EVENT, event)
  })

  test('does not broadcast a non-Royal straight flush', () => {
    const emit = jest.fn()
    const cards = [9, 10, 11, 12, 13].map(value => card(value, 'spades'))
    expect(broadcastHumanRoyalFlush({ emit } as any, { eventId: 'match:1:g2', playerId: 'p1', playerName: 'Aurora', cards })).toBeNull()
    expect(emit).not.toHaveBeenCalled()
  })
})
