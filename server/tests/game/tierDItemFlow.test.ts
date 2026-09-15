const mockProfile={tier_d_solo_level:51,vip_status:'none',tier_d_match_win_streak:0}
jest.mock('../../src/config/supabase',()=>({supabaseAdmin:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:mockProfile})})}),update:()=>({eq:async()=>({error:null})}),upsert:async()=>({error:null}),delete:()=>({eq:async()=>({error:null})})}),rpc:async()=>({data:null,error:null})}}))
jest.mock('../../src/game/tierDRewardService',()=>({
  getTierDItemInventory:async()=>({shuffle:0,swap:0,double_pile:0,freeze:0,auto_sort:0,undo:0}),
  consumeTierDRuntimeItem:async()=>false,
}))
jest.mock('../../src/game/tierDSoloProgress',()=>({}))
jest.mock('../../src/game/tierDLeaderboardService',()=>({}))

import {pauseTierDItemAd,resumeTierDItemAd,startTierDSolo,startTierDTimerAfterDeal,reserveTierDSoloItemAd,grantTierDSoloItemAd,refreshTierDSoloInventory,useTierDItem,stageTierDArrangement,playTierDGame,finishTierDRevealAnimation,resumeTierDTimer} from '../../src/game/tierDSoloRuntime'
import * as solo from '../../src/game/tierDSolo'

test('the same Combo AI persists through all three Matches while Missions reroll',async()=>{
  jest.useFakeTimers()
  mockProfile.tier_d_solo_level=201
  const created=jest.spyOn(solo,'createTierDLevel')
  const random=jest.spyOn(Math,'random').mockReturnValue(.1)
  const events:any[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>{if(name==='tier_d_state')events.push(body)}})} as any
  const id='level-combo-role'
  try{
    await startTierDSolo(io,id,id)
    const first=created.mock.results[0].value as solo.TierDLevelState
    expect(first.comboBotId).toBe('tier-d-bot-1')
    for(let match=1;match<=2;match++){
      startTierDTimerAfterDeal(io,id,id)
      for(let pile=1;pile<=3;pile++){
        await playTierDGame(io,id,id)
        finishTierDRevealAnimation(io,id,id)
      }
      random.mockReturnValue(match===1?.9:.6)
      await playTierDGame(io,id,id)
      expect(events.at(-1).matchNumber).toBe(match+1)
      const next=created.mock.results[match].value as solo.TierDLevelState
      expect(next.comboBotId).toBe(first.comboBotId)
      expect(next.seats.filter(seat=>seat.isBot).map(seat=>seat.bot)).toEqual(first.seats.filter(seat=>seat.isBot).map(seat=>seat.bot))
      expect(created.mock.calls[match][3]).toEqual({comboBotId:first.comboBotId})
    }
    expect((created.mock.results[1].value as solo.TierDLevelState).missions).not.toEqual(first.missions)
  }finally{created.mockRestore();random.mockRestore();mockProfile.tier_d_solo_level=51;jest.clearAllTimers();jest.useRealTimers()}
},30000)

test('a missed client reveal acknowledgement cannot leave the first pile locked',async()=>{
  jest.useFakeTimers()
  const events:any[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>{if(name==='tier_d_state')events.push(body)}})} as any
  const state=()=>events.at(-1)
  const id='reveal-watchdog'
  try{
    await startTierDSolo(io,id,id)
    startTierDTimerAfterDeal(io,id,id)
    await playTierDGame(io,id,id)
    expect(state().currentGame).toBe(1)
    expect(state().phase).toBe('revealing')
    jest.advanceTimersByTime(5001)
    expect(state().phase).toBe('revealed')
    expect(state().systemPausedAt).toBeUndefined()
  }finally{jest.clearAllTimers();jest.useRealTimers()}
},30000)

test.each(['swap','double_pile','freeze','auto_sort','undo'] as const)('%s grants stock only; separate valid use consumes it once',async item=>{
  jest.useFakeTimers()
  const events:{name:string;body:any}[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>events.push({name,body})})} as any
  const state=()=>events.filter(event=>event.name==='tier_d_state').at(-1)!.body
  const id=`flow-${item}`
  const random=jest.spyOn(Math,'random').mockReturnValue(item==='undo' ? .82 : .1)
  try{
    await startTierDSolo(io,id,id);startTierDTimerAfterDeal(io,id,id)
    const cards=[...state().cards]
    const layout={pile1:cards.slice(0,3),pile2:cards.slice(3,6),pile3:cards.slice(6)}
    ;[layout.pile1[0],layout.pile3[0]]=[layout.pile3[0],layout.pile1[0]]
    stageTierDArrangement(io,id,id,layout)
    expect(grantTierDSoloItemAd(id,item)).toBe(false)
    expect(reserveTierDSoloItemAd(id,item)).toBe(true)
    expect(grantTierDSoloItemAd(id,item)).toBe(true)
    expect(grantTierDSoloItemAd(id,item)).toBe(false)
    await refreshTierDSoloInventory(io,id,id)
    expect(state().inventory[item]).toBe(1)
    expect(state().cards).toEqual(cards)
    expect(state().phase).toBe('arranging')
    expect(state().doubledPiles).toEqual([])
    if(item==='swap'){
      await useTierDItem(io,id,id,item)
      await refreshTierDSoloInventory(io,id,id)
      expect(state().inventory[item]).toBe(1)
      await useTierDItem(io,id,id,item,layout.pile3[0])
      expect(state().cards.filter((card:string)=>!cards.includes(card))).toHaveLength(1)
      expect(state().piles.pile1).toEqual(layout.pile1)
      expect(state().piles.pile2).toEqual(layout.pile2)
      expect(state().piles.pile3.slice(1)).toEqual(layout.pile3.slice(1))
      expect(state().dealRevision).toBe(0)
    }else if(item==='double_pile'){
      await useTierDItem(io,id,id,item,undefined,4 as any)
      await refreshTierDSoloInventory(io,id,id)
      expect(state().inventory[item]).toBe(1)
      await useTierDItem(io,id,id,item,undefined,2)
      expect(state().doubledPiles).toEqual([2])
      expect(state().cards).toEqual(cards)
    }else if(item==='freeze'){
      await useTierDItem(io,id,id,item)
      expect(state().phase).toBe('frozen')
      const remaining=state().timerRemainingMs
      jest.advanceTimersByTime(5000)
      resumeTierDTimer(io,id,id)
      expect(state().timerRemainingMs).toBe(remaining)
      expect(state().piles).toEqual(layout)
    }else if(item==='auto_sort'){
      await useTierDItem(io,id,id,item)
      expect(state().phase).toBe('arranging')
      expect(state().inventory.auto_sort).toBe(0)
      expect(state().piles.pile1).toHaveLength(3)
      expect(state().piles.pile2).toHaveLength(3)
      expect(state().piles.pile3).toHaveLength(5)
      expect(new Set([...state().piles.pile1,...state().piles.pile2,...state().piles.pile3])).toEqual(new Set(cards))
    }else{
      await useTierDItem(io,id,id,item)
      await refreshTierDSoloInventory(io,id,id)
      expect(state().inventory[item]).toBe(1)
      await playTierDGame(io,id,id,layout)
      finishTierDRevealAnimation(io,id,id)
      await playTierDGame(io,id,id)
      finishTierDRevealAnimation(io,id,id)
      await playTierDGame(io,id,id)
      finishTierDRevealAnimation(io,id,id)
      const scores={...state().scores}
      const highestBotScore=Math.max(...Object.entries(scores).filter(([seat])=>seat!==id).map(([,score])=>Number(score)))
      expect(scores[id]).toBeLessThan(highestBotScore)
      await useTierDItem(io,id,id,item)
      expect(state().phase).toBe('revealing')
      expect(state().reveal).toBeUndefined()
      expect(state().scores[id]).toBe(0)
      expect(state().matchNumber).toBe(1)
      expect(state().currentGame).toBe(1)
      expect(state().dealRevision).toBe(1)
    }
    expect(state().inventory[item]).toBe(0)
    expect(reserveTierDSoloItemAd(id,item)).toBe(false)
  }finally{random.mockRestore();jest.clearAllTimers();jest.useRealTimers()}
},30000)

test('empty Free stock requires an ad grant, then a separate Shuffle use deals new cards',async()=>{
  jest.useFakeTimers()
  const events:{name:string;body:any}[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>events.push({name,body})})} as any
  const state=()=>events.filter(event=>event.name==='tier_d_state').at(-1)!.body
  // Free player selects any zero-stock item; there is no pre-rolled ad item.
  const random=jest.spyOn(Math,'random').mockReturnValue(0)
  try{
    await startTierDSolo(io,'item-flow-room','item-flow-user')
    startTierDTimerAfterDeal(io,'item-flow-room','item-flow-user')
    const before=[...state().cards]
    expect(state().adGrantAvailable).toBe(true)
    await useTierDItem(io,'item-flow-room','item-flow-user','shuffle')
    expect(state().cards).toEqual(before)
    expect(reserveTierDSoloItemAd('item-flow-user','shuffle')).toBe(true)
    expect(reserveTierDSoloItemAd('item-flow-user','shuffle')).toBe(false)
    expect(grantTierDSoloItemAd('item-flow-user','shuffle')).toBe(true)
    await refreshTierDSoloInventory(io,'item-flow-room','item-flow-user')
    expect(state().inventory.shuffle).toBe(1)
    expect(state().cards).toEqual(before)
    random.mockRestore()
    await useTierDItem(io,'item-flow-room','item-flow-user','shuffle')
    expect(state().inventory.shuffle).toBe(0)
    expect(state().cards).not.toEqual(before)
    expect(new Set(state().cards).size).toBe(11)
    expect(state().phase).toBe('revealing')
    expect(state().dealRevision).toBe(1)
    expect(state().timerRemainingMs).toBe(330_000)
  }finally{random.mockRestore();jest.clearAllTimers();jest.useRealTimers()}
},30000)

test('item ad pauses the Match until returning, including claim and cancellation',async()=>{
  jest.useFakeTimers()
  const events:any[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>{if(name==='tier_d_state')events.push(body)}})} as any
  const state=()=>events.at(-1)
  const id='ad-timer-flow'
  try{
    await startTierDSolo(io,id,id);startTierDTimerAfterDeal(io,id,id)
    const item='shuffle'
    expect(pauseTierDItemAd(io,id,'wrong-user',item)).toBe(false)
    jest.advanceTimersByTime(2000)
    expect(pauseTierDItemAd(io,id,id,item)).toBe(true)
    const remaining=state().timerRemainingMs
    jest.advanceTimersByTime(400000)
    expect(state().matchNumber).toBe(1)
    resumeTierDItemAd(io,id,id)
    expect(state().timerRemainingMs).toBe(remaining)
    expect(state().adGrantAvailable).toBe(true)
    expect(pauseTierDItemAd(io,id,id,item)).toBe(true)
    expect(reserveTierDSoloItemAd(id,item)).toBe(true)
    expect(grantTierDSoloItemAd(id,item)).toBe(true)
    await useTierDItem(io,id,id,item)
    await refreshTierDSoloInventory(io,id,id)
    expect(state().inventory[item]).toBe(1)
    jest.advanceTimersByTime(10000)
    resumeTierDItemAd(io,id,id)
    expect(state().timerRemainingMs).toBe(remaining)
    expect(state().adPausedAt).toBeUndefined()
  }finally{jest.clearAllTimers();jest.useRealTimers()}
},30000)

test.each(['none','vip'])('Bronze %s Match grants exclude Freeze and Undo',async vip=>{
  jest.useFakeTimers()
  const events:any[]=[]
  const io={to:()=>({emit:(name:string,body:any)=>{if(name==='tier_d_state')events.push(body)}})} as any
  const random=jest.spyOn(Math,'random').mockReturnValue(.99)
  mockProfile.tier_d_solo_level=1;mockProfile.vip_status=vip
  try{
    await startTierDSolo(io,`bronze-${vip}`,`bronze-${vip}`)
    const state=events.at(-1)
    expect(state.inventory.freeze).toBe(0)
    expect(state.inventory.undo).toBe(0)
    if(vip==='none')expect(state.adGrantAvailable).toBe(true)
    else expect(Object.values(state.inventory).reduce((total:number,value:any)=>total+Number(value),0)).toBe(2)
  }finally{mockProfile.tier_d_solo_level=51;mockProfile.vip_status='none';random.mockRestore();jest.clearAllTimers();jest.useRealTimers()}
},30000)
