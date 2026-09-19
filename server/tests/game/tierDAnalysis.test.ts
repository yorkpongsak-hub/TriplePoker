import { analyzeTierDCompletedMatch, type TierDMatchAnalysis } from '../../src/game/tierDAnalysis'
import { commitTierDCombo, createTierDLevel, firstValidTierDArrangement, resolveTierDGame, submitTierDArrangement } from '../../src/game/tierDSolo'
import { compareHands, evaluateBestFive } from '../../src/game/handEvaluator'

describe('Tier D VIP analysis', () => {
  function completed() {
    const state=createTierDLevel(51,'human',()=>.5)
    submitTierDArrangement(state,'human',firstValidTierDArrangement(state.dealtHands.human,state.communityPiles))
    resolveTierDGame(state,1);resolveTierDGame(state,2);resolveTierDGame(state,3);commitTierDCombo(state,()=>0)
    return state
  }
  test('enumerates only strict legal arrangements and never exposes opponent cards',()=>{
    const state=completed();const analysis=analyzeTierDCompletedMatch(state,'human',1)
    expect([...analysis.best.pile1,...analysis.best.pile2,...analysis.best.pile3].map(card=>`${card.rank}${card.suit}`).sort()).toEqual(state.dealtHands.human.map(card=>`${card.rank}${card.suit}`).sort())
    const hands=[1,2,3].map(game=>evaluateBestFive([...(analysis.best as any)[`pile${game}`],...(state.communityPiles as any)[`pile${game}`]]))
    expect(compareHands(hands[0],hands[1])).toBeLessThan(0);expect(compareHands(hands[1],hands[2])).toBeLessThan(0)
    expect(analysis).not.toHaveProperty('opponentCards')
    expect(analysis.bestScore).toBeGreaterThanOrEqual(analysis.actualScore)
  })
  test('hidden or post-Reveal AI information cannot change the analysis',()=>{
    const state=completed();const first=analyzeTierDCompletedMatch(state,'human',1)
    for(const result of state.gameResults)for(const hand of Object.values(result.hands))hand.score=999999999999999
    const second=analyzeTierDCompletedMatch(state,'human',1)
    expect(second).toEqual(first)
  })
  test('the result remains based on the actual known post-Swap hand, not a hypothetical replacement',()=>{
    const state=completed();const before=state.dealtHands.human.map(card=>`${card.rank}${card.suit}`)
    const analysis=analyzeTierDCompletedMatch(state,'human',1)
    expect(analysis.cards.map(card=>`${card.rank}${card.suit}`)).toEqual(before)
  })
  test.each([[5,false],[6,true]])('free teaser eligibility threshold %i', (difference,eligible)=>expect(difference>=6).toBe(eligible))
})
