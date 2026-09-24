import { createTierDLevel, firstValidTierDArrangement, resetTierDForNextDuel, submitTierDArrangement } from '../../src/game/tierDSolo'
import { calculateTierDDuelPayout, exchangeTierDDuelCard, hiddenTierDDuelView, orderTierDDuelOpponents, tierDMatchesPerLevel, tierDNextDuelG1Stake, tierDDuelActive, tierDDuelBuyIn, tierDDuelRoster, tierDDuelWon } from '../../src/game/tierDRiseDuel'

describe('Tier D Rise three-stage Duel Challenge', () => {
  test('activates at Lv.1000, not Lv.999, without Open Challenge', () => {
    expect(tierDDuelActive(999)).toBe(false)
    expect(createTierDLevel(999, 'human', () => .1).duel).toBeUndefined()
    const rise = createTierDLevel(1000, 'human', () => .1)
    expect(rise.duel).toBeDefined()
    expect(rise.openChallenge).toBeUndefined()
    expect(rise.missions).toHaveLength(3)
    expect(rise.riseSuperCombo).toBeDefined()
    expect(tierDMatchesPerLevel(999)).toBe(3)
    expect(tierDMatchesPerLevel(1000)).toBe(1)
  })

  test('Lv.1000–1999 locks weakest to strongest initial-hand ordering', () => {
    const opponents = ['a', 'b', 'c'].map(id => ({ id, name: id, emoji: '', aiConfigId: id }))
    expect(orderTierDDuelOpponents(1999, opponents, { a: 30, b: 10, c: 20 }).map(x => x.id)).toEqual(['b', 'c', 'a'])
  })

  test('Lv.2000+ order is random and independent of hand strength', () => {
    const opponents = ['weak', 'middle', 'strong'].map(id => ({ id, name: id, emoji: '', aiConfigId: id }))
    expect(orderTierDDuelOpponents(2000, opponents, { weak: 1, middle: 2, strong: 3 }, () => 0).map(x => x.id)).toEqual(['middle', 'strong', 'weak'])
  })

  test('Lv.2000 roster is Monarch + Soren + one existing Four God and excludes CAELUM', () => {
    const roster = tierDDuelRoster(2000, () => .99)
    expect(roster.map(x => x.name)).toEqual(expect.arrayContaining(['Monarch', 'Soren Veyl']))
    expect(roster).toHaveLength(3)
    expect(roster.some(x => /caelum/i.test(x.name) || /CAELUM/.test(x.id))).toBe(false)
    expect(['AI_REAPER', 'AI_CRAG', 'AI_CORTEX', 'AI_CIPHER']).toContain(roster[2].id)
  })

  test.each([[1000,1000],[1099,1000],[1100,3500],[1200,6000],[1300,8000],[1400,10500],[1500,13000],[1600,15500],[1700,18000],[1800,20000],[1900,22500],[2000,25000],[9999,25000]])('buy-in progression at Lv.%i', (level, amount) => {
    expect(tierDDuelBuyIn(level)).toBe(amount)
    if (level >= 1000) expect(createTierDLevel(level, 'human', () => .2).duel?.totalPot).toBe(amount * 4)
  })

  test('swap is physical 1-for-1 ownership transfer with no duplicate cards', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    const opponent = state.duel!.order[0].id
    const beforePlayer = state.dealtHands.human[0]
    const beforeAi = state.dealtHands[opponent][0]
    exchangeTierDDuelCard(state, 'human', opponent, 0, 0)
    expect(state.dealtHands.human[0]).toEqual(beforeAi)
    expect(state.dealtHands[opponent][0]).toEqual(beforePlayer)
    const ids = [...Object.values(state.dealtHands).flat(), ...Object.values(state.communityPiles).flat(), ...state.drawPile].map(card => `${card.rank}:${card.suit}`)
    expect(new Set(ids).size).toBe(52)
  })

  test('Buy/Swap advances immediately without recomputing the eliminated opponent', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    const eliminated = state.duel!.order[0].id
    submitTierDArrangement(state, 'human', firstValidTierDArrangement(state.dealtHands.human, state.communityPiles))
    const previous = state.arrangements.human!
    const outgoing = previous.pile1[0]
    const incoming = state.dealtHands[eliminated][0]
    exchangeTierDDuelCard(state, 'human', eliminated, 0, 0)
    expect(state.arrangements[eliminated]).toBeUndefined()
    resetTierDForNextDuel(state, () => { throw new Error('eliminated AI must not consume RNG') })
    expect(state.duel).toMatchObject({ current: 1, phase: 'REARRANGE' })
    expect(state.arrangements[eliminated]).toBeUndefined()
    expect(state.arrangements.human!.pile1[0]).toEqual(incoming)
    expect(Object.values(state.arrangements.human!).flat().filter(card => card.rank === outgoing.rank && card.suit === outgoing.suit)).toHaveLength(0)
    expect(state.gameResults).toEqual([])
  })

  test('Skip preserves the exact committed arrangement and the original deal across Duels', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    submitTierDArrangement(state, 'human', firstValidTierDArrangement(state.dealtHands.human, state.communityPiles))
    const arrangement = JSON.parse(JSON.stringify(state.arrangements.human))
    const hands = JSON.parse(JSON.stringify(state.dealtHands))
    const community = JSON.parse(JSON.stringify(state.communityPiles))
    resetTierDForNextDuel(state)
    expect(state.arrangements.human).toEqual(arrangement)
    expect(state.dealtHands).toEqual(hands)
    expect(state.communityPiles).toEqual(community)
  })

  test('Swap replaces only the selected arranged card and keeps every other position', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    const opponent = state.duel!.order[0].id
    submitTierDArrangement(state, 'human', firstValidTierDArrangement(state.dealtHands.human, state.communityPiles))
    const before = JSON.parse(JSON.stringify(state.arrangements.human))
    const outgoing = state.dealtHands.human[4]
    const incoming = state.dealtHands[opponent][2]
    exchangeTierDDuelCard(state, 'human', opponent, 4, 2)
    const after = state.arrangements.human!
    const beforeFlat = Object.values(before).flat()
    const afterFlat = Object.values(after).flat()
    const replacedAt = beforeFlat.findIndex((card: any) => card.rank === outgoing.rank && card.suit === outgoing.suit)
    expect(afterFlat[replacedAt]).toEqual(incoming)
    expect(afterFlat.filter((_: unknown, index: number) => index !== replacedAt)).toEqual(beforeFlat.filter((_: unknown, index: number) => index !== replacedAt))
    const ids = [...Object.values(state.dealtHands).flat(), ...Object.values(state.communityPiles).flat(), ...state.drawPile].map(card => `${card.rank}:${card.suit}`)
    expect(new Set(ids).size).toBe(52)
  })

  test('Retry creates a fresh attempt deal while an intra-attempt transition does not', () => {
    const attempt = createTierDLevel(1000, 'human', () => .1)
    const originalCards = JSON.stringify({ hands: attempt.dealtHands, community: attempt.communityPiles })
    resetTierDForNextDuel(attempt)
    expect(JSON.stringify({ hands: attempt.dealtHands, community: attempt.communityPiles })).toBe(originalCards)
    const retry = createTierDLevel(1000, 'human', () => .9)
    expect(JSON.stringify({ hands: retry.dealtHands, community: retry.communityPiles })).not.toBe(originalCards)
  })

  test('only a strict win advances; tie and loss terminate, and swap costs next Duel G1 stake', () => {
    expect(tierDDuelWon(11, 10)).toBe(true)
    expect(tierDDuelWon(10, 10)).toBe(false)
    expect(tierDDuelWon(9, 10)).toBe(false)
    expect(tierDNextDuelG1Stake(1000)).toBe(4)
  })

  test('payout clamps negative scores, normalizes positive scores, floors, and burns remainder', () => {
    const result = calculateTierDDuelPayout({ human: 7, a: 2, b: 1, c: -40 }, 100_000)
    expect(result.payouts).toEqual({ human: 70_000, a: 20_000, b: 10_000, c: 0 })
    const rounded = calculateTierDDuelPayout({ human: 1, a: 1, b: 1, c: 0 }, 100_000)
    expect(rounded.payouts).toEqual({ human: 33_333, a: 33_333, b: 33_333, c: 0 })
    expect(rounded.burned).toBe(1)
    expect(Object.values(rounded.payouts).reduce((a,b)=>a+b,0)+rounded.burned).toBe(rounded.pot)
  })

  test('hidden-information projection exposes only the viewer hand', () => {
    const state = createTierDLevel(1000, 'human', () => .4)
    const view = hiddenTierDDuelView(state, 'human')
    expect(view.human).toHaveLength(11)
    expect(Object.entries(view).filter(([id]) => id !== 'human').every(([,cards]) => cards.length === 0)).toBe(true)
  })
})
