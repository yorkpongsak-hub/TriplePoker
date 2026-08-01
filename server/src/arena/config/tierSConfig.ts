// Config แยกของ Arena เพื่อไม่ให้ค่าใหม่กระทบ gameConfig ของ Tier เดิม
export const tierSConfig = Object.freeze({
  featureEnabled: false,
  tierKey: 'grandmaster' as const,
  unlockTokenExclusive: 1_000_000,
  matchGames: 3,
  tableSeats: 4,
  minimumHumans: 2,
  fastBossRollHumanCount: 3,
  fastBossRollWindowSeconds: 60,
  bossEncounterRate: 0.6,
  dualBossRateWithinEncounterMax: 0.1,
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
  maximumVariableMatchCostCrest: 216,
  requiredReservationCrest: 228,
})

export { sovereignConfig, sovereignEconomyConfig } from './sovereignConfig'

export const arenaPhaseTimeoutMs = Object.freeze({
  MATCH_BUY_IN_RESERVE: 15_000,
  ARRANGE_1: 45_000,
  AUCTION_FACE_UP: 12_000,
  AUCTION_BLIND: 12_000,
  FINAL_ARRANGE: 45_000,
  JOKER_DECLARE: 15_000,
  DISCARD: 20_000,
  FINAL_LOCK: 15_000,
  GF_PILE_2: 12_000,
  GF_PILE_3_ROUND_1: 12_000,
  GF_PILE_3_ROUND_2: 12_000,
})
