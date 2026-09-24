import { applyTierDLevelOutcome, arrangeTierDBot, assertTierDCardConservation, assignTierDAuctionCard, commitTierDCombo, createTierDLevel, firstValidTierDArrangement, openChallengeMatchPassed, resolveTierDGame, resolveTierDLevel, rollbackTierDGame, submitTierDArrangement, submitTierDUndoArrangement, swapTierDHandCard, tierDAiCandidateFraction, tierDAiMissionsEnabled, tierDBotArrangementUtility, TIER_D_TRIPLE_SWEEP_BONUS, tierDBotCount, tierDDifficulty } from '../../src/game/tierDSolo'
import { compareHands, evaluateBestFive } from '../../src/game/handEvaluator'
import { createDeck, type Card } from '../../src/game/deck'

const c = (value: number, suit: string): Card => ({
  value,
  rank: (value === 14 ? 'A' : value === 13 ? 'K' : value === 12 ? 'Q' : value === 11 ? 'J' : String(value)) as Card['rank'],
  suit: suit as Card['suit'],
})
const random = () => 0.5

describe('Tier D Solo loop', () => {
  test('multi-AI combo specialist is sampled at Level start and preserved when redealing', () => {
    const rules = { missions: [{ pile: 1 as const, rank: 'high_card' as const }, { pile: 2 as const, rank: 'high_card' as const }] }
    const first = createTierDLevel(201, 'human', () => 0, rules)
    const second = createTierDLevel(201, 'human', () => .99, rules)
    expect(first.comboBotId).toBe('tier-d-bot-1')
    expect(second.comboBotId).toBe('tier-d-bot-2')
    const redeal = createTierDLevel(201, 'human', () => .99, { ...rules, comboBotId: first.comboBotId })
    expect(redeal.comboBotId).toBe(first.comboBotId)
    for (const seat of first.seats.filter(seat => seat.isBot)) {
      const focus = seat.id === first.comboBotId
      expect(first.arrangements[seat.id]).toEqual(arrangeTierDBot(first.dealtHands[seat.id], first.communityPiles, seat.difficulty.skill, () => 0, focus ? first.missions : [], focus, tierDAiCandidateFraction(201)))
    }
    // การรักษาบทบาทไม่ได้รับประกันว่าไพ่ที่สุ่มได้จะทำ Mission สำเร็จ
  })
  test.each([161, 201, 1000, 1001])('Mission and Combo eligibility at level %i applies independently to every AI', level => {
    const state = createTierDLevel(level, 'human', random)
    state.missions = [{ pile: 1, rank: 'high_card' }, { pile: 2, rank: 'high_card' }]
    for (const pile of [1, 2, 3] as const) {
      const result = resolveTierDGame(state, pile)
      if (pile === 3) continue
      expect(result.missionScores.human).toBe(result.hands.human.rank === 'high_card' ? 1 : 0)
      for (const seat of state.seats.filter(seat => seat.isBot)) {
        expect(result.missionScores[seat.id]).toBe(result.hands[seat.id].rank === 'high_card' ? 1 : 0)
      }
    }
    const before = { ...state.scores }
    const bonuses = commitTierDCombo(state, () => 0)
    const completes = (id: string, count: number) => state.gameResults.slice(0, count).every(result => result.hands[id].rank === 'high_card')
    expect(bonuses.human).toBe(completes('human', 2) ? 5 : 0)
    for (const seat of state.seats.filter(seat => seat.isBot)) {
      expect(bonuses[seat.id]).toBe(completes(seat.id, 2) ? 5 : 0)
      expect(state.scores[seat.id]).toBe(before[seat.id] + bonuses[seat.id])
    }
    state.scores = { ...before }
    state.missions.push({ pile: 3, rank: 'high_card' })
    state.comboBonuses = undefined
    const superBonuses = commitTierDCombo(state, () => 0)
    expect(superBonuses.human).toBe(completes('human', 3) ? 10 : 0)
    for (const seat of state.seats.filter(seat => seat.isBot)) {
      expect(superBonuses[seat.id]).toBe(completes(seat.id, 3) ? 10 : 0)
    }

    state.scores = { ...before }
    state.gameResults = []
    state.games[0].resolved = false
    state.missions = [{ pile: 1, rank: 'flush', negative: true, penalty: -7 }]
    const negative = resolveTierDGame(state, 1)
    for (const seat of state.seats.filter(seat => seat.isBot)) {
      const hasFlushOrBetter = ['flush', 'full_house', 'four_of_a_kind', 'straight_flush', 'royal_flush'].includes(negative.hands[seat.id].rank)
      expect(negative.missionPenalties[seat.id]).toBe(!hasFlushOrBetter ? -7 : 0)
    }
  })

  test('Lv. 151-160 reserves Mission and Combo scoring for the Player', () => {
    for (const level of [151, 160]) {
      const state = createTierDLevel(level, 'human', random, { missions: [{ pile: 1, rank: 'high_card' }, { pile: 2, rank: 'one_pair' }] })
      expect(tierDAiMissionsEnabled(level)).toBe(false)
      expect(state.comboBotId).toBeUndefined()
      for (const pile of [1, 2, 3] as const) resolveTierDGame(state, pile)
      const bonuses = commitTierDCombo(state, () => 0)
      for (const bot of state.seats.filter(seat => seat.isBot)) {
        expect(state.gameResults.every(result => (result.missionScores[bot.id] ?? 0) === 0)).toBe(true)
        expect(bonuses[bot.id]).toBe(0)
      }
    }
  })

  test('Platinum restores AI Missions at 161 and delays the specialist until Diamond', () => {
    expect(tierDAiMissionsEnabled(161)).toBe(true)
    expect(createTierDLevel(161, 'human', random).comboBotId).toBeUndefined()
    expect(createTierDLevel(200, 'human', random).comboBotId).toBeUndefined()
    expect(createTierDLevel(201, 'human', random).comboBotId).toBeDefined()
  })

  test.each([[1, 1], [150, 1], [151, 2], [350, 2], [351, 3], [1000, 3], [1501, 3]])('level %i has the configured Solo bot count', (level, bots) => {
    expect(tierDBotCount(level)).toBe(bots)
    const state = createTierDLevel(level, 'human', random)
    expect(state.seats).toHaveLength(bots + 1)
    expect(state.seats.filter(seat => seat.id === state.comboBotId)).toHaveLength(bots >= 2 && level >= 201 ? 1 : 0)
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

  test.each([1,151,351])('conserves exactly 52 unique physical cards with every seat count at level %i',level=>{
    const state=createTierDLevel(level,'human',random)
    expect(assertTierDCardConservation(state)).toBe(true)
    const physical=[...Object.values(state.dealtHands).flat(),...state.communityPiles.pile1,...state.communityPiles.pile2,...state.communityPiles.pile3,...state.drawPile]
    expect(physical).toHaveLength(52)
    expect(new Set(physical.map(card=>`${card.value}:${card.suit}`)).size).toBe(52)
  })

  test('conserves the deck through Swap, Arrange, Reveal and Undo',()=>{
    const state=createTierDLevel(1,'human',random)
    swapTierDHandCard(state,'human',0)
    const arrangement=firstValidTierDArrangement(state.dealtHands.human,state.communityPiles)
    submitTierDArrangement(state,'human',arrangement)
    const scoreSnapshot={...state.scores}
    resolveTierDGame(state,1)
    expect(assertTierDCardConservation(state)).toBe(true)
    rollbackTierDGame(state,1,scoreSnapshot)
    expect(assertTierDCardConservation(state)).toBe(true)
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

  test('locks an out-of-order physical layout as a foul while preserving exact-card validation', () => {
    const state = createTierDLevel(1, 'human', random)
    const pile1 = [c(2, 'spades'), c(3, 'hearts'), c(4, 'diamonds')]
    const pile2 = [c(9, 'spades'), c(9, 'hearts'), c(3, 'diamonds')]
    const pile3 = [c(14, 'spades'), c(14, 'hearts'), c(14, 'diamonds'), c(13, 'spades'), c(12, 'spades')]
    const community = { pile1: [c(5, 'clubs'), c(7, 'diamonds')], pile2: [c(6, 'clubs'), c(8, 'diamonds')], pile3: [c(10, 'clubs'), c(11, 'clubs')] }
    const installFixtureInOneDeck = (target: typeof state) => {
      const fixed = [...pile1, ...pile2, ...pile3, ...community.pile1, ...community.pile2, ...community.pile3]
      const fixedIds = new Set(fixed.map(card => `${card.value}:${card.suit}`))
      const remaining = createDeck().filter(card => !fixedIds.has(`${card.value}:${card.suit}`))
      target.dealtHands.human = [...pile1, ...pile2, ...pile3]
      target.dealtHands['tier-d-bot-1'] = remaining.slice(0, 11)
      target.arrangements['tier-d-bot-1'] = undefined
      target.communityPiles = community
      target.drawPile = remaining.slice(11)
    }
    installFixtureInOneDeck(state)
    expect(() => submitTierDArrangement(state, 'human', { pile1, pile2, pile3 })).not.toThrow()
    const invalid = createTierDLevel(1, 'human', random)
    installFixtureInOneDeck(invalid)
    const fouledArrangement={ pile1: pile3.slice(0, 3), pile2, pile3: [...pile1, ...pile3.slice(3)] }
    expect(() => submitTierDArrangement(invalid, 'human', fouledArrangement)).not.toThrow()
    expect(invalid.arrangements.human).toEqual(fouledArrangement)
    expect(invalid.fouled.human).toBe(true)
    expect(resolveTierDGame(invalid,1)).toMatchObject({ winnerId:'tier-d-bot-1', fouled:{human:true} })
    expect(invalid.scores.human).toBe(0)
  })

  test('difficulty uses a forgiving League curve with Mythic as a hard ceiling', () => {
    expect(tierDDifficulty(1)).toEqual({ band: 'rookie', skill: 1 })
    expect(tierDDifficulty(51)).toEqual({ band: 'rookie', skill: 1 })
    expect(tierDDifficulty(101)).toEqual({ band: 'rookie', skill: 1 })
    expect(tierDDifficulty(151)).toEqual({ band: 'steady', skill: 2 })
    expect(tierDDifficulty(201)).toEqual({ band: 'steady', skill: 2 })
    expect(tierDDifficulty(251)).toEqual({ band: 'skilled', skill: 3 })
    expect(tierDDifficulty(351)).toEqual({ band: 'skilled', skill: 3 })
    expect(tierDDifficulty(501)).toEqual({ band: 'elite', skill: 4 })
    expect(tierDDifficulty(701)).toEqual({ band: 'elite', skill: 4 })
    expect(tierDDifficulty(1001)).toEqual({ band: 'master', skill: 5 })
    expect(tierDDifficulty(100000)).toEqual({ band: 'master', skill: 5 })
    expect([1, 51, 101, 151, 201, 251, 351, 501, 701, 1001].map(tierDAiCandidateFraction)).toEqual([.90, .85, .80, .75, .70, .65, .50, .40, .30, .20])
    expect(tierDAiCandidateFraction(100000)).toBe(.20)
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

  test('lower AI ignores Missions while the Mythic ceiling values Mission and Combo EV', () => {
    const state = createTierDLevel(351, 'human', random)
    const arrangement = firstValidTierDArrangement(state.dealtHands['tier-d-bot-1'], state.communityPiles)
    const missions = [{ pile: 1 as const, rank: 'high_card' as const }, { pile: 2 as const, rank: 'one_pair' as const }]
    expect(tierDBotArrangementUtility(arrangement, state.communityPiles, 3, missions)).toBe(tierDBotArrangementUtility(arrangement, state.communityPiles, 3, []))
    expect(tierDBotArrangementUtility(arrangement, state.communityPiles, 5, missions)).toBeGreaterThan(tierDBotArrangementUtility(arrangement, state.communityPiles, 5, []))
  })

  test('Shuffle-style creation preserves an explicitly absent Open Challenge', () => {
    const state = createTierDLevel(51, 'human', () => 0, { missions: [], openChallenge: undefined, guidedRevealPiles: [] })
    expect(state.openChallenge).toBeUndefined()
    expect(state.missions).toEqual([])
  })

  test('G1/G2/G3 score 4/6/8 and a strict highest total wins the level', () => {
    const state = createTierDLevel(1, 'human', random)
    state.games[0].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades')]
    state.games[1].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades')]
    state.games[2].hands.human = [c(14, 'spades'), c(13, 'spades'), c(12, 'spades'), c(11, 'spades'), c(10, 'spades')]
    state.games[0].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds')]
    state.games[1].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds')]
    state.games[2].hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds'), c(5, 'clubs'), c(7, 'spades')]
    expect(resolveTierDGame(state, 1).points).toBe(4)
    expect(resolveTierDGame(state, 2).points).toBe(6)
    expect(resolveTierDGame(state, 3)).toMatchObject({ points: 8, bonusPoints: TIER_D_TRIPLE_SWEEP_BONUS })
    expect(resolveTierDLevel(state, 'human')).toMatchObject({ winnerId: 'human', playerWon: true, scores: { human: 23 } })
  })

  test('exact poker ties award the pile to the Player', () => {
    const state = createTierDLevel(1, 'human', random)
    const game = state.games[0]
    game.communityCards = [c(7, 'clubs'), c(9, 'diamonds')]
    game.hands.human = [c(14, 'spades'), c(14, 'hearts'), c(13, 'diamonds'), c(12, 'clubs'), c(2, 'spades')]
    game.hands['tier-d-bot-1'] = [c(14, 'diamonds'), c(14, 'clubs'), c(13, 'spades'), c(12, 'hearts'), c(2, 'diamonds')]
    expect(resolveTierDGame(state, 1)).toMatchObject({ winnerId: 'human', tiedSeatIds: ['human', 'tier-d-bot-1'], points: 4 })
  })

  test('×2 binds to one pile and Undo restores the provisional score snapshot', () => {
    const state = createTierDLevel(51, 'human', random)
    state.missions = []
    const game = state.games[0]
    game.hands.human = [c(14, 'spades'), c(14, 'hearts'), c(13, 'diamonds')]
    game.hands['tier-d-bot-1'] = [c(2, 'hearts'), c(3, 'hearts'), c(4, 'diamonds')]
    const snapshot = { ...state.scores }
    expect(resolveTierDGame(state, 1, { doubledSeatId: 'human', doubledPile: 1 }).points).toBe(8)
    expect(state.scores.human).toBe(8)
    rollbackTierDGame(state, 1, snapshot)
    expect(state.scores).toEqual(snapshot)
    expect(state.games[0].resolved).toBe(false)
    expect(state.gameResults).toHaveLength(0)
  })

  test('Undo can rearrange the current and future piles but cannot alter a committed earlier pile', () => {
    const state = createTierDLevel(51, 'human', random)
    const arrangement = firstValidTierDArrangement(state.dealtHands.human, state.communityPiles)
    submitTierDArrangement(state, 'human', arrangement)
    resolveTierDGame(state, 1)
    const scoreSnapshot = { ...state.scores }
    resolveTierDGame(state, 2)
    rollbackTierDGame(state, 2, scoreSnapshot)

    const changedEarlierPile = {
      pile1: [arrangement.pile2[0], arrangement.pile1[1], arrangement.pile1[2]],
      pile2: [arrangement.pile1[0], arrangement.pile2[1], arrangement.pile2[2]],
      pile3: arrangement.pile3,
    }
    expect(() => submitTierDUndoArrangement(state, 'human', changedEarlierPile, 2)).toThrow('G1 is already committed')
    expect(() => submitTierDUndoArrangement(state, 'human', arrangement, 2)).not.toThrow()
  })

  test('Combo is unavailable before G3 Commit and is applied exactly when committed', () => {
    const state = createTierDLevel(161, 'human', random)
    state.missions = [{ pile: 1, rank: 'high_card' }, { pile: 2, rank: 'high_card' }]
    resolveTierDGame(state, 1)
    resolveTierDGame(state, 2)
    expect(() => commitTierDCombo(state, () => 0)).toThrow('Commit all three piles')
    const beforeG3 = { ...state.scores }
    resolveTierDGame(state, 3)
    const beforeCommit = { ...state.scores }
    expect(beforeCommit).not.toEqual(beforeG3)
    expect(commitTierDCombo(state, () => 0)).toEqual({ human: 0, 'tier-d-bot-1': 0, 'tier-d-bot-2': 5 })
    expect(state.scores.human).toBe(beforeCommit.human)
    expect(state.scores['tier-d-bot-1']).toBe(beforeCommit['tier-d-bot-1'])
    expect(state.scores['tier-d-bot-2']).toBe(beforeCommit['tier-d-bot-2'] + 5)
  })

  test('timeout fallback returns the first strict G1 < G2 < G3 arrangement', () => {
    const state = createTierDLevel(51, 'human', random)
    const arrangement = firstValidTierDArrangement(state.dealtHands.human, state.communityPiles)
    expect(() => submitTierDArrangement(state, 'human', arrangement)).not.toThrow()
    expect([...arrangement.pile1, ...arrangement.pile2, ...arrangement.pile3]).toHaveLength(11)
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

  test('Bronze clears never earn streak credit; Silver starts at the first Silver clear', () => {
    expect(applyTierDLevelOutcome({ level: 1, currentWinStreak: 9, bestWinStreak: 9 }, true)).toEqual({ level: 2, currentWinStreak: 0, bestWinStreak: 9 })
    expect(applyTierDLevelOutcome({ level: 50, currentWinStreak: 0, bestWinStreak: 0 }, true)).toEqual({ level: 51, currentWinStreak: 0, bestWinStreak: 0 })
    expect(applyTierDLevelOutcome({ level: 51, currentWinStreak: 0, bestWinStreak: 0 }, true)).toEqual({ level: 52, currentWinStreak: 1, bestWinStreak: 1 })
  })

  test('a tied final score favors the Player', () => {
    const state = createTierDLevel(1, 'human', random)
    for (const game of state.games) game.resolved = true
    state.scores.human = 11; state.scores['tier-d-bot-1'] = 11
    expect(resolveTierDLevel(state, 'human')).toMatchObject({ winnerId: 'human', playerWon: true })
  })

  test('legacy Open Challenge helper remains compatible but Rise no longer generates it', () => {
    expect(createTierDLevel(1000, 'human', () => 0).openChallenge).toBeUndefined()
    expect(createTierDLevel(1001, 'human', () => 0).openChallenge).toBeUndefined()
    const state = createTierDLevel(1001, 'human', random)
    state.openChallenge = { revealedPiles: [1, 2] }
    state.gameResults = [{ game: 1, winnerId: 'human' }, { game: 2, winnerId: 'tier-d-bot-1' }, { game: 3, winnerId: 'human' }] as any
    expect(openChallengeMatchPassed(state, 'human')).toBe(false)
    state.gameResults = [{ game: 1, winnerId: 'human' }, { game: 2, winnerId: 'human' }, { game: 3, winnerId: 'human' }] as any
    expect(openChallengeMatchPassed(state, 'human')).toBe(true)
  })
})
