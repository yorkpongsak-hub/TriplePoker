import type { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { claimTierDLevelAdBonus, getTierDLevelReward } from '../game/tierDRewardService'
import type { TierDRewardItem } from '../game/tierDRewards'
import { grantTierDSoloItemAd, reserveTierDSoloItemAd, restoreTierDSoloItemAd } from '../game/tierDSoloRuntime'

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
    try {
      const reward=await getTierDLevelReward(data.user.id,level,(profile.vip_status??'none')!=='none')
      return reward?reply.send(reward):reply.status(409).send({error:'REWARD_NOT_AVAILABLE'})
    }
    catch (claimError) {
      const message=claimError instanceof Error?claimError.message:'REWARD_CLAIM_UNAVAILABLE'
      request.log.warn({err:claimError,level,userId:data.user.id},'Tier D level reward claim failed')
      return reply.status(409).send({error:`REWARD_CLAIM_UNAVAILABLE: ${message}`})
    }
  })

  app.post<{ Body: { level?: number; devMock?: boolean } }>('/tier-d/reward/ad-complete', async (request, reply) => {
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token) return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user) return reply.status(401).send({error:'INVALID_TOKEN'})
    const level=request.body?.level
    if(typeof level!=='number'||!Number.isInteger(level)||level<1) return reply.status(400).send({error:'INVALID_LEVEL'})
    // The mock is deliberately unavailable in production; wire an ad-provider
    // callback/attestation here before allowing real ad fulfilment.
    if(process.env.NODE_ENV==='production'||request.body?.devMock!==true) return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'})
    try { return reply.send(await claimTierDLevelAdBonus(data.user.id,level)) }
    catch { return reply.status(409).send({error:'AD_BONUS_UNAVAILABLE'}) }
  })

  app.post<{ Body: { item?: TierDRewardItem; eventId?: string; devMock?: boolean } }>('/tier-d/reward/item-ad-complete', async (request, reply) => {
    const token=request.headers.authorization?.replace('Bearer ','')
    if(!token) return reply.status(401).send({error:'UNAUTHORIZED'})
    const {data,error}=await supabase.auth.getUser(token)
    if(error||!data.user) return reply.status(401).send({error:'INVALID_TOKEN'})
    const item=request.body?.item
    const eventId=request.body?.eventId
    if(!item||!['shuffle','swap','double_pile','freeze','undo'].includes(item)||typeof eventId!=='string') return reply.status(400).send({error:'INVALID_ITEM_AD_CLAIM'})
    if(process.env.NODE_ENV==='production'||request.body?.devMock!==true) return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'})
    const claimKey=`${data.user.id}:${eventId}`
    const previous=itemAdClaims.get(claimKey)
    if(previous) return previous.item===item?reply.send({itemKey:item,quantity:1,idempotent:true,matchOnly:true}):reply.status(409).send({error:'ITEM_AD_CLAIM_MISMATCH'})
    const { data: profile }=await supabaseAdmin.from('users').select('vip_status').eq('user_id',data.user.id).maybeSingle()
    if((profile?.vip_status??'none')!=='none') return reply.status(403).send({error:'FREE_MEMBERS_ONLY'})
    if(!reserveTierDSoloItemAd(data.user.id,item)) return reply.status(409).send({error:'ITEM_AD_NOT_ELIGIBLE'})
    // Replace devMock with a provider receipt/attestation check in production.
    if(process.env.NODE_ENV==='production'||request.body?.devMock!==true) { restoreTierDSoloItemAd(data.user.id,item);return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'}) }
    try {
      if(!grantTierDSoloItemAd(data.user.id,item)) throw new Error('MATCH_AD_GRANT_UNAVAILABLE')
      for(const [key,claim] of itemAdClaims)if(Date.now()-claim.at>86_400_000)itemAdClaims.delete(key)
      itemAdClaims.set(claimKey,{item,at:Date.now()})
      return reply.send({itemKey:item,quantity:1,idempotent:false,matchOnly:true})
    }
    catch { restoreTierDSoloItemAd(data.user.id,item);return reply.status(409).send({error:'ITEM_AD_CLAIM_UNAVAILABLE'}) }
  })
}
