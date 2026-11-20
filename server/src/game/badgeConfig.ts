// ============================================================
// badgeConfig.ts — Badge Shop canonical catalog (มติลุงเยาะ 2026-08-15)
// เกณฑ์ปลดล็อคทุกใบอิงสัญญาณที่มีอยู่แล้วในระบบจริง (tier_unlocked_max/ascendant_status/
// monarch_victories/streak_7days_badge/crown_balance/match_wins) ไม่มีการสร้าง tracking ใหม่
// ราคา/เกณฑ์ยืนยันกับลุงเยาะแล้วก่อน implement (รวมรอบแก้ไข: Royal Straight Flush 30,000,
// Arena Champion 25,000) — ดู badgeUnlockService.ts สำหรับ logic ประเมิน unlock จริง
//
// 'card_monarch_conquered.png' ไม่ใช่ badge ขายในร้าน (ใช้จริงใน MonarchConquestBanner.tsx
// อยู่แล้ว) — ไม่รวมในแคตาล็อกนี้ตามที่ยืนยันกับลุงเยาะ
// 'Last Boss' badge (ราคา 50,000 ตามที่ลุงเยาะบอก) ยังไม่ใส่เข้าแคตาล็อก เพราะยังไม่มีไฟล์ภาพ
// และ Tier S+ (Sovereign/Last Boss) เองก็ถูกพักไว้ไม่ทำใน MVP (ดู CLAUDE.md pending #11)
// — เพิ่มเข้าทีหลังได้ทันทีที่มีทั้งไฟล์ภาพและ unlock signal จริง
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { TierOrderKey } from './progressionGate'

export type BadgeKey =
  | 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'grandmaster' | 'ascendant'
  | 'golden_rookie' | 'dedicated' | 'top_10' | 'crown_collector' | 'triple_jackpot'
  | 'high_roller' | 'monarch_slayer' | 'arena_champion' | 'royal_straight_flush'

export type BadgeCategory = 'tier' | 'achievement'

// เงื่อนไขปลดล็อค — ประเมินจริงใน badgeUnlockService.ts's isUnlocked() เทียบกับ BadgeSignals
// ที่ query มาจาก users/match_wins ครั้งเดียวต่อ request (ไม่มี query ซ้ำต่อ badge)
export type BadgeUnlockCondition =
  | { type: 'tier'; tier: TierOrderKey }              // tier_unlocked_max ถึง tier นี้แล้ว (Ceiling Model)
  | { type: 'ascendant' }                              // ascendant_status !== 'none' (เคยซื้อ Ascendant Pass)
  | { type: 'matchWinsAny' }                            // เคยชนะแมตช์อย่างน้อย 1 ครั้ง (มีแถวใน match_wins)
  | { type: 'streak7Days' }                             // streak_7days_badge = true
  | { type: 'matchWinsTop10' }                          // เคยติด Top 10 (match_wins.rank_after <= 10)
  | { type: 'crownBalance'; min: number }               // crown_balance (Earned Crown เท่านั้น) >= min
  | { type: 'matchWinsTripleSweep' }                    // เคยได้ Triple Sweep Jackpot
  | { type: 'lifetimeTokensWon'; min: number }          // ผลรวม tokens_won สะสมทุกแมตช์ >= min
  | { type: 'monarchVictories'; min: number }           // monarch_victories >= min
  | { type: 'matchWinsGrandmaster' }                    // เคยชนะแมตช์ tier='grandmaster' (Arena)
  | { type: 'matchWinsRoyalFlush' }                     // เคยได้ไพ่ Royal Flush (best_hand.rank)

export interface BadgeDefinition {
  key: BadgeKey
  name: string
  category: BadgeCategory
  price: number
  hint: string // ข้อความบอกเงื่อนไขปลดล็อค โชว์ตอน badge ยัง locked อยู่
  unlock: BadgeUnlockCondition
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  // ── Tier Progression ──────────────────────────────────────────────
  { key: 'initiate',    name: 'Initiate',    category: 'tier', price: 1000,  hint: 'Unlock Tier Initiate', unlock: { type: 'tier', tier: 'initiate' } },
  { key: 'adept',       name: 'Adept',       category: 'tier', price: 2500,  hint: 'Unlock Tier Adept', unlock: { type: 'tier', tier: 'adept' } },
  { key: 'mastermind',  name: 'Mastermind',  category: 'tier', price: 5000,  hint: 'Unlock Tier Mastermind', unlock: { type: 'tier', tier: 'mastermind' } },
  { key: 'highNoble',   name: 'High Noble',  category: 'tier', price: 9000,  hint: 'Unlock Tier High Noble', unlock: { type: 'tier', tier: 'highNoble' } },
  { key: 'grandmaster', name: 'Grandmaster', category: 'tier', price: 15000, hint: 'Unlock Tier Grandmaster (The Arena)', unlock: { type: 'tier', tier: 'grandmaster' } },
  { key: 'ascendant',   name: 'Ascendant',   category: 'tier', price: 20000, hint: 'Purchase the Ascendant Pass', unlock: { type: 'ascendant' } },

  // ── Achievement ────────────────────────────────────────────────────
  { key: 'golden_rookie',         name: 'Golden Rookie',         category: 'achievement', price: 1000,  hint: 'Win your first match', unlock: { type: 'matchWinsAny' } },
  { key: 'dedicated',             name: 'Dedicated',             category: 'achievement', price: 2500,  hint: 'Reach a 7-day Play Streak', unlock: { type: 'streak7Days' } },
  { key: 'top_10',                name: 'Top 10',                category: 'achievement', price: 6000,  hint: 'Reach Top 10 on any tier leaderboard', unlock: { type: 'matchWinsTop10' } },
  { key: 'crown_collector',       name: 'Crown Collector',       category: 'achievement', price: 6000,  hint: 'Hold 50 Earned Crown or more', unlock: { type: 'crownBalance', min: 50 } },
  { key: 'triple_jackpot',        name: 'Triple Jackpot',        category: 'achievement', price: 8000,  hint: 'Win a Triple Sweep Jackpot', unlock: { type: 'matchWinsTripleSweep' } },
  { key: 'high_roller',           name: 'High Roller',           category: 'achievement', price: 9000,  hint: 'Win 500,000 Token lifetime total', unlock: { type: 'lifetimeTokensWon', min: 500000 } },
  { key: 'monarch_slayer',        name: 'Monarch Slayer',        category: 'achievement', price: 15000, hint: 'Defeat the Monarch', unlock: { type: 'monarchVictories', min: 1 } },
  { key: 'arena_champion',        name: 'Arena Champion',        category: 'achievement', price: 25000, hint: 'Win a Grandmaster (Arena) match', unlock: { type: 'matchWinsGrandmaster' } },
  { key: 'royal_straight_flush',  name: 'Royal Straight Flush',  category: 'achievement', price: 30000, hint: 'Win a hand with a Royal Flush', unlock: { type: 'matchWinsRoyalFlush' } },
]
