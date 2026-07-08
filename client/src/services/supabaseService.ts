// ─────────────────────────────────────────────────────────────────────────────
// supabaseService.ts — Supabase Auth + Direct Queries
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Login ด้วย Google OAuth */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
  if (error) throw error;
}

/** Login ด้วย Facebook OAuth */
export async function signInWithFacebook(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook' });
  if (error) throw error;
}

/** Logout */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** ดึง Session ปัจจุบัน */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/** ดึง JWT token สำหรับส่งไปยัง Backend */
export async function getAuthToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/** Subscribe to auth state changes */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
