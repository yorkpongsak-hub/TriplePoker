import { gameConfig } from '../../src/config/gameConfig'
import {
  getVipPlusActionOrder,
  getVipPlusCallMultiplier,
  getVipPlusDeckAccounting,
  resolveVipPlusWagerSnapshot,
  validateVipPlusFoundation,
  VIP_PLUS_BETTING_ROUNDS,
  VIP_PLUS_LAYOUT,
  VIP_PLUS_TIMING_SECONDS,
  VIP_PLUS_WAGER_OPTIONS,
} from '../../src/game/vipPlusFoundation'

describe('VIP Plus Gate 2 foundation', () => {
  test('locks exactly three wager mappings without copying existing tier economy', () => {
    expect(VIP_PLUS_WAGER_OPTIONS).toEqual([
      { id: 'INITIATE_WAGER', bettingTier: 'initiate', buyInTier: 'adept' },
      { id: 'ADEPT_WAGER', bettingTier: 'adept', buyInTier: 'mastermind' },
      { id: 'MASTERMIND_WAGER', bettingTier: 'mastermind', buyInTier: 'highNoble' },
    ])
  })

  test.each([
    ['INITIATE_WAGER', 50, 'adept'],
    ['ADEPT_WAGER', 100, 'mastermind'],
    ['MASTERMIND_WAGER', gameConfig.grandFinale.callAmount.mastermind, 'highNoble'],
  ] as const)('resolves %s from authoritative config', (optionId, callAmount, buyInTier) => {
    const snapshot = resolveVipPlusWagerSnapshot(optionId)
    expect(snapshot.callAmount).toBe(callAmount)
    expect(snapshot.buyIn).toBe(gameConfig.buyIn[buyInTier])
    expect(snapshot.ante).toEqual(gameConfig.tokenPot.tiers[snapshot.bettingTier])
    expect(snapshot.auctionBidAmounts).toEqual([0.5, 1, 1.5, 2].map(multiplier => callAmount * multiplier))
  })

  // Feedback ลุงเยาะ (รอบ 2) — center layout + Auction ผูกกับ ruleset ล้วนๆ แล้ว เหมือนกันทุกเกมในแมตช์
  // (ไม่ผูกกับ gameNumber===3 อีกต่อไป) WITH_G3_CENTER (3-3-1) ไม่มี Auction เลยทั้งแมตช์ NO_G3_CENTER
  // (3-3-0) มี Auction ทุกเกม
  test('uses 2-2-5 hands and consumes exactly 52 cards for every center ruleset', () => {
    expect(VIP_PLUS_LAYOUT.playerHandByRuleset.WITH_G3_CENTER).toEqual([2, 2, 5])
    expect(getVipPlusDeckAccounting('WITH_G3_CENTER')).toEqual({ playerCards: 45, centerCards: 7, auctionCards: 0, totalCards: 52 })
    expect(getVipPlusDeckAccounting('NO_G3_CENTER')).toEqual({ playerCards: 45, centerCards: 6, auctionCards: 1, totalCards: 52 })
  })

  // Feedback ลุงเยาะ (รอบ 3) — HOLDEM_G3: มือ 3-3-2 (24 ใบ x 5 ที่นั่ง? ไม่ใช่ 8x5=40) + กองกลาง 2-2-5=9
  // = 49 ใบ เหลือ 3 ใบไม่ได้แจกโดยตั้งใจ (bonus visual คว่ำหน้า) ไม่มี Auction
  test('HOLDEM_G3 uses 3-3-2 hands, 2-2-5 center, and leaves exactly 3 cards undealt on purpose', () => {
    expect(VIP_PLUS_LAYOUT.playerHandByRuleset.HOLDEM_G3).toEqual([3, 3, 2])
    expect(VIP_PLUS_LAYOUT.centerLayoutByRuleset.HOLDEM_G3).toEqual([2, 2, 5])
    expect(getVipPlusDeckAccounting('HOLDEM_G3')).toEqual({ playerCards: 40, centerCards: 9, auctionCards: 0, totalCards: 49 })
  })

  test('traverses five seats in both locked directions', () => {
    expect(getVipPlusActionOrder('H1', 'CLOCKWISE')).toEqual(['H1', 'H2', 'H3', 'H4', 'H5'])
    expect(getVipPlusActionOrder('H5', 'COUNTER_CLOCKWISE')).toEqual(['H5', 'H4', 'H3', 'H2', 'H1'])
  })

  // มติลุงเยาะ (รอบ 9 — "เข้มข้นยิ่งขึ้น") — ทุกกองเล่น Call/Fold 2 รอบเหมือนกันหมดแล้ว (เดิมมีแค่ G3 ที่ 2 รอบ)
  // รวม 6 รอบต่อเกม สลับ H1-clockwise/H5-counter-clockwise ทุกรอบต่อเนื่องกันตามแพทเทิร์นเดิมของ G3
  test('locks the six-round loop (every pile plays twice) and resets from the same definition each game', () => {
    expect(VIP_PLUS_BETTING_ROUNDS.map(round => [round.group, round.groupRound, round.startSeat, round.direction])).toEqual([
      [1, 1, 'H1', 'CLOCKWISE'],
      [1, 2, 'H5', 'COUNTER_CLOCKWISE'],
      [2, 1, 'H1', 'CLOCKWISE'],
      [2, 2, 'H5', 'COUNTER_CLOCKWISE'],
      [3, 1, 'H1', 'CLOCKWISE'],
      [3, 2, 'H5', 'COUNTER_CLOCKWISE'],
    ])
  })

  // มติลุงเยาะ (รอบ 9) — ตัวคูณเดิมพันต่อรอบ: รอบ 2 ของทุกกอง = 2x ของรอบแรกกองนั้น, G3 รอบแรก = 2x ของ G1
  // รอบแรก (เลย G3 รอบสอง = 4x โดยอัตโนมัติ), G2 รอบแรก = เท่ากับ G1 รอบแรก (1x, มติ 🅰️ ไม่เติมค่ากลางเอง)
  test('escalates the call multiplier per round: G1/G2 double on round 2, G3 doubles again on top of that', () => {
    expect(getVipPlusCallMultiplier(1, 1)).toBe(1)
    expect(getVipPlusCallMultiplier(1, 2)).toBe(2)
    expect(getVipPlusCallMultiplier(2, 1)).toBe(1)
    expect(getVipPlusCallMultiplier(2, 2)).toBe(2)
    expect(getVipPlusCallMultiplier(3, 1)).toBe(2)
    expect(getVipPlusCallMultiplier(3, 2)).toBe(4)
  })

  test('copies High Noble defaults and keeps new auction timings configurable', () => {
    expect(VIP_PLUS_TIMING_SECONDS.initialArrange).toBe(gameConfig.arrangementTimer.highNoble)
    expect(VIP_PLUS_TIMING_SECONDS.bettingAction).toBe(gameConfig.grandFinale.betTimer.highNoble)
    expect(VIP_PLUS_TIMING_SECONDS.auction).toBe(7)
    // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — เพิ่มจาก 15 เป็น 25 วิ ให้ผู้ชนะประมูลมีเวลาคิดเพิ่ม
    expect(VIP_PLUS_TIMING_SECONDS.postAuctionRearrange).toBe(25)
  })

  test('passes startup validation', () => {
    expect(validateVipPlusFoundation()).toBeUndefined()
  })
})
