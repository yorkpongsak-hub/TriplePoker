import { itemPolicyError, newMatchItemState, resolveGameRules } from '../../src/game/unifiedTierRules'
import { assertCardZones, evaluateSharedPile, isSharedArrangementFoul } from '../../src/game/sharedCardRules'
import { createDeck } from '../../src/game/deck'
import { automaticTierDArrangement, createTierDLevel, strongestTierDArrangement } from '../../src/game/tierDSolo'
import { compareHands } from '../../src/game/handEvaluator'

test.each(['D','C','A'])('%s mode capabilities are separate from Tier and Match count',tier=>{
  const configuration={matchesPerGame:5,auctionRules:{enabled:false,pile2Bonus:false},callFoldRules:{enabled:false},tokenSettlementRules:{enabled:true,xXEffect:'PILE_SIDE_BET' as const},bossModifiers:[]}
  const solo=resolveGameRules({tier,gameMode:'SOLO',playerCount:4,configuration})
  const multi=resolveGameRules({tier,gameMode:'MULTIPLAYER',playerCount:4,configuration})
  expect(solo.itemCapabilities).toHaveLength(6)
  expect(multi.matchesPerGame).toBe(5)
  for(const item of ['freeze','shuffle','undo'] as const)expect(itemPolicyError(multi,newMatchItemState(),item)).toMatch(/forbidden/)
  expect(()=>resolveGameRules({tier:'A',gameMode:'SOLO',playerCount:4})).toThrow(/configuration/)
})

test('physical zones reject invalid identity/value, duplicates and missing cards',()=>{
  const deck=createDeck()
  expect(assertCardZones({hands:deck.slice(0,44),community:deck.slice(44,50),remaining:deck.slice(50)})).toBe(true)
  expect(()=>assertCardZones({deck:deck.slice(1)})).toThrow()
  expect(()=>assertCardZones({deck:[deck[1],...deck.slice(1)]})).toThrow()
  expect(()=>assertCardZones({deck:[{...deck[0],value:999},...deck.slice(1)]})).toThrow()
})

test('automatic arrangement may repeat or be weaker; canonical exact-five and best-seven remain',()=>{
  const s=createTierDLevel(51,'p',()=>.1)
  const first=automaticTierDArrangement(s.dealtHands.p,s.communityPiles,()=>.2)
  expect(automaticTierDArrangement(s.dealtHands.p,s.communityPiles,()=>.2)).toEqual(first)
  expect(isSharedArrangementFoul(first,s.communityPiles)).toBe(false)
  expect(first.pile1).toHaveLength(3);expect(first.pile2).toHaveLength(3);expect(first.pile3).toHaveLength(5)
  const score=(a:typeof first)=>([1,2,3] as const).reduce((n,p)=>{const h=evaluateSharedPile(a,s.communityPiles,p);return n+[0,4,6,8][p]*(h.rankIndex*1e12+h.score)},0)
  const best=strongestTierDArrangement(s.dealtHands.p,s.communityPiles)!
  expect(score(first)).toBeLessThan(score(best))
  const candidates=[.05,.2,.4,.6,.8].map(random=>automaticTierDArrangement(s.dealtHands.p,s.communityPiles,()=>random))
  expect(new Set(candidates.map(score)).size).toBeGreaterThan(1)
  expect(compareHands(evaluateSharedPile(first,s.communityPiles,1),evaluateSharedPile(first,s.communityPiles,2))).toBeLessThan(0)
  expect(evaluateSharedPile(first,s.communityPiles,3).unusedCards).toHaveLength(2)
  expect(evaluateSharedPile(first,s.communityPiles,2,s.drawPile[0]).unusedCards).toHaveLength(1)
  expect(()=>evaluateSharedPile(first,s.communityPiles,1,s.drawPile[0])).toThrow(/G2/)
},30000)
