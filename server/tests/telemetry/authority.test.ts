import { AuthorityTelemetry, membershipSnapshot, receiptUuid } from '../../src/telemetry/authority'
import { anonymousGameId, ServerGameTelemetry } from '../../src/telemetry/gameplay'
import { telemetryEventSchema } from '../../src/telemetry/schema'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const ctx={player_id:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000002',app_version:'1.0.0',platform:'android' as const}
const at='2026-10-03T00:00:00.000Z',user='account-secret'
const original={...process.env}
beforeEach(()=>{process.env.TELEMETRY_ENABLED='true';process.env.TELEMETRY_ENV='development'})
afterEach(()=>{process.env={...original};jest.useRealTimers()})
const tick=async()=>{for(let i=0;i<3;i++)await new Promise<void>(done=>setImmediate(done))}
function harness(tables:Record<string,unknown>,enabled=true,context:typeof ctx|undefined=ctx){
  const from=jest.fn((table:string)=>{
    const query:any={select:()=>query,eq:()=>query,not:()=>query,maybeSingle:()=>query,
      abortSignal:()=>Promise.resolve({data:table==='users'?{vip_status:'vip_pro'}:tables[table],error:null})}
    return query
  })
  const emit=jest.fn(),telemetry=new AuthorityTelemetry(()=>enabled,()=>context,{from} as any,emit)
  return {telemetry,emit,from}
}
const ledger=(delta=20)=>({id:7,transaction_id:3,account_id:user,amount:delta,balance_before:100,balance_after:100+delta,created_at:at,economy_transactions:{reason:'MATCH_SETTLEMENT',tier:'adept'}})

test.each([20,-20])('ledger produces exact committed balances for delta %s; excludes NPC/CREST by query',async(delta)=>{
  const h=harness({economy_ledger_entries:[ledger(delta)]});h.telemetry.ledger(3);await tick()
  expect(h.emit).toHaveBeenCalledTimes(1)
  expect(h.emit.mock.calls[0][2]).toEqual({transaction_id:'3',ledger_id:'7',delta,balance_before:100,balance_after:100+delta,flow:delta>0?'source':'sink',reason:'MATCH_SETTLEMENT',tier:'adept'})
  expect(h.emit.mock.calls[0][5]?.plan).toBe('PRO_PLUS')
  expect(JSON.stringify(h.emit.mock.calls)).not.toContain(user)
})
test('successful token rescue ledger emits reward, retry/replay preserves both IDs and original timestamp',async()=>{
  const row=ledger();row.economy_transactions.reason='AD_REWARD'
  const h=harness({economy_ledger_entries:[row]});h.telemetry.ledger(3);await tick();h.telemetry.ledger(3);await tick()
  expect(h.emit.mock.calls.map(c=>c[1])).toEqual(['token_balance_change','ad_reward','token_balance_change','ad_reward'])
  expect(h.emit.mock.calls[0][4]).toBe(h.emit.mock.calls[2][4]);expect(h.emit.mock.calls[1][4]).toBe(h.emit.mock.calls[3][4])
  expect(h.emit.mock.calls[1][2]).toMatchObject({placement:'TOKEN_RESCUE',reward_type:'token',quantity:20})
  expect(h.emit.mock.calls[0][3]).toBe(Date.parse(at))
})
test('SQL nested badge ledger resolves transaction by original idempotency key, not returned UI balance',async()=>{
  const h=harness({economy_transactions:{id:3},economy_ledger_entries:[ledger(-20)]});h.telemetry.ledgerKey('private-badge-key');await tick()
  expect(h.emit.mock.calls[0][2].balance_before).toBe(100)
})
test('item use requires persisted action receipt and shares the gameplay UUID; replay IDs stay stable',async()=>{
  const h=harness({tier_d_item_action_receipts:{item_key:'swap',created_at:at}})
  const action={userId:user,gameId:'existing-game-id',matchNumber:2,requestId:'secret-request'}
  h.telemetry.itemUse(action);await tick();h.telemetry.itemUse(action);await tick()
  expect(h.emit.mock.calls[0][2]).toMatchObject({item_type:'swap',quantity:1,tier:'tier_d',match_number:2,game_id:anonymousGameId('tier_d:existing-game-id')})
  expect(h.emit.mock.calls[0][4]).toBe(h.emit.mock.calls[1][4]);expect(JSON.stringify(h.emit.mock.calls)).not.toMatch(/secret-request|existing-game-id|account-secret/)
})
test('legacy bomb use requires successful persisted consumption',async()=>{
  const h=harness({tier_d_bomb_defuser_uses:{used_at:at}});h.telemetry.bombUse(user,'private-bomb');await tick()
  expect(h.emit.mock.calls[0][2]).toMatchObject({item_type:'bomb_defuser',quantity:1})
})
test('reserved/unclaimed level items produce nothing; claimed slots use receipt quantity and ad only on newly claimed slots',async()=>{
  const h=harness({tier_d_level_item_rewards:[{reward_slot:1,item_key:'shuffle',granted_quantity:2,claimed_at:at},{reward_slot:2,item_key:'freeze',granted_quantity:1,claimed_at:at}]})
  h.telemetry.level(user,10,[2]);await tick()
  expect(h.emit.mock.calls.map(c=>c[1])).toEqual(['item_reward','item_reward','ad_reward'])
  expect(h.emit.mock.calls[0][2]).toMatchObject({quantity:2,reward_source:'level_clear',level:10})
  expect(h.emit.mock.calls[2][2]).toMatchObject({reward_type:'freeze',quantity:1,placement:'TIER_D_LEVEL_CLEAR'})
  h.emit.mockClear();h.telemetry.level(user,10,[]);await tick();expect(h.emit.mock.calls.every(c=>c[1]==='item_reward')).toBe(true)
  const reserved=harness({tier_d_level_item_rewards:[]});reserved.telemetry.level(user,11,[1]);await tick();expect(reserved.emit).not.toHaveBeenCalled()
})
test.each(['runtimeAd','offer'] as const)('%s reads a successful claim receipt, emits item+ad rewards with stable identities',async(kind)=>{
  const table=kind==='runtimeAd'?'tier_d_runtime_item_ad_claims':'tier_d_item_offers'
  const h=harness({[table]:{item_key:'undo',claimed_at:at}});h.telemetry[kind](user,'private-claim');await tick();h.telemetry[kind](user,'private-claim');await tick()
  expect(h.emit.mock.calls.map(c=>c[1])).toEqual(['item_reward','ad_reward','item_reward','ad_reward'])
  expect(h.emit.mock.calls[0][4]).toBe(h.emit.mock.calls[2][4]);expect(h.emit.mock.calls[1][4]).toBe(h.emit.mock.calls[3][4])
  expect(h.emit.mock.calls[0][2].quantity).toBe(1)
})
test.each([true,false])('daily receipt ad_verified=%s controls ad telemetry, aggregates repeated item types and uses membership at claim',async(ad)=>{
  const h=harness({daily_streak_reward_claims:{item_rewards:[{itemKey:'swap',quantity:1},{itemKey:'swap',quantity:1}],token_amount:40,social_item:'rose',ad_verified:ad,membership_at_claim:'none',created_at:at}})
  h.telemetry.daily(user,'2026-10-03');await tick()
  expect(h.emit.mock.calls.filter(c=>c[1]==='item_reward')).toHaveLength(3)
  const ads=h.emit.mock.calls.filter(c=>c[1]==='ad_reward');expect(ads).toHaveLength(ad?2:0)
  if(ad){expect(ads.map(c=>c[2].quantity)).toEqual([2,40]);expect(ads[0][2].claim_id).toBe(ads[1][2].claim_id)}
  expect(h.emit.mock.calls[0][5]?.plan).toBe('FREE')
  expect(h.emit.mock.calls.some(c=>c[1]==='token_balance_change')).toBe(false) // direct daily SQL is not a ledger
})
test('legacy grants, league awards and tournament receipts use authoritative quantity/source',async()=>{
  const h=harness({tier_d_item_reward_grants:{quantity:2,granted_at:at},tier_d_league_awards:[{award_type:'medal',awarded_at:at},{award_type:'trophy',awarded_at:at}],tier_d_mini_tournament_rewards:{item_key:'freeze',awarded_at:at}})
  h.telemetry.legacyReward(user,'private-event','freeze',true);h.telemetry.league(user,'league-secret');h.telemetry.tournament(user,'tournament-secret');await tick()
  expect(h.emit.mock.calls.filter(c=>c[1]==='item_reward')).toHaveLength(4)
  expect(h.emit.mock.calls.find(c=>c[2].reward_source==='legacy_reward')?.[2].quantity).toBe(2)
  expect(h.emit.mock.calls.some(c=>c[2].reward_source==='tournament')).toBe(true)
})
test('disabled/missing context/missing receipt and invalid/frozen ledger data produce no events',async()=>{
  const off=harness({},false);off.telemetry.ledger(3);off.telemetry.runtimeAd(user,'id');await tick();expect(off.from).not.toHaveBeenCalled()
  const missing=new AuthorityTelemetry(()=>true,()=>undefined,{from:jest.fn()} as any,jest.fn());expect(()=>missing.offer(user,'id')).not.toThrow()
  const empty=harness({tier_d_item_action_receipts:null});empty.telemetry.itemUse({userId:user,gameId:'g',matchNumber:1,requestId:'r'});await tick();expect(empty.emit).not.toHaveBeenCalled()
  const bad=ledger();bad.balance_after=999;const frozen=ledger();frozen.economy_transactions.tier='sovereign'
  const invalid=harness({economy_ledger_entries:[bad,frozen]});invalid.telemetry.ledger(3);await tick();expect(invalid.emit).not.toHaveBeenCalled()
})
test('read/storage callback errors and delayed/unavailable telemetry never throw; read concurrency is bounded',async()=>{
  const db:any={from:()=>{throw new Error('DB offline')}};const emit=jest.fn()
  const brokenContext=new AuthorityTelemetry(()=>true,()=>{throw new Error('context unavailable')},db,emit)
  expect(()=>brokenContext.offer(user,'offer')).not.toThrow()
  const h=new AuthorityTelemetry(()=>true,()=>ctx,db,emit);expect(()=>h.ledger(3)).not.toThrow();await tick();expect(h.diagnostics.failed).toBe(1)
  const delayed:any={from:()=>{const q:any={select:()=>q,eq:()=>q,abortSignal:()=>new Promise(()=>{})};return q}}
  jest.useFakeTimers({doNotFake:['setImmediate']});const slow=new AuthorityTelemetry(()=>true,()=>ctx,delayed,emit)
  for(let i=0;i<20;i++)slow.ledger(i);expect(slow.diagnostics.dropped).toBe(4)
  await jest.advanceTimersByTimeAsync(5001);await tick();expect(slow.diagnostics.failed).toBe(16)
  const broken=harness({tier_d_runtime_item_ad_claims:{item_key:'swap',claimed_at:at}});broken.emit.mockImplementation(()=>{throw new Error('sink failed')});expect(()=>broken.telemetry.runtimeAd(user,'id')).not.toThrow();await tick()
})
test('server gameplay membership accepts only verified snapshots for the current session',()=>{
  const emit=jest.fn(),game=new ServerGameTelemetry(()=>true,emit);game.setContext(user,ctx)
  game.setMembership(user,'old-session',membershipSnapshot('vip_pro')!);expect(game.context(user)?.membership).toBeUndefined()
  game.setMembership(user,ctx.session_id,membershipSnapshot('vip')!);game.startSolo({tier:'adept',escrowId:'escrow',humanPlayerId:user,results:[]})
  expect(emit.mock.calls[0][0].membership.plan).toBe('PRO')
})
test('all producers conform to allowlists; migration retains canonical claim behavior except private metadata',async()=>{
  const h=harness({economy_ledger_entries:[ledger()],tier_d_runtime_item_ad_claims:{item_key:'swap',claimed_at:at}});h.telemetry.ledger(3);h.telemetry.runtimeAd(user,'id');await tick()
  for(const [context,name,properties,time,eventId,membership]of h.emit.mock.calls)expect(telemetryEventSchema.safeParse({...context,event_name:name,properties,occurred_at:new Date(time).toISOString(),event_id:eventId,schema_version:1,membership}).success).toBe(true)
  const sql=readFileSync(resolve(__dirname,'../../../supabase/migrations/090_telemetry_economy_receipts.sql'),'utf8')
  const old=readFileSync(resolve(__dirname,'../../../supabase/migrations/070_tier_d_every_level_claimed_rewards.sql'),'utf8')
  const body=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION public.claim_tier_d_level_reward'),s.indexOf('END; $$;',s.indexOf('CREATE OR REPLACE FUNCTION public.claim_tier_d_level_reward')))
  const stripped=body(sql).replace(/\n  telemetry_claimed_slots jsonb := '\[\]'::jsonb;/,'').replace(/\n      telemetry_claimed_slots := telemetry_claimed_slots \|\| jsonb_build_array\(reward.reward_slot\);/,'').replace(/,\n    '_telemetry_claimed_slots',telemetry_claimed_slots/,'')
  expect(stripped.replace(/\r/g,'')).toBe(body(old).replace(/\r/g,''))
  expect(sql).toContain("OR source='server'");expect(receiptUuid('one')).not.toBe(receiptUuid('two'))
})
