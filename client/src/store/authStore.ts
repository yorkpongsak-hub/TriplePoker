// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts -- Auth State Management (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่: เก็บ session + user profile + display_name สำหรับ auth guard ทั่วทั้งแอป

import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, onAuthStateChange } from '../services/supabaseService'
import { useUserStore } from './userStore'

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
  last_login: string | null
  performance_score: number | null    // Monarch_Spec_v1_3 §4 — Career PS (lifetime, ห้ามรีเซ็ต) active ตั้งแต่ Tier A+ ขึ้นไป
  ps_season: number | null            // Monarch_Spec_v1_3 §4.2 — Season PS (เกณฑ์แข่งขัน/Ascendant Star, รีเซ็ตตาม tournament)
  monarch_victories: number | null    // Monarch_Spec_v1_3 §3/§5 — Badge "Monarch Slayer" (>=1) + เงื่อนไข Ascendant Gate
  tier_unlock_celebrated: string[] | null  // LobbyMatchmaking_Spec_v1_0 §1.3 — Tier ที่เคยแสดง Unlock Celebration แล้ว
  beyond_path?: 'CAELUM' | 'SOREN' | 'MONARCH' | null
  streak_count: number | null         // matchStatsService.ts อัปเดตทุกจบแมตช์ (Asia/Bangkok) — ยืนยันแล้วว่าคอลัมน์มีจริงบน live DB
  best_streak_count: number | null
  streak_shields: number | null
  streak_7days_badge: boolean | null
  games_played: number | null         // matchStatsService.ts — นับทุกแมตช์ที่จบครบ totalRounds
  games_won: number | null            // เกณฑ์: finalWinner === humanPlayerId (อันดับ 1 ของโต๊ะ)
  best_hands: Record<string, any> | null   // jsonb — hand ที่ดีที่สุดแยกตาม rank
  tier_unlocked_max: string | null    // Ceiling model — Tier สูงสุดที่เคยปลด (token ลดไม่ล็อคกลับ)
  iap_token_total: number | null      // Token สะสมจาก IAP — ไม่นับเป็นเกณฑ์ปลดล็อค Tier (กัน pay-to-unlock)
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
      let bootSession = data.session

      // ตรวจ refresh token ตอนเริ่มแอป และล้าง session ในเครื่องทันทีเมื่อ token ใช้ไม่ได้
      if (bootSession) {
        const refreshed = await supabase.auth.refreshSession(bootSession)
        if (refreshed.error || !refreshed.data.session) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          bootSession = null
          useUserStore.getState().logout()
        } else {
          bootSession = refreshed.data.session
        }
      }
      await get().setSession(bootSession)

      // subscribe ทุก auth state change (login/logout/token refresh)
      onAuthStateChange(async (_event, session) => {
        await get().setSession(session as Session | null)
        // Patch: session หายเมื่อไหร่ (SIGNED_OUT / token refresh fail กลางคัน) -> เคลียร์ userStore ทันที
        if (!session) useUserStore.getState().logout()
      })
    } catch (e: any) {
      console.error('[authStore] initAuth failed:', e)
      // Patch 2026-07-17: refresh token เสีย/หาย (เช่น "Invalid Refresh Token: Refresh Token Not Found")
      // -> ล้าง session ค้างใน AsyncStorage แล้วบูตแอปแบบ logged-out สะอาดๆ แทนการปล่อย error ค้าง
      const msg = String(e?.message ?? '')
      if (e?.name === 'AuthApiError' || msg.includes('Refresh Token')) {
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {} // ล้างเฉพาะ session ในเครื่อง ไม่เรียก refresh token ที่เสียซ้ำ
        set({ session: null, user: null, profile: null })
        useUserStore.getState().logout() // canon: ห้าม userId ค้าง/fallback
      }
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
        .select('user_id, display_name, vip_status, avatar_url, tier, token_balance, crown_balance, xp, last_login, performance_score, ps_season, monarch_victories, tier_unlock_celebrated, beyond_path, streak_count, best_streak_count, streak_shields, streak_7days_badge, games_played, games_won, best_hands, tier_unlocked_max, iap_token_total')
        .eq('user_id', user.id)
        .maybeSingle()
      console.log('[authStore] refreshProfile query result:', { data, error, queriedUserId: user.id })
      if (get().user?.id !== user.id) return // session เปลี่ยนระหว่าง query — ห้าม profile บัญชีเก่าทับบัญชีใหม่
      set({ profile: data as UserProfile | null })
    } catch (e) {
      console.error('[authStore] refreshProfile failed:', e)
      set({ profile: null })
    }
  },

  signOut: async () => {
    // Patch: signOut บน session ที่เสียแล้วจะ throw "Invalid Refresh Token" ซ้ำ -> ห่อไว้ให้ logout สำเร็จเสมอ
    // Patch 2026-08-13: ลุงเยาะรายงานว่ากดปุ่ม Logout แล้วไม่มีอะไรเกิดขึ้น — supabase.auth.signOut() เป็น
    // network call ที่ไม่มี timeout ในตัว ถ้าค้าง (ไม่ resolve/reject) โค้ดจะหยุดอยู่ตรง await นี้ตลอดไป
    // ทำให้ set({session:null,...}) ด้านล่างไม่เคยรัน — Logout ต้องเคลียร์ session ในเครื่องได้เสมอไม่ว่า
    // เครือข่ายจะเป็นยังไง จึงใส่เพดานเวลา 5 วิ แล้วเดินหน้าเคลียร์ local state ต่อโดยไม่รอ network call ค้าง
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SIGN_OUT_TIMEOUT')), 5000)),
      ])
    } catch (e) { console.warn('[authStore] signOut error/timeout (ignored):', e) }
    set({ session: null, user: null, profile: null })
    useUserStore.getState().logout()
  },
}))
