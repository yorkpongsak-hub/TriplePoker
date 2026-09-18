import type { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { claimTierDLevelAdBonus, claimTierDLevelReward, claimTierDRuntimeItemAd } from '../game/tierDRewardService'
import type { TierDRewardItem } from '../game/tierDRewards'
import { grantTierDSoloItemAd, reserveTierDSoloItemAd, restoreTierDSoloItemAd } from '../game/tierDSoloRuntime'
import { markRewardedAdCompleted } from '../game/adPolicyService'
import { adProvider } from '../game/adProvider'

/** Production fulfilment must be called only after provider verification. */
export async function tierDRewardRoutes(app: FastifyInstance) {
  // จดใบรับรางวัลชั่วคราวเพื่อไม่ให้การส่งคำขอซ้ำเพิ่มไอเทมอีกครั้ง
  const itemAdClaims=new Map<string,{item:TierDRewardItem;at:number}>()
  // A clear is settled before the client sees LEVEL CLEARED.  This endpoint is
  // the explicit claim step and also repairs an interrupted completion event.
  app.post<{ Body: { level?: number } }>('/tier-d/reward/claim', async (request, reply) => {
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token) return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user) return reply.status(401).send({error:'INVALID_TOKEN'})
    const level=request.body?.level
    if(typeof level!=='number'||!Number.isInteger(level)||level<1) return reply.status(400).send({error:'INVALID_LEVEL'})
    const { data: profile, error: profileError }=await supabaseAdmin.from('users').select('tier_d_solo_level,vip_status').eq('user_id',data.user.id).maybeSingle()
    if(profileError||!profile||profile.tier_d_solo_level<=level) return reply.status(409).send({error:'LEVEL_NOT_CLEARED'})
    if((profile.vip_status??'none')==='none') return reply.status(403).send({error:'AD_REQUIRED'})
    try {
      return reply.send(await claimTierDLevelReward(data.user.id,level))
    }
    catch (claimError) {
      const message=claimError instanceof Error?claimError.message:'REWARD_CLAIM_UNAVAILABLE'
      request.log.warn({err:claimError,level,userId:data.user.id},'Tier D level reward claim failed')
      return reply.status(409).send({error:`REWARD_CLAIM_UNAVAILABLE: ${message}`})
    }
  })

  app.post<{ Body: { level?: number; devMock?: boolean; googleTestEarned?: boolean } }>('/tier-d/reward/ad-complete', async (request, reply) => {
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token) return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user) return reply.status(401).send({error:'INVALID_TOKEN'})
    const level=request.body?.level
    if(typeof level!=='number'||!Number.isInteger(level)||level<1) return reply.status(400).send({error:'INVALID_LEVEL'})
    const { data: profile }=await supabaseAdmin.from('users').select('vip_status,tier_d_solo_level').eq('user_id',data.user.id).maybeSingle()
    if(!profile||profile.tier_d_solo_level<=level) return reply.status(409).send({error:'LEVEL_NOT_CLEARED'})
    if((profile.vip_status??'none')!=='none') return reply.status(403).send({error:'VIP_CLAIM_DIRECTLY'})
    // The mock is deliberately unavailable in production; wire an ad-provider
    // callback/attestation here before allowing real ad fulfilment.
    if(!await adProvider.verifyRewardedCompletion({devMock:request.body?.devMock,googleTestEarned:request.body?.googleTestEarned})) return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'})
    try { const reward=await claimTierDLevelAdBonus(data.user.id,level);await markRewardedAdCompleted(data.user.id).catch(()=>undefined);return reply.send(reward) }
    catch { return reply.status(409).send({error:'AD_BONUS_UNAVAILABLE'}) }
  })

  app.post<{ Body: { item?: TierDRewardItem; eventId?: string; devMock?: boolean; googleTestEarned?: boolean } }>('/tier-d/reward/item-ad-complete', async (request, reply) => {
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token) return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user) return reply.status(401).send({error:'INVALID_TOKEN'})
    const item=request.body?.item
    const eventId=request.body?.eventId
    if(!item||!['shuffle','swap','double_pile','freeze','auto_sort','undo'].includes(item)||typeof eventId!=='string') return reply.status(400).send({error:'INVALID_ITEM_AD_CLAIM'})
    if(!await adProvider.verifyRewardedCompletion({devMock:request.body?.devMock,googleTestEarned:request.body?.googleTestEarned})) return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'})
    const claimKey=`${data.user.id}:${eventId}`
    const previous=itemAdClaims.get(claimKey)
    if(previous) return reply.send({itemKey:previous.item,quantity:1,idempotent:true,matchOnly:false})
    const { data: profile }=await supabaseAdmin.from('users').select('vip_status').eq('user_id',data.user.id).maybeSingle()
    if((profile?.vip_status??'none')!=='none') return reply.status(403).send({error:'FREE_MEMBERS_ONLY'})
    if(!reserveTierDSoloItemAd(data.user.id,item)) return reply.status(409).send({error:'ITEM_AD_NOT_ELIGIBLE'})
    try {
      // This route is the explicit "selected item is empty" refill context.
      // Do not share the random-item reward pool: the reservation above pins the
      // requested item until the provider callback is verified and fulfilled.
      const persistedGrant=await claimTierDRuntimeItemAd(data.user.id,item,eventId)
      if(!grantTierDSoloItemAd(data.user.id,item)) throw new Error('MATCH_AD_GRANT_UNAVAILABLE')
      for(const [key,claim] of itemAdClaims)if(Date.now()-claim.at>86_400_000)itemAdClaims.delete(key)
      itemAdClaims.set(claimKey,{item:persistedGrant.itemKey,at:Date.now()})
      await markRewardedAdCompleted(data.user.id).catch(()=>undefined)
      return reply.send({itemKey:persistedGrant.itemKey,quantity:1,idempotent:persistedGrant.idempotent,matchOnly:false})
    }
    catch { restoreTierDSoloItemAd(data.user.id,item);return reply.status(409).send({error:'ITEM_AD_CLAIM_UNAVAILABLE'}) }
  })
}
