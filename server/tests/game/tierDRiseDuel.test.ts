import { createTierDLevel, firstValidTierDArrangement, resetTierDForNextDuel, resolveTierDGame, submitTierDArrangement, tierDComboKinds } from '../../src/game/tierDSolo'
import { chooseTierDAiExchange, exchangeTierDDuelCard, hiddenTierDDuelView, orderTierDDuelOpponents, recordTierDDuelResult, settleTierDDuel, tierDMatchesPerLevel, tierDDuelActive, tierDDuelBuyIn, tierDDuelExchangeableOpponentPiles, tierDDuelExchangeFee, tierDDuelFinalProfit, tierDDuelRankingScore, tierDDuelRoster, tierDDuelStake, tierDDuelWon } from '../../src/game/tierDRiseDuel'

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

  test.each([1000,1099,1100,1500,1999,2000,9999])('uses one independent 1,000 Token Level buy-in at Lv.%i', level => {
    expect(tierDDuelBuyIn(level)).toBe(1000)
    expect(createTierDLevel(level, 'human', () => .2).duel?.totalPot).toBe(2000)
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

  test('defeated-AI exchange offers only the arranged G1 and G2 cards', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    const opponent = state.duel!.order[0].id
    const arrangement = state.arrangements[opponent]!
    const offered = tierDDuelExchangeableOpponentPiles(state, opponent)!
    const identity = (card: { rank: string; suit: string }) => `${card.rank}:${card.suit}`
    expect(offered.pile1).toEqual(arrangement.pile1)
    expect(offered.pile2).toEqual(arrangement.pile2)
    expect([...offered.pile1, ...offered.pile2]).toHaveLength(6)
    expect(new Set([...offered.pile1, ...offered.pile2].map(identity))).not.toContain(identity(arrangement.pile3[0]))
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

  test('Duel 2 G1 reveal evaluates only the player and current opponent', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    const eliminated = state.duel!.order[0].id
    submitTierDArrangement(state, 'human', firstValidTierDArrangement(state.dealtHands.human, state.communityPiles))
    exchangeTierDDuelCard(state, 'human', eliminated, 0, 0)
    resetTierDForNextDuel(state)
    const current = state.duel!.order[1].id

    expect(state.arrangements[eliminated]).toBeUndefined()
    expect(() => resolveTierDGame(state, 1)).not.toThrow()
    expect(Object.keys(state.gameResults[0].hands).sort()).toEqual(['human', current].sort())
    expect(state.gameResults[0].hands[eliminated]).toBeUndefined()
  })

  test('Skip preserves the exact committed arrangement and the original deal across Duels', () => {
    const state = createTierDLevel(1000, 'human', () => .2)
    submitTierDArrangement(state, 'human', firstValidTierDArrangement(state.dealtHands.human, state.communityPiles))
    state.scores.human=42
    for(const seat of state.seats.filter(seat=>seat.isBot))state.scores[seat.id]=17
    const arrangement = JSON.parse(JSON.stringify(state.arrangements.human))
    const hands = JSON.parse(JSON.stringify(state.dealtHands))
    const community = JSON.parse(JSON.stringify(state.communityPiles))
    resetTierDForNextDuel(state)
    expect(state.scores).toEqual(Object.fromEntries(state.seats.map(seat=>[seat.id,0])))
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

  test('a tied or higher score advances; Duel stakes remain fixed and independent', () => {
    expect(tierDDuelWon(11, 10)).toBe(true)
    expect(tierDDuelWon(10, 10)).toBe(true)
    expect(tierDDuelWon(9, 10)).toBe(false)
    expect([tierDDuelStake(0),tierDDuelStake(1),tierDDuelStake(2)]).toEqual([200,300,500])
    expect([tierDDuelExchangeFee(0),tierDDuelExchangeFee(1)]).toEqual([50,100])
  })

  test('settles each Duel independently by positive score share', () => {
    expect(settleTierDDuel(200,8,2)).toEqual({stake:200,playerStake:200,opponentStake:200,pot:400,playerScore:8,opponentScore:2,grossPayout:320,opponentGrossPayout:80,playerTokens:320,opponentTokens:80,playerNet:120})
    expect(settleTierDDuel(300,8,2)).toMatchObject({pot:600,grossPayout:480,opponentGrossPayout:120,playerNet:180})
    expect(settleTierDDuel(500,18,2)).toMatchObject({pot:1000,grossPayout:900,opponentGrossPayout:100,playerNet:400})
    expect(settleTierDDuel(200,2,8)).toMatchObject({pot:400,grossPayout:80,opponentGrossPayout:320,playerNet:-120})
    expect(settleTierDDuel(200,5,5)).toMatchObject({pot:400,grossPayout:200,opponentGrossPayout:200,playerNet:0})
    expect(settleTierDDuel(200,0,0)).toMatchObject({pot:400,grossPayout:200,opponentGrossPayout:200,playerNet:0})
    expect(settleTierDDuel(200,-4,2).playerNet).toBe(-200)
  })

  test('accumulates all three Duel scores once and survives Duel resets/restoration', () => {
    const level=createTierDLevel(1000,'human',()=>.2);const duel=level.duel!
    const add=(score:number,opponentScore:number)=>recordTierDDuelResult(duel,{opponentId:duel.order[duel.current].id,playerScore:score,opponentScore,won:score>opponentScore,settlement:settleTierDDuel(tierDDuelStake(duel.current),score,opponentScore)})
    expect(add(30,2)).toBe(true)
    expect(add(30,2)).toBe(false)
    expect(tierDDuelRankingScore(duel)).toBe(30)
    resetTierDForNextDuel(level);expect(level.scores.human).toBe(0);expect(tierDDuelRankingScore(duel)).toBe(30)
    expect(add(16,2)).toBe(true);resetTierDForNextDuel(level)
    expect(add(24,2)).toBe(true)
    expect(tierDDuelRankingScore(duel)).toBe(70)
    expect(duel.accumulatedDuels).toBe(3)
    const restored=JSON.parse(JSON.stringify(duel));delete restored.rankingScore
    expect(tierDDuelRankingScore(restored)).toBe(70)
  })

  test('Swap items replace player Token fees in final profit', () => {
    const state=createTierDLevel(1000,'human',()=>.2).duel!
    state.results=[
      {opponentId:'a',playerScore:8,opponentScore:2,won:true,settlement:settleTierDDuel(200,8,2)},
      {opponentId:'b',playerScore:8,opponentScore:2,won:true,settlement:settleTierDDuel(300,8,2)},
      {opponentId:'c',playerScore:18,opponentScore:2,won:true,settlement:settleTierDDuel(500,18,2)},
    ]
    state.exchangeFees.player=150
    expect(tierDDuelFinalProfit(state)).toBe(700)
  })

  test('hidden-information projection exposes only the viewer hand', () => {
    const state = createTierDLevel(1000, 'human', () => .4)
    const view = hiddenTierDDuelView(state, 'human')
    expect(view.human).toHaveLength(11)
    expect(Object.entries(view).filter(([id]) => id !== 'human').every(([,cards]) => cards.length === 0)).toBe(true)
  })

  test('AI exchange decision is isolated from the hidden player hand', () => {
    const first=createTierDLevel(1000,'human',()=>.4);const second=JSON.parse(JSON.stringify(first))
    const revealed=first.duel!.order[0].id;const next=first.duel!.order[1].id
    second.dealtHands.human.reverse()
    expect(chooseTierDAiExchange(first,next,revealed,50,300)).toEqual(chooseTierDAiExchange(second,next,revealed,50,300))
  })

  test('Skip and Buy/Swap both complete the AI exchange transition without breaking card state', () => {
    for(const playerSwaps of [false,true]){
      const state=createTierDLevel(1000,'human',()=>.4);const duel=state.duel!;const revealed=duel.order[0].id;const next=duel.order[1].id
      submitTierDArrangement(state,'human',firstValidTierDArrangement(state.dealtHands.human,state.communityPiles))
      if(playerSwaps)exchangeTierDDuelCard(state,'human',revealed,0,0)
      const choice=chooseTierDAiExchange(state,next,revealed,50,300)
      if(choice)exchangeTierDDuelCard(state,next,revealed,choice.aiCardIndex,choice.revealedCardIndex)
      expect(()=>resetTierDForNextDuel(state)).not.toThrow()
      expect(state.duel).toMatchObject({current:1,phase:'REARRANGE'})
      const ids=[...Object.values(state.dealtHands).flat(),...Object.values(state.communityPiles).flat(),...state.drawPile].map(card=>`${card.rank}:${card.suit}`)
      expect(new Set(ids).size).toBe(52)
    }
  })

  test('Lv.1010 Combo labels ignore eliminated opponents after the final Duel', () => {
    const state=createTierDLevel(1010,'human',()=>.4)
    submitTierDArrangement(state,'human',firstValidTierDArrangement(state.dealtHands.human,state.communityPiles))
    for(const game of [1,2,3] as const)resolveTierDGame(state,game)
    const current=state.duel!.order[state.duel!.current].id
    expect(()=>tierDComboKinds(state)).not.toThrow()
    expect(tierDComboKinds(state)).toHaveProperty('human')
    expect(tierDComboKinds(state)).toHaveProperty(current)
    for(const opponent of state.duel!.order.filter(entry=>entry.id!==current))expect(tierDComboKinds(state)[opponent.id]).toBeUndefined()
  })
})
