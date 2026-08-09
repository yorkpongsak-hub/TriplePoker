// ============================================================
// crownVaultService.ts — The Crown Vault business logic (มติลุงเยาะ 2026-07-30)
// Orchestration ของ 3 ส่วนใน Crown Vault (Shop):
//   1. Token → Crown Exchange (ปลดล็อกที่ HighNoble)
//   2. Ascendant Pass (20 Crown) — เปิด Ascendant window 30 วัน หรือ Instant Pass
//   3. Arena Pass (20 Crown) — ด่านสุดท้ายบังคับก่อนเข้า Tier S / The Arena จริง
//
// ใช้โดย server/src/routes/crownVault.ts เท่านั้น
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabase, supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { TIER_ORDER, TierOrderKey } from './progressionGate'
import { checkAscendantEligibility, AscendantStatusRecord, AscendantStatusValue } from './ascendantGate'
import { deductCrown } from '../items/shopAPI'

export interface AscendantStatusResult {
  status: AscendantStatusValue
  startedAt: string | null
  expiresAt: string | null
}

// อ่าน ascendant_status ปัจจุบัน + ทำ on-demand transition (เรียกตอน login/token settle ตาม
// Ascendant_Spec_v1_1 §7.2 — ไม่มี cron job ในโปรเจคนี้เลย ต้องเช็ค on-demand เท่านั้น):
//   active + token >= 1,000,000  → passed (ไม่ต้องรอครบ 30 วัน)
//   active + เลย expiresAt แล้ว  → failed (ปิด window เฉยๆ ไม่มี penalty อื่น — Ceiling Model เดิมไม่แตะ)
export async function getAscendantStatus(userId: string): Promise<AscendantStatusResult> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('token_balance, ascendant_status')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return { status: 'none', startedAt: null, expiresAt: null }
  }

  const current: AscendantStatusRecord = data.ascendant_status ?? { status: 'none', startedAt: null, expiresAt: null }
  if (current.status !== 'active') return current

  const token = data.token_balance ?? 0
  let next: AscendantStatusRecord | null = null

  if (token >= 1_000_000) {
    next = { ...current, status: 'passed' }
  } else if (current.expiresAt && Date.now() > new Date(current.expiresAt).getTime()) {
    next = { ...current, status: 'failed' }
  }

  if (!next) return current

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ ascendant_status: next })
    .eq('user_id', userId)

  if (updateError) {
    console.error('[CROWN-VAULT] Error updating ascendant_status transition for', userId, updateError)
    return current
  }

  return next
}

export type BuyAscendantPassError =
  | 'NOT_ELIGIBLE'
  | 'INSUFFICIENT_CROWN'
  | 'USER_NOT_FOUND'

export interface BuyAscendantPassResult {
  success: boolean
  status?: AscendantStatusResult
  error?: BuyAscendantPassError
  errorDetail?: string
}

// ซื้อ Ascendant Pass (20 Crown) — จุดเดียวที่เป็น "Opt-in Start" ตามมติลุงเยาะ 2026-07-30
// (ไม่มีปุ่ม "Begin Ascension" แยกอีกแล้ว การกดซื้อ Pass คือจุดเริ่ม window)
export async function buyAscendantPass(userId: string): Promise<BuyAscendantPassResult> {
  const eligibility = await checkAscendantEligibility(userId)
  if (!eligibility.eligible) return { success: false, error: 'NOT_ELIGIBLE', errorDetail: eligibility.reason }

  try {
    await deductCrown(userId, gameConfig.crownVaultConfig.ascendantPassPriceCrown)
  } catch (err: any) {
    return { success: false, error: 'INSUFFICIENT_CROWN', errorDetail: err.message }
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('token_balance')
    .eq('user_id', userId)
    .single()

  if (error || !data) return { success: false, error: 'USER_NOT_FOUND' }

  const now = new Date()
  const token = data.token_balance ?? 0

  // Instant Pass: token ถึง 1M อยู่แล้วตอนซื้อ Pass → ผ่านทันที ไม่ต้องเปิด window 30 วัน
  const newStatus: AscendantStatusRecord = token >= 1_000_000
    ? { status: 'passed', startedAt: now.toISOString(), expiresAt: now.toISOString() }
    : {
        status: 'active',
        startedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + gameConfig.ascendantConfig.windowDays * 86_400_000).toISOString(),
      }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ ascendant_status: newStatus })
    .eq('user_id', userId)

  if (updateError) {
    console.error('[CROWN-VAULT] Error writing ascendant_status after Pass purchase for', userId, updateError)
    return { success: false, error: 'USER_NOT_FOUND', errorDetail: updateError.message }
  }

  return { success: true, status: newStatus }
}

export interface ArenaPassEligibilityResult {
  eligible: boolean
  viaAscendant: boolean
}

// Arena Pass เป็นด่านสุดท้ายบังคับทั้ง 2 เส้นทาง (มติลุงเยาะ 2026-07-30):
//   1. ผ่าน Ascendant สำเร็จ (ascendant_status.status === 'passed')
//   2. เส้นทางสำรอง — ไต่ Tier S ปกติ (token >= 1M + account age >= 180 วัน, progressionGate.arena เดิม)
export async function checkArenaPassEligibility(userId: string): Promise<ArenaPassEligibilityResult> {
  void userId
  // Gate 10.7: legacy 20-Crown Arena Pass is retired. Grandmaster unlocks permanently
  // after Token > 1,000,000; Ascendant remains a separate temporary shortcut.
  return { eligible: false, viaAscendant: false }
}

export type BuyArenaPassError =
  | 'NOT_ELIGIBLE'
  | 'ALREADY_UNLOCKED'
  | 'INSUFFICIENT_CROWN'
  | 'USER_NOT_FOUND'

export interface BuyArenaPassResult {
  success: boolean
  error?: BuyArenaPassError
  errorDetail?: string
}

// ซื้อ Arena Pass (20 Crown) — ปลดล็อก arena_unlocked ถาวร (entitlement flag เท่านั้น game logic
// จริงของ Arena อยู่ในแอปแยกตาม Architecture Rule #5)
export async function buyArenaPass(userId: string): Promise<BuyArenaPassResult> {
  void userId
  return { success: false, error: 'NOT_ELIGIBLE' }
}

export type ExchangeError = 'TIER_REQUIRED' | 'INSUFFICIENT_TOKENS' | 'USER_NOT_FOUND'

export interface ExchangeResult {
  success: boolean
  newTokenBalance?: number
  newCrownBalance?: number
  error?: ExchangeError
}

// Token → Crown Exchange (1 Crown = 5,000 Token ทางเดียว, ปลดล็อกที่ HighNoble ตาม Ascendant_Spec_v1_1 §5)
export async function exchangeTokenToCrown(userId: string, crownAmount: number): Promise<ExchangeResult> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('tier_unlocked_max')
    .eq('user_id', userId)
    .single()

  if (error || !data) return { success: false, error: 'USER_NOT_FOUND' }

  const currentMax = data.tier_unlocked_max as TierOrderKey | null
  const requiredIdx = TIER_ORDER.indexOf(gameConfig.crownVaultConfig.unlockCrownExchangeAtTier)
  const currentIdx = currentMax ? TIER_ORDER.indexOf(currentMax) : -1
  if (currentIdx < requiredIdx) return { success: false, error: 'TIER_REQUIRED' }

  const tokenCost = crownAmount * gameConfig.crownVaultConfig.tokenToCrownRate

  const { data: exchangeData, error: exchangeError } = await supabaseAdmin.rpc('exchange_token_to_crown', {
    p_user_id: userId,
    p_crown_amount: crownAmount,
    p_token_cost: tokenCost,
  })

  if (exchangeError) {
    return { success: false, error: exchangeError.message === 'INSUFFICIENT_TOKENS' ? 'INSUFFICIENT_TOKENS' : 'USER_NOT_FOUND' }
  }

  const row = Array.isArray(exchangeData) ? exchangeData[0] : exchangeData
  return { success: true, newTokenBalance: row.new_token_balance, newCrownBalance: row.new_crown_balance }
}
