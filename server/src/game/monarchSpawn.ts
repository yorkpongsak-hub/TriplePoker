// ============================================================
// monarchSpawn.ts — Four Gods Boss Selection (โต๊ะ High Noble ปกติ)
// Batch 1 Task 2 (Monarch v2.2 cleanup): Monarch ถูกถอดออกจาก pool นี้แล้วทั้งหมด — โต๊ะ High Noble
// ปกติจะไม่มีทางสุ่มเจอ Monarch ผ่านทางนี้อีกต่อไป เหลือเส้นทางเดียวเท่านั้นคือ rollMonarchEntry()
// (monarchEngine.ts) ที่ intercept ที่ gameSocket.ts ก่อนเข้า matchmaking ปกติเลย — แก้ known issue เดิม
// ที่ Monarch เคยสุ่มได้ 2 ทางคู่ขนานกัน (ดู monarchEngine.ts header comment เดิม/audit ก่อนหน้า)
// pity counter (users.monarch_pity_counter/monarch_encounters) ย้ายไปอยู่ที่ rollMonarchEntry() แล้ว
// (Batch 1 Task 3) — ฟังก์ชันนี้ไม่อ่าน/ไม่เขียนคอลัมน์นั้นอีกต่อไป
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { gameConfig } from '../config/gameConfig'
import { economyService } from '../economy/economyService'
import { FOUR_GODS, AIConfig } from './aiEngine'
import { supabaseAdmin } from '../config/supabase'

export interface MonarchRollResult {
  isMonarch: false   // Batch 1 Task 2: เส้นทางนี้คืน false เสมอ — คง field ไว้ไม่ลบเพื่อไม่ต้องแตะ
                      // roomRegistry.ts's bossSeatFromRoll() ที่อ่าน field นี้อยู่ (ดู audit ก่อนหน้า)
  boss: AIConfig
}

// ── Batch 3D-1 — Royal Relic pool (MVP 6 ชิ้น, canon: TriplePoker_MonarchEncounter_Spec_v2_2.md §10) ──
// เก็บสะสมไม่ซ้ำเมื่อชนะ Monarch — index 0 (blank_crest) การันตีเสมอสำหรับชัยชนะครั้งแรกสุด ที่เหลือ
// สุ่มไม่ซ้ำจนกว่าจะครบ ไม่มี asset ภาพในเฟสแรก (relic = id + label + lore text ล้วนตาม spec)
// lore text ตั้งใจเขียนแบบชวนสงสัยไม่เฉลย (Rise = ตั้งคำถามไม่ใช่ตอบ) เข้าธีม Monarch (ไร้หน้า/ไร้ยศ)
export interface MonarchRelic {
  id: string
  label: string
  lore: string
  type: 'avatar_crest' | 'card_frame' | 'title'
}

export const MONARCH_RELICS: MonarchRelic[] = [
  { id: 'blank_crest', label: 'The Blank Crest', lore: 'A crest belonging to no rank.', type: 'avatar_crest' },
  { id: 'refused_crown', label: 'Refused Crown', lore: 'A crown, once offered. Never worn.', type: 'card_frame' },
  { id: 'zero_mark', label: 'The Zero Mark', lore: 'Before Tier One, there was a hand dealt to no one.', type: 'card_frame' },
  { id: 'monarchs_witness', label: "Monarch's Witness", lore: 'It has seen every hand at this table, and told no one.', type: 'title' },
  { id: 'the_unbowed', label: 'The Unbowed', lore: 'It has never once said fold.', type: 'title' },
  { id: 'faceless_joker', label: 'Faceless Joker', lore: 'NO HAND ABOVE ANOTHER. Yet somebody always deals.', type: 'avatar_crest' },
]

// สุ่ม Four Gods ตัวใดตัวหนึ่งตามน้ำหนัก bossWeights (normalize แล้วหลังถอด Monarch ออก — gameConfig.ts)
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

// สุ่ม Boss ของโต๊ะ High Noble ปกติ — weighted random ล้วน (Four Gods เท่านั้น ไม่มี Monarch/pity/DB
// อีกต่อไป) ยังคง async signature ไว้เพื่อไม่ต้องแก้ call site ที่ roomRegistry.ts:391,639 (ทั้งคู่ await
// อยู่แล้ว) — humanUserIds ไม่ได้ใช้แล้วแต่คงพารามิเตอร์ไว้กันแก้ signature ที่ผู้เรียก
export async function rollHighNobleBoss(_humanUserIds: string[]): Promise<MonarchRollResult> {
  const boss = pickWeightedFourGod(gameConfig.monarchConfig.bossWeights)
  return { isMonarch: false, boss }
}

// บันทึกชัยชนะเหนือ Monarch — ใช้แสดง Badge "Monarch Slayer" (monarch_victories >= 1) และเป็นเงื่อนไข Ascendant Gate
// เรียกเฉพาะผู้ชนะ human 1 คนต่อแมตช์ ณ จุด settlement ของ finalizeHNGrandFinale
// ⚠️ ยังใช้อยู่จริงที่ highNobleMultiEngine.ts:1322 (เส้นทางเก่า Monarch-in-regular-HN-table ที่ตอนนี้
// unreachable ในทางปฏิบัติหลัง Batch 1 Task 2 แต่โค้ดยังคอมไพล์/เทสอยู่) — ห้ามแก้ signature/ชื่อ
export async function recordMonarchVictory(userId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('monarch_victories')
      .eq('user_id', userId)
      .single()
    const current = data?.monarch_victories ?? 0
    await supabaseAdmin.from('users').update({ monarch_victories: current + 1 }).eq('user_id', userId)
  } catch (err) {
    console.error('[MONARCH] Error recording victory for', userId, err)
  }
}

// Batch 1 Task 5 — บันทึกว่าเจอ Monarch จบแมตช์แล้ว 1 ครั้ง (ทุกผลลัพธ์: ชนะ/แพ้/disconnect) แยกจาก
// recordMonarchVictory (นับเฉพาะชนะ) เพราะจังหวะเรียกไม่ตรงกัน — monarch_encounters +1 เสมอไม่มีเงื่อนไข
export async function recordMonarchEncounter(userId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('monarch_encounters')
      .eq('user_id', userId)
      .single()
    const current = data?.monarch_encounters ?? 0
    await supabaseAdmin.from('users').update({ monarch_encounters: current + 1 }).eq('user_id', userId)
  } catch (err) {
    console.error('[MONARCH] Error recording encounter for', userId, err)
  }
}

export interface MonarchRelicResult {
  relicId?: string
  label?: string
  lore?: string
  isNew: boolean
  collectionComplete?: boolean
  tokenBonus?: number
}

// Batch 3D-1 Task 3 — สุ่ม/บันทึก Royal Relic ตอนชนะ Monarch เรียกเฉพาะจาก settleMonarchMatch's
// isHumanWinner block เท่านั้น (monarchEngine.ts) แยกจาก recordMonarchVictory เจตนา — ฟังก์ชันนั้น
// ห้ามแก้ signature/ชื่อ (ยังใช้จากเส้นทาง legacy ที่คอมไพล์อยู่) และคืนแค่ void ไม่รองรับ return ผล relic
//
// ⚠️ อ่าน users.monarch_relics ด้วย pattern (b): destructure {error} แล้ว throw ทิ้งงานทันทีถ้า read
// พลาด (ห้าม fallback เป็น [] แล้วเขียนทับ — จะทำ relic ที่สะสมไว้หายหมด) เหมือน conquered_sentinels
// ที่ gameLoop.ts:2044-2062 เป๊ะ — ต่างจาก recordMonarchVictory/recordMonarchEncounter ด้านบนที่เป็น
// counter เดี่ยวๆ ไม่มีความเสี่ยงเดียวกัน (fallback 0 ไม่ทำข้อมูลหาย)
export async function rollAndRecordMonarchRelic(userId: string, matchId: string): Promise<MonarchRelicResult | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('monarch_relics')
      .eq('user_id', userId)
      .single()
    if (error) {
      console.error('[MONARCH_RELIC] Read failed, skip:', error, '| userId:', userId)
      throw new Error('relic_read_failed')
    }
    const current: string[] = Array.isArray(data?.monarch_relics) ? data.monarch_relics : []

    // เก็บครบทั้ง 6 ชิ้นแล้ว — claim-first: ยืนยันสถานะ "ครบ" จากข้อมูลที่อ่านมาแล้วก่อนเสมอ ค่อยไปแตะ
    // token_balance (ไม่ append relic ใหม่ — เป็น recurring bonus ทุกครั้งที่ชนะหลังจากนี้ ไม่ใช่ one-time)
    if (current.length >= MONARCH_RELICS.length) {
      const bonus = gameConfig.monarchConfig.relicCompleteBonus
      await economyService.mint({
        idempotencyKey: `MONARCH_RELIC_COMPLETE:${userId}:${matchId}`,
        to: { accountType: 'PLAYER', accountId: userId },
        currency: 'TOKEN', amount: bonus, reason: 'ACHIEVEMENT',
        actor: 'monarch_relic_system', context: { playerId: userId, matchId },
      })
      return { isNew: false, collectionComplete: true, tokenBonus: bonus }
    }

    // ยังเก็บไม่ครบ — เลือก relic ใหม่ 1 ชิ้น: ว่างเปล่า (ชนะครั้งแรกสุด) การันตี blank_crest เสมอ
    // มีของแล้วแต่ยังไม่ครบ → สุ่มจากชิ้นที่เหลือที่ยังไม่มี
    const remaining = MONARCH_RELICS.filter(r => !current.includes(r.id))
    const picked = current.length === 0 ? MONARCH_RELICS[0] : remaining[Math.floor(Math.random() * remaining.length)]

    const updated = [...current, picked.id]
    const { error: writeErr } = await supabaseAdmin
      .from('users')
      .update({ monarch_relics: updated })
      .eq('user_id', userId)
    if (writeErr) {
      console.error('[MONARCH_RELIC] Write failed:', writeErr, '| userId:', userId)
      throw new Error('relic_write_failed')
    }
    return { relicId: picked.id, label: picked.label, lore: picked.lore, isNew: true }
  } catch (err) {
    console.error('[MONARCH_RELIC] Error rolling relic for', userId, err)
    return null
  }
}
