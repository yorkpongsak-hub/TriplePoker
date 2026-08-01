import { Card } from '../../src/game/deck'
import { resolveLastBossConquest } from '../../src/arena/sovereign/lastBossConquest'
import { createLastBossPublicIdentity } from '../../src/arena/sovereign/lastBossIdentity'

const c = (value: number): Card => ({ rank: String(value) as Card['rank'], suit: 'clubs', value })

describe('Gate 10.4 Last Boss conquest', () => {
  test('only a unique eligible overall human winner conquers the throne', () => {
    const result = resolveLastBossConquest([
      { participantId: 'winner', isLastBoss: false, seat: 1, matchScore: 30, botControlledThroughCompletion: false, discardedCards: [c(4), c(5)] },
      { participantId: 'h2', isLastBoss: false, seat: 2, matchScore: 20, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
      { participantId: 'h3', isLastBoss: false, seat: 3, matchScore: 10, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
      { participantId: 'boss', isLastBoss: true, seat: 4, matchScore: 25, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
    ])
    expect(result).toEqual({ winnerId: 'winner', resolvedBy: 'MATCH_SCORE', throneConquered: true, reason: 'HUMAN_CONQUERED' })
  })

  test('Bot-controlled winner cannot conquer', () => {
    const standings = [
      { participantId: 'winner', isLastBoss: false, seat: 1 as const, matchScore: 30, botControlledThroughCompletion: true, discardedCards: [c(4), c(5)] },
      { participantId: 'h2', isLastBoss: false, seat: 2 as const, matchScore: 20, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
      { participantId: 'h3', isLastBoss: false, seat: 3 as const, matchScore: 10, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
      { participantId: 'boss', isLastBoss: true, seat: 4 as const, matchScore: 25, botControlledThroughCompletion: false, discardedCards: [c(2), c(3)] },
    ]
    expect(resolveLastBossConquest(standings).reason).toBe('BOT_INELIGIBLE')
  })

  test('creates stable dark silhouette identity and rotating aura', () => {
    expect(createLastBossPublicIdentity({ reignId: 'r1', throneName: 'CAELUM', reignNumber: 13, reignStartedAt: '2026-08-01T00:00:00Z' }))
      .toMatchObject({ avatarKind: 'DARK_SILHOUETTE', auraKey: 'last-boss-aura-1' })
  })
})
