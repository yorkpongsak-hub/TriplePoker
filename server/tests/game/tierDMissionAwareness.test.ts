import { tierDMissionAwareness } from '../../src/game/tierDMissionAwareness'
import { commitTierDCombo, type TierDLevelState } from '../../src/game/tierDSolo'
import type { Mission } from '../../src/game/leagueGameplay'

const stateFor=(missions:Mission[])=>({missions,seats:[{id:'p',isBot:false},{id:'ai',isBot:true}],scores:{p:0,ai:0},fouled:{},gameResults:[]} as unknown as TierDLevelState)
function result(state:TierDLevelState,pile:1|2|3,rank='flush'){
  state.gameResults.push({game:pile,hands:{p:{rank},ai:{rank}},fouled:{}} as any)
}
test('one Mission on G2 has no Combo messaging and keeps its location',()=>{
  const state=stateFor([{pile:2,rank:'one_pair'}])
  const view=tierDMissionAwareness(state,'p',0)
  expect(view.title).toBe('MISSION');expect(view.detail).not.toContain('COMBO');expect(view.missions[0]).toMatchObject({pile:2,status:'pending',label:'PAIR +2'})
})
test('G1/G3 Combo tracks provisional reveal, Undo and committed progress',()=>{
  const state=stateFor([{pile:3,rank:'flush'},{pile:1,rank:'one_pair'}])
  result(state,1)
  expect(tierDMissionAwareness(state,'p',0).missions[0]).toMatchObject({status:'success',provisional:true})
  expect(tierDMissionAwareness(state,'p',0).detail).toBe('COMBO +5–7')
  state.gameResults=[]
  expect(tierDMissionAwareness(state,'p',0).missions[0].status).toBe('pending')
  result(state,1)
  expect(tierDMissionAwareness(state,'p',1).detail).toBe('1 TO GO')
  result(state,3)
  expect(tierDMissionAwareness(state,'p',3).detail).toBe('COMBO!')
})
test.each([false,true])('negative Mission success/failure maps Super Combo (failure=%s)',failed=>{
  const state=stateFor([{pile:1,rank:'one_pair'},{pile:2,rank:'three_of_a_kind',negative:true,penalty:-8},{pile:3,rank:'flush'}])
  result(state,1);result(state,2,failed?'high_card':'flush');result(state,3)
  const view=tierDMissionAwareness(state,'p',3)
  expect(view.detail).toBe(failed?'SUPER COMBO MISSED':'SUPER COMBO!')
  expect(view.risk).toBe(true);expect(view.missions[1].label).toBe('⚠ TRIPS+ · FAIL -8')
  expect(view.missions[1].status).toBe(failed?'failed':'success')
  expect(commitTierDCombo(state,()=>0).p).toBe(failed?0:10)
})
test('Super Combo progress and failure never offer normal Combo for two successes',()=>{
  const state=stateFor([{pile:1,rank:'one_pair'},{pile:2,rank:'one_pair'},{pile:3,rank:'flush'}])
  result(state,1);expect(tierDMissionAwareness(state,'p',1).detail).toBe('2 TO GO')
  result(state,2);expect(tierDMissionAwareness(state,'p',2).detail).toBe('1 TO GO')
  result(state,3,'high_card');expect(tierDMissionAwareness(state,'p',3).detail).toBe('SUPER COMBO MISSED')
  expect(commitTierDCombo(state,()=>.99).p).toBe(0)
})
test('new Match resets progress; hidden G3 does not leak its provisional outcome',()=>{
  const state=stateFor([{pile:3,rank:'flush'}]);result(state,3)
  expect(tierDMissionAwareness(state,'p',2,true).missions[0].status).toBe('pending')
  const fresh=stateFor(state.missions)
  expect(tierDMissionAwareness(fresh,'p',0).missions.every(m=>m.status==='pending')).toBe(true)
})
test('Combo awards once when both Missions are committed, never rerolls on later commit',()=>{
  const state=stateFor([{pile:1,rank:'one_pair'},{pile:2,rank:'one_pair'}])
  result(state,1);result(state,2)
  const random=jest.fn(()=>0)
  expect(commitTierDCombo(state,random,1).p).toBe(0)
  expect(random).not.toHaveBeenCalled()
  expect(commitTierDCombo(state,random,2).p).toBe(5)
  const scores={...state.scores};const count=random.mock.calls.length
  result(state,3)
  expect(commitTierDCombo(state,random).p).toBe(5)
  expect(state.scores).toEqual(scores);expect(random).toHaveBeenCalledTimes(count)
})
