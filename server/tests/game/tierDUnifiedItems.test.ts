const mockSnapshots=new Map<string,any>()
const mockInventory:Record<string,number>={shuffle:8,swap:8,double_pile:8,freeze:8,auto_sort:8,undo:8}
let mockDurations=[15,45,22,30,18,40,21,35]
let mockFail=false
let mockAfterCommitFail=false
let mockCommits=0
jest.mock('../../src/config/supabase',()=>({supabaseAdmin:{from:(table:string)=>({
  select:()=>({eq:(_key:string,id:string)=>({maybeSingle:async()=>({data:table==='users'?{tier_d_solo_level:51,vip_status:'none'}:{snapshot:mockSnapshots.get(id)}})})}),
  upsert:async(row:any)=>{mockSnapshots.set(row.user_id,structuredClone(row.snapshot));return {}},
  update:()=>({eq:async()=>({})}),delete:()=>({eq:async()=>({})}),
}),rpc:async()=>({})}}))
jest.mock('../../src/game/tierDRewardService',()=>({getTierDItemInventory:async()=>({...mockInventory})}))
jest.mock('../../src/game/tierDSoloProgress',()=>({}))
jest.mock('../../src/game/tierDLeaderboardService',()=>({}))
jest.mock('../../src/game/tierDItemPersistence',()=>({
  getTierDFreezeDurations:async()=>[...mockDurations],
  commitTierDItem:async(input:any)=>{
    if(mockFail)throw Error('DB unavailable')
    expect(input.expectedRevision).toBe(mockSnapshots.get(input.userId).itemRevision)
    mockCommits++
    if(input.persistent){mockInventory[input.item]--;if(input.item==='freeze')mockDurations.shift()}
    mockSnapshots.set(input.userId,structuredClone(input.snapshot))
    if(mockAfterCommitFail)throw Error('response lost after commit')
  },
}))
import type * as Runtime from '../../src/game/tierDSoloRuntime'
import { assertTierDCardConservation, firstValidTierDArrangement } from '../../src/game/tierDSolo'
import { isSharedArrangementFoul } from '../../src/game/sharedCardRules'
jest.setTimeout(60000)
let runtime:typeof Runtime
let events:any[]
const id='phase2-player'
const io={to:()=>({emit:(name:string,body:any)=>{if(name==='tier_d_state')events.push(structuredClone(body))}})} as any
const state=()=>events.at(-1)
const flush=async()=>{for(let n=0;n<12;n++)await Promise.resolve()}
let sequence=0
const scope=()=>({gameId:state().gameId,matchNumber:state().matchNumber,dealRevision:state().dealRevision,requestId:`action-${++sequence}`})
const use=(item:any,card?:string,pile?:any,request=scope())=>runtime.useTierDItem(io,id,id,item,card,pile,request)
const key=(c:any)=>`${c.rank.toLowerCase()}${({spades:'s',hearts:'h',diamonds:'d',clubs:'c'} as any)[c.suit]}`
function legalLayout(){const s=mockSnapshots.get(id).state;const a=firstValidTierDArrangement(s.dealtHands[id],s.communityPiles);return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v.map(key)])) as any}
async function reconnect(){await flush();const now=Date.now();jest.clearAllTimers();jest.resetModules();runtime=require('../../src/game/tierDSoloRuntime');jest.useFakeTimers();jest.setSystemTime(now);expect(await runtime.resumeTierDSolo(io,id,id)).toBe('RESUMED');await flush()}
beforeEach(async()=>{
  jest.resetModules();runtime=require('../../src/game/tierDSoloRuntime');events=[];mockSnapshots.clear()
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-09-16T01:00:00Z'))
  Object.keys(mockInventory).forEach(key=>mockInventory[key]=8);mockDurations=[15,45,22,30,18,40,21,35]
  mockFail=false;mockAfterCommitFail=false;mockCommits=0
  jest.spyOn(Math,'random').mockReturnValue(.1)
  await runtime.startTierDSolo(io,id,id);runtime.startTierDTimerAfterDeal(io,id,id);await flush()
})
afterEach(()=>{jest.restoreAllMocks();jest.clearAllTimers();jest.useRealTimers()})

test('Auto Sort repeats legally, consumes each activation, but retry consumes once and empty stock fails',async()=>{
  const request=scope()
  expect(await use('auto_sort',undefined,undefined,request)).toBe(true)
  const piles=state().piles
  expect(await use('auto_sort',undefined,undefined,request)).toBe(true)
  expect(mockCommits).toBe(1)
  for(let n=0;n<7;n++)expect(await use('auto_sort')).toBe(true)
  expect(state().piles).toEqual(piles);expect(mockInventory.auto_sort).toBe(0)
  expect(await use('auto_sort')).toBe(false);expect(mockCommits).toBe(8)
  await reconnect();expect(await use('auto_sort',undefined,undefined,request)).toBe(true);expect(mockCommits).toBe(8)
})

test('Swap validates selection, preserves exact slot, returns card, and survives duplicate/reconnect',async()=>{
  expect(await use('swap')).toBe(false);expect(mockCommits).toBe(0)
  const cards=state().cards;const selected=cards[7];const layout={pile1:cards.slice(0,3),pile2:cards.slice(3,6),pile3:cards.slice(6)}
  runtime.stageTierDArrangement(io,id,id,layout)
  const request=scope()
  expect(await use('swap',selected,undefined,request)).toBe(true)
  expect(state().piles.pile3[1]).not.toBe(selected)
  expect(state().piles.pile3.filter((_:any,i:number)=>i!==1)).toEqual(layout.pile3.filter((_:any,i:number)=>i!==1))
  const saved=mockSnapshots.get(id)
  expect(saved.state.drawPile.map(key)).toContain(selected);expect(assertTierDCardConservation(saved.state)).toBe(true)
  expect(await use('swap',selected,undefined,request)).toBe(true);expect(mockCommits).toBe(1)
  await reconnect();expect(await use('swap',state().cards[0])).toBe(false)
  expect(mockInventory.swap).toBe(7);expect(state().itemUsageByMatch.swap).toBe(1)
})

test('Shuffle redeals all zones and preserves Freeze, Swap and xX usage and target',async()=>{
  await use('freeze');jest.advanceTimersByTime(15000)
  await use('swap',state().cards[0]);await use('double_pile',undefined,2)
  const before=structuredClone(mockSnapshots.get(id));const request=scope()
  jest.spyOn(Math,'random').mockReturnValue(.7)
  expect(await use('shuffle',undefined,undefined,request)).toBe(true)
  expect(state().matchNumber).toBe(1);expect(state().gameId).toBe(before.gameId)
  expect(state().cards).not.toEqual(before.state.dealtHands[id].map(key))
  expect(mockSnapshots.get(id).state.communityPiles).not.toEqual(before.state.communityPiles)
  expect(assertTierDCardConservation(mockSnapshots.get(id).state)).toBe(true)
  expect(await use('shuffle',undefined,undefined,request)).toBe(true)
  runtime.startTierDTimerAfterDeal(io,id,id)
  for(const item of ['freeze','swap','double_pile','shuffle'])expect(await use(item,state().cards[0],3)).toBe(false)
  expect(state().xX).toEqual({effect:'SCORE_MULTIPLIER',pile:2,multiplier:2})
  await reconnect();expect(state().itemUsageByMatch).toMatchObject({freeze:1,swap:1,xX:1,shuffle:1})
  expect(await use('shuffle')).toBe(false)
})

test('Freeze is a persisted instance duration; reconnect and early resume cannot extend it',async()=>{
  const remaining=state().timerRemainingMs
  expect(await use('freeze')).toBe(true);const expires=state().freezeExpiresAt
  jest.advanceTimersByTime(5000);runtime.resumeTierDTimer(io,id,id)
  expect(state().phase).toBe('frozen')
  await reconnect();expect(state().freezeExpiresAt).toBe(expires)
  jest.advanceTimersByTime(9999);expect(state().phase).toBe('frozen')
  jest.advanceTimersByTime(1);expect(state().phase).toBe('arranging');expect(state().timerRemainingMs).toBe(remaining)
  expect(await use('freeze')).toBe(false)
})

test('Freeze expiry during server downtime deducts exactly post-expiry time',async()=>{
  expect(await use('freeze')).toBe(true)
  const remaining=state().timerRemainingMs
  const reconnectAt=state().freezeExpiresAt+10000
  await flush()
  jest.clearAllTimers();jest.useFakeTimers();jest.setSystemTime(reconnectAt)
  await reconnect()
  expect(state().phase).toBe('arranging')
  expect(state().timerRemainingMs).toBe(remaining-10000)
  expect(state().itemUsageByMatch.freeze).toBe(1)
})

test('Reveal resolves a foul immediately without opening a correction gate',async()=>{
  expect(await use('undo')).toBe(false)
  await use('double_pile',undefined,3)
  const raw=mockSnapshots.get(id).state;const legal=firstValidTierDArrangement(raw.dealtHands[id],raw.communityPiles)
  let foul={pile1:legal.pile2,pile2:legal.pile1,pile3:legal.pile3}
  if(!isSharedArrangementFoul(foul,raw.communityPiles))throw Error('Fixture must be foul')
  const keys=Object.fromEntries(Object.entries(foul).map(([k,v])=>[k,v.map(key)])) as any
  await runtime.playTierDGame(io,id,id,keys)
  expect(state().phase).toBe('revealing')
  expect(state().foulPendingRecovery).toBe(false)
  expect(state().reveal?.fouled[id]).toBe(true)
  expect(state().xX.pile).toBe(3)
  expect(state().preG1LockedAt).toBeDefined()
})

test('G1 locks every item, xX target cannot change, and lock survives restart',async()=>{
  expect(await use('double_pile',undefined,2)).toBe(true)
  expect(await use('double_pile',undefined,3)).toBe(false)
  await runtime.playTierDGame(io,id,id,legalLayout());runtime.finishTierDRevealAnimation(io,id,id)
  for(const item of Object.keys(mockInventory))expect(await use(item,state().cards[0],1)).toBe(false)
  await reconnect();expect(state().preG1LockedAt).toBeDefined();expect(state().xX.pile).toBe(2)
  expect(await use('auto_sort')).toBe(false)
})

test('next Matches reset usage but preserve consumed inventory, Game identity and cumulative scores',async()=>{
  const game=state().gameId
  for(let match=1;match<=3;match++){
    expect(state().matchNumber).toBe(match);expect(state().gameId).toBe(game)
    expect(state().itemUsageByMatch).toEqual({})
    const duration=state().freezeDuration
    expect(await use('freeze')).toBe(true)
    jest.advanceTimersByTime(duration*1000)
    expect(state().phase).toBe('arranging')
    expect(await use('shuffle')).toBe(true)
    runtime.startTierDTimerAfterDeal(io,id,id)
    expect(await use('swap',state().cards[0])).toBe(true)
    expect(await use('double_pile',undefined,1)).toBe(true)
    expect(mockInventory.swap).toBe(8-match)
    expect(mockInventory.freeze).toBe(8-match)
    expect(mockInventory.shuffle).toBe(8-match)
    if(match===3)break
    await runtime.playTierDGame(io,id,id,legalLayout())
    for(let p=1;p<=3;p++){
      runtime.finishTierDRevealAnimation(io,id,id);runtime.finishTierDTripleSweepVfx(io,id,id)
      await runtime.playTierDGame(io,id,id)
    }
    runtime.startTierDTimerAfterDeal(io,id,id);await flush()
    expect(Object.values(state().scores).some((v:any)=>v>0)).toBe(true)
  }
})

test('stale Game/Match/deal, missing scope and forged item cannot debit inventory',async()=>{
  const request=scope()
  for(const stale of [{...request,gameId:'old'},{...request,matchNumber:2},{...request,dealRevision:99}])expect(await use('swap',state().cards[0],undefined,stale)).toBe(false)
  expect(await runtime.useTierDItem(io,id,id,'swap',state().cards[0])).toBe(false)
  expect(await use('forged')).toBe(false);expect(mockCommits).toBe(0)
})

test('concurrent requests cannot debit or mutate twice',async()=>{
  const request=scope(),card=state().cards[0]
  await Promise.all([use('swap',card,undefined,request),use('swap',card,undefined,request)])
  expect(mockCommits).toBe(1);expect(mockInventory.swap).toBe(7)
})

test('special object keys remain durable request receipts',async()=>{
  const request={...scope(),requestId:'__proto__'}
  expect(await use('auto_sort',undefined,undefined,request)).toBe(true)
  expect(await use('auto_sort',undefined,undefined,request)).toBe(true)
  await reconnect()
  expect(await use('auto_sort',undefined,undefined,request)).toBe(true)
  expect(mockCommits).toBe(1)
})

test('invalid Freeze instance or failed Auto Sort never consumes stock',async()=>{
  mockDurations=[99]
  await runtime.refreshTierDSoloInventory(io,id,id)
  expect(await use('freeze')).toBe(false)
  const selector=jest.spyOn(require('../../src/game/tierDSolo'),'automaticTierDArrangement').mockImplementation(()=>{throw new Error('No legal layout')})
  expect(await use('auto_sort')).toBe(false)
  selector.mockRestore()
  expect(mockCommits).toBe(0);expect(mockInventory.freeze).toBe(8);expect(mockInventory.auto_sort).toBe(8)
})

test('empty authoritative deck rejects Swap before item consumption',async()=>{
  const factory=jest.spyOn(require('../../src/game/tierDSolo'),'createTierDLevel')
  await runtime.startTierDSolo(io,id,id)
  runtime.startTierDTimerAfterDeal(io,id,id)
  const live=factory.mock.results[0].value
  live.drawPile=[]
  expect(await use('swap',state().cards[0])).toBe(false)
  expect(mockCommits).toBe(0);expect(mockInventory.swap).toBe(8)
})

test('invalid partial arrangement is not persisted as the Swap layout',async()=>{
  runtime.stageTierDArrangement(io,id,id,{pile1:[state().cards[0]],pile2:[],pile3:[]})
  expect(await use('swap',state().cards[0])).toBe(true)
  expect(state().piles.pile1).toHaveLength(3)
  expect(state().piles.pile2).toHaveLength(3)
  expect(state().piles.pile3).toHaveLength(5)
})

test.each([false,true])('transaction failure/reply loss restores atomic saved state (committed=%s)',async committed=>{
  const before=state().cards,request=scope()
  mockFail=!committed;mockAfterCommitFail=committed
  expect(await use('swap',before[0],undefined,request)).toBe(false)
  mockFail=false;mockAfterCommitFail=false
  await reconnect()
  if(committed){expect(state().cards).not.toEqual(before);expect(await use('swap',before[0],undefined,request)).toBe(true)}
  else expect(state().cards).toEqual(before)
  expect(mockInventory.swap).toBe(committed?7:8)
})
