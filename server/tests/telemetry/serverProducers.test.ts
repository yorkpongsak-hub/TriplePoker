jest.mock('../../src/config/supabase',()=>({supabaseAdmin:{rpc:jest.fn(async()=>({error:null}))}}))
import { ServerGameTelemetry } from '../../src/telemetry/gameplay'
import { telemetryEventSchema } from '../../src/telemetry/schema'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const context={player_id:'00000000-0000-4000-8000-000000000001',session_id:'00000000-0000-4000-8000-000000000002',app_version:'1.0.0',platform:'android' as const}
function harness(enabled=true){let now=Date.now();const emit=jest.fn();const telemetry=new ServerGameTelemetry(()=>enabled,emit,()=>now);telemetry.setContext('human',context);return{telemetry,emit,advance:(ms:number)=>{now+=ms}}}
const rounds=[{pile1Winner:'human',pile2Winner:'human',pile3Winner:'human'},{pile1Winner:'bot',pile2Winner:'human',pile3Winner:'bot'}]
test.each(['initiate','adept','mastermind','highNoble'])('%s solo producer uses engine winner, one full-game end and no economy/hand values',tier=>{
  const h=harness();const state={tier,escrowId:`escrow-${tier}`,humanPlayerId:'human',results:rounds,tokenBalance:{human:9999},cards:['secret']}
  h.telemetry.startSolo(state);h.telemetry.startSolo(state);h.advance(2000);h.telemetry.endSolo(state,'human');h.telemetry.endSolo(state,'human')
  expect(h.emit.mock.calls.map(call=>call[1])).toEqual(['game_start','game_end','first_game_complete'])
  expect(h.emit.mock.calls[1][2]).toMatchObject({tier,mode:'solo',human_count:1,bot_count:3,outcome:'win',score:4,score_kind:'pile_wins',duration_ms:2000,triple_sweep:true})
  expect(JSON.stringify(h.emit.mock.calls)).not.toMatch(/9999|secret|escrow-/)
})
test('Adept multiplayer emits one player result per originally seated human, including loss',()=>{
  const h=harness();h.telemetry.setContext('human2',{...context,player_id:'00000000-0000-4000-8000-000000000003'})
  const state={tier:'adept' as const,escrowIds:{human:'one',human2:'two'},humanPlayerIds:['human','human2'],aiPlayerIds:['bot','bot2'],results:rounds}
  h.telemetry.startMulti(state);h.telemetry.endMulti(state,'human');h.telemetry.endMulti(state,'human')
  const ends=h.emit.mock.calls.filter(c=>c[1]==='game_end');expect(ends).toHaveLength(2)
  expect(ends.map(c=>c[2].outcome)).toEqual(['win','loss']);expect(ends[0][2].game_id).toBe(ends[1][2].game_id)
  expect(ends[1][2]).toMatchObject({human_count:2,bot_count:2,score:0})
})
test('High Noble captures initial seats and rejects deferred Monarch encounters',()=>{
  const h=harness();const state={escrowIds:{human:'hn'},seats:[{id:'human',isHuman:true},{id:'bot',isHuman:false},{id:'bot2',isHuman:false},{id:'bot3',isHuman:false}],results:rounds}
  h.telemetry.startHighNoble(state);state.seats[0].isHuman=false;h.telemetry.endHighNoble(state,'bot');h.telemetry.endHighNoble(state,'bot')
  expect(h.emit.mock.calls.filter(c=>c[1]==='game_end')).toHaveLength(1)
  expect(h.emit.mock.calls[1][2]).toMatchObject({mode:'solo',tier:'highNoble',human_count:1,bot_count:3,outcome:'loss'})
  const frozen={...state,seats:state.seats.map(seat=>({...seat,isMonarch:true}))};h.telemetry.startHighNoble(frozen);h.telemetry.endHighNoble(frozen,'human');expect(h.emit).toHaveBeenCalledTimes(3)
})
test.each([false,true])('Tier D level attempt (duel=%s) is one game across its internal rounds',duel=>{
  const h=harness();const state={gameId:'stable-attempt',userId:'human',levelStartedAt:Date.now(),state:{level:duel?1001:20,duel:duel?{}:undefined,seats:[{isBot:false},{isBot:true},{isBot:true},{isBot:true}]},cumulativeScores:{human:17}}
  h.telemetry.startTierD(state);h.advance(4500);h.telemetry.endTierD(state,true,12,true);h.telemetry.endTierD(state,true,12,true)
  expect(h.emit.mock.calls.filter(c=>c[1]==='game_end')).toHaveLength(1)
  expect(h.emit.mock.calls[1][2]).toMatchObject({mode:duel?'tier_d_duel':'tier_d_solo',tier:'tier_d',level:duel?1001:20,outcome:'win',score:17,opponent_score:12,open_challenge_passed:true})
})
test('restoring Tier D reuses game identity; database lifecycle uniqueness dedups reconstructed objects',()=>{
  const h=harness();const state={gameId:'same-attempt',userId:'human',levelStartedAt:Date.now(),state:{level:1,seats:[{isBot:false},{isBot:true}]},cumulativeScores:{human:2}}
  h.telemetry.startTierD(state);const restored={...state};h.telemetry.startTierD(restored)
  expect(h.emit.mock.calls[0][2].game_id).toBe(h.emit.mock.calls[1][2].game_id)
})
test('missing/late/invalid context never blocks games; valid late metadata recovers original start time',()=>{
  const h=harness();const state={tier:'initiate',escrowId:'late',humanPlayerId:'other',results:rounds}
  h.telemetry.setContext('other',{...context,email:'secret'});h.telemetry.startSolo(state);expect(h.emit).not.toHaveBeenCalled()
  h.advance(800);h.telemetry.setContext('other',context);h.telemetry.endSolo(state,'bot')
  expect(h.emit.mock.calls.map(c=>c[1])).toEqual(['game_start','game_end','first_game_complete']);expect(h.emit.mock.calls[1][2].duration_ms).toBe(800)
})
test('disabled/frozen/error paths emit nothing or swallow telemetry failure',()=>{
  const h=harness(false);const state={tier:'initiate',escrowId:'one',humanPlayerId:'human',results:rounds};h.telemetry.startSolo(state);h.telemetry.endSolo(state,'human');expect(h.emit).not.toHaveBeenCalled()
  const frozen=harness();for(const tier of ['arena','sovereign','monarch','lastBoss']){const s={...state,tier};frozen.telemetry.startSolo(s);frozen.telemetry.endSolo(s,'human')}expect(frozen.emit).not.toHaveBeenCalled()
  const broken=new ServerGameTelemetry(()=>true,()=>{throw new Error('telemetry unavailable')});broken.setContext('human',context)
  expect(()=>broken.startSolo(state)).not.toThrow();expect(()=>broken.endSolo(state,'human')).not.toThrow()
})
test('server producers conform to schema; gameplay hook sites cover every completion path without client online result producers',()=>{
  const h=harness();const state={tier:'initiate',escrowId:'check',humanPlayerId:'human',results:rounds};h.telemetry.startSolo(state);h.telemetry.endSolo(state,'human')
  for(const [ctx,name,properties,time]of h.emit.mock.calls)expect(telemetryEventSchema.safeParse({...ctx,event_name:name,properties,occurred_at:new Date(time).toISOString(),schema_version:1,event_id:context.player_id}).success).toBe(true)
  const loop=readFileSync(resolve(__dirname,'../../src/game/gameLoop.ts'),'utf8')
  expect(loop.match(/gameTelemetry\.endSolo\(state,finalWinner\)/g)).toHaveLength(2)
  expect(loop).toContain('gameTelemetry.startMulti(state)');expect(loop).toContain('gameTelemetry.endMulti(state,finalWinner)')
  const hn=readFileSync(resolve(__dirname,'../../src/game/highNobleMultiEngine.ts'),'utf8');expect(hn).toContain('gameTelemetry.startHighNoble(state)');expect(hn).toContain('gameTelemetry.endHighNoble(state,finalWinner)')
  const d=readFileSync(resolve(__dirname,'../../src/game/tierDSoloRuntime.ts'),'utf8');expect(d.match(/gameTelemetry\.startTierD\(s\)/g)).toHaveLength(2);expect(d.match(/gameTelemetry\.endTierD\(/g)).toHaveLength(1)
  for(const tier of ['tier-d','initiate','adept','mastermind','highNoble']){const client=readFileSync(resolve(__dirname,`../../../client/app/game/${tier}/index.tsx`),'utf8');expect(client).not.toMatch(/trainingEnd|event_name:\s*['"]game_end/)}
})
