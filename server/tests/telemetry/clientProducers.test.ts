import { TelemetryQueue, type QueueConfig } from '../../../client/src/telemetry/queue'
import { ClientTelemetry } from '../../../client/src/telemetry/producers'
import { telemetryEventSchema } from '../../src/telemetry/schema'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const config:QueueConfig={enabled:true,environment:'development',serverUrl:'http://localhost:3001',appVersion:'1.0.0',platform:'android'}
function harness(enabled=true){
  let clock=Date.now(),id=20
  const memory=new Map<string,string>()
  const storage={getItem:jest.fn(async(key:string)=>memory.get(key)??null),setItem:jest.fn(async(key:string,value:string)=>{memory.set(key,value)})}
  const fetcher=jest.fn(async()=>new Response('{}',{status:503}))
  const deps={storage,fetch:fetcher,uuid:()=>`00000000-0000-4000-8000-${String(id++).padStart(12,'0')}`,now:()=>clock,random:()=>.5}
  const queue=new TelemetryQueue({...config,enabled},deps)
  const producer=new ClientTelemetry(queue,()=>clock)
  return {queue,producer,storage,memory,deps,events:()=>JSON.parse(memory.get(queue.storageKey)??'{"events":[]}').events,advance:(ms:number)=>{clock+=ms}}
}
afterEach(()=>jest.useRealTimers())

test('VIP state waits for an available profile, reports once per session and only actual plan changes; snapshots use existing entitlements',async()=>{
  const h=harness();await h.producer.active();await h.producer.membershipStatus(undefined)
  expect(h.events().some((e:any)=>e.event_name==='vip_status')).toBe(false)
  await h.producer.membershipStatus('none');await h.producer.membershipStatus('none');await h.producer.membershipStatus('vip');await h.producer.membershipStatus('vip_pro')
  const trace=h.producer.trainingStart(2)!;h.producer.trainingEnd(trace,4,2,1);await h.producer.settled()
  const vip=h.events().filter((e:any)=>e.event_name==='vip_status')
  expect(vip.map((e:any)=>[e.properties.plan,e.properties.trigger])).toEqual([['FREE','session_start'],['PRO','change'],['PRO_PLUS','change']])
  expect(h.events().find((e:any)=>e.event_name==='game_end').membership).toMatchObject({plan:'PRO_PLUS',entitled:true,entitlements:{canUseProPlusSocialBenefits:true}})
  for(const e of h.events())expect(telemetryEventSchema.safeParse(e).success).toBe(true)
  await h.producer.background();await h.producer.membershipStatus('vip');await h.producer.active();await h.producer.membershipStatus('vip');h.queue.stop()
  expect(h.events().filter((e:any)=>e.event_name==='vip_status')).toHaveLength(4)
  expect(h.events().filter((e:any)=>e.event_name==='vip_status').at(-1).properties).toMatchObject({plan:'PRO',trigger:'session_start'})
})
test('VIP flag off / unknown profile / sign-out never fabricates membership or leaks stale snapshots',async()=>{
  const off=harness(false);await off.producer.membershipStatus('vip');expect(off.storage.getItem).not.toHaveBeenCalled()
  const h=harness();await h.producer.membershipStatus('vip');await h.producer.active();await h.producer.membershipStatus(undefined);await h.producer.route('launch');h.queue.stop()
  expect(h.events().find((e:any)=>e.event_name==='launch_step').membership).toBeUndefined()
  expect(h.events().filter((e:any)=>e.event_name==='vip_status')).toHaveLength(1)
})
test('app_open once per JS boot, idempotent foreground, inactive ignored by root, best-effort end and return ordinal',async()=>{
  const h=harness();const contexts:any[]=[];const unsubscribe=h.producer.subscribeContext(c=>contexts.push(c))
  await h.producer.active();await h.producer.active();h.advance(2500);await h.producer.background();await h.producer.background()
  await h.producer.active();await h.producer.settled();h.queue.stop();unsubscribe()
  expect(h.events().filter((e:any)=>e.event_name==='app_open')).toHaveLength(1)
  const starts=h.events().filter((e:any)=>e.event_name==='session_start')
  expect(starts.map((e:any)=>e.properties)).toEqual([{session_number:1,is_return:false},{session_number:2,is_return:true}])
  expect(h.events().find((e:any)=>e.event_name==='session_end').properties).toEqual({duration_ms:2500,reason:'background'})
  expect(starts[0].session_id).not.toBe(starts[1].session_id);expect(contexts).toHaveLength(2)
})
test('disabled producers perform no storage, UUID allocation, network or state instrumentation',async()=>{
  const h=harness(false);await h.producer.active();await h.producer.route('launch');await h.producer.background()
  const trace=h.producer.trainingStart(0);h.producer.trainingEnd(trace,5,4,1);await h.producer.settled()
  expect(trace).toBeUndefined();expect(h.storage.getItem).not.toHaveBeenCalled();expect(h.events()).toHaveLength(0)
})
test('training games emit only allowlisted numerical outcomes and survive repeat result calls/restart',async()=>{
  const h=harness();const trace=h.producer.trainingStart(0)!
  h.advance(1200);h.producer.trainingEnd(trace,5.5,3.5,1);h.producer.trainingEnd(trace,5.5,3.5,1);await h.producer.settled()
  const end=h.events().filter((e:any)=>e.event_name==='game_end');expect(end).toHaveLength(1)
  expect(end[0].properties).toEqual({game_id:trace.gameId,mode:'training',tier:'training',human_count:1,bot_count:1,outcome:'win',duration_ms:1200,score:5.5,score_kind:'points',opponent_score:3.5,seal_wins:1})
  const restarted=new ClientTelemetry(new TelemetryQueue(config,h.deps),()=>Date.now())
  restarted.trainingEnd(trace,5.5,3.5,1);await restarted.settled()
  expect(h.events().filter((e:any)=>e.event_name==='game_end')).toHaveLength(1)
  for(const event of h.events())expect(telemetryEventSchema.safeParse(event).success).toBe(true)
  expect(JSON.stringify(end)).not.toMatch(/cards|hands|seed|token|vip|ad_reward/)
})
test.each([[2,6,'loss'],[4.5,4.5,'draw']])('training outcome %s:%s is %s',async(score,opponent,outcome)=>{
  const h=harness();const trace=h.producer.trainingStart(5)!;h.producer.trainingEnd(trace,score as number,opponent as number,0);await h.producer.settled()
  expect(h.events().find((e:any)=>e.event_name==='game_end').properties.outcome).toBe(outcome)
  expect(h.events().some((e:any)=>e.event_name==='tutorial_start')).toBe(false)
})
test('two onboarding matches create ordered tutorial steps, one completion and one first-game marker',async()=>{
  const h=harness();for(let i=0;i<2;i++){const trace=h.producer.trainingStart(i)!;h.producer.trainingEnd(trace,5,4,1)}await h.producer.settled()
  expect(h.events().filter((e:any)=>e.event_name==='tutorial_start')).toHaveLength(1)
  expect(h.events().filter((e:any)=>e.event_name==='tutorial_step').map((e:any)=>e.properties.step)).toEqual([1,2,3,4])
  expect(h.events().filter((e:any)=>e.event_name==='tutorial_complete')).toHaveLength(1)
  expect(h.events().filter((e:any)=>e.event_name==='first_game_complete')).toHaveLength(1)
  h.producer.trainingEnd(undefined,5,4,1);await h.producer.settled();expect(h.events().filter((e:any)=>e.event_name==='game_end')).toHaveLength(2)
})
test.each(['strategy_check','tier_d_guide'] as const)('%s funnel steps are idempotent across revisits',async tutorial=>{
  const h=harness();await h.producer.tutorialStart(tutorial);await h.producer.tutorialStart(tutorial)
  await h.producer.tutorialStep(tutorial,1);await h.producer.tutorialStep(tutorial,1)
  await h.producer.tutorialComplete(tutorial);await h.producer.tutorialComplete(tutorial)
  expect(h.events().filter((e:any)=>e.event_name.startsWith('tutorial_')).map((e:any)=>e.event_name)).toEqual(['tutorial_start','tutorial_step','tutorial_complete'])
})
test('essential route allowlist records visits without frozen/ads/PII paths or same-route remount duplication',async()=>{
  const h=harness();for(const path of ['launch','launch','duel','game/tier-d/entry','game/tier-d','(home)/lobby','(home)/classic-lobby','(auth)/login','(auth)/onboarding','game/mastermind/select','game/initiate','game/adept','game/mastermind','game/highNoble','game/monarch','game/sovereign','game/grandmaster','game/tier-d/ad','profile/user-secret'])await h.producer.route(path)
  expect(h.events().filter((e:any)=>e.event_name==='launch_step')).toHaveLength(13)
  expect(JSON.stringify(h.events())).not.toMatch(/user-secret|monarch|sovereign|grandmaster|tier-d\/ad/)
})
test('telemetry storage failure cannot reject producer operations',async()=>{
  const h=harness();h.storage.getItem.mockRejectedValue(new Error('storage unavailable'))
  await expect(h.producer.active()).resolves.toBeUndefined();await expect(h.producer.background()).resolves.toBeUndefined();await expect(h.producer.route('launch')).resolves.toBeUndefined()
  h.queue.stop()
})
test('UI connections are confined to actual lifecycle/tutorial transitions; guide skip is not completion',()=>{
  const root=readFileSync(resolve(__dirname,'../../../client/app/_layout.tsx'),'utf8')
  expect(root).toContain("state === 'background'");expect(root).toContain("else if (state === 'background') void launchTelemetry.background()")
  expect(root).toContain("royalSocket.emit('telemetry_context', context)")
  const guide=readFileSync(resolve(__dirname,'../../../client/app/(auth)/onboarding.tsx'),'utf8')
  expect(guide).toContain("if (index === TOTAL_SLIDES-1) void launchTelemetry.tutorialComplete('tier_d_guide')")
  const launch=readFileSync(resolve(__dirname,'../../../client/app/launch.tsx'),'utf8')
  expect(launch).toContain("answer===LESSONS[lesson].correct&&<Button")
  expect(launch).toContain("launchTelemetry.tutorialStep('strategy_check',lesson+1)")
  expect(launch).toContain("launchTelemetry.tutorialComplete('strategy_check')")
})
