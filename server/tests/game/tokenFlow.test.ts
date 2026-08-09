// ─────────────────────────────────────────────────────────────────────────────
// tokenFlow.test.ts — Unit Tests พิสูจน์ "กฎเหล็ก" ของ Token Flow Panel
// อ้างอิง: TriplePoker_TokenFlowPanel_Spec_v1_1 (ขอบเขต Tier C / Initiate)
//
//     Pot G1 + Pot G2 + Pot G3 + Fee & Rake + All Stack = 4 x Buy-in  เสมอ
//
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collectAntes, settleRound, computeTotal, checkConservation, chargeAutoSortFee,
  chargeAuctionBid, chargeGrandFinaleCall, settleMastermindRound,
  PileStakes, PileWinners,
} from '../../src/game/tokenFlow'
import { gameConfig, getAutoSortFee } from '../../src/config/gameConfig'

// ดึงค่าจริงจาก config (ไม่ hardcode) — ถ้าลุงปรับ config เทสจะจับได้ทันทีว่าเลขคาดหวังเปลี่ยน
const STAKES: PileStakes = gameConfig.tokenPot.tiers.initiate
const RAKE = gameConfig.tokenPot.rake
const BUY_IN = gameConfig.buyIn.initiate

const HUMAN = 'HUMAN'
const P2 = 'AI_SAGE'
const P3 = 'AI_RECKLESS'
const P4 = 'AI_GHOST'
const PLAYERS = [HUMAN, P2, P3, P4]

const TOTAL_EXPECTED = BUY_IN * PLAYERS.length // 500 x 4 = 2000

/** stack เริ่มต้น: ทุก seat รวม AI ได้ Buy-in เท่ากันเป๊ะ (Spec 7.1) */
function freshStacks(): Record<string, number> {
  const s: Record<string, number> = {}
  PLAYERS.forEach(id => { s[id] = BUY_IN })
  return s
}

/** ย่อ: ต้นรอบหัก ante แล้ว settle ตามผู้ชนะที่กำหนด */
function playRound(
  stacks: Record<string, number>,
  feeRake: number,
  winners: PileWinners,
) {
  const afterAnte = collectAntes(stacks, PLAYERS, STAKES)
  return settleRound({
    stacks: afterAnte.stacks,
    pot: afterAnte.pot,
    feeRake,
    playerIds: PLAYERS,
    winners,
    stakes: STAKES,
    rake: RAKE,
  })
}

// ─────────────────────────────────────────────────────────────
describe('config ของ Tier C ตรงตามที่ Spec คำนวณไว้', () => {
  test('ante 10/20/40, rake 5%, buy-in 500', () => {
    expect(STAKES.pile1).toBe(10)
    expect(STAKES.pile2).toBe(20)
    expect(STAKES.pile3).toBe(40)
    expect(RAKE).toBe(0.05)
    expect(BUY_IN).toBe(500)
  })

  test('Buy-in ครอบคลุม ante ครบ 5 รอบ (Spec 5.2 ไม่มีหนี้ข้ามเกม)', () => {
    const antePerRound = STAKES.pile1 + STAKES.pile2 + STAKES.pile3 // 70
    expect(antePerRound * 5).toBeLessThan(BUY_IN) // 350 < 500
  })
})

// ─────────────────────────────────────────────────────────────
describe('collectAntes — Ante ไหลจาก Stack เข้า Pot', () => {
  test('ทุก seat จ่าย ante รวม 70 และ Pot = [40, 80, 160]', () => {
    const r = collectAntes(freshStacks(), PLAYERS, STAKES)
    PLAYERS.forEach(id => expect(r.stacks[id]).toBe(BUY_IN - 70))
    expect(r.pot).toEqual([40, 80, 160])
  })

  test('กฎเหล็กยังคงที่หลังหัก ante (เงินแค่ย้ายที่ ไม่หาย)', () => {
    const r = collectAntes(freshStacks(), PLAYERS, STAKES)
    expect(computeTotal(r.stacks, PLAYERS, r.pot, 0)).toBe(TOTAL_EXPECTED)
  })

  test('ไม่ mutate input เดิม (pure function)', () => {
    const original = freshStacks()
    collectAntes(original, PLAYERS, STAKES)
    expect(original[HUMAN]).toBe(BUY_IN)
  })
})

// ─────────────────────────────────────────────────────────────
describe('settleRound — รอบปกติ (ผู้ชนะคนละกอง)', () => {
  const winners: PileWinners = [HUMAN, P2, P3]

  test('Fee & Rake ได้ 14 (rake 5% ของ 3 กอง: 2 + 4 + 8)', () => {
    const r = playRound(freshStacks(), 0, winners)
    expect(r.feeRake).toBe(14)
  })

  test('Pot reset เป็น 0 ทั้ง 3 กองหลัง settle', () => {
    const r = playRound(freshStacks(), 0, winners)
    expect(r.pot).toEqual([0, 0, 0])
  })

  test('displayDeltas ตรงกับสูตร calcDeltas เดิมเป๊ะ (กัน UI แสดงเลขเพี้ยน)', () => {
    const r = playRound(freshStacks(), 0, winners)
    // G1 net 38 / G2 net 76 / G3 net 152
    expect(r.displayDeltas[HUMAN]).toBe(28 - 20 - 40)   // -32
    expect(r.displayDeltas[P2]).toBe(-10 + 56 - 40)     // +6
    expect(r.displayDeltas[P3]).toBe(-10 - 20 + 112)    // +82
    expect(r.displayDeltas[P4]).toBe(-70)               // ไม่ชนะเลย
  })

  test('ผลรวม displayDeltas = -Fee & Rake (เงินที่หายจากมือผู้เล่นไปเข้าบ้านพอดี)', () => {
    const r = playRound(freshStacks(), 0, winners)
    const sum = PLAYERS.reduce((a, id) => a + r.displayDeltas[id], 0)
    expect(sum).toBe(-r.feeRake)
  })

  test('กฎเหล็ก: Total = 2000', () => {
    const r = playRound(freshStacks(), 0, winners)
    expect(computeTotal(r.stacks, PLAYERS, r.pot, r.feeRake)).toBe(TOTAL_EXPECTED)
  })

  test('ไม่มี Triple Sweep เมื่อผู้ชนะคนละกอง', () => {
    const r = playRound(freshStacks(), 0, winners)
    expect(r.jackpotWinner).toBeNull()
    expect(r.jackpotBonus).toBe(0)
    expect(r.jackpotRake).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
describe('settleRound — AI ชนะ (มติลุงเยาะ Q1: AI เก็บเงินเข้ากระเป๋าตัวเอง ไม่ burn)', () => {
  test('AI ที่ชนะได้ net เข้า stack จริง ไม่ไหลเข้า Fee & Rake', () => {
    const r = playRound(freshStacks(), 0, [P2, P2, P2])
    // P2 ได้ net 266 + jackpot extra 101 = 367 (stack 430 -> 797)
    expect(r.stacks[P2]).toBe(BUY_IN - 70 + 266 + 101)
    expect(r.stacks[P2]).toBeGreaterThan(BUY_IN)
  })

  test('กฎเหล็กยังคงที่แม้ AI กวาดเงินไปหมด', () => {
    const r = playRound(freshStacks(), 0, [P2, P2, P2])
    expect(computeTotal(r.stacks, PLAYERS, r.pot, r.feeRake)).toBe(TOTAL_EXPECTED)
  })
})

// ─────────────────────────────────────────────────────────────
describe('settleRound — Triple Sweep (สูตร ante x ผู้แพ้ ตามมติลุงเยาะ Q3)', () => {
  const sweep: PileWinners = [HUMAN, HUMAN, HUMAN]

  test('bonus = ante กอง3 x ผู้แพ้ 3 คน = 120', () => {
    const r = playRound(freshStacks(), 0, sweep)
    expect(r.jackpotWinner).toBe(HUMAN)
    expect(r.jackpotBonus).toBe(120)
  })

  test('jackpotRake = floor((266 + 120) x 5%) = 19', () => {
    const r = playRound(freshStacks(), 0, sweep)
    expect(r.jackpotRake).toBe(19)
  })

  test('Fee & Rake รอบนั้น = 33 (14 ปกติ + 19 jackpot)', () => {
    const r = playRound(freshStacks(), 0, sweep)
    expect(r.feeRake).toBe(33)
  })

  test('ผู้ชนะได้สุทธิ +297 / ผู้แพ้เสียคนละ -110', () => {
    const r = playRound(freshStacks(), 0, sweep)
    expect(r.displayDeltas[HUMAN]).toBe(297)
    expect(r.displayDeltas[P2]).toBe(-110)
    expect(r.displayDeltas[P3]).toBe(-110)
    expect(r.displayDeltas[P4]).toBe(-110)
  })

  test('ส่วนเกินดูดจาก Stack ผู้แพ้จริง ไม่เสกจากอากาศ (Spec 3.1 กฎทอง)', () => {
    const r = playRound(freshStacks(), 0, sweep)
    // ผู้แพ้: 500 - 70 (ante) - 40 (bonus) = 390
    expect(r.stacks[P2]).toBe(390)
    expect(r.stacks[P3]).toBe(390)
    expect(r.stacks[P4]).toBe(390)
    expect(r.stacks[HUMAN]).toBe(797)
  })

  test('กฎเหล็ก: Total = 2000', () => {
    const r = playRound(freshStacks(), 0, sweep)
    expect(computeTotal(r.stacks, PLAYERS, r.pot, r.feeRake)).toBe(TOTAL_EXPECTED)
  })

  test('Buy-in 500 รับ Triple Sweep 2 ครั้ง + ante อีก 3 รอบได้โดยไม่ติดลบ', () => {
    // เหตุผลที่เลือกสูตรนี้แทน Pot x2 ของ Spec (ซึ่งจะทำให้ stack ติดลบ)
    const worstCase = 110 * 2 + 70 * 3 // 430
    expect(worstCase).toBeLessThan(BUY_IN)
  })
})

// ─────────────────────────────────────────────────────────────
describe('settleRound — Foul (มติลุงเยาะ Q4/Q5)', () => {
  test('Q4: foul รายคน คงพฤติกรรมเดิม — ante ไหลไปหาผู้ชนะกอง ไม่เข้า Fee & Rake', () => {
    // P4 foul ถูกตัดออกจากการตัดสิน แต่ผู้ชนะกองยังได้ Pot เต็มตามปกติ
    const r = playRound(freshStacks(), 0, [HUMAN, P2, P3])
    expect(r.feeRake).toBe(14) // เท่ากับรอบปกติ ไม่มี penalty เพิ่ม
    expect(r.displayDeltas[P4]).toBe(-70)
  })

  test('Q5: foul ครบทุกคน -> Pot ทั้ง 280 เข้า Fee & Rake', () => {
    const r = playRound(freshStacks(), 0, ['', '', ''])
    expect(r.feeRake).toBe(280)
    expect(r.pot).toEqual([0, 0, 0])
    PLAYERS.forEach(id => expect(r.displayDeltas[id]).toBe(-70))
  })

  test('Q5: กฎเหล็กยังคงที่ (Pot ไม่ค้างไม่มีเจ้าของ)', () => {
    const r = playRound(freshStacks(), 0, ['', '', ''])
    expect(computeTotal(r.stacks, PLAYERS, r.pot, r.feeRake)).toBe(TOTAL_EXPECTED)
  })

  test('บางกองไม่มีผู้ชนะ บางกองมี -> คิดแยกกองถูกต้อง', () => {
    const r = playRound(freshStacks(), 0, [HUMAN, '', P3])
    // G1 rake 2 + G2 ทั้งก้อน 80 + G3 rake 8
    expect(r.feeRake).toBe(2 + 80 + 8)
    expect(computeTotal(r.stacks, PLAYERS, r.pot, r.feeRake)).toBe(TOTAL_EXPECTED)
  })
})

// ─────────────────────────────────────────────────────────────
describe('กฎเหล็กตลอดทั้งเกม 5 รอบ (Fee & Rake สะสม ไม่ reset ระหว่างรอบ)', () => {
  test('เล่นครบ 5 รอบผสมทุกสถานการณ์ Total = 2000 ทุกรอบ', () => {
    const scenarios: PileWinners[] = [
      [HUMAN, P2, P3],      // ปกติ
      [HUMAN, HUMAN, HUMAN], // triple sweep human
      [P2, P2, P2],          // triple sweep AI
      ['', '', ''],          // foul ครบ
      [P4, HUMAN, ''],       // ผสม
    ]

    let stacks = freshStacks()
    let feeRake = 0

    scenarios.forEach((winners, i) => {
      const r = playRound(stacks, feeRake, winners)
      stacks = r.stacks
      feeRake = r.feeRake
      expect(computeTotal(stacks, PLAYERS, r.pot, feeRake)).toBe(TOTAL_EXPECTED)
      expect(checkConservation(stacks, PLAYERS, r.pot, feeRake, BUY_IN, `round ${i + 1}`)).toBe(true)
    })

    // Fee & Rake สะสมยาวทั้งเกม ไม่ reset (Spec 5 Reset scope)
    expect(feeRake).toBeGreaterThan(0)
  })

  test('Stack ติดลบได้โดยกฎเหล็กไม่พัง (Spec 8 - CoreRules 1.6)', () => {
    // บีบให้ P4 โดนกวาดรัว 5 รอบติด
    let stacks = freshStacks()
    let feeRake = 0
    for (let i = 0; i < 5; i++) {
      const r = playRound(stacks, feeRake, [HUMAN, HUMAN, HUMAN])
      stacks = r.stacks
      feeRake = r.feeRake
      expect(computeTotal(stacks, PLAYERS, r.pot, feeRake)).toBe(TOTAL_EXPECTED)
    }
    expect(stacks[P4]).toBe(BUY_IN - 110 * 5) // -50 ติดลบจริง
    expect(stacks[P4]).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Auto Sort Fee (มติลุงเยาะ 2026-07-25: ไม่มี free rounds แล้ว ฟรีเฉพาะ Tier C)
// ─────────────────────────────────────────────────────────────
describe('chargeAutoSortFee — Stack ผู้กด -> Fee & Rake', () => {
  const ADEPT_FEE = getAutoSortFee('adept')

  // สูตร % ของ Ante กอง 3 (มติลุงเยาะ 2026-07-25 ชุดที่ 2): C Free / B 25% / A 33% / A+ 50%
  test('config: Tier C ฟรี (0) / Adept 35 (25% x 140) / Mastermind 165 / High Noble 750', () => {
    expect(getAutoSortFee('initiate')).toBe(0)
    expect(ADEPT_FEE).toBe(35)
    expect(getAutoSortFee('mastermind')).toBe(165)
    expect(getAutoSortFee('highNoble')).toBe(750)
  })

  test('fee แพงขึ้นตาม Tier เสมอ (เจตนา: กันติดนิสัยพึ่ง Auto Sort ก่อนขึ้น Arena)', () => {
    const fees = ['initiate', 'adept', 'mastermind', 'highNoble'].map(getAutoSortFee)
    fees.forEach((f, i) => { if (i > 0) expect(f).toBeGreaterThan(fees[i - 1]) })
  })

  test('fee = 0 (Tier C) -> ผ่านเสมอ ไม่มีการไหลใดๆ', () => {
    const r = chargeAutoSortFee(freshStacks(), 0, HUMAN, 0)
    expect(r.ok).toBe(true)
    expect(r.charged).toBe(0)
    expect(r.stacks[HUMAN]).toBe(BUY_IN)
    expect(r.feeRake).toBe(0)
  })

  test('Adept: หัก 35 จาก stack ผู้กด เข้า Fee & Rake', () => {
    const r = chargeAutoSortFee(freshStacks(), 0, HUMAN, ADEPT_FEE)
    expect(r.ok).toBe(true)
    expect(r.charged).toBe(35)
    expect(r.stacks[HUMAN]).toBe(BUY_IN - 35)
    expect(r.feeRake).toBe(35)
  })

  test('หักเฉพาะคนกด คนอื่นไม่กระทบ', () => {
    const r = chargeAutoSortFee(freshStacks(), 0, HUMAN, ADEPT_FEE)
    expect(r.stacks[P2]).toBe(BUY_IN)
    expect(r.stacks[P3]).toBe(BUY_IN)
  })

  test('token ไม่พอ -> ok=false และไม่มีการไหลใดๆ (Spec ข้อ 8 ปุ่ม disabled)', () => {
    const poor = freshStacks()
    poor[HUMAN] = 29
    const r = chargeAutoSortFee(poor, 100, HUMAN, ADEPT_FEE)
    expect(r.ok).toBe(false)
    expect(r.charged).toBe(0)
    expect(r.stacks[HUMAN]).toBe(29)
    expect(r.feeRake).toBe(100)
  })

  test('token พอดีเป๊ะ -> หักได้ เหลือ 0', () => {
    const exact = freshStacks()
    exact[HUMAN] = ADEPT_FEE
    const r = chargeAutoSortFee(exact, 0, HUMAN, ADEPT_FEE)
    expect(r.ok).toBe(true)
    expect(r.stacks[HUMAN]).toBe(0)
  })

  test('กฎเหล็กคงที่หลังหัก fee (เงินย้ายที่ ไม่หาย)', () => {
    const r = chargeAutoSortFee(freshStacks(), 0, HUMAN, ADEPT_FEE)
    expect(computeTotal(r.stacks, PLAYERS, [0, 0, 0], r.feeRake)).toBe(TOTAL_EXPECTED)
  })

  test('ไม่ mutate input เดิม (pure function)', () => {
    const original = freshStacks()
    chargeAutoSortFee(original, 0, HUMAN, ADEPT_FEE)
    expect(original[HUMAN]).toBe(BUY_IN)
  })
})

// ─────────────────────────────────────────────────────────────
// Tier B (Adept) — engine เดียวกันแต่คนละค่า: 2 Human + 2 AI, buy-in 2,000
// ─────────────────────────────────────────────────────────────
describe('กฎเหล็กของ Adept (Total = 8,000)', () => {
  const A_STAKES: PileStakes = gameConfig.tokenPot.tiers.adept
  const A_BUYIN = gameConfig.buyIn.adept
  const A_TOTAL = A_BUYIN * 4
  const H1 = 'HUMAN_1', H2 = 'HUMAN_2', AI1 = 'AI_SAGE', AI2 = 'AI_GHOST'
  const A_PLAYERS = [H1, H2, AI1, AI2]

  const aFresh = () => {
    const s: Record<string, number> = {}
    A_PLAYERS.forEach(id => { s[id] = A_BUYIN })
    return s
  }
  const aPlay = (stacks: Record<string, number>, feeRake: number, winners: PileWinners) => {
    const ante = collectAntes(stacks, A_PLAYERS, A_STAKES)
    return settleRound({
      stacks: ante.stacks, pot: ante.pot, feeRake,
      playerIds: A_PLAYERS, winners, stakes: A_STAKES, rake: RAKE,
    })
  }

  test('config Adept: ante 60/100/140, buy-in 2,000', () => {
    expect([A_STAKES.pile1, A_STAKES.pile2, A_STAKES.pile3]).toEqual([60, 100, 140])
    expect(A_BUYIN).toBe(2_000)
  })

  test('Buy-in ครอบคลุม ante ครบ 5 รอบ (300 x 5 = 1,500 < 2,000)', () => {
    expect((A_STAKES.pile1 + A_STAKES.pile2 + A_STAKES.pile3) * 5).toBeLessThan(A_BUYIN)
  })

  test('Ante -> Pot = [240, 400, 560]', () => {
    const r = collectAntes(aFresh(), A_PLAYERS, A_STAKES)
    expect(r.pot).toEqual([240, 400, 560])
    expect(computeTotal(r.stacks, A_PLAYERS, r.pot, 0)).toBe(A_TOTAL)
  })

  test('รอบปกติ: Fee & Rake = 60 (12+20+28)', () => {
    const r = aPlay(aFresh(), 0, [H1, H2, AI1])
    expect(r.feeRake).toBe(60)
    expect(computeTotal(r.stacks, A_PLAYERS, r.pot, r.feeRake)).toBe(A_TOTAL)
  })

  test('Triple Sweep: Fee & Rake = 138 / ผู้ชนะ +1,182 / ผู้แพ้ -440', () => {
    const r = aPlay(aFresh(), 0, [H1, H1, H1])
    expect(r.jackpotBonus).toBe(420)   // ante กอง3 (140) x ผู้แพ้ 3 คน
    expect(r.jackpotRake).toBe(78)     // floor((1,140 + 420) x 5%)
    expect(r.feeRake).toBe(138)
    expect(r.displayDeltas[H1]).toBe(1182)
    expect(r.displayDeltas[H2]).toBe(-440)
    expect(computeTotal(r.stacks, A_PLAYERS, r.pot, r.feeRake)).toBe(A_TOTAL)
  })

  test('Buy-in 2,000 รับ Triple Sweep 2 ครั้ง + ante 3 รอบได้โดยไม่ติดลบ', () => {
    expect(440 * 2 + 300 * 3).toBeLessThan(A_BUYIN) // 1,780 < 2,000
  })

  test('foul ครบทุกคน -> Pot ทั้ง 1,200 เข้า Fee & Rake', () => {
    const r = aPlay(aFresh(), 0, ['', '', ''])
    expect(r.feeRake).toBe(1_200)
    expect(computeTotal(r.stacks, A_PLAYERS, r.pot, r.feeRake)).toBe(A_TOTAL)
  })

  test('เล่นครบ 5 รอบ + กด Auto Sort ระหว่างทาง -> Total = 8,000 ทุกรอบ', () => {
    const scenarios: PileWinners[] = [
      [H1, H2, AI1], [H1, H1, H1], [AI2, AI2, AI2], ['', '', ''], [H2, AI1, H1],
    ]
    let stacks = aFresh()
    let feeRake = 0

    scenarios.forEach((winners, i) => {
      // H1 กด Auto Sort ทุกรอบ (Adept เสีย 35 ทุกครั้ง ไม่มีรอบฟรี)
      const fee = chargeAutoSortFee(stacks, feeRake, H1, getAutoSortFee('adept'))
      stacks = fee.stacks
      feeRake = fee.feeRake

      const r = aPlay(stacks, feeRake, winners)
      stacks = r.stacks
      feeRake = r.feeRake
      expect(computeTotal(stacks, A_PLAYERS, r.pot, feeRake)).toBe(A_TOTAL)
      expect(checkConservation(stacks, A_PLAYERS, r.pot, feeRake, A_BUYIN, `adept round ${i + 1}`)).toBe(true)
    })

    // Auto Sort 5 ครั้ง x 35 = 175 ต้องอยู่ใน Fee & Rake ทั้งหมด
    expect(feeRake).toBeGreaterThanOrEqual(175)
  })
})

// ─────────────────────────────────────────────────────────────
// Mastermind (Tier A) — Total = 36,000
// Tier แรกที่มีเงินไหลระหว่างรอบนอกเหนือจาก Ante: Blind Auction + Grand Finale Call
// ─────────────────────────────────────────────────────────────
describe('กฎเหล็กของ Mastermind (Total = 36,000)', () => {
  const M_STAKES: PileStakes = gameConfig.tokenPot.tiers.mastermind
  const M_BUYIN = gameConfig.buyIn.mastermind
  const M_TOTAL = M_BUYIN * 4
  const M_FEE = getAutoSortFee('mastermind')
  const M_BIDS = gameConfig.blindAuction.bidLevels.mastermind
  const M_CALL = gameConfig.grandFinale.callAmount.mastermind as number
  const M_PLAYERS = [HUMAN, P2, P3, P4]

  const mFresh = () => {
    const s: Record<string, number> = {}
    M_PLAYERS.forEach(id => { s[id] = M_BUYIN })
    return s
  }

  test('config Mastermind: ante 200/300/500, buy-in 15,000, autoSort 165 (33% ของ ante กอง 3), call 300', () => {
    expect([M_STAKES.pile1, M_STAKES.pile2, M_STAKES.pile3]).toEqual([200, 300, 500])
    expect(M_BUYIN).toBe(15_000)     // ขึ้นจาก 9,000 เพราะ worst case เดิมทะลุ buy-in
    expect(M_FEE).toBe(165)          // 33% x 500
    expect(M_CALL).toBe(300)         // Economy Progression Spec v2.0 §4 (2026-07-30) — ลดจาก 600 เหลือครึ่ง
    expect(M_BIDS).toEqual([25, 50, 100, 150])
  })

  test('Ante -> Pot = [800, 1200, 2000]', () => {
    const r = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
    expect(r.pot).toEqual([800, 1_200, 2_000])
    expect(computeTotal(r.stacks, M_PLAYERS, r.pot, 0)).toBe(M_TOTAL)
  })

  // ─── Blind Auction: Stack -> Fee & Rake ────────────────────
  describe('chargeAuctionBid — เงินประมูลเข้า Fee & Rake (ไม่ burn ทันที)', () => {
    test('หักจาก stack ผู้ชนะประมูล เข้า Fee & Rake เต็มจำนวน', () => {
      const r = chargeAuctionBid(mFresh(), 0, HUMAN, 150)
      expect(r.ok).toBe(true)
      expect(r.charged).toBe(150)
      expect(r.stacks[HUMAN]).toBe(M_BUYIN - 150)
      expect(r.feeRake).toBe(150)
    })

    test('เงินไม่ได้หายจากโต๊ะ — Total ยังเท่าเดิมเป๊ะ (หัวใจของมติลุงเยาะ)', () => {
      const r = chargeAuctionBid(mFresh(), 0, HUMAN, 150)
      expect(computeTotal(r.stacks, M_PLAYERS, [0, 0, 0], r.feeRake)).toBe(M_TOTAL)
    })

    test('ประมูลทั้ง 2 ใบ (คนละคน) -> Fee & Rake สะสมทั้งคู่', () => {
      const a = chargeAuctionBid(mFresh(), 0, HUMAN, 100)
      const b = chargeAuctionBid(a.stacks, a.feeRake, P2, 50)
      expect(b.feeRake).toBe(150)
      expect(computeTotal(b.stacks, M_PLAYERS, [0, 0, 0], b.feeRake)).toBe(M_TOTAL)
    })

    test('token ไม่พอ -> ไม่มีการไหลใดๆ stack ไม่ติดลบ', () => {
      const poor = { ...mFresh(), [HUMAN]: 20 }
      const r = chargeAuctionBid(poor, 0, HUMAN, 150)
      expect(r.ok).toBe(false)
      expect(r.charged).toBe(0)
      expect(r.stacks[HUMAN]).toBe(20)
      expect(r.feeRake).toBe(0)
    })

    test('ไม่มีใครประมูล (amount 0) -> ผ่านได้ ไม่แตะอะไรเลย', () => {
      const r = chargeAuctionBid(mFresh(), 77, HUMAN, 0)
      expect(r.ok).toBe(true)
      expect(r.charged).toBe(0)
      expect(r.feeRake).toBe(77)
    })
  })

  // ─── Grand Finale Call: Stack -> Pot 3 ─────────────────────
  describe('chargeGrandFinaleCall — เงิน Call เข้า Pot 3', () => {
    test('หักจาก stack เข้า pot[2] เท่านั้น กองอื่นไม่ขยับ', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const r = chargeGrandFinaleCall(ante.stacks, ante.pot, HUMAN, M_CALL)
      expect(r.ok).toBe(true)
      expect(r.pot).toEqual([800, 1_200, 2_300])
      expect(r.stacks[HUMAN]).toBe(M_BUYIN - 1_000 - M_CALL) // ante 1,000 + call 300
      expect(computeTotal(r.stacks, M_PLAYERS, r.pot, 0)).toBe(M_TOTAL)
    })

    test('Call ครบ 4 คน 2 รอบ -> Pot 3 = 2,000 + 2,400', () => {
      let stacks = collectAntes(mFresh(), M_PLAYERS, M_STAKES).stacks
      let pot = collectAntes(mFresh(), M_PLAYERS, M_STAKES).pot
      for (let round = 0; round < 2; round++) {
        for (const id of M_PLAYERS) {
          const r = chargeGrandFinaleCall(stacks, pot, id, M_CALL)
          stacks = r.stacks
          pot = r.pot
        }
      }
      expect(pot[2]).toBe(2_000 + M_CALL * 8)
      expect(computeTotal(stacks, M_PLAYERS, pot, 0)).toBe(M_TOTAL)
    })

    test('token ไม่พอ Call -> ok:false (ผู้เล่นถูกบังคับ Fold ไม่มี all-in ในเกมนี้)', () => {
      const poor = { ...mFresh(), [HUMAN]: 100 }
      const r = chargeGrandFinaleCall(poor, [0, 0, 0], HUMAN, M_CALL)
      expect(r.ok).toBe(false)
      expect(r.stacks[HUMAN]).toBe(100)
      expect(r.pot).toEqual([0, 0, 0])
    })
  })

  // ─── settleMastermindRound ─────────────────────────────────
  describe('settleMastermindRound — จ่าย Pot + รายงาน displayDeltas ให้ตรงที่เสียจริง', () => {
    const mSettle = (
      stacks: Record<string, number>, pot: [number, number, number],
      feeRake: number, winners: PileWinners, extraPaid?: Record<string, number>,
    ) => settleMastermindRound({
      stacks, pot, feeRake, playerIds: M_PLAYERS, winners, stakes: M_STAKES, rake: RAKE, extraPaid,
    })

    test('รอบปกติไม่มี Auction/Call -> ผลเท่ากับ settleRound ทุกประการ', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const withExtra = mSettle(ante.stacks, ante.pot, 0, [HUMAN, P2, P3])
      const plain = settleRound({
        stacks: ante.stacks, pot: ante.pot, feeRake: 0,
        playerIds: M_PLAYERS, winners: [HUMAN, P2, P3], stakes: M_STAKES, rake: RAKE,
      })
      expect(withExtra.displayDeltas).toEqual(plain.displayDeltas)
      expect(withExtra.feeRake).toBe(plain.feeRake)
    })

    test('Fee & Rake รอบปกติ = 200 (40+60+100)', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const r = mSettle(ante.stacks, ante.pot, 0, [HUMAN, P2, P3])
      expect(r.feeRake).toBe(200)
      expect(computeTotal(r.stacks, M_PLAYERS, r.pot, r.feeRake)).toBe(M_TOTAL)
    })

    test('extraPaid ไม่หักเงินซ้ำ — แตะแค่ displayDeltas ตัวเลข stack ต้องไม่ขยับ', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const noExtra = mSettle(ante.stacks, ante.pot, 0, [HUMAN, P2, P3])
      const withExtra = mSettle(ante.stacks, ante.pot, 0, [HUMAN, P2, P3], { [HUMAN]: 750 })

      expect(withExtra.stacks[HUMAN]).toBe(noExtra.stacks[HUMAN])           // stack เท่าเดิม
      expect(withExtra.displayDeltas[HUMAN]).toBe(noExtra.displayDeltas[HUMAN] - 750) // แต่ UI เห็นว่าเสียเพิ่ม
    })

    test('ผู้ชนะกอง 3 ได้ Pot ที่โตจาก Call ไปแล้ว (2,000 + 600 = 2,600 -> net 2,470)', () => {
      let stacks = collectAntes(mFresh(), M_PLAYERS, M_STAKES).stacks
      let pot = collectAntes(mFresh(), M_PLAYERS, M_STAKES).pot
      const c1 = chargeGrandFinaleCall(stacks, pot, HUMAN, M_CALL); stacks = c1.stacks; pot = c1.pot
      const c2 = chargeGrandFinaleCall(stacks, pot, P2, M_CALL);    stacks = c2.stacks; pot = c2.pot

      expect(pot[2]).toBe(2_600)
      const r = mSettle(stacks, pot, 0, ['', '', HUMAN], { [HUMAN]: M_CALL, [P2]: M_CALL })
      // กอง 1+2 ไม่มีผู้ชนะ (ทุกคน foul/fold) -> เข้า Fee & Rake ทั้งก้อน
      expect(r.feeRake).toBe(800 + 1_200 + 130)
      expect(computeTotal(r.stacks, M_PLAYERS, r.pot, r.feeRake)).toBe(M_TOTAL)
    })

    test('ทุกคน Fold/Foul หมด (burned) -> Pot ทั้ง 4,000 เข้า Fee & Rake', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const r = mSettle(ante.stacks, ante.pot, 0, ['', '', ''])
      expect(r.feeRake).toBe(4_000)
      expect(computeTotal(r.stacks, M_PLAYERS, r.pot, r.feeRake)).toBe(M_TOTAL)
    })

    test('Triple Sweep: bonus = 500 x 3 ผู้แพ้ = 1,500', () => {
      const ante = collectAntes(mFresh(), M_PLAYERS, M_STAKES)
      const r = mSettle(ante.stacks, ante.pot, 0, [HUMAN, HUMAN, HUMAN])
      expect(r.jackpotWinner).toBe(HUMAN)
      expect(r.jackpotBonus).toBe(1_500)
      expect(computeTotal(r.stacks, M_PLAYERS, r.pot, r.feeRake)).toBe(M_TOTAL)
    })
  })

  // ─── เกมเต็ม 5 รอบ ครบทุกกลไกพร้อมกัน ──────────────────────
  test('เล่นครบ 5 รอบ พร้อม Auto Sort + Auction + Call ทุกรอบ -> Total = 36,000 ทุกจังหวะ', () => {
    const scenarios: PileWinners[] = [
      [HUMAN, P2, P3], [HUMAN, HUMAN, HUMAN], [P4, P4, P4], ['', '', ''], [P2, P3, HUMAN],
    ]
    let stacks = mFresh()
    let feeRake = 0

    scenarios.forEach((winners, i) => {
      const ctx = `mastermind round ${i + 1}`

      // 1) ต้นรอบ: Ante -> Pot
      const ante = collectAntes(stacks, M_PLAYERS, M_STAKES)
      stacks = ante.stacks
      let pot = ante.pot
      expect(checkConservation(stacks, M_PLAYERS, pot, feeRake, M_BUYIN, `${ctx} ante`)).toBe(true)

      // 2) Auto Sort (human กดทุกรอบ)
      const sort = chargeAutoSortFee(stacks, feeRake, HUMAN, M_FEE)
      stacks = sort.stacks; feeRake = sort.feeRake
      expect(sort.ok).toBe(true)
      expect(checkConservation(stacks, M_PLAYERS, pot, feeRake, M_BUYIN, `${ctx} autosort`)).toBe(true)

      // 3) Blind Auction (human ชนะใบหนึ่ง, AI ชนะอีกใบ)
      const bidH = chargeAuctionBid(stacks, feeRake, HUMAN, M_BIDS[3])
      stacks = bidH.stacks; feeRake = bidH.feeRake
      const bidA = chargeAuctionBid(stacks, feeRake, P2, M_BIDS[1])
      stacks = bidA.stacks; feeRake = bidA.feeRake
      expect(checkConservation(stacks, M_PLAYERS, pot, feeRake, M_BUYIN, `${ctx} auction`)).toBe(true)

      // 4) Grand Finale: human + P2 Call คนละ 1 ครั้ง
      const callH = chargeGrandFinaleCall(stacks, pot, HUMAN, M_CALL)
      stacks = callH.stacks; pot = callH.pot
      const callP2 = chargeGrandFinaleCall(stacks, pot, P2, M_CALL)
      stacks = callP2.stacks; pot = callP2.pot
      expect(checkConservation(stacks, M_PLAYERS, pot, feeRake, M_BUYIN, `${ctx} gf`)).toBe(true)

      // 5) Settle
      const r = settleMastermindRound({
        stacks, pot, feeRake, playerIds: M_PLAYERS, winners, stakes: M_STAKES, rake: RAKE,
        extraPaid: { [HUMAN]: M_BIDS[3] + M_CALL, [P2]: M_BIDS[1] + M_CALL },
      })
      stacks = r.stacks; feeRake = r.feeRake
      expect(checkConservation(stacks, M_PLAYERS, r.pot, feeRake, M_BUYIN, `${ctx} settle`)).toBe(true)
    })

    // Auto Sort 5 x 165 + Auction 5 x (150+50) = 825 + 1,000 ต้องอยู่ใน Fee & Rake อย่างน้อย
    expect(feeRake).toBeGreaterThanOrEqual(825 + 1_000)
  })

  // ─── Game balance: buy-in ครอบคลุมพอไหม ────────────────────
  test('Ante 5 รอบ + Auto Sort ทุกรอบ ยังไม่เกิน buy-in (5,000 + 825 < 15,000)', () => {
    const anteAll = (M_STAKES.pile1 + M_STAKES.pile2 + M_STAKES.pile3) * 5
    expect(anteAll + M_FEE * 5).toBeLessThan(M_BUYIN)
  })

  test('worst case: Call ครบ 2 รอบทุกเกม + Auction แพงสุด + Auto Sort ทุกรอบ ยังไม่เกิน buy-in', () => {
    // เดิม buy-in 9,000 เคสนี้เคยทะลุตอน call=600 (12,575 > 9,000) จึงขึ้น buy-in เป็น 15,000
    // (มติลุงเยาะ 2026-07-25) — Economy Progression Spec v2.0 (2026-07-30) ลด call เหลือ 300 แล้ว
    // worst case ใหม่จึงเหลือ 9,575 มี headroom มากขึ้นกว่าเดิม ไม่ต้องลด buy-in ตาม (buy-in ไม่อยู่ใน scope งานนี้)
    const perRound =
      (M_STAKES.pile1 + M_STAKES.pile2 + M_STAKES.pile3) // ante 1,000
      + M_FEE                                            // auto sort 165
      + M_BIDS[3]                                        // auction 150
      + M_CALL * 2                                       // call 2 รอบ 600
    expect(perRound * 5).toBe(9_575)
    expect(perRound * 5).toBeLessThan(M_BUYIN)
  })
})

describe('checkConservation — ตัวตรวจการบ้าน', () => {
  test('คืน true เมื่อยอดตรง', () => {
    expect(checkConservation(freshStacks(), PLAYERS, [0, 0, 0], 0, BUY_IN, 'test')).toBe(true)
  })

  test('คืน false + log error เมื่อยอดเพี้ยน (ไม่ throw)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const broken = freshStacks()
    broken[HUMAN] += 1 // เสกเงิน 1 token
    expect(checkConservation(broken, PLAYERS, [0, 0, 0], 0, BUY_IN, 'test')).toBe(false)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
