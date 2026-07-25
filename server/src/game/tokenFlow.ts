// ============================================================
// tokenFlow.ts — Token Flow Panel Engine (TriplePoker_TokenFlowPanel_Spec_v1_1)
// ขอบเขต: Initiate / Adept / Mastermind — High Noble ยังใช้ calcDeltas() เดิมใน gameLoop.ts
// (ทุกจุดที่ wire ใน gameLoop.ts gate ด้วย tier เสมอ ห้ามให้ Tier ที่ยังไม่ย้ายโดนหางเลข)
//
// หัวใจของไฟล์นี้คือ "กฎเหล็ก" (Conservation Invariant):
//     Pot G1 + Pot G2 + Pot G3 + Fee & Rake + All Stack = 4 x Buy-in  เสมอ
//
// ทุกฟังก์ชันในไฟล์นี้เป็น pure function (ไม่แตะ DB / socket / MatchState ตรงๆ)
// เพื่อให้ unit test พิสูจน์กฎเหล็กได้โดยไม่ต้อง mock อะไรเลย
//
// The Sage Unicorn Studio Co., Ltd.
// Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
// ============================================================

// ─── Types ───────────────────────────────────────────────────

/** ค่า Ante ต่อกอง (มาจาก gameConfig.tokenPot.tiers[tier]) */
export interface PileStakes {
  pile1: number
  pile2: number
  pile3: number
}

/** ผู้ชนะแต่ละกอง — '' หมายถึงไม่มีผู้ชนะ (foul ครบทุกคน) */
export type PileWinners = [string, string, string]

export interface SettleRoundInput {
  stacks: Record<string, number>       // stack ปัจจุบันของทุก seat (ante ถูกหักไปแล้วตอนต้นรอบ)
  pot: [number, number, number]        // ยอดใน Pot G1/G2/G3 ตอนนี้
  feeRake: number                      // holding tank สะสมมาตั้งแต่ต้นเกม
  playerIds: string[]                  // ทุก seat รวม AI
  winners: PileWinners
  stakes: PileStakes
  rake: number                         // 0.05 (5% ทุกกรณี รวม Triple Sweep - มติลุงเยาะ 2026-07-25)
}

export interface SettleRoundOutput {
  stacks: Record<string, number>
  pot: [number, number, number]        // reset เป็น [0,0,0] เสมอหลัง settle
  feeRake: number
  /**
   * ตัวเลขที่ "โชว์บน UI" เป็น net delta ของทั้งรอบ (= net - ante) เหมือน calcDeltas() เดิมเป๊ะ
   * แยกจากการบวกเข้า stacks จริง เพราะ ante ถูกหักไปตั้งแต่ต้นรอบแล้ว จะหักซ้ำไม่ได้
   */
  displayDeltas: Record<string, number>
  jackpotWinner: string | null
  jackpotBonus: number
  jackpotRake: number
}

// ─── ต้นรอบ: Ante -> Pot ─────────────────────────────────────

/**
 * หัก Ante จาก stack ทุก seat แล้วรวมเข้า Pot ทั้ง 3 กอง
 * เรียกตอนต้นรอบทุกรอบ (Pot reset เป็นยอด ante ใหม่เสมอ ตาม Spec 5 "Reset scope")
 */
export function collectAntes(
  stacks: Record<string, number>,
  playerIds: string[],
  stakes: PileStakes,
): { stacks: Record<string, number>; pot: [number, number, number] } {
  const next = { ...stacks }
  const anteTotal = stakes.pile1 + stakes.pile2 + stakes.pile3

  playerIds.forEach(id => {
    next[id] = (next[id] ?? 0) - anteTotal
  })

  return {
    stacks: next,
    pot: [
      stakes.pile1 * playerIds.length,
      stakes.pile2 * playerIds.length,
      stakes.pile3 * playerIds.length,
    ],
  }
}

// ─── จบรอบ: Pot -> Stack ผู้ชนะ / Fee & Rake ─────────────────

/**
 * ตัดสินการไหลของ token ทั้งรอบ (Spec 3 Flow Rules ชุด Tier C)
 *
 * กติกาที่ใช้ (ยืนยันกับลุงเยาะแล้ว 2026-07-25):
 *   - จบกอง มีผู้ชนะ  : Pot -> Stack ผู้ชนะ (หัก rake 5% เข้า Fee & Rake) โดย AI ที่ชนะ "เก็บเงินไว้เอง"
 *                       ไม่ burn (คงพฤติกรรมเดิมของโค้ด ไม่ใช่ตาม Spec 3 ที่ให้ AI-win เข้า Fee & Rake)
 *   - จบกอง ไม่มีผู้ชนะ: foul ครบทุกคน -> Pot ทั้งก้อนเข้า Fee & Rake (กัน Pot ค้างไม่มีเจ้าของ)
 *   - Foul รายคน       : คงพฤติกรรมเดิม (คน foul ถูกตัดออกจากการตัดสิน ante ที่จ่ายไปแล้วไหลไปหาผู้ชนะกอง)
 *   - Triple Sweep     : ใช้สูตรเดียวกับ Mastermind/HighNoble ที่โค้ดไว้แล้ว (gameLoop.ts บรรทัด 1747)
 *                       bonus = ante กอง 3 x จำนวนผู้แพ้ (ดูดจาก Stack ผู้แพ้จริง ไม่เสกเงิน)
 *                       jackpotRake = floor((net ที่ผู้ชนะได้จาก 3 กอง + bonus) x 5%)
 */
export function settleRound(input: SettleRoundInput): SettleRoundOutput {
  const { playerIds, winners, stakes, rake } = input

  const stacks = { ...input.stacks }
  const pot: [number, number, number] = [...input.pot] as [number, number, number]
  let feeRake = input.feeRake

  const displayDeltas: Record<string, number> = {}
  playerIds.forEach(id => { displayDeltas[id] = 0 })

  const stakeByPile = [stakes.pile1, stakes.pile2, stakes.pile3]

  // Triple Sweep = คนเดียวกันชนะครบทั้ง 3 กอง (ต้องมีผู้ชนะจริงทั้ง 3 กอง)
  const jackpotWinner =
    winners[0] && winners[0] === winners[1] && winners[1] === winners[2]
      ? winners[0]
      : null

  // net รวมที่ผู้ชนะ jackpot ได้จาก Pot ปกติทั้ง 3 กอง — ใช้คิดฐาน jackpotRake
  let jackpotWinnerNet = 0

  for (let k = 0; k < 3; k++) {
    const potAmount = pot[k]
    const stake = stakeByPile[k]
    const winner = winners[k]

    // ทุกคนจ่าย ante กองนี้ไปแล้วตอนต้นรอบ — สะท้อนใน displayDeltas ให้ UI เห็นเลขเดิม
    playerIds.forEach(id => { displayDeltas[id] -= stake })

    if (!winner) {
      // ไม่มีผู้ชนะ (foul ครบทุกคน) -> Pot ทั้งก้อนเข้า Fee & Rake
      feeRake += potAmount
    } else {
      const net = Math.floor(potAmount * (1 - rake))
      feeRake += potAmount - net
      stacks[winner] = (stacks[winner] ?? 0) + net
      displayDeltas[winner] += net
      if (winner === jackpotWinner) jackpotWinnerNet += net
    }

    pot[k] = 0
  }

  // ─── Triple Sweep Jackpot ───────────────────────────────────
  let jackpotBonus = 0
  let jackpotRake = 0

  if (jackpotWinner) {
    const losers = playerIds.filter(id => id !== jackpotWinner)
    jackpotBonus = stakes.pile3 * losers.length
    jackpotRake = Math.floor((jackpotWinnerNet + jackpotBonus) * rake)

    // ส่วนเกินดูดจาก Stack ผู้แพ้เสมอ ไม่เสกจากอากาศ (Spec 3.1 กฎทอง)
    losers.forEach(id => {
      stacks[id] = (stacks[id] ?? 0) - stakes.pile3
      displayDeltas[id] -= stakes.pile3
    })

    const winnerExtra = jackpotBonus - jackpotRake
    stacks[jackpotWinner] = (stacks[jackpotWinner] ?? 0) + winnerExtra
    displayDeltas[jackpotWinner] += winnerExtra
    feeRake += jackpotRake
  }

  return { stacks, pot, feeRake, displayDeltas, jackpotWinner, jackpotBonus, jackpotRake }
}

// ─── Auto Sort Fee: Stack ผู้กด -> Fee & Rake ────────────────

/**
 * หักค่า Auto Sort จาก stack ผู้กด เข้า Fee & Rake (Spec ข้อ 3)
 *
 * มติลุงเยาะ 2026-07-25: **ยกเลิกระบบ free rounds ทั้งหมด** (`freeRoundsForNewUser` เลิกใช้)
 * ฟรีเฉพาะ Tier C (fee = 0) เท่านั้น Tier อื่นคิดเงินทุกครั้งและแพงขึ้นตาม Tier
 * เหตุผลเชิง design: กันผู้เล่นติดนิสัยพึ่ง Auto Sort ก่อนขึ้น The Arena ที่ห้ามใช้เด็ดขาด (Hardcore Rule)
 *
 * คืน charged = จำนวนที่หักจริง (0 = ฟรีหรือ token ไม่พอ) — ผู้เรียกต้องเช็ค `ok` ก่อนอนุญาตให้จัดไพ่
 */
export function chargeAutoSortFee(
  stacks: Record<string, number>,
  feeRake: number,
  playerId: string,
  fee: number,
): { ok: boolean; stacks: Record<string, number>; feeRake: number; charged: number } {
  // fee = 0 (Tier C) ผ่านได้เสมอ ไม่ต้องแตะ stack เลย
  if (fee <= 0) return { ok: true, stacks, feeRake, charged: 0 }

  // token ไม่พอ -> ไม่มีการไหลใดๆ (Spec ข้อ 8: ปุ่ม disabled ผู้เล่นต้องจัดเอง)
  const balance = stacks[playerId] ?? 0
  if (balance < fee) return { ok: false, stacks, feeRake, charged: 0 }

  const next = { ...stacks }
  next[playerId] = balance - fee
  return { ok: true, stacks: next, feeRake: feeRake + fee, charged: fee }
}

// ============================================================
// Mastermind (Tier A) — ทางเดินเงินที่ Tier C/B ไม่มี
//
// Tier นี้มีเงินไหลเพิ่ม 2 ทางระหว่างรอบ (นอกจาก Ante + Auto Sort):
//   1. Blind Auction  — ผู้ชนะประมูลจ่ายค่าไพ่
//   2. Grand Finale   — ผู้เล่นที่ Call จ่ายเดิมพันเพิ่มเข้ากอง 3
//
// มติลุงเยาะ 2026-07-25:
//   - Auction: เข้า Fee & Rake แล้ว burn ตอนจบเกม (ไม่ burn ทันทีตาม gameConfig.auctionBurn)
//     เพราะ burn กลางเกมทำให้ token หายออกจากโต๊ะ -> แถว Total จะไม่เท่า 4 x Buy-in กฎเหล็กพังทันที
//     ผลลัพธ์ทางเศรษฐศาสตร์เหมือน burn 100% ทุกประการ ต่างแค่จังหวะที่ออกจากระบบ
//   - Grand Finale Call: เข้า Pot 3 (แถว G3) ตรงๆ ตามธรรมชาติของการเดิมพันในกองนั้น
// ============================================================

/**
 * ผู้ชนะ Blind Auction จ่ายค่าไพ่ -> Fee & Rake (รอ burn ตอนจบเกม)
 *
 * ใช้กติกาเดียวกับ Auto Sort: token ไม่พอ = ไม่มีการไหลใดๆ ผู้เรียกต้องเช็ค `ok`
 * (ฝั่ง client ต้อง disable ระดับราคาที่จ่ายไม่ไหวไว้ก่อนอยู่แล้ว ตัวนี้เป็นด่านที่สอง
 *  กัน stack ติดลบเมื่อ client ส่งค่าที่จ่ายไม่ไหวขึ้นมา)
 */
export function chargeAuctionBid(
  stacks: Record<string, number>,
  feeRake: number,
  playerId: string,
  amount: number,
): { ok: boolean; stacks: Record<string, number>; feeRake: number; charged: number } {
  if (amount <= 0) return { ok: true, stacks, feeRake, charged: 0 }

  const balance = stacks[playerId] ?? 0
  if (balance < amount) return { ok: false, stacks, feeRake, charged: 0 }

  const next = { ...stacks }
  next[playerId] = balance - amount
  return { ok: true, stacks: next, feeRake: feeRake + amount, charged: amount }
}

/**
 * ผู้เล่นที่ Call ใน Grand Finale จ่ายเดิมพัน -> Pot 3
 * เงินยังอยู่บนโต๊ะ (ย้ายช่องเฉยๆ) กฎเหล็กจึงไม่ขยับ
 */
export function chargeGrandFinaleCall(
  stacks: Record<string, number>,
  pot: [number, number, number],
  playerId: string,
  amount: number,
): { ok: boolean; stacks: Record<string, number>; pot: [number, number, number]; charged: number } {
  if (amount <= 0) return { ok: true, stacks, pot, charged: 0 }

  const balance = stacks[playerId] ?? 0
  if (balance < amount) return { ok: false, stacks, pot, charged: 0 }

  const next = { ...stacks }
  next[playerId] = balance - amount
  const nextPot: [number, number, number] = [pot[0], pot[1], pot[2] + amount]
  return { ok: true, stacks: next, pot: nextPot, charged: amount }
}

export interface SettleMastermindInput extends SettleRoundInput {
  /**
   * เงินที่ผู้เล่นแต่ละคน "จ่ายไปแล้วระหว่างรอบ" (Auction bid + Grand Finale call)
   *
   * เงินก้อนนี้ถูกหักจาก stack และย้ายเข้า Pot/Fee & Rake ไปตั้งแต่ตอนเกิดเหตุการณ์จริงแล้ว
   * ห้ามหักซ้ำ — รับเข้ามาเพื่อ "รายงาน" ใน displayDeltas อย่างเดียว ให้ตัวเลขที่ผู้เล่นเห็นบน UI
   * ตรงกับที่เสียไปจริงทั้งรอบ (ถ้าไม่บวกตัวนี้ ผู้เล่นที่ Call 600 จะเห็นตัวเลขดีเกินจริง 600)
   */
  extraPaid?: Record<string, number>
}

/**
 * ตัดสินการไหลของ token ทั้งรอบสำหรับ Mastermind
 *
 * แกนกลางใช้ settleRound() ตัวเดียวกับ Tier C/B ทั้งดุ้น (ตรรกะตรงกันทุกกรณี — ไม่มีผู้ชนะกอง
 * ก็เข้า Fee & Rake เหมือนกัน, Triple Sweep สูตรเดียวกัน) จึงไม่ duplicate logic ที่ผ่านเทสแล้ว
 * งานเดียวที่เพิ่มคือปรับ displayDeltas ให้รวมเงินที่จ่ายระหว่างรอบเข้าไปด้วย
 *
 * ⚠️ ผู้เรียกต้องส่ง pot[2] ที่ "รวม Grand Finale call แล้ว" เข้ามา (ผ่าน chargeGrandFinaleCall)
 */
export function settleMastermindRound(input: SettleMastermindInput): SettleRoundOutput {
  const { extraPaid, ...base } = input
  const result = settleRound(base)

  if (extraPaid) {
    for (const [id, paid] of Object.entries(extraPaid)) {
      if (paid) result.displayDeltas[id] = (result.displayDeltas[id] ?? 0) - paid
    }
  }

  return result
}

// ─── กฎเหล็ก: ตัวตรวจการบ้าน ─────────────────────────────────

/** ผลรวม token ทุกช่องบนจอ = แถว Total ของ Panel */
export function computeTotal(
  stacks: Record<string, number>,
  playerIds: string[],
  pot: [number, number, number],
  feeRake: number,
): number {
  const allStack = playerIds.reduce((sum, id) => sum + (stacks[id] ?? 0), 0)
  return allStack + pot[0] + pot[1] + pot[2] + feeRake
}

/**
 * ตรวจกฎเหล็ก — log error ไม่ throw (Spec 7: "fail = log error ไม่ crash")
 * คืน true เมื่อ conservation ถูกต้อง
 */
export function checkConservation(
  stacks: Record<string, number>,
  playerIds: string[],
  pot: [number, number, number],
  feeRake: number,
  buyIn: number,
  context: string,
): boolean {
  const total = computeTotal(stacks, playerIds, pot, feeRake)
  const expected = buyIn * playerIds.length

  if (total !== expected) {
    console.error(
      '[CONSERVATION]', Date.now(), 'BROKEN at', context,
      '| total:', total, '| expected:', expected, '| diff:', total - expected,
      '| stacks:', JSON.stringify(stacks), '| pot:', JSON.stringify(pot), '| feeRake:', feeRake,
    )
    return false
  }
  return true
}
