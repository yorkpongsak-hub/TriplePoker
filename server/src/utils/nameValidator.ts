// ─────────────────────────────────────────────────────────────────────────────
// nameValidator.ts — Name Protection (3-Layer Check)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// อ้างอิง: docs/TriplePoker_NameProtection_Spec_v1_0.md
// ตรวจสอบชื่อผู้เล่นก่อน register หรือเปลี่ยนชื่อ — ห้ามซ้ำกับ bosses / graveyard / reserved_names
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../config/supabase'

/**
 * normalize: lowercase + trim + collapse spaces
 * ใช้ทั้ง input และ stored names (ต้องตรงกับ normalized_name generated column ใน DB)
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export interface NameValidationResult {
  allowed: boolean
  reason?: 'BOSS_NAME' | 'GRAVEYARD_NAME' | 'RESERVED_NAME' | 'INVALID_FORMAT' | 'DB_ERROR'
  message?: string
}

// อนุญาต: ตัวอักษร, ตัวเลข, ไทย, space, ขีดกลาง, ขีดล่าง
const FORMAT_REGEX = /^[a-zA-Z0-9ก-๙\s\-_]+$/

/**
 * validateDisplayName
 * คืนค่า allowed: true ถ้าใช้ได้
 * คืนค่า allowed: false พร้อม reason ถ้าไม่ได้
 *
 * Fail-safe: ถ้า query ตาราง Layer ใดล้มเหลว (DB error) → reject ทันที (ตาม spec §10 Edge Cases)
 */
export async function validateDisplayName(
  inputName: string
): Promise<NameValidationResult> {

  // ─── 1. ตรวจ format ก่อน ────────────────────────────────────────────
  const trimmed = inputName.trim()

  // Patch (2026-07-17): จำกัดความยาว 30 → 9 ตัวอักษร ตามมติใหม่
  if (trimmed.length < 3 || trimmed.length > 9) {
    return {
      allowed: false,
      reason: 'INVALID_FORMAT',
      message: 'Name must be 3–9 characters.',
    }
  }

  if (!FORMAT_REGEX.test(trimmed)) {
    return {
      allowed: false,
      reason: 'INVALID_FORMAT',
      message: 'Name contains invalid characters. Use letters, numbers, spaces, hyphens, or underscores only.',
    }
  }

  const normalized = normalizeName(trimmed)

  // ─── 2. ตรวจ bosses table (Layer 1) ────────────────────────────────
  const { data: bossMatch, error: bossError } = await supabase
    .from('bosses')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (bossError) {
    return { allowed: false, reason: 'DB_ERROR', message: 'Please try again.' }
  }
  if (bossMatch) {
    return {
      allowed: false,
      reason: 'BOSS_NAME',
      message: 'This name belongs to a legendary Last Boss and cannot be used.',
    }
  }

  // ─── 3. ตรวจ graveyard table (Layer 2) ─────────────────────────────
  const { data: graveyardMatch, error: graveyardError } = await supabase
    .from('graveyard')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (graveyardError) {
    return { allowed: false, reason: 'DB_ERROR', message: 'Please try again.' }
  }
  if (graveyardMatch) {
    return {
      allowed: false,
      reason: 'GRAVEYARD_NAME',
      message: 'This name is eternally inscribed in the Hall of Bosses.',
    }
  }

  // ─── 4. ตรวจ reserved_names table (Layer 3) ─────────────────────────
  const { data: reservedMatch, error: reservedError } = await supabase
    .from('reserved_names')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()

  if (reservedError) {
    return { allowed: false, reason: 'DB_ERROR', message: 'Please try again.' }
  }
  if (reservedMatch) {
    return {
      allowed: false,
      reason: 'RESERVED_NAME',
      message: 'This name is reserved and cannot be used.',
    }
  }

  // ─── 5. ผ่านทุก Layer → อนุญาต ──────────────────────────────────────
  return { allowed: true }
}
