import type { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'
import { claimTierDLevelAdBonus } from '../game/tierDRewardService'

/** Production fulfilment must be called only after provider verification. */
export async function tierDRewardRoutes(app: FastifyInstance) {
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
}
