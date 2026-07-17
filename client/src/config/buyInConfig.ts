// buyInConfig.ts — client-side mirror ของ server gameConfig.ts buyIn/adRescueAmount
// (TriplePoker_BuyIn_Spec_v1_0 §5) — ใช้แสดงผล/เช็คก่อนเข้าโต๊ะเท่านั้น
// การหักจริงเกิดที่ server เสมอ (escrowBuyIn ใน gameLoop.ts) — ห้ามคำนวณ token ฝั่ง client

export type BuyInTier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss'

export const BUY_IN: Record<BuyInTier, number> = {
  initiate:   500,
  adept:      2_000,  // Buy-in Spec v1.1 — sync กับ server gameConfig.ts (แก้บั๊ก game balance)
  mastermind: 9_000,
  highNoble:  30_000,
  lastBoss:   60_000,
}

export const AD_RESCUE_AMOUNT = 500
