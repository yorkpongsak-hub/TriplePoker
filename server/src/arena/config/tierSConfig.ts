// Config แยกของ Arena เพื่อไม่ให้ค่าใหม่กระทบ gameConfig ของ Tier เดิม
export const tierSConfig = Object.freeze({
  featureEnabled: false,
  tierKey: 'grandmaster' as const,
  unlockTokenExclusive: 1_000_000,
  matchGames: 3,
  tableSeats: 4,
  minimumHumans: 2,
  fastBossRollHumanCount: 3,
  // Countdown starts when the second human joins, never when the queue is created.
  thirdHumanWaitSeconds: 60,
  // มติลุงเยาะ 2026-08-08: ลดจาก 0.6 เหลือ 0.2 — ลดโอกาสเจอ Monarch/Soren ลง (Four Gods กลายเป็น 80% แทน)
  bossEncounterRate: 0.2,
  // ใช้เฉพาะโต๊ะ 2 Human: 50% ของ boss encounter (20%) = Monarch + Soren 10% ของทุกแมตช์
  // โต๊ะ 3 Human ไม่เข้าเงื่อนไข dualAllowed จึงไม่ถูกกระทบ
  dualBossRateWithinEncounterMax: 0.5,
  reconnectGraceSeconds: 8,
  quickReconnectWindowSeconds: 30,
  crestPerCrown: 12,
  tokenPerCrown: 5_000,
  tableSkinKey: 'boss_monarch',
  handLayout: 'fan' as const,
})

export const tierSEconomyConfig = Object.freeze({
  anteCrest: Object.freeze({ pile1: 3, pile2: 3, pile3: 6 }),
  auctionBidOptionsCrest: Object.freeze([0, 3, 6, 9, 12] as const),
  callCostCrest: 3,
  entryFeeCrest: 12,
  bossFeeCrest: Object.freeze({ aiBoss: 24, humanBoss: 48 }),
  maximumVariableMatchCostCrest: 216,
  // 20 Crown exactly. The extra 12-Crest buffer keeps Human and AI starting
  // balances round and makes Crown Panel conservation easy to audit.
  requiredReservationCrest: 240,
})

export { sovereignConfig, sovereignEconomyConfig } from './sovereignConfig'

export const arenaPhaseTimeoutMs = Object.freeze({
  MATCH_BUY_IN_RESERVE: 15_000,
  DUAL_BOSS_INTRO: 30_000,
  DEAL_ANIMATION: 4_000,
  ARRANGE_1: 30_000,
  AUCTION_FACE_UP: 12_000,
  AUCTION_FACE_UP_RESULT: 10_000,
  AUCTION_BLIND: 12_000,
  AUCTION_BLIND_RESULT: 4_500,
  REVEAL_PILE3_COMMUNITY_CARD_2: 3_000,
  // Temporary multi-device playtest window. Restore after Tier S flow is stable.
  FINAL_ARRANGE: 90_000,
  JOKER_DECLARE: 15_000,
  DISCARD: 20_000,
  FINAL_LOCK: 15_000,
  // Keep pile 1 in a real presentation phase long enough for the client to
  // move the locked pile 2/3 cards out of P1's hand before resolving.
  RESOLVE_PILE_1: 2_000,
  GF_PILE_2: 15_000,
  GF_PILE_3_ROUND_1: 15_000,
  GF_PILE_3_ROUND_2: 15_000,
  // ช่วงหยุดเกมจริงโชว์ผู้ชนะแต่ละกอง (ports VIP Plus's resultDisplayMs pause pattern — ดู
  // gameConfig.ts's vipPlus5.resultDisplayMs) ปรับได้หลัง playtest จริง
  REVEAL_PILE_1: 4_000,
  REVEAL_PILE_2: 4_000,
  REVEAL_PILE_3: 4_000,
})
