import { NINE_SENTINELS, arrangementSearchBudget, canonicalArrangementObjective, greedyArrangement, mastermindBossUsesMissions } from '../../src/game/aiEngine'
import { checkTierCFoul, type CommunityCards } from '../../src/game/foulChecker'
import { evaluateBestFive } from '../../src/game/handEvaluator'
import type { Card } from '../../src/game/deck'

const c=(value:number,suit:string):Card=>({value,suit,rank:value===14?'A':value===13?'K':value===12?'Q':value===11?'J':String(value)} as Card)
const sideRows={row1:[c(2,'clubs'),c(4,'diamonds')],row2:[c(3,'clubs'),c(6,'diamonds')]} as const
const fillers=[c(14,'clubs'),c(12,'hearts'),c(11,'diamonds'),c(9,'clubs'),c(8,'hearts'),c(6,'spades'),c(5,'diamonds'),c(3,'hearts')]

const cases:{name:string;expected:string;made:Card[];row3:Card[]}[]=[
  {name:'Full House',expected:'full_house',made:[c(13,'spades'),c(13,'hearts'),c(7,'diamonds')],row3:[c(13,'clubs'),c(7,'spades')]},
  {name:'Straight',expected:'straight',made:[c(13,'diamonds'),c(12,'clubs'),c(11,'hearts')],row3:[c(10,'spades'),c(9,'diamonds')]},
  {name:'Flush',expected:'flush',made:[c(14,'spades'),c(11,'spades'),c(8,'spades')],row3:[c(5,'spades'),c(2,'spades')]},
  {name:'Four of a Kind',expected:'four_of_a_kind',made:[c(13,'spades'),c(13,'hearts'),c(13,'diamonds')],row3:[c(13,'clubs'),c(7,'spades')]},
  {name:'Royal Flush',expected:'royal_flush',made:[c(14,'spades'),c(13,'spades'),c(12,'spades')],row3:[c(11,'spades'),c(10,'spades')]},
]

describe('Tier C++ canonical AI arrangement',()=>{
  test('Mastermind bosses 1-5 play without Missions and bosses 6-9 require Missions',()=>{
    expect(NINE_SENTINELS.slice(0,5).map(boss=>[boss.bossId,mastermindBossUsesMissions(boss.bossId)])).toEqual([
      ['iron_wall',false],['chivalry',false],['war_lord',false],['phantom',false],['dark_shark',false],
    ])
    expect(NINE_SENTINELS.slice(5).map(boss=>[boss.bossId,mastermindBossUsesMissions(boss.bossId)])).toEqual([
      ['oracle',true],['jester',true],['phoenix',true],['black_magic',true],
    ])
    expect(mastermindBossUsesMissions('unknown')).toBe(false)
  })
  test('only P3/Boss receives the tier search budget; support AI is capped at 10%',()=>{
    for(const tier of ['initiate','adept','mastermind','highNoble']){
      expect(arrangementSearchBudget(tier,'support')).toBeLessThanOrEqual(arrangementSearchBudget(tier,'boss')*.10)
    }
    expect(arrangementSearchBudget('adept','boss')).toBe(240)
    expect(arrangementSearchBudget('mastermind','boss')).toBe(400)
    expect(arrangementSearchBudget('highNoble','boss')).toBe(640)
  })
  test.each(cases)('greedy/minion path recognizes $name with Best 5/7',({expected,made,row3})=>{
    const used=new Set([...made,...row3].map(card=>`${card.value}:${card.suit}`))
    const cards=[...made,...fillers.filter(card=>!used.has(`${card.value}:${card.suit}`))].slice(0,11)
    const community:CommunityCards={row1:[...sideRows.row1],row2:[...sideRows.row2],row3}
    const arrangement=greedyArrangement(cards,community)
    expect(checkTierCFoul(arrangement,community).isFoul).toBe(false)
    const result=evaluateBestFive([...arrangement.pile3,...row3])
    expect(result.rank).toBe(expected)
    expect(result.combinationsEvaluated).toBe(21)
  })
  test('mission-aware AI maximizes canonical expected score, not hand strength alone',()=>{
    const cards=[c(14,'spades'),c(14,'hearts'),c(13,'spades'),c(13,'hearts'),c(12,'spades'),c(11,'spades'),c(10,'diamonds'),c(9,'clubs'),c(8,'hearts'),c(7,'diamonds'),c(2,'clubs')]
    const community:CommunityCards={row1:[c(3,'clubs'),c(4,'diamonds')],row2:[c(10,'clubs'),c(6,'diamonds')],row3:[c(10,'spades'),c(6,'spades')]}
    const missions=[{pile:1 as const,rank:'high_card' as const},{pile:2 as const,rank:'two_pair' as const},{pile:3 as const,rank:'straight' as const}]
    const strengthOnly=greedyArrangement(cards,community)
    const missionAware=greedyArrangement(cards,community,missions)
    expect(canonicalArrangementObjective(missionAware,community,missions)).toBeGreaterThanOrEqual(canonicalArrangementObjective(strengthOnly,community,missions))
    expect(checkTierCFoul(missionAware,community).isFoul).toBe(false)
  })
})
