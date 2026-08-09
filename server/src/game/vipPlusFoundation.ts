import { gameConfig } from '../config/gameConfig'

export type VipPlusSeat = 'H1' | 'H2' | 'H3' | 'H4' | 'H5'
export type VipPlusDirection = 'CLOCKWISE' | 'COUNTER_CLOCKWISE'
export type VipPlusWagerOptionId = 'INITIATE_WAGER' | 'ADEPT_WAGER' | 'MASTERMIND_WAGER'
export type VipPlusBettingTier = 'initiate' | 'adept' | 'mastermind'
export type VipPlusBuyInTier = 'adept' | 'mastermind' | 'highNoble'

// Feedback ลุงเยาะ — host เลือกกติกากองกลางตอนเปิดโต๊ะ ใช้ค่าเดียวกันทั้ง 3 เกมในแมตช์ (กันผู้เล่นงง)
// เพิ่มตัวเลือกใหม่ในอนาคตได้โดยเพิ่ม key ใน centerLayoutByRuleset/playerHandByRuleset ด้านล่าง
// HOLDEM_G3 (รอบ 3) — G1/G2 เหมือนเดิม (มือ3+กองกลาง2=5) ส่วน G3 เป็น "กอง Hold'em": มือ 2 + กองกลาง 5 = 7
// ใบ ต้องหาไพ่ที่ดีที่สุด 5 จาก 7 (ดู evaluateVipPlusPile/bestFiveOfN ใน vipPlusMatchEngine.ts) — Batch
// นี้ยังไม่ทำ "เปิดกองกลางทีละใบ" (item 4 เดิม) กองกลาง G3 ทั้ง 5 ใบเปิดเต็มตั้งแต่แจกเหมือน G1/G2 ก่อน
export type VipPlusCenterRuleset = 'WITH_G3_CENTER' | 'NO_G3_CENTER' | 'HOLDEM_G3'
export const VIP_PLUS_CENTER_RULESETS: readonly VipPlusCenterRuleset[] = ['WITH_G3_CENTER', 'NO_G3_CENTER', 'HOLDEM_G3']
export const VIP_PLUS_DEFAULT_CENTER_RULESET: VipPlusCenterRuleset = 'WITH_G3_CENTER'
// ทดลองมติลุงเยาะ — host เลือกได้ว่าจะบังคับ G1<=G2<=G3 (FOUL_HAND) หรือไม่ ค่าเริ่มต้นเปิดไว้ (กติกาหลักเดิม)
export const VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED = true

export const VIP_PLUS_SEATS: readonly VipPlusSeat[] = ['H1', 'H2', 'H3', 'H4', 'H5']

// Feedback ลุงเยาะ (รอบ 2) — เปลี่ยนจากผูก Auction กับ "เกม 3 เสมอ" มาผูกกับ ruleset แทน ทำให้ทั้ง 3 เกม
// ในแมตช์ใช้กติกาเดียวกันจริงๆ ตลอดทั้งแมตช์ (ตามที่ตั้งใจไว้แต่แรก) — WITH_G3_CENTER (3-3-1): กองกลาง G3
// เต็มทุกเกม ไม่มี Auction เลยทั้งแมตช์ NO_G3_CENTER (3-3-0): กองกลาง G3 ว่างทุกเกม มี Blind Auction ทุกเกม
// มาเติมช่องว่างแทน — HOLDEM_G3 (รอบ 3): มือผู้เล่นเปลี่ยนเป็น 3-3-2 (ไม่ใช่ 2-2-5 อีกต่อไป) เหลือไพ่ 3 ใบ
// ไม่ได้แจกเลยโดยตั้งใจ (ดู getVipPlusExpectedDeckTotal) โชว์เป็น bonus visual คว่ำหน้าฝั่ง client
export const VIP_PLUS_LAYOUT = {
  playerHandByRuleset: {
    WITH_G3_CENTER: [2, 2, 5],
    NO_G3_CENTER: [2, 2, 5],
    HOLDEM_G3: [3, 3, 2],
  },
  centerLayoutByRuleset: {
    WITH_G3_CENTER: [3, 3, 1],
    NO_G3_CENTER: [3, 3, 0],
    HOLDEM_G3: [2, 2, 5],
  },
} as const

export function getVipPlusPlayerHandLayout(ruleset: VipPlusCenterRuleset): readonly [number, number, number] {
  return VIP_PLUS_LAYOUT.playerHandByRuleset[ruleset]
}

export function getVipPlusCenterLayout(ruleset: VipPlusCenterRuleset): readonly [number, number, number] {
  return VIP_PLUS_LAYOUT.centerLayoutByRuleset[ruleset]
}

export function getVipPlusAuctionCardCount(ruleset: VipPlusCenterRuleset): 0 | 1 {
  return ruleset === 'NO_G3_CENTER' ? 1 : 0
}

// มติลุงเยาะ (รอบ 9 — "เข้มข้นยิ่งขึ้น") — ทุกกอง (G1/G2/G3) เล่น Call/Fold 2 รอบเหมือนกันหมดแล้ว (เดิมมีแค่
// G3 ที่ 2 รอบ) สลับ H1-clockwise/H5-counter-clockwise ทุกรอบต่อเนื่องกันตามแพทเทิร์นเดิมของ G3 ขยายมาใช้ทั้ง
// 6 รอบ — ตัวคูณเดิมพันต่อรอบดู VIP_PLUS_CALL_MULTIPLIERS (ผูกกับ ruleset ไหนก็ตัวเดียวกันหมดตามมติลุงเยาะ)
export const VIP_PLUS_BETTING_ROUNDS = [
  { round: 1, group: 1, groupRound: 1, startSeat: 'H1', direction: 'CLOCKWISE' },
  { round: 2, group: 1, groupRound: 2, startSeat: 'H5', direction: 'COUNTER_CLOCKWISE' },
  { round: 3, group: 2, groupRound: 1, startSeat: 'H1', direction: 'CLOCKWISE' },
  { round: 4, group: 2, groupRound: 2, startSeat: 'H5', direction: 'COUNTER_CLOCKWISE' },
  { round: 5, group: 3, groupRound: 1, startSeat: 'H1', direction: 'CLOCKWISE' },
  { round: 6, group: 3, groupRound: 2, startSeat: 'H5', direction: 'COUNTER_CLOCKWISE' },
] as const

// มติลุงเยาะ (รอบ 9) — ตัวคูณเดิมพันต่อรอบ: รอบ 2 ของทุกกอง = 2x ของรอบแรกกองนั้น, G3 รอบแรก = 2x ของ G1
// รอบแรก (เลยได้ G3 รอบสอง = 4x ของ G1 รอบแรกโดยอัตโนมัติ) — G2 รอบแรก = เท่ากับ G1 รอบแรก (1x, ไม่ขยับ
// ตามที่ลุงยืนยัน 🅰️ ไม่เติมค่ากลางเอง) ใช้เหมือนกันทุก ruleset
export const VIP_PLUS_CALL_MULTIPLIERS: Record<1 | 2 | 3, Record<1 | 2, number>> = {
  1: { 1: 1, 2: 2 },
  2: { 1: 1, 2: 2 },
  3: { 1: 2, 2: 4 },
}

export function getVipPlusCallMultiplier(group: 1 | 2 | 3, groupRound: 1 | 2): number {
  return VIP_PLUS_CALL_MULTIPLIERS[group][groupRound]
}

export const VIP_PLUS_WAGER_OPTIONS = [
  { id: 'INITIATE_WAGER', bettingTier: 'initiate', buyInTier: 'adept' },
  { id: 'ADEPT_WAGER', bettingTier: 'adept', buyInTier: 'mastermind' },
  { id: 'MASTERMIND_WAGER', bettingTier: 'mastermind', buyInTier: 'highNoble' },
] as const

export const VIP_PLUS_TIMING_SECONDS = {
  initialArrange: gameConfig.arrangementTimer.highNoble,
  bettingAction: gameConfig.grandFinale.betTimer.highNoble,
  auction: 7,
  // Feedback ลุงเยาะ (เทสมือถือรอบ 2) — เพิ่มอีก 10 วิ (เดิม 15) เพราะผู้ชนะประมูลต้องคิดเพิ่มว่าจะสลับใบไหน
  // ทิ้งจาก 10 ใบ available (9 เดิม + auction card) ไม่ใช่แค่เรียงไพ่เดิมเหมือน G1/G2/G3 ปกติ
  postAuctionRearrange: 25,
} as const

export const VIP_PLUS_AUCTION_MULTIPLIERS = [0.5, 1, 1.5, 2] as const

export interface VipPlusWagerSnapshot {
  optionId: VipPlusWagerOptionId
  bettingTier: VipPlusBettingTier
  buyInTier: VipPlusBuyInTier
  ante: { pile1: number; pile2: number; pile3: number }
  callAmount: number
  buyIn: number
  rake: number
  auctionBidAmounts: readonly [number, number, number, number]
}

export function getVipPlusActionOrder(
  startSeat: VipPlusSeat,
  direction: VipPlusDirection,
): readonly VipPlusSeat[] {
  const startIndex = VIP_PLUS_SEATS.indexOf(startSeat)
  const step = direction === 'CLOCKWISE' ? 1 : -1
  return Array.from({ length: VIP_PLUS_SEATS.length }, (_, offset) => {
    const index = (startIndex + (step * offset) + VIP_PLUS_SEATS.length) % VIP_PLUS_SEATS.length
    return VIP_PLUS_SEATS[index]
  })
}

function getCallAmount(tier: VipPlusBettingTier): number {
  if (tier === 'initiate') return gameConfig.vipPlus5.callAmountOverrides.initiate
  if (tier === 'adept') return gameConfig.vipPlus5.callAmountOverrides.adept
  return gameConfig.grandFinale.callAmount.mastermind
}

export function resolveVipPlusWagerSnapshot(optionId: VipPlusWagerOptionId): VipPlusWagerSnapshot {
  const option = VIP_PLUS_WAGER_OPTIONS.find(candidate => candidate.id === optionId)
  if (!option) throw new Error(`VIP_PLUS_UNKNOWN_WAGER_OPTION:${optionId}`)

  const ante = gameConfig.tokenPot.tiers[option.bettingTier]
  const callAmount = getCallAmount(option.bettingTier)
  const bidAmounts = VIP_PLUS_AUCTION_MULTIPLIERS.map(multiplier => callAmount * multiplier)

  return {
    optionId: option.id,
    bettingTier: option.bettingTier,
    buyInTier: option.buyInTier,
    ante: { pile1: ante.pile1, pile2: ante.pile2, pile3: ante.pile3 },
    callAmount,
    buyIn: gameConfig.buyIn[option.buyInTier],
    rake: gameConfig.tokenPot.rake,
    auctionBidAmounts: bidAmounts as [number, number, number, number],
  }
}

export function getVipPlusDeckAccounting(ruleset: VipPlusCenterRuleset = VIP_PLUS_DEFAULT_CENTER_RULESET) {
  const playerCards = VIP_PLUS_SEATS.length * getVipPlusPlayerHandLayout(ruleset).reduce<number>((sum, count) => sum + count, 0)
  const centerCards = getVipPlusCenterLayout(ruleset).reduce<number>((sum, count) => sum + count, 0)
  const auctionCards = getVipPlusAuctionCardCount(ruleset)
  return { playerCards, centerCards, auctionCards, totalCards: playerCards + centerCards + auctionCards }
}

// HOLDEM_G3 (รอบ 3, มติลุงเยาะ) — เหลือไพ่ 3 ใบไม่ได้แจกโดยตั้งใจ (5×8=40 + กองกลาง 9 = 49 ไม่ใช่ 52)
// โชว์เป็น bonus visual คว่ำหน้าฝั่ง client ไม่กระทบเกมเลย — ruleset อื่นยังต้องครบ 52 เป๊ะเหมือนเดิมทุกจุด
function getVipPlusExpectedDeckTotal(ruleset: VipPlusCenterRuleset): number {
  if (ruleset === 'HOLDEM_G3') return 49
  return 52
}

export function validateVipPlusFoundation(): void {
  const errors: string[] = []

  if (VIP_PLUS_SEATS.length !== 5 || new Set(VIP_PLUS_SEATS).size !== 5) errors.push('ต้องมี H1-H5 ไม่ซ้ำกัน exactly 5 seats')
  // เช็คครบทุก ruleset ที่เลือกได้ (ไม่ใช่แค่ default) เพราะ host เลือกได้ตอนเปิดโต๊ะ
  for (const ruleset of VIP_PLUS_CENTER_RULESETS) {
    const accounting = getVipPlusDeckAccounting(ruleset)
    const expected = getVipPlusExpectedDeckTotal(ruleset)
    if (accounting.totalCards !== expected) errors.push(`[${ruleset}] ใช้ไพ่ ${accounting.totalCards} ใบ ไม่เท่ากับ ${expected}`)
  }

  for (const option of VIP_PLUS_WAGER_OPTIONS) {
    const snapshot = resolveVipPlusWagerSnapshot(option.id)
    if (!Number.isInteger(snapshot.callAmount) || snapshot.callAmount <= 0) errors.push(`${option.id} Call ต้องเป็น positive integer`)
    if (!Number.isInteger(snapshot.buyIn) || snapshot.buyIn <= 0) errors.push(`${option.id} Buy-in ต้องเป็น positive integer`)
    if (snapshot.auctionBidAmounts.some(amount => !Number.isInteger(amount) || amount < 0)) {
      errors.push(`${option.id} สร้างราคา auction ที่ไม่เป็น integer`)
    }
    // มติลุงเยาะ (รอบ 9) — เช็คด้วยว่าตัวคูณต่อรอบ (1x/2x/4x) คูณแล้วยังเป็น positive integer ทุกกอง/ทุกรอบ
    for (const round of VIP_PLUS_BETTING_ROUNDS) {
      const amount = snapshot.callAmount * getVipPlusCallMultiplier(round.group, round.groupRound)
      if (!Number.isInteger(amount) || amount <= 0) {
        errors.push(`${option.id} G${round.group} รอบ${round.groupRound} Call ${amount} ไม่เป็น positive integer`)
      }
    }
  }

  if (errors.length > 0) throw new Error('[vipPlusFoundation] validation failed:\n' + errors.map(error => `  - ${error}`).join('\n'))
}
