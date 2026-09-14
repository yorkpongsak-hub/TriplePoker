import type { Card } from '../../src/game/deck'
import { checkFoul, checkTierCFoul, type CommunityCards, type PlayerArrangement } from '../../src/game/foulChecker'

const c=(value:number,suit:string)=>({value,suit,rank:value===14?'A':String(value)}) as Card

describe('Tier C Best 5 arrangement',()=>{
 test('keeps all five G3 cards and evaluates Best 5 of 7',()=>{
  const arrangement:PlayerArrangement={
   pile1:[c(2,'spades'),c(4,'hearts'),c(6,'diamonds')],
   pile2:[c(8,'spades'),c(8,'hearts'),c(8,'diamonds')],
   pile3:[c(3,'spades'),c(5,'hearts'),c(7,'diamonds'),c(9,'clubs'),c(9,'diamonds')],
  }
  const community:CommunityCards={
   row1:[c(11,'clubs'),c(13,'spades')],
   row2:[c(10,'clubs'),c(12,'spades')],
   row3:[c(9,'hearts'),c(9,'spades')],
  }
  expect(checkFoul(arrangement,community).isFoul).toBe(true)
  expect(checkTierCFoul(arrangement,community)).toEqual({isFoul:false})
 })

 test('Ready shape requires the full 3-3-5 arrangement',()=>{
  const community:CommunityCards={row1:[c(2,'clubs'),c(3,'clubs')],row2:[c(4,'clubs'),c(5,'clubs')],row3:[c(6,'clubs'),c(7,'clubs')]}
  const arrangement:PlayerArrangement={pile1:[c(2,'spades'),c(3,'spades'),c(4,'spades')],pile2:[c(5,'spades'),c(6,'spades'),c(7,'spades')],pile3:[c(8,'spades'),c(9,'spades'),c(10,'spades')]}
  expect(checkTierCFoul(arrangement,community)).toEqual({isFoul:true,reason:'Pile 3 must have 5 cards',foulPile:3})
 })
})
