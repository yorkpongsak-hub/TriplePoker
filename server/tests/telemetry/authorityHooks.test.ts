const mockRpc=jest.fn()
const mockVerified=jest.fn(async()=>true)
const mockObserve={ledger:jest.fn(),ledgerKey:jest.fn(),level:jest.fn(),legacyReward:jest.fn(),league:jest.fn(),runtimeAd:jest.fn(),offer:jest.fn(),itemUse:jest.fn(),bombUse:jest.fn(),daily:jest.fn()}
jest.mock('../../src/config/supabase',()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:'account-id'}}})}},supabaseAdmin:{rpc:mockRpc,from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{vip_status:'none',streak_count:2}})};return q}}}))
jest.mock('../../src/game/adProvider',()=>({adProvider:{verifyRewardedCompletion:mockVerified}}))
jest.mock('../../src/game/adPolicyService',()=>({markRewardedAdCompleted:async()=>{}}))
jest.mock('../../src/telemetry/authority',()=>({authorityTelemetry:mockObserve}))
import { SupabaseEconomyGateway } from '../../src/economy/economyService'
import { commitTierDItem } from '../../src/game/tierDItemPersistence'
import { claimTierDLevelReward, claimTierDLevelAdBonus, claimTierDRuntimeItemAd, grantTierDLevelRandomItem, grantTierDLeagueAwards, fulfillTierDItemReward } from '../../src/game/tierDRewardService'
import { claimTierDItemOffer } from '../../src/game/tierDItemOfferService'
import { consumeTierDBombDefuser } from '../../src/game/tierDBombService'
import { dailyStreakRoutes } from '../../src/routes/dailyStreak'
import Fastify from 'fastify'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const user='account-id',reward={items:[{itemKey:'shuffle',quantity:1}],adBonusQuantity:0,canWatchAd:false,idempotent:true}
beforeEach(()=>{jest.clearAllMocks();mockRpc.mockResolvedValue({data:reward,error:null});mockVerified.mockResolvedValue(true)})
test('real ledger gateway observes only RPC success, including idempotent replay; never from proposed entries',async()=>{
  const gateway=new SupabaseEconomyGateway(),input:any={idempotencyKey:'existing',type:'MINT',reason:'AD_REWARD',entries:[]}
  mockRpc.mockResolvedValueOnce({data:[{transaction_id:7,replayed:false}],error:null}).mockResolvedValueOnce({data:{transaction_id:7,replayed:true},error:null}).mockResolvedValueOnce({error:{message:'failed'}})
  expect(await gateway.apply(input)).toEqual({transactionId:7,replayed:false});expect(await gateway.apply(input)).toEqual({transactionId:7,replayed:true})
  await expect(gateway.apply(input)).rejects.toThrow('failed');expect(mockObserve.ledger.mock.calls).toEqual([[7],[7]])
})
test('real item commit only observes accepted receipt; rejected/errors preserve existing failure behavior',async()=>{
  const input:any={userId:user,roomId:'room',item:'swap',requestId:'request',persistent:true,expectedRevision:1,snapshot:{gameId:'game',matchNumber:2}}
  mockRpc.mockResolvedValueOnce({data:true}).mockResolvedValueOnce({data:false}).mockResolvedValueOnce({error:new Error('failed')})
  await expect(commitTierDItem(input)).resolves.toBeUndefined();await expect(commitTierDItem(input)).rejects.toThrow('rejected');await expect(commitTierDItem(input)).rejects.toThrow('failed')
  expect(mockObserve.itemUse).toHaveBeenCalledTimes(1);expect(mockObserve.itemUse).toHaveBeenCalledWith({userId:user,gameId:'game',matchNumber:2,requestId:'request'})
})
test('level reservation emits nothing; claims retain public response and ad receives only committed new slots',async()=>{
  await grantTierDLevelRandomItem(user,10,false);expect(mockObserve.level).not.toHaveBeenCalled()
  mockRpc.mockResolvedValue({data:{...reward,_telemetry_claimed_slots:[1,2]}})
  expect(await claimTierDLevelReward(user,10)).toEqual(reward);expect(await claimTierDLevelAdBonus(user,10)).toEqual(reward)
  expect(mockObserve.level.mock.calls).toEqual([[user,10],[user,10,[1,2]]])
  mockRpc.mockResolvedValue({data:{...reward,_telemetry_claimed_slots:[]}});await claimTierDLevelAdBonus(user,10);expect(mockObserve.level).toHaveBeenLastCalledWith(user,10,[])
})
test('refill, offer, legacy grant and league producers follow successful receipts and retain authoritative return data',async()=>{
  mockRpc.mockResolvedValue({data:{itemKey:'swap',quantity:1,idempotent:true}})
  expect(await claimTierDRuntimeItemAd(user,'freeze','claim')).toEqual({itemKey:'swap',quantity:1,idempotent:true});expect(mockObserve.runtimeAd).toHaveBeenCalledWith(user,'claim')
  mockRpc.mockResolvedValue({data:[{item_key:'undo',quantity:1,idempotent:true}]});expect(await claimTierDItemOffer(user,'offer','claim')).toEqual({itemKey:'undo',quantity:1,idempotent:true});expect(mockObserve.offer).toHaveBeenCalledWith(user,'offer')
  await grantTierDLeagueAwards(user,'league');expect(mockObserve.league).toHaveBeenCalledWith(user,'league')
  mockRpc.mockResolvedValue({data:{itemKey:'freeze',quantity:2,idempotent:false}})
  await fulfillTierDItemReward({userId:user,eventId:'event',item:'freeze',mode:'ad',adCompleted:true,isNoAdsMember:false});expect(mockObserve.legacyReward).toHaveBeenLastCalledWith(user,'event','freeze',true)
  mockRpc.mockResolvedValue({data:{itemKey:'freeze',quantity:2,idempotent:true}})
  await fulfillTierDItemReward({userId:user,eventId:'event',item:'freeze',mode:'ad',adCompleted:true,isNoAdsMember:false});expect(mockObserve.legacyReward).toHaveBeenLastCalledWith(user,'event','freeze',false)
  await fulfillTierDItemReward({userId:user,eventId:'event',item:'freeze',mode:'ad',adCompleted:true,isNoAdsMember:true});expect(mockObserve.legacyReward).toHaveBeenLastCalledWith(user,'event','freeze',false)
})
test('RPC failures never emit reward/ad telemetry; successful bomb consumption only',async()=>{
  mockRpc.mockResolvedValue({error:new Error('failed')})
  for(const work of [()=>claimTierDLevelReward(user,10),()=>claimTierDLevelAdBonus(user,10),()=>claimTierDRuntimeItemAd(user,'swap','claim'),()=>claimTierDItemOffer(user,'offer','claim'),()=>grantTierDLeagueAwards(user,'league'),()=>fulfillTierDItemReward({userId:user,eventId:'event',item:'freeze',mode:'ad',adCompleted:true,isNoAdsMember:false})])await expect(work()).rejects.toThrow('failed')
  for(const mock of Object.values(mockObserve))expect(mock).not.toHaveBeenCalled()
  mockRpc.mockResolvedValueOnce({data:false}).mockResolvedValueOnce({data:true});expect(await consumeTierDBombDefuser(user,'bomb')).toBe(false);expect(await consumeTierDBombDefuser(user,'bomb')).toBe(true);expect(mockObserve.bombUse).toHaveBeenCalledTimes(1)
})
test('actual daily claim route emits after committed claim, and emits nothing for unverified ads or failed claims',async()=>{
  const app=Fastify();await app.register(dailyStreakRoutes)
  let release:(result:unknown)=>void=()=>{}
  let entered:()=>void=()=>{}
  const started=new Promise<void>(done=>{entered=done})
  mockRpc.mockImplementationOnce(()=>new Promise(done=>{release=done;entered()}))
  const response=app.inject({method:'POST',url:'/daily-streak/claim',headers:{authorization:'Bearer token'},payload:{devMock:true}}).then(value=>value)
  try {
    await started;expect(mockObserve.daily).not.toHaveBeenCalled()
    release({data:{items:[],idempotent:false},error:null});expect((await response).statusCode).toBe(200)
    expect(mockObserve.daily).toHaveBeenCalledTimes(1)
    mockObserve.daily.mockClear();mockRpc.mockResolvedValueOnce({error:{message:'NOT_ELIGIBLE'}})
    expect((await app.inject({method:'POST',url:'/daily-streak/claim',headers:{authorization:'Bearer token'}})).statusCode).toBe(409)
    mockVerified.mockResolvedValue(false);expect((await app.inject({method:'POST',url:'/daily-streak/claim',headers:{authorization:'Bearer token'}})).statusCode).toBe(503)
    expect(mockObserve.daily).not.toHaveBeenCalled()
  } finally {await app.close()}
})
test('remaining hooks observe successful atomic badge/tournament operations and existing profile only',()=>{
  const badge=readFileSync(resolve(__dirname,'../../src/game/badgeUnlockService.ts'),'utf8')
  expect(badge).toContain('if (!error) { authorityTelemetry.ledgerKey(`BADGE_PURCHASE:${userId}:${badgeKey}`)')
  const tournament=readFileSync(resolve(__dirname,'../../src/game/tierDMiniTournamentService.ts'),'utf8')
  expect(tournament.indexOf('authorityTelemetry.tournament')).toBeGreaterThan(tournament.indexOf("rpc('award_tier_d_personal_tournament'"))
  const root=readFileSync(resolve(__dirname,'../../../client/app/_layout.tsx'),'utf8')
  expect(root).toContain('s.profile?.vip_status');expect(root).toContain('launchTelemetry.membershipStatus(telemetryVipStatus)')
  const socket=readFileSync(resolve(__dirname,'../../src/sockets/gameSocket.ts'),'utf8')
  expect(socket).toContain('authorityTelemetry.refreshMembership(socket.data.authUserId)')
})
