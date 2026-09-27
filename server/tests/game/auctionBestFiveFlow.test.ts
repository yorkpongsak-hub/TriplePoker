import type { Card } from '../../src/game/deck'
import { applyAuctionCardsToPile2 } from '../../src/game/gameLoop'
import { evaluateBestFive } from '../../src/game/handEvaluator'
import type { PlayerArrangement } from '../../src/game/foulChecker'

const c=(value:number,suit:string):Card=>({value,suit,rank:value===14?'A':value===13?'K':String(value)} as Card)
const arrangement=(pile2:Card[]):PlayerArrangement=>({
  pile1:[c(2,'clubs'),c(3,'diamonds'),c(4,'hearts')],
  pile2,
  pile3:[c(5,'clubs'),c(6,'diamonds'),c(7,'hearts'),c(8,'spades'),c(9,'clubs')],
})

describe('post-Auction G2 Best 5/6 flow',()=>{
  test.each(['human','ai'])('%s winner receives the Auction card as fourth private G2 card',winner=>{
    const human=arrangement([c(14,'spades'),c(14,'hearts'),c(13,'clubs')])
    const ai=arrangement([c(10,'spades'),c(10,'hearts'),c(12,'clubs')])
    const auction=winner==='human'?c(14,'clubs'):c(10,'clubs')
    const updated=applyAuctionCardsToPile2({human,ai},{[winner]:auction})
    expect(updated[winner].pile2).toHaveLength(4)
    expect(updated[winner].pile3).toHaveLength(5)
    expect(updated[winner==='human'?'ai':'human'].pile2).toHaveLength(3)
  })

  test('the sixth eligible card participates in Best 5/6 and may improve the result',()=>{
    const base=arrangement([c(14,'spades'),c(14,'hearts'),c(13,'clubs')])
    const community=[c(14,'diamonds'),c(13,'spades')]
    expect(evaluateBestFive([...base.pile2,...community]).rank).toBe('full_house')
    const updated=applyAuctionCardsToPile2({human:base},{human:c(14,'clubs')})
    const result=evaluateBestFive([...updated.human.pile2,...community])
    expect(updated.human.pile2).toHaveLength(4)
    expect(result.rank).toBe('four_of_a_kind')
    expect(result.combinationsEvaluated).toBe(6)
    expect(result.unusedCards).toHaveLength(1)
  })

  test('replaying recovery data never duplicates an Auction card',()=>{
    const auction=c(14,'clubs')
    const first=applyAuctionCardsToPile2({human:arrangement([c(14,'spades'),c(14,'hearts'),c(13,'clubs')])},{human:auction})
    const second=applyAuctionCardsToPile2(first,{human:auction})
    expect(second.human.pile2).toHaveLength(4)
  })
})
