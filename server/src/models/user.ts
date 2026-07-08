// User model — ตรงกับ DB Schema ใน Supabase
export interface User {
  id: string
  display_name: string
  avatar_url: string | null
  provider: 'google' | 'facebook'
  token_balance: number
  subscription: 'free' | 'vip'
  level: number
  xp: number
  streak_count: number
  streak_shield: number
  last_login_at: string
  created_at: string
}

// User ที่ส่งกลับให้ client (ไม่มีข้อมูล sensitive)
export interface PublicUser {
  id: string
  display_name: string
  avatar_url: string | null
  token_balance: number
  subscription: 'free' | 'vip'
  level: number
}
