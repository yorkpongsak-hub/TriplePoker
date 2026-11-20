// ─────────────────────────────────────────────────────────────────────────────
// tierConfig.ts -- Single Source of Truth: Tier Config ฝั่ง Client
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// ไฟล์นี้คือแหล่งข้อมูล Tier เดียวที่ทั้งแอปฝั่ง client ต้องอ้างอิง (lobby.tsx, profile.tsx ฯลฯ)
// ห้ามประกาศ TIER_CONFIG/threshold ซ้ำที่ไฟล์อื่นอีก — ย้ายมาจาก lobby.tsx เดิม
//
// มี 2 concept แยกกัน:
//   1. Tier    — key เดิมของระบบ Lobby/Matchmaking (5 ค่า รวม last_boss)
//   2. TierKey — 4 tier หลักที่คำนวณจาก token_balance จริงได้ (canon MasterPlan v10.0)
//                ไม่รวม last_boss เพราะไม่ใช่ token-threshold tier
//
// Ascendant (S) / Last Boss (S+) เป็น status แยก ไม่ใช่ token-threshold —
// ห้ามเพิ่มเข้า TierKey หรือ getTierFromToken() เด็ดขาด (ดู TriplePoker_Ascendant_Spec_v1_1 — ยัง stub)
//
// 'demo' ถูกลบออกจากที่นี่แล้ว (เคยเป็น tier placeholder implemented:false ไม่เคยเล่นได้จริง) —
// ตำแหน่งเดิมในล็อบบี้ถูกแทนที่ด้วยปุ่ม "How to Play" (เปิด Onboarding ตรงๆ ไม่ผ่าน Tier system นี้แล้ว)

export type Tier = 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'grandmaster' | 'last_boss'

// Threshold ชุดนี้ต้องตรงกับ server/src/config/gameConfig.ts (tierRanges + progressionGate) เสมอ —
// Canon: TriplePoker_EconomyProgression_Spec_v2_0.md §5 (2026-07-30, แทนที่ชุดเดิม 10k/40k/100k)
// ⚠️ ค่านี้เป็นแค่ token axis เดียว ใช้แสดงผล/preview เท่านั้น (isEligible ด้านล่างก็เช่นกัน) — Time Gate
// (minDays) และ Skill Gate ไม่ถูกคำนวณฝั่ง client เลยตาม Spec §9 "Client ห้ามคำนวณ minDays เอง"
// การ enforce จริงอยู่ที่ server (room_auto_match handler ใน gameSocket.ts อ่าน tier_unlocked_max
// ตรงๆ) — ปุ่ม/badge ที่นี่อาจโชว์ "ปลดล็อกแล้ว" ทั้งที่ server ยังบล็อกเพราะวันไม่ครบ เป็นเรื่องปกติ
export const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean; badgeColor: string }> = {
  initiate:    { label: 'Initiate',      letter: 'C',  minToken: 100,     implemented: true,  badgeColor: '#8DFFB5' },
  adept:       { label: 'Adept',         letter: 'B',  minToken: 6_000,   implemented: true,  badgeColor: '#FFD76A' },
  mastermind:  { label: 'Mastermind',    letter: 'A',  minToken: 20_000,  implemented: true,  badgeColor: '#FFD76A' },
  // letter เดิมเป็น 'S' — แก้เป็น 'A+' ตาม canon ล่าสุด (profile.tsx TIER_INFO) High Noble = A+, สงวน S ไว้ให้ Ascendant
  high_noble:  { label: 'High Noble',    letter: 'A+', minToken: 100_000, implemented: true,  badgeColor: '#FF6B6B' },
  grandmaster: { label: 'Grandmaster',   letter: 'S',  minToken: 1_000_001, implemented: true, badgeColor: '#E9C96B' },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,       implemented: false, badgeColor: '#FFC857' },
}

export function meetsLastBossCondition(_token: number): boolean { return false }

export function isEligible(tier: Tier, token: number, tierUnlockedMax?: string | null): boolean {
  if (tier === 'last_boss') return meetsLastBossCondition(token)
  if (tier === 'grandmaster' && tierUnlockedMax === 'grandmaster') return true
  return token >= TIER_CONFIG[tier].minToken
}

// ─── Canon 4-tier ที่คำนวณจาก token_balance ได้จริง (TriplePoker_MasterPlan_v10_0) ───
export type TierKey = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'grandmaster'

// คำนวณ tier สดจาก token_balance — ใช้แทนการอ่าน users.tier ตรงๆ (คอลัมน์นั้นไม่มี pipeline ไหนอัปเดตจริง)
// อ้างอิง threshold จาก TIER_CONFIG ด้านบนตัวเดียว กันเลข drift ระหว่าง 2 ค่า
export function getTierFromToken(tokenBalance: number): TierKey {
  if (tokenBalance >= TIER_CONFIG.grandmaster.minToken) return 'grandmaster'
  if (tokenBalance >= TIER_CONFIG.high_noble.minToken) return 'highNoble'
  if (tokenBalance >= TIER_CONFIG.mastermind.minToken) return 'mastermind'
  if (tokenBalance >= TIER_CONFIG.adept.minToken) return 'adept'
  return 'initiate'
}

export function getAuthoritativeDisplayTier(tokenBalance: number, tierUnlockedMax?: string | null): TierKey {
  if (tierUnlockedMax === 'grandmaster') return 'grandmaster'
  return getTierFromToken(tokenBalance)
}

const TIER_KEY_ORDER: TierKey[] = ['initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster']
// TierKey ('highNoble' camelCase) กับ Tier/TIER_CONFIG key ('high_noble' snake_case) เป็นคนละชุด — ต้อง
// เชื่อมเอง เพราะ getTierFromToken คืนอย่างแรก แต่ minToken lookup ต้องใช้อย่างหลัง
const TIER_KEY_TO_CONFIG_KEY: Record<TierKey, Tier> = {
  initiate: 'initiate', adept: 'adept', mastermind: 'mastermind', highNoble: 'high_noble', grandmaster: 'grandmaster',
}

export interface TierProgress {
  pct: number
  isMaxTier: boolean
  nextTierLabel: string | null
}

// ความก้าวหน้าไปยัง Tier ถัดไป (มติลุงเยาะ 2026-08-14, สำหรับ progress bar หน้า Victory Screen) — สูตร
// อัตราส่วนตรงตามที่ลุงเยาะเลือก: token ปัจจุบัน ÷ token สูงสุดของ Tier ถัดไปที่จะปลดล็อค (ไม่ใช่
// range-based ที่หักลบขั้นต่ำ Tier ปัจจุบันออกก่อน) · Grandmaster เป็น Tier สูงสุดที่มีตอนนี้ (Last Boss
// ยัง implemented:false) เลยไม่มี Tier ถัดไปให้เทียบ คืน isMaxTier:true แทนแทนที่จะซ่อนไปเลย
export function getTierProgress(tokenBalance: number): TierProgress {
  const currentKey = getTierFromToken(tokenBalance)
  const nextKey = TIER_KEY_ORDER[TIER_KEY_ORDER.indexOf(currentKey) + 1]
  if (!nextKey) return { pct: 100, isMaxTier: true, nextTierLabel: null }
  const nextConfig = TIER_CONFIG[TIER_KEY_TO_CONFIG_KEY[nextKey]]
  const pct = Math.max(0, Math.min(100, Math.round((tokenBalance / nextConfig.minToken) * 100)))
  return { pct, isMaxTier: false, nextTierLabel: nextConfig.label }
}
