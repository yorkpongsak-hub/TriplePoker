import { DiscardShowdownHand, resolveDiscardShowdown } from './discardShowdown'

export interface LastBossMatchStanding {
  participantId: string
  isLastBoss: boolean
  seat: 1 | 2 | 3 | 4
  matchScore: number
  botControlledThroughCompletion: boolean
  discardedCards: DiscardShowdownHand['cards']
}

export interface LastBossConquestResult {
  winnerId: string
  resolvedBy: 'MATCH_SCORE' | 'DISCARD_SHOWDOWN'
  throneConquered: boolean
  reason: 'HUMAN_CONQUERED' | 'THRONE_DEFENDED' | 'BOT_INELIGIBLE'
}

export function resolveLastBossConquest(standings: readonly LastBossMatchStanding[]): LastBossConquestResult {
  if (standings.length !== 4 || standings.filter(row => row.isLastBoss).length !== 1) {
    throw new Error('INVALID_LAST_BOSS_STANDINGS')
  }
  const highestScore = Math.max(...standings.map(row => row.matchScore))
  const tied = standings.filter(row => row.matchScore === highestScore)
  const winner = tied.length === 1
    ? tied[0]
    : standings.find(row => row.participantId === resolveDiscardShowdown(tied.map(row => ({
      participantId: row.participantId,
      isLastBoss: row.isLastBoss,
      seat: row.seat,
      cards: row.discardedCards,
    }))).participantId)!

  if (winner.isLastBoss) return { winnerId: winner.participantId, resolvedBy: tied.length === 1 ? 'MATCH_SCORE' : 'DISCARD_SHOWDOWN', throneConquered: false, reason: 'THRONE_DEFENDED' }
  if (winner.botControlledThroughCompletion) return { winnerId: winner.participantId, resolvedBy: tied.length === 1 ? 'MATCH_SCORE' : 'DISCARD_SHOWDOWN', throneConquered: false, reason: 'BOT_INELIGIBLE' }
  return { winnerId: winner.participantId, resolvedBy: tied.length === 1 ? 'MATCH_SCORE' : 'DISCARD_SHOWDOWN', throneConquered: true, reason: 'HUMAN_CONQUERED' }
}
