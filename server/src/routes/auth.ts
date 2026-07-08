import { FastifyInstance } from 'fastify'
import { supabase } from '../config/supabase'

export async function authRoutes(app: FastifyInstance) {

  // ทดสอบ connection
  app.get('/auth/health', async () => {
    return { status: 'ok', service: 'auth' }
  })

  // ดึงข้อมูล user จาก token
  app.get('/auth/me', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    return { user: data.user }
  })
}
