import { Card } from '../../src/game/deck'
import { evaluateDiscardShowdownHand, resolveDiscardShowdown } from '../../src/arena/sovereign/discardShowdown'

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit, value: rank === 'A' ? 14 : ['J','Q','K'].includes(rank) ? ({ J: 11, Q: 12, K: 13 } as any)[rank] : Number(rank) })

describe('Gate 10.4 Pok Deng Discard Showdown', () => {
  test('orders locked categories Pok 9 > Pok 8 > trips > straight flush', () => {
    const hands = [
      { participantId: 'sf', isLastBoss: false, seat: 1 as const, cards: [card('2','spades'), card('3','spades'), card('4','spades')] },
      { participantId: 'trip', isLastBoss: false, seat: 2 as const, cards: [card('K','spades'), card('K','hearts'), card('K','clubs')] },
      { participantId: 'pok8', isLastBoss: false, seat: 3 as const, cards: [card('A','spades'), card('7','clubs')] },
      { participantId: 'pok9', isLastBoss: true, seat: 4 as const, cards: [card('A','hearts'), card('8','clubs')] },
    ]
    expect(resolveDiscardShowdown(hands).participantId).toBe('pok9')
    expect(evaluateDiscardShowdownHand(hands[1]).category).toBe('THREE_OF_KIND')
  })

  test('Last Boss defends an exact tie before human seat fallback', () => {
    const sameCards = [card('A','spades'), card('8','hearts')] as const
    expect(resolveDiscardShowdown([
      { participantId: 'human', isLastBoss: false, seat: 1, cards: sameCards },
      { participantId: 'boss', isLastBoss: true, seat: 4, cards: sameCards },
    ]).participantId).toBe('boss')
  })

  test('lower authoritative seat wins an exact human-only tie', () => {
    const sameCards = [card('2','clubs'), card('3','diamonds')] as const
    expect(resolveDiscardShowdown([
      { participantId: 'seat2', isLastBoss: false, seat: 2, cards: sameCards },
      { participantId: 'seat1', isLastBoss: false, seat: 1, cards: sameCards },
    ]).participantId).toBe('seat1')
  })
})
