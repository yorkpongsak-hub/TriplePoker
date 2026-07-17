// ─────────────────────────────────────────────────────────────────────────────
// tierConfig.ts -- Single Source of Truth: Tier Config ฝั่ง Client
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// ไฟล์นี้คือแหล่งข้อมูล Tier เดียวที่ทั้งแอปฝั่ง client ต้องอ้างอิง (lobby.tsx, profile.tsx ฯลฯ)
// ห้ามประกาศ TIER_CONFIG/threshold ซ้ำที่ไฟล์อื่นอีก — ย้ายมาจาก lobby.tsx เดิม
//
// มี 2 concept แยกกัน:
//   1. Tier    — key เดิมของระบบ Lobby/Matchmaking (6 ค่า รวม demo/last_boss)
//   2. TierKey — 4 tier หลักที่คำนวณจาก token_balance จริงได้ (canon MasterPlan v10.0)
//                ไม่รวม demo/last_boss เพราะไม่ใช่ token-threshold tier
//
// Ascendant (S) / Last Boss (S+) เป็น status แยก ไม่ใช่ token-threshold —
// ห้ามเพิ่มเข้า TierKey หรือ getTierFromToken() เด็ดขาด (ดู TriplePoker_Ascendant_Spec_v1_1 — ยัง stub)

export type Tier = 'demo' | 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'last_boss'

export const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean; badgeColor: string }> = {
  demo:        { label: 'Demo',          letter: 'D',  minToken: 0,       implemented: false, badgeColor: '#8DFFB5' },
  initiate:    { label: 'Initiate',      letter: 'C',  minToken: 100,     implemented: true,  badgeColor: '#8DFFB5' },
  adept:       { label: 'Adept',         letter: 'B',  minToken: 10_000,  implemented: true,  badgeColor: '#FFD76A' },
  mastermind:  { label: 'Mastermind',    letter: 'A',  minToken: 40_000,  implemented: true,  badgeColor: '#FFD76A' },
  // letter เดิมเป็น 'S' — แก้เป็น 'A+' ตาม canon ล่าสุด (profile.tsx TIER_INFO) High Noble = A+, สงวน S ไว้ให้ Ascendant
  high_noble:  { label: 'High Noble',    letter: 'A+', minToken: 100_000, implemented: true,  badgeColor: '#FF6B6B' },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,       implemented: false, badgeColor: '#FFC857' },
}

export function meetsLastBossCondition(_token: number): boolean { return false }

export function isEligible(tier: Tier, token: number): boolean {
  if (tier === 'last_boss') return meetsLastBossCondition(token)
  return token >= TIER_CONFIG[tier].minToken
}

// ─── Canon 4-tier ที่คำนวณจาก token_balance ได้จริง (TriplePoker_MasterPlan_v10_0) ───
export type TierKey = 'initiate' | 'adept' | 'mastermind' | 'highNoble'

// คำนวณ tier สดจาก token_balance — ใช้แทนการอ่าน users.tier ตรงๆ (คอลัมน์นั้นไม่มี pipeline ไหนอัปเดตจริง)
// อ้างอิง threshold จาก TIER_CONFIG ด้านบนตัวเดียว กันเลข drift ระหว่าง 2 ค่า
export function getTierFromToken(tokenBalance: number): TierKey {
  if (tokenBalance >= TIER_CONFIG.high_noble.minToken) return 'highNoble'
  if (tokenBalance >= TIER_CONFIG.mastermind.minToken) return 'mastermind'
  if (tokenBalance >= TIER_CONFIG.adept.minToken) return 'adept'
  return 'initiate'
}
