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
