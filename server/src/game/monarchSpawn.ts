// ============================================================
// monarchSpawn.ts — Monarch Boss Selection + Pity Counter (Monarch_Spec_v1_3 §2)
// ใช้เฉพาะโต๊ะ High Noble ตอนห้องเต็ม (รู้ user_id ของ Human ทั้ง 3 คนแล้ว)
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { supabase } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { FOUR_GODS, AIConfig } from './aiEngine'

export interface MonarchRollResult {
  isMonarch: boolean
  boss: AIConfig | null   // null เมื่อ isMonarch = true (Monarch ไม่ใช่หนึ่งใน Four Gods ปกติ)
  effectiveRate: number
  maxPity: number
  guaranteed: boolean
}

// สุ่ม Four Gods ตัวใดตัวหนึ่งตามน้ำหนัก bossWeights (ไม่รวม Monarch — ถูกตัดสินไปแล้วก่อนเรียกฟังก์ชันนี้)
function pickWeightedFourGod(weights: { reaper: number; crag: number; cortex: number; cipher: number }): AIConfig {
  const pool: Array<{ god: AIConfig; weight: number }> = [
    { god: FOUR_GODS.find(g => g.personality === 'reaper')!, weight: weights.reaper },
    { god: FOUR_GODS.find(g => g.personality === 'crag')!,   weight: weights.crag },
    { god: FOUR_GODS.find(g => g.personality === 'cortex')!, weight: weights.cortex },
    { god: FOUR_GODS.find(g => g.personality === 'cipher')!, weight: weights.cipher },
  ]
  const total = pool.reduce((sum, p) => sum + p.weight, 0)
  let roll = Math.random() * total
  for (const p of pool) {
    roll -= p.weight
    if (roll <= 0) return p.god
  }
  return pool[pool.length - 1].god
}

// สุ่ม Boss ของโต๊ะ High Noble — weighted random (28/25/25/19) + Monarch pity (max ของโต๊ะ, การันตีเกม 30)
// อัปเดต monarch_pity_counter / monarch_encounters ของผู้เล่นทั้งโต๊ะเป็น batch เดียว (upsert)
export async function rollHighNobleBoss(humanUserIds: string[]): Promise<MonarchRollResult> {
  const cfg = gameConfig.monarchConfig
  const uniqueIds = [...new Set(humanUserIds.filter(Boolean))]

  const pityByUser: Record<string, number> = {}
  const encountersByUser: Record<string, number> = {}
  let maxPity = 0

  if (uniqueIds.length > 0) {
    try {
      const { data } = await supabase
        .from('users')
        .select('user_id, monarch_pity_counter, monarch_encounters')
        .in('user_id', uniqueIds)
      for (const row of data ?? []) {
        pityByUser[row.user_id] = row.monarch_pity_counter ?? 0
        encountersByUser[row.user_id] = row.monarch_encounters ?? 0
        maxPity = Math.max(maxPity, row.monarch_pity_counter ?? 0)
      }
    } catch (err) {
      // Patch: ถ้า migration 006_monarch_spawn_reward.sql ยังไม่ได้รันบน Supabase คอลัมน์นี้จะยังไม่มี — fallback pity=0 ทุกคน (ไม่ throw)
      console.error('[MONARCH] Error reading pity counters:', err)
    }
  }

  const guaranteed = maxPity >= cfg.pityGuaranteeAt
  const effectiveRate = guaranteed ? 1 : Math.min(1, cfg.spawnRateBase + maxPity * cfg.pityStepPerGame)
  const isMonarch = Math.random() < effectiveRate

  const boss = isMonarch ? null : pickWeightedFourGod(cfg.bossWeights)

  if (uniqueIds.length > 0) {
    const rows = uniqueIds.map(uid => isMonarch
      ? { user_id: uid, monarch_pity_counter: 0, monarch_encounters: (encountersByUser[uid] ?? 0) + 1 }
      : { user_id: uid, monarch_pity_counter: (pityByUser[uid] ?? 0) + 1 })
    try {
      await supabase.from('users').upsert(rows, { onConflict: 'user_id' })
    } catch (err) {
      console.error('[MONARCH] Error updating pity/encounters batch:', err)
    }
  }

  return { isMonarch, boss, effectiveRate, maxPity, guaranteed }
}

// บันทึกชัยชนะเหนือ Monarch — ใช้แสดง Badge "Monarch Slayer" (monarch_victories >= 1) และเป็นเงื่อนไข Ascendant Gate
// เรียกเฉพาะผู้ชนะ human 1 คนต่อแมตช์ ณ จุด settlement ของ finalizeHNGrandFinale
export async function recordMonarchVictory(userId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('users')
      .select('monarch_victories')
      .eq('user_id', userId)
      .single()
    const current = data?.monarch_victories ?? 0
    await supabase.from('users').update({ monarch_victories: current + 1 }).eq('user_id', userId)
  } catch (err) {
    console.error('[MONARCH] Error recording victory for', userId, err)
  }
}
