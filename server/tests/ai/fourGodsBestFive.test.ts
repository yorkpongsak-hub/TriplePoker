import { aiDecideArrangement, FOUR_GODS } from '../../src/game/aiEngine'
import { checkTierCFoul, type CommunityCards } from '../../src/game/foulChecker'
import { evaluateBestFive } from '../../src/game/handEvaluator'
import type { Card } from '../../src/game/deck'
import { arrangeTierDBot } from '../../src/game/tierDSolo'
import type { TierDRiseSoloPersonality } from '../../src/game/tierDRiseSoloPersonality'

const c=(value:number,suit:string):Card=>({value,suit,rank:value===14?'A':value===13?'K':value===12?'Q':value===11?'J':String(value)} as Card)
const community:CommunityCards={
  row1:[c(2,'clubs'),c(4,'diamonds')],
  row2:[c(3,'clubs'),c(6,'diamonds')],
  row3:[c(13,'clubs'),c(7,'spades')],
}
const cards:Card[]=[c(13,'spades'),c(13,'hearts'),c(7,'diamonds'),c(14,'clubs'),c(12,'hearts'),c(11,'diamonds'),c(10,'clubs'),c(9,'hearts'),c(8,'diamonds'),c(5,'clubs'),c(2,'hearts')]

describe('Four Gods canonical Best 5/7 arrangement',()=>{
  test.each(FOUR_GODS)('$name keeps the available made Full House in a legal layout',config=>{
    const arrangement=aiDecideArrangement(config,cards,community,1,'highNoble',0)
    expect(checkTierCFoul(arrangement,community).isFoul).toBe(false)
    const g3=evaluateBestFive([...arrangement.pile3,...community.row3])
    expect(g3.rankIndex).toBeGreaterThanOrEqual(6)
    expect(g3.combinationsEvaluated).toBe(21)
  })
})

describe('Rise Lv.1000+ canonical Best 5/7 arrangement',()=>{
  test.each(['reaper','crag','cypher'] as TierDRiseSoloPersonality[])('%s does not randomly discard the available made Full House',personality=>{
    const tierCommunity={pile1:community.row1,pile2:community.row2,pile3:community.row3}
    const arrangement=arrangeTierDBot(cards,tierCommunity,5,()=>.999,[],false,.2,{personality,visible:{community:tierCommunity}})
    const g3=evaluateBestFive([...arrangement.pile3,...community.row3])
    expect(g3.rankIndex).toBeGreaterThanOrEqual(6)
    expect(g3.combinationsEvaluated).toBe(21)
  })
})
