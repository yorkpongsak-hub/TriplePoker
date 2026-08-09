// ============================================================
// progressionGate.ts — Progression Gate ระหว่าง Tier (3-Axis: Token + Time + Skill)
// Canon: TriplePoker_EconomyProgression_Spec_v2_0.md §6, §8, §11
// The Sage Unicorn Studio Co., Ltd.
//
// ใช้โดย:
//   - tierUnlockService.ts (checkTierUnlock) — gate ก่อนเลื่อน tier_unlocked_max ขึ้น
//   - gameSocket.ts (room_auto_match handler) — enforce ceiling จริงก่อนปล่อยเข้าคิว
// ============================================================

import { gameConfig } from '../config/gameConfig'

// ลำดับ Tier จากต่ำไปสูง — 'D' คือค่าเริ่มต้นก่อนปลดล็อคอะไรเลย (DB default ของ tier_unlocked_max)
// ย้ายมาจาก tierUnlockService.ts เดิม (single source ของลำดับ Tier — ทั้ง gameSocket.ts และ
// tierUnlockService.ts ต้อง import จากที่นี่ ห้ามประกาศ array ซ้ำที่อื่นอีก)
export const TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const
export type TierOrderKey = typeof TIER_ORDER[number]

// Tier ที่มี Progression Gate จริง (initiate ไม่มี gate เพราะเป็น Tier แรกที่ทุกคนเข้าได้ฟรี)
// 'ascendant' ยังอยู่ใน type เพื่อ compatibility กับ progression config เดิม แต่ Ascendant shortcut
// ไม่เรียก Skill Gate/Monarch Slayer แล้วตาม Arena Tier S+ Canon Addendum v1.0
// เพิ่ม 'arena' (2026-07-30) — เส้นทางสำรองเข้า Tier S แบบไม่ผ่าน Ascendant (token >= 1M + 180 วัน)
// ใช้จริงครั้งแรกใน crownVaultService.ts's checkArenaPassEligibility — ก่อนหน้านี้มีแค่ config
// ไว้เฉยๆ ("ยังไม่ถูก wire เข้า flow จริง") ยังไม่เคยเรียก canUnlockTier('arena', ...) เลย
export type GateTier = 'adept' | 'mastermind' | 'highNoble' | 'ascendant' | 'arena'

// รายชื่อ Tier ที่มี Progression Gate ไว้ให้ผู้เรียก loop ได้ (เช่น lobbySocket.ts ตอนสร้าง
// tierEligibility ต่อ user) — ลำดับเดียวกับ TIER_ORDER ไม่รวม 'D'/'initiate' เพราะไม่มี gate
// (ascendant/arena ไม่อยู่ใน TIER_ORDER/ceiling model เพราะ tier_unlocked_max ไม่รองรับค่านี้ — เป็น gate
// คนละชนิดที่เช็คตรงๆ ตอนต้องการเท่านั้น ไม่ผูกกับ ceiling)
export const PROGRESSION_TIERS: GateTier[] = ['adept', 'mastermind', 'highNoble', 'ascendant', 'arena']

export type GateMissingReason = 'TOKEN' | 'DAYS' | 'SKILL'

export interface GateCheckResult {
  passed: boolean
  missing: GateMissingReason[]
}

// ข้อมูล Skill ที่ canUnlockTier() ต้องการเพิ่ม แล้วแต่ Tier — ผู้เรียกต้อง query เองจาก DB ก่อน
// (canUnlockTier ยังเป็น pure function เหมือนเดิม ไม่ query เอง)
export interface SkillData {
  conqueredSentinels?: number  // ใช้กับ highNoble (skill: 'nineSentinels')
  monarchVictories?: number    // ใช้กับ ascendant (skill: 'monarchSlayer')
}

// จำนวน Nine Sentinels ที่ต้องพิชิตครบก่อนขึ้น highNoble (MasterPlan v1.1 §4.4)
const SENTINELS_REQUIRED = 9
// จำนวนครั้งที่ต้องชนะ Monarch ก่อนขึ้น ascendant (Monarch_Spec_v1_3 §5)
const MONARCH_VICTORIES_REQUIRED = 1

/**
 * เช็ค 3 แกนของ Progression Gate (Spec v2.0 §6): Token + Time (นับจาก account created_at) + Skill
 * Skill Gate มี 3 แบบตาม gameConfig.progressionGate[tier].skill:
 *   - 'pass'          → ผ่านเสมอ (MVP default)
 *   - 'nineSentinels' → ต้อง skillData.conqueredSentinels >= 9 (highNoble)
 *   - 'monarchSlayer' → ต้อง skillData.monarchVictories >= 1 (ascendant)
 * ไม่ผ่าน Skill Gate → push 'SKILL' เข้า missing (เดิมสองอันนี้เคยเช็คแยกกันคนละไฟล์ — รวมที่นี่ที่เดียว)
 */
export function canUnlockTier(
  tier: GateTier,
  tokenBalance: number,
  accountCreatedAt: string | Date,
  skillData?: SkillData,
): GateCheckResult {
  const gate = gameConfig.progressionGate[tier]
  const missing: GateMissingReason[] = []

  if (tokenBalance < gate.minToken) missing.push('TOKEN')

  if (gate.minDays != null) {
    const createdMs = new Date(accountCreatedAt).getTime()
    const daysSinceCreation = (Date.now() - createdMs) / 86_400_000
    if (daysSinceCreation < gate.minDays) missing.push('DAYS')
  }

  if (gate.skill === 'nineSentinels' && (skillData?.conqueredSentinels ?? 0) < SENTINELS_REQUIRED) {
    missing.push('SKILL')
  }
  if (gate.skill === 'monarchSlayer' && (skillData?.monarchVictories ?? 0) < MONARCH_VICTORIES_REQUIRED) {
    missing.push('SKILL')
  }
  // gate.skill === 'pass' → ไม่มีเงื่อนไขให้ fail

  return { passed: missing.length === 0, missing }
}
