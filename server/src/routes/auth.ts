import { FastifyInstance } from 'fastify'
import { supabase, supabaseAdmin } from '../config/supabase'
import { validateDisplayName } from '../utils/nameValidator'

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

  // ตั้ง/เปลี่ยน display_name — validate ผ่าน 3-layer name protection ก่อนบันทึกลง users table
  app.post<{ Body: { displayName?: string } }>('/auth/register', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return reply.status(401).send({ error: 'Invalid token' })
    }

    const { displayName } = request.body ?? {}
    if (!displayName) {
      return reply.status(400).send({ error: 'INVALID_FORMAT', message: 'displayName is required.' })
    }

    const result = await validateDisplayName(displayName)
    if (!result.allowed) {
      return reply.status(400).send({ error: result.reason, message: result.message })
    }

    // ผ่านทุก layer แล้ว — บันทึกชื่อลง users table (row ถูกสร้างไว้แล้วตอน Supabase Auth signup)
    // ใช้ supabaseAdmin เพราะ RLS ของ public.users จำกัดแค่ auth.uid() = user_id — anon client เดิมมองไม่เห็นแถวเลย
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ display_name: displayName.trim() })
      .eq('user_id', authData.user.id)
      .select('user_id, display_name')
      .maybeSingle()

    if (updateError) {
      return reply.status(500).send({ error: 'DB_ERROR', message: 'Please try again.' })
    }
    if (!updated) {
      return reply.status(404).send({ error: 'USER_NOT_FOUND', message: 'User record not found. Please complete sign-in first.' })
    }

    return reply.send({ success: true, user: updated })
  })
}
