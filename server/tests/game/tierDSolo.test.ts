import { applyTierDLevelOutcome, arrangeTierDBot, assignTierDAuctionCard, createTierDLevel, resolveTierDGame, resolveTierDLevel, submitTierDArrangement, swapTierDHandCard, TIER_D_TRIPLE_SWEEP_BONUS, tierDBotCount, tierDDifficulty } from '../../src/game/tierDSolo'
import { compareHands, evaluateBestFive } from '../../src/game/handEvaluator'
import type { Card } from '../../src/game/deck'

const c = (value: number, suit: string): Card => ({ value, suit } as Card)
const random = () => 0.5

describe('Tier D Solo loop', () => {
  test.each([[1, 1], [100, 1], [101, 2], [400, 2], [401, 3], [500, 3], [501, 3]])('level %i has the configured Solo bot count', (level, bots) => {
    expect(tierDBotCount(level)).toBe(bots)
    expect(createTierDLevel(level, 'human', random).seats).toHaveLength(bots + 1)
  })

  test('deals all 11 player cards and all three community piles before arrangement', () => {
    const state = createTierDLevel(1, 'human', random)
    expect(state.dealtHands.human).toHaveLength(11)
    expect(state.communityPiles).toMatchObject({ pile1: expect.any(Array), pile2: expect.any(Array), pile3: expect.any(Array) })
    expect(state.communityPiles.pile1).toHaveLength(2)
    expect(state.communityPiles.pile2).toHaveLength(2)
    expect(state.communityPiles.pile3).toHaveLength(2)
    expect(state.arrangements.human).toBeUndefined()
    expect(state.drawPile).toHaveLength(24)
  })

  test('Swap replaces the selected player card with a real undealt card before READY', () => {
    const state = createTierDLevel(1, 'human', random)
    const selectedIndex = 4
    const selected = state.dealtHands.human[selectedIndex]
    const drawn = state.drawPile[0]
    swapTierDHandCard(state, 'human', selectedIndex)
    expect(state.dealtHands.human[selectedIndex]).toEqual(drawn)
    expect(state.drawPile[state.drawPile.length - 1]).toEqual(selected)
    expect(state.dealtHands.human).toHaveLength(11)
    expect(state.drawPile).toHaveLength(24)
  })

  test('accepts an out-of-order player arrangement on READY while preserving exact-card validation', () => {
    const state = createTierDLevel(1, 'human', random)
    const pile1 = [c(2, 'spades'), c(3, 'hearts'), c(4, 'diamonds')]
    const pile2 = [c(9, 'spades'), c(9, 'hearts'), c(3, 'diamonds')]
    const pile3 = [c(14, 'spades'), c(14, 'hearts'), c(14, 'diamonds'), c(13, 'spades'), c(12, 'spades')]
    state.dealtHands.human = [...pile1, ...pile2, ...pile3]
    state.communityPiles = { pile1: [c(5, 'clubs'), c(7, 'diamonds')], pile2: [c(2, 'clubs'), c(4, 'diamonds')], pile3: [c(2, 'clubs'), c(3, 'clubs')] }
    expect(() => submitTierDArrangement(state, 'human', { pile1, pile2, pile3 })).not.toThrow()
    const invalid = createTierDLevel(1, 'human', random)
    invalid.dealtHands.human = [...pile1, ...pile2, ...pile3]
    invalid.communityPiles = state.communityPiles
    expect(() => submitTierDArrangement(invalid, 'human', { pile1: pile3.slice(0, 3), pile2, pile3: [...pile1, ...pile3.slice(3)] })).not.toThrow()
  })

  test('difficulty advances one skill per 50-level League and remains endless beyond 500', () => {
    expect(tierDDifficulty(1)).toEqual({ band: 'rookie', skill: 1 })
    expect(tierDDifficulty(51)).toEqual({ band: 'steady', skill: 2 })
    expect(tierDDifficulty(151)).toEqual({ band: 'elite', skill: 4 })
    expect(tierDDifficulty(201)).toEqual({ band: 'master', skill: 5 })
    expect(tierDDifficulty(451)).toEqual({ band: 'endless', skill: 10 })
    expect(tierDDifficulty(601).skill).toBeGreaterThan(tierDDifficulty(501).skill)
  })

  test('bot arrangement is legal against only its public community cards at every skill', () => {
    const state = createTierDLevel(1, 'human', random)
    const botCards = state.dealtHands['tier-d-bot-1']
    for (const skill of [1, 3, 5, 10]) {
      const arrangement = arrangeTierDBot(botCards, state.communityPiles, skill, random)
      const h1 = evaluateBestFive([...arrangement.pile1, ...state.communityPiles.pile1])
      const h2 = evaluateBestFive([...arrangement.pile2, ...state.communityPiles.pile2])
      const h3 = evaluateBestFive([...arrangement.pile3, ...state.communityPiles.pile3])
      expect(compareHands(h1, h2)).toBeLessThanOrEqual(0)
      expect(compareHands(h2, h3)).toBeLessThanOrEqual(0)
    }
  })

  test('G1/G2/G3 score 2/3/4 and a strict highest total wins the level', () => {
    const state = createTierDLevel(1, 'human', random)
    state.games[0].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades')]
    state.games[1].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades')]
    state.games[2].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades'), c(11, 'spades'), c(10, 'spades')]
    state.games[0].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds')]
    state.games[1].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds')]
    state.games[2].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds'), c(5, 'clubs'), c(7, 'spades')]
    expect(resolveTierDGame(state, 1).points).toBe(2)
    expect(resolveTierDGame(state, 2).points).toBe(3)
    expect(resolveTierDGame(state, 3)).toMatchObject({ points: 4, bonusPoints: TIER_D_TRIPLE_SWEEP_BONUS })
    expect(resolveTierDLevel(state, 'human')).toMatchObject({ winnerId: 'human', playerWon: true, scores: { human: 14 } })
  })

  test('exact poker ties award no points and therefore do not create an arbitrary winner', () => {
    const state = createTierDLevel(1, 'human', random)
    const game = state.games[0]
    game.hands.human = [c(14, 'spades'), c(14, 'hearts'), c(13, 'diamonds'), c(12, 'clubs'), c(2, 'spades')]
    game.hands['tier-d-bot-1'] = [c(14, 'diamonds'), c(14, 'clubs'), c(13, 'spades'), c(12, 'hearts'), c(2, 'diamonds')]
    expect(resolveTierDGame(state, 1)).toMatchObject({ winnerId: null, tiedSeatIds: ['human', 'tier-d-bot-1'], points: 0 })
  })

  test('Auction is G2-only, capped at one card, and G3 stays separate from it', () => {
    const state = createTierDLevel(1, 'human', random); const game = state.games[1]
    assignTierDAuctionCard(game, 'human', c(14, 'clubs'))
    expect(() => assignTierDAuctionCard(game, 'human', c(13, 'clubs'))).toThrow('only one')
    expect(() => assignTierDAuctionCard(state.games[2], 'human', c(13, 'clubs'))).toThrow('G2 only')
    const resolution = resolveTierDGame(state, 3)
    expect(resolution.hands['tier-d-bot-1']).toBeDefined()
  })

  test('win advances exactly one level and streak; loss resets only current streak', () => {
    expect(applyTierDLevelOutcome({ level: 500, currentWinStreak: 3, bestWinStreak: 4 }, true)).toEqual({ level: 501, currentWinStreak: 4, bestWinStreak: 4 })
    expect(applyTierDLevelOutcome({ level: 501, currentWinStreak: 4, bestWinStreak: 4 }, false)).toEqual({ level: 501, currentWinStreak: 0, bestWinStreak: 4 })
  })
})
