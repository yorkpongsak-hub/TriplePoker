import { PLAYER_TITLE_RULES, PlayerTitleSignals, selectPlayerTitle } from '../../src/game/playerTitleService'

const signals = (overrides: Partial<PlayerTitleSignals> = {}): PlayerTitleSignals => ({
  tierUnlockedMax: 'D', monarchVictories: 0, streak7DaysBadge: false, crownBalance: 0,
  performanceScore: 0, gamesPlayed: 0, gamesWon: 0, wins: [], ...overrides,
})

describe('automatic player titles', () => {
  test('initial catalog has no more than 20 unique titles', () => {
    expect(PLAYER_TITLE_RULES).toHaveLength(20)
    expect(new Set(PLAYER_TITLE_RULES.map(title => title.key)).size).toBe(20)
  })

  test('new players receive the safe default title', () => {
    expect(selectPlayerTitle(signals())).toEqual({ key: 'new_challenger', label: 'New Challenger' })
  })

  test('uses server-confirmed progression and behavior signals', () => {
    expect(selectPlayerTitle(signals({ gamesWon: 1 })).key).toBe('golden_rookie')
    expect(selectPlayerTitle(signals({ tierUnlockedMax: 'mastermind' })).key).toBe('mastermind')
    expect(selectPlayerTitle(signals({ streak7DaysBadge: true })).key).toBe('seven_day_flame')
    expect(selectPlayerTitle(signals({ monarchVictories: 1 })).key).toBe('monarch_slayer')
  })

  test('major rare achievements outrank routine progression', () => {
    const title = selectPlayerTitle(signals({
      tierUnlockedMax: 'grandmaster', monarchVictories: 5,
      wins: [{ best_hand: { rank: 'ROYAL_FLUSH' }, is_triple_sweep: true }],
    }))
    expect(title.key).toBe('royal_ace')
  })

  test('win-rate title requires a meaningful sample size', () => {
    expect(selectPlayerTitle(signals({ gamesPlayed: 10, gamesWon: 10 })).key).toBe('golden_rookie')
    expect(selectPlayerTitle(signals({ gamesPlayed: 20, gamesWon: 14 })).key).toBe('precision_player')
  })
})
