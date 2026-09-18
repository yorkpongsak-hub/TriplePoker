import { sendTierDItemRequest, type TierDItemRequest } from '../../../client/src/game/tierDItemRequest'
import { tierDOwnerRegistrar } from '../../src/sockets/tierDOwnerGuard'
const payload:TierDItemRequest={roomId:'tier-d-p',playerId:'p',item:'auto_sort',gameId:'g',matchNumber:1,dealRevision:0,requestId:'request-1'}
test('lost ACK retries the identical action and settles once',async()=>{
  let tries=0
  const emit=jest.fn((_event:string,request:TierDItemRequest,ack:(err:Error|null,ok?:boolean)=>void)=>{
    expect(request).toBe(payload);tries++
    ack(tries===1?new Error('timeout'):null,true)
  })
  expect(await sendTierDItemRequest({timeout:()=>({emit})},payload)).toBe(true)
  expect(emit).toHaveBeenCalledTimes(2)
})
test('rejection does not retry and repeated timeouts fail for explicit recovery',async()=>{
  const rejected=jest.fn((_e:string,_p:TierDItemRequest,ack:(err:Error|null,ok?:boolean)=>void)=>ack(null,false))
  expect(await sendTierDItemRequest({timeout:()=>({emit:rejected})},payload)).toBe(false)
  expect(rejected).toHaveBeenCalledTimes(1)
  const timeout=jest.fn((_e:string,_p:TierDItemRequest,ack:(err:Error|null,ok?:boolean)=>void)=>ack(new Error('timeout')))
  await expect(sendTierDItemRequest({timeout:()=>({emit:timeout})},payload)).rejects.toThrow('timeout')
  expect(timeout).toHaveBeenCalledTimes(2)
})
test('socket identity protects room joins and mutations against forged player/room',async()=>{
  const handlers:Record<string,Function>={}
  const socket:any={handshake:{auth:{accessToken:'signed-token'}},on:(event:string,handler:Function)=>{handlers[event]=handler},emit:jest.fn()}
  const verify=jest.fn(async()=> 'p')
  const register=tierDOwnerRegistrar(socket,verify),handler=jest.fn()
  register('tier_d_start',handler);register('tier_d_item_use',handler)
  const ack=jest.fn()
  await handlers.tier_d_start({...payload,playerId:'other'},ack)
  await handlers.tier_d_item_use({...payload,roomId:'tier-d-other'},ack)
  expect(handler).not.toHaveBeenCalled();expect(ack).toHaveBeenCalledWith(false)
  await handlers.tier_d_item_use(payload,ack)
  expect(handler).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledTimes(1)
})
