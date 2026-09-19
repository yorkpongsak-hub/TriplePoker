import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { adProvider } from '../game/adProvider'
import { claimTierDItemOffer, dismissTierDItemOffer, getOrCreateTierDItemOffer } from '../game/tierDItemOfferService'
import { markRewardedAdCompleted } from '../game/adPolicyService'

async function userIdFrom(request: any) { const token=request.headers.authorization?.replace('Bearer ',''); if(!token)return undefined; const {data,error}=await supabase.auth.getUser(token); return error?undefined:data.user?.id }
export async function tierDItemOfferRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { placement?: string } }>('/tier-d/item-offer', async (request, reply) => {
    const userId=await userIdFrom(request);if(!userId)return reply.status(401).send({error:'UNAUTHORIZED'})
    try{return reply.send({offer:await getOrCreateTierDItemOffer(userId,request.query.placement?.slice(0,64)||'SAFE_SCREEN')})}catch{return reply.status(503).send({error:'OFFER_UNAVAILABLE'})}
  })
  app.post<{ Body: { offerId?: string } }>('/tier-d/item-offer/dismiss', async (request, reply) => {
    const userId=await userIdFrom(request);if(!userId)return reply.status(401).send({error:'UNAUTHORIZED'});if(!request.body?.offerId)return reply.status(400).send({error:'INVALID_OFFER'})
    try{await dismissTierDItemOffer(userId,request.body.offerId);return reply.send({ok:true})}catch{return reply.status(409).send({error:'OFFER_UNAVAILABLE'})}
  })
  app.post<{ Body: { offerId?: string; eventId?: string; devMock?: boolean; googleTestEarned?: boolean } }>('/tier-d/item-offer/claim', async (request, reply) => {
    const userId=await userIdFrom(request);if(!userId)return reply.status(401).send({error:'UNAUTHORIZED'});const {offerId,eventId}=request.body??{};if(!offerId||!eventId)return reply.status(400).send({error:'INVALID_OFFER_CLAIM'})
    if(!await adProvider.verifyRewardedCompletion({devMock:request.body?.devMock,googleTestEarned:request.body?.googleTestEarned}))return reply.status(503).send({error:'AD_PROVIDER_UNAVAILABLE'})
    try{const reward=await claimTierDItemOffer(userId,offerId,eventId);await markRewardedAdCompleted(userId).catch(()=>undefined);return reply.send(reward)}catch{return reply.status(409).send({error:'OFFER_CLAIM_UNAVAILABLE'})}
  })
}
