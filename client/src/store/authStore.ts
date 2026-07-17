// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts -- Auth State Management (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่: เก็บ session + user profile + display_name สำหรับ auth guard ทั่วทั้งแอป

import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, onAuthStateChange } from '../services/supabaseService'

interface UserProfile {
  profile_image_url?: string | null; // รูปโปรไฟล์จริง (VIP) — แยกจาก avatar_url (emoji)
  user_id: string
  display_name: string | null
  vip_status: 'none' | 'vip' | 'vip_pro'
  avatar_url: string | null
  tier: string | null
  token_balance: number | null
  crown_balance: number | null
  xp: number | null
  performance_score: number | null    // Monarch_Spec_v1_3 §4 — Career PS (lifetime, ห้ามรีเซ็ต) active ตั้งแต่ Tier A+ ขึ้นไป
  ps_season: number | null            // Monarch_Spec_v1_3 §4.2 — Season PS (เกณฑ์แข่งขัน/Ascendant Star, รีเซ็ตตาม tournament)
  monarch_victories: number | null    // Monarch_Spec_v1_3 §3/§5 — Badge "Monarch Slayer" (>=1) + เงื่อนไข Ascendant Gate
  tier_unlock_celebrated: string[] | null  // LobbyMatchmaking_Spec_v1_0 §1.3 — Tier ที่เคยแสดง Unlock Celebration แล้ว
  streak_count: number | null         // matchStatsService.ts อัปเดตทุกจบแมตช์ (Asia/Bangkok) — ยืนยันแล้วว่าคอลัมน์มีจริงบน live DB
}

interface AuthState {
  // state
  session: Session | null
  user: User | null
  profile: UserProfile | null
  isLoading: boolean       // true = กำลัง init/เช็ค session ครั้งแรก
  isInitialized: boolean   // true = เช็คเสร็จแล้ว พร้อม render UI

  // actions
  initAuth: () => Promise<void>
  setSession: (session: Session | null) => Promise<void>
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  // เรียกตอน app boot ครั้งเดียวใน root _layout.tsx
  initAuth: async () => {
    try {
      const { data } = await supabase.auth.getSession()
      await get().setSession(data.session)

      // subscribe ทุก auth state change (login/logout/token refresh)
      onAuthStateChange(async (_event, session) => {
        await get().setSession(session as Session | null)
      })
    } catch (e) {
      console.error('[authStore] initAuth failed:', e)
    } finally {
      set({ isLoading: false, isInitialized: true })
    }
  },

  // ตั้ง session + ดึง profile (display_name) จาก DB
  setSession: async (session) => {
    set({ session, user: session?.user ?? null })
    if (session?.user) {
      await get().refreshProfile()
    } else {
      set({ profile: null })
    }
  },

  // ดึง profile จาก table users
  refreshProfile: async () => {
    const user = get().user
    console.log('[authStore] refreshProfile called, get().user =', user?.id ?? null)
    if (!user) {
      console.log('[authStore] refreshProfile: no user in store, bailing with profile=null')
      set({ profile: null })
      return
    }
    try {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, display_name, vip_status, avatar_url, tier, token_balance, crown_balance, xp, performance_score, ps_season, monarch_victories, tier_unlock_celebrated, streak_count')
        .eq('user_id', user.id)
        .maybeSingle()
      console.log('[authStore] refreshProfile query result:', { data, error, queriedUserId: user.id })
      set({ profile: data as UserProfile | null })
    } catch (e) {
      console.error('[authStore] refreshProfile failed:', e)
      set({ profile: null })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null })
  },
}))
