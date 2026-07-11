import { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'

const VALID_TIERS = ['initiate', 'adept', 'mastermind', 'high_noble', 'last_boss'] as const

export async function profileRoutes(app: FastifyInstance) {

  // Lobby Matchmaking Spec v1.0 §1.3 — บันทึกว่าผู้เล่นเคยเห็น Tier Unlock Celebration ของ tier นี้แล้ว
  // (กัน replay ซ้ำเมื่อเปลี่ยนเครื่อง — เก็บใน Supabase ไม่ใช่ AsyncStorage)
  app.post<{ Body: { tier?: string } }>('/profile/celebrate-tier', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    const { tier } = request.body ?? {}
    if (!tier || !VALID_TIERS.includes(tier as any)) {
      return reply.status(400).send({ error: 'INVALID_TIER', message: 'tier must be one of: ' + VALID_TIERS.join(', ') })
    }

    const { data: userData, error: readError } = await supabase
      .from('users')
      .select('tier_unlock_celebrated')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    if (readError) {
      return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
    }
    if (!userData) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User record not found.' })
    }

    const current: string[] = userData.tier_unlock_celebrated ?? []
    const updated = current.includes(tier) ? current : [...current, tier]

    if (updated.length !== current.length) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ tier_unlock_celebrated: updated })
        .eq('user_id', authData.user.id)

      if (updateError) {
        return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
      }
    }

    return reply.send({ success: true, tierUnlockCelebrated: updated })
  })
}
