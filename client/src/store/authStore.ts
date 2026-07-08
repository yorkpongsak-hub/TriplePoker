// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts -- Auth State Management (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่: เก็บ session + user profile + display_name สำหรับ auth guard ทั่วทั้งแอป

import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, onAuthStateChange } from '../services/supabaseService'

interface UserProfile {
  user_id: string
  display_name: string | null
  vip_status: 'none' | 'vip' | 'vip_pro'
  avatar_url: string | null
  tier: string | null
  token_balance: number | null
  crown_balance: number | null
  xp: number | null
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
    if (!user) {
      set({ profile: null })
      return
    }
    try {
      const { data } = await supabase
        .from('users')
        .select('user_id, display_name, vip_status, avatar_url, tier, token_balance, crown_balance, xp')
        .eq('user_id', user.id)
        .maybeSingle()
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
