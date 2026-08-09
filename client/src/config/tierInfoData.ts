// ─────────────────────────────────────────────────────────────────────────────
// tierInfoData.ts -- ข้อมูลสำหรับ Tier Info popup (single source ของทั้ง 4 หน้าเกม)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// เดิม object นี้ถูก copy-paste ซ้ำ 4 ที่ (initiate/adept/mastermind/highNoble index.tsx) จน
// tokenRange และ Grand Finale Call เพี้ยนไปจาก gameConfig.ts จริงโดยไม่มีใครรู้ — ย้ายมารวมที่นี่
// ที่เดียว ห้ามประกาศ TIER_INFO_TABLE ซ้ำที่ไฟล์อื่นอีก
//
// ⚠️ ตัวเลข ante/pot/jackpot (pile1-3, payout, penalty) ไม่ได้เปลี่ยนในรอบนี้ — คงของเดิมไว้ทั้งหมด
// เปลี่ยนแค่ tokenRange (ตาม tierConfig.ts ชุดใหม่) กับ Grand Finale Call (ตาม
// server/src/config/gameConfig.ts grandFinale.callAmount ชุดใหม่ — Spec v2.0 §4)

export interface TierInfoEntry {
  name: string
  tagline: string
  tokenRange: string
  table: string
  ante: { pile1: number; pile2: number; pile3: number; call: number | '-' }
  pot: { pile1: number; pile2: number; pile3: number }
  jackpot: { payout: number; penalty: number }
  features: string[]
}

export const TIER_INFO_LABELS = ['INITIATE', 'ADEPT', 'MASTERMIND', 'HIGH NOBLE', 'LAST BOSS'] as const
export type TierInfoLabel = typeof TIER_INFO_LABELS[number]

export const TIER_INFO_TABLE: Record<TierInfoLabel, TierInfoEntry> = {
  'INITIATE': {
    name: 'Initiate', tagline: 'The First Step',
    tokenRange: '100 – 5,999',
    table: 'Bot × 3',
    ante: { pile1: 10, pile2: 20, pile3: 40, call: '-' },
    pot: { pile1: 40, pile2: 80, pile3: 160 },
    jackpot: { payout: 504, penalty: 90 },
    features: ['Simultaneous Showdown', 'No Fog of War', 'No Blind Auction', 'No Grand Finale Betting', 'Learn the basics (~6 days to advance)'],
  },
  'ADEPT': {
    name: 'Adept', tagline: 'The Rising Player',
    tokenRange: '6,000 – 19,999',
    table: 'Real Player × 1 + Bot × 2',
    ante: { pile1: 60, pile2: 100, pile3: 140, call: '-' },
    pot: { pile1: 230, pile2: 380, pile3: 530 },
    jackpot: { payout: 2052, penalty: 380 },
    features: ['Simultaneous Showdown', 'No Fog of War', 'No Blind Auction', 'No Grand Finale Betting', 'First real opponents (~12 days to advance)'],
  },
  'MASTERMIND': {
    name: 'Mastermind', tagline: 'The Auction Begins',
    tokenRange: '20,000 – 99,999',
    table: 'Real Player × 2 + Minion AI × 1',
    ante: { pile1: 200, pile2: 300, pile3: 500, call: 300 },
    pot: { pile1: 760, pile2: 1140, pile3: 1900 },
    jackpot: { payout: 6840, penalty: 1260 },
    features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Discard Phase ✅ (~31 days to advance)'],
  },
  'HIGH NOBLE': {
    name: 'High Noble', tagline: 'Audience with the Four Gods',
    tokenRange: '100,000 – 999,999',
    table: 'Real Player × 2 + Four Gods AI × 1',
    ante: { pile1: 500, pile2: 1000, pile3: 1500, call: 1000 },
    pot: { pile1: 1900, pile2: 3800, pile3: 5700 },
    jackpot: { payout: 20520, penalty: 3800 },
    features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Full Competitive Experience'],
  },
  'LAST BOSS': {
    name: 'The Last Boss', tagline: 'Beyond the Four Gods',
    tokenRange: 'Special Condition',
    table: 'Special Condition',
    ante: { pile1: 1000, pile2: 2000, pile3: 3000, call: 2000 },
    pot: { pile1: 3800, pile2: 7600, pile3: 11400 },
    jackpot: { payout: 41040, penalty: 7600 },
    features: ['Sequential Showdown', 'Fog of War ✅', 'Blind Auction ✅', 'Grand Finale Betting ✅', 'Final Challenge'],
  },
}
