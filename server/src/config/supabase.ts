import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import ws from 'ws'

dotenv.config()

// สร้าง Supabase client พร้อม ws transport สำหรับ Node.js < 22
const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: ws as any,
  },
})

// ─── Admin client (service_role) — ใช้ฝั่ง server เท่านั้น ห้าม import เข้า client/ เด็ดขาด ───
// bypass RLS ทุก policy — ใช้เฉพาะจุดที่ server เขียน/อ่าน users table แทนผู้เล่นเอง (lock-up token,
// Monarch pity, Performance Score, display_name ฯลฯ) เพราะ RLS ของ public.users จำกัดไว้แค่
// auth.uid() = user_id ทำให้ anon key เดิมมองไม่เห็นแถวของ user คนอื่นเลย (แม้แต่ query ของ server เอง)
// RLS policies เองไม่ได้แก้ที่นี่ — จัดการฝั่ง Supabase dashboard เท่านั้น
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
