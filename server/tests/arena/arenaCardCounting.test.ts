import { ArenaMatchEngine, ArenaMatchAction } from '../../src/arena/match/arenaMatchEngine'
import { bestArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { arenaCardKey, ArenaCard, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'

jest.setTimeout(30_000)

// โต๊ะที่มี Boss จริง (REAPER) ที่นั่ง 3 — estimateOpponentSafeRate มีความหมายเฉพาะช่วง GF (ต้องมี gfRound)
const composition: ArenaMatchComposition = {
  queueId: 'q-cc', kind: 'FOUR_GODS',
  seats: [
    { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
    { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
    { seat: 3, controller: 'AI', aiId: 'REAPER', role: 'BOSS' },
    { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
  ],
  humanCount: 3, encounterRoll: 0.9, finalizedAt: 0,
}

function dealCardsById(engine: ArenaMatchEngine): Map<string, ArenaCard> {
  const deal = engine.currentDeal()!
  const all = [...deal.players.flat(), ...deal.community.pile1, ...deal.community.pile2, ...deal.community.pile3, deal.auction.faceUp, ...deal.auction.blind]
  return new Map(all.map(card => [arenaCardKey(card), card]))
}

function arrangementFor(engine: ArenaMatchEngine, actorId: string) {
  const byId = dealCardsById(engine)
  const ids = engine.snapshotDetail().heldCardIds[actorId] ?? []
  return bestArenaArrangement(ids.map(id => byId.get(id)!), engine.currentDeal()!.community)
}

function actionFor(engine: ArenaMatchEngine, actorId: string, sequence: number): ArenaMatchAction {
  const phase = engine.snapshot().phase
  const base = { actionId: `a-${sequence}`, actorId }
  switch (phase) {
    case 'MATCH_BUY_IN_RESERVE': return { ...base, type: 'BUY_IN_RESERVED' }
    case 'ARRANGE_1': return { ...base, type: 'ARRANGE_1', ...arrangementFor(engine, actorId) }
    case 'AUCTION_FACE_UP': return { ...base, type: 'FACE_UP_BID', amountCrest: 0 }
    case 'AUCTION_BLIND': return { ...base, type: 'BLIND_BID', amountCrest: 0, cardIndex: sequence % 2 as 0 | 1 }
    case 'FINAL_ARRANGE': return { ...base, type: 'FINAL_ARRANGE', ...arrangementFor(engine, actorId) }
    case 'JOKER_DECLARE': return { ...base, type: 'JOKER_DECLARE', mode: 'WILD', targetPile: 3, availableCrest: 100 }
    case 'DISCARD': {
      const held = engine.snapshotDetail().heldCardIds[actorId] ?? []
      return { ...base, type: 'DISCARD', cardId: held[held.length - 1] }
    }
    case 'FINAL_LOCK': return { ...base, type: 'FINAL_LOCK', ...arrangementFor(engine, actorId) }
    case 'GF_PILE_2': case 'GF_PILE_3_ROUND_1': case 'GF_PILE_3_ROUND_2':
      return { ...base, type: 'GF_ACTION', decision: 'CALL' }
    default: throw new Error(`No action for ${phase}`)
  }
}

// ขับ engine ไปจนถึง phase เป้าหมาย โดยยังไม่ Submit GF_ACTION ใดๆ ที่ phase นั้น (เพื่อให้ gfRound ยัง "สด" ตอนเรียก estimateOpponentSafeRate)
function driveTo(engine: ArenaMatchEngine, targetPhase: string): void {
  let sequence = 0
  let now = 1
  while (engine.snapshot().phase !== targetPhase && !engine.snapshot().completed) {
    const pending = engine.snapshot().pendingActorIds
    if (pending.length) { engine.submit(actionFor(engine, pending[0], ++sequence), now); now++ }
    // ไม่มี actor รอ = phase หยุดรอ deadline เฉยๆ (เช่น REVEAL_PILE_X) — กระโดด now ไปที่ deadlineAt ตรงๆ
    // กัน loop วนนับพันรอบทีละ 1ms ตอน deadline จริงยาว (REVEAL_PILE_X = 4000ms)
    else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
  }
}

describe('ArenaMatchEngine.estimateOpponentSafeRate — card counting กอง 2/3', () => {
  test('คืนค่า fallback 0.5 (ไม่ throw) ตอนยังไม่มี gfRound เลย เช่น phase ก่อนถึง GF', () => {
    const engine = new ArenaMatchEngine('m-cc-empty', composition, createSeededRandom(1), 0)
    expect(engine.estimateOpponentSafeRate('p1', 2)).toBe(0.5)
  })

  test('ค่าที่คืนอยู่ในช่วง [0,1] เสมอ ไม่ว่าใครถามหรือกองไหน (สุ่มหลาย seed)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const engine = new ArenaMatchEngine(`m-cc-${seed}`, composition, createSeededRandom(seed), 0)
      driveTo(engine, 'GF_PILE_2')
      if (engine.snapshot().completed) continue // เผื่อ solo-win ข้าม GF ไปเลยในบาง seed
      for (const actorId of engine.actorIds) {
        const rate = engine.estimateOpponentSafeRate(actorId, 2)
        expect(rate).toBeGreaterThanOrEqual(0)
        expect(rate).toBeLessThanOrEqual(1)
      }
    }
  })

  test('Boss ใช้ card counting จริงตัดสินใจ GF โดยไม่ throw ตลอดทั้ง Match (สุ่ม 8 seed เต็มรอบ)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const engine = new ArenaMatchEngine(`m-cc-full-${seed}`, composition, createSeededRandom(seed), 1_000)
      let sequence = 0
      let now = 1_001
      while (!engine.snapshot().completed && sequence < 1_000) {
        const pending = engine.snapshot().pendingActorIds
        if (pending.length) { engine.submit(actionFor(engine, pending[0], ++sequence), now); now++ }
        else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
      }
      expect(engine.snapshot().completed).toBe(true)
    }
  })

  test('รู้ known lower bound จากผู้ชนะกอง 1 ที่เปิดเผยจริง: ถ้ามือ Boss กอง 2 อ่อนกว่าไพ่กอง 1 ของผู้ชนะ ต้องนับว่าไม่ปลอดภัยจากคนนั้นเสมอ', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const engine = new ArenaMatchEngine(`m-cc-lb-${seed}`, composition, createSeededRandom(seed), 0)
      driveTo(engine, 'GF_PILE_2')
      if (engine.snapshot().completed) continue
      const detail = engine.snapshotDetail()
      const pile1Winner = detail.pile1WinnerId
      if (!pile1Winner) continue
      const gfRound = detail.gfRound
      if (!gfRound || !gfRound.turnOrder.includes(pile1Winner)) continue
      // หา actor อื่นที่ไม่ใช่ pile1Winner เพื่อถามมุมมองของเขา
      const asker = engine.actorIds.find(id => id !== pile1Winner && gfRound.turnOrder.includes(id))
      if (!asker) continue
      const myHand = engine.pileHandFor(asker, 2)
      const winnerLowerBound = engine.pileHandFor(pile1Winner, 1)
      if (!myHand || !winnerLowerBound) continue
      // ถ้ามือกอง 2 ของ asker อ่อนกว่า known lower bound ของผู้ชนะกอง 1 -> เหลือคู่ต่อสู้แค่คนนี้ก็ต้อง unsafe (rate ต้อง < 1)
      const winnerBeatsAsker = winnerLowerBound.score > myHand.score
      const contenders = gfRound.turnOrder.filter(id => id !== asker && !gfRound.foldedPlayerIds.includes(id))
      if (winnerBeatsAsker && contenders.length === 1 && contenders[0] === pile1Winner) {
        expect(engine.estimateOpponentSafeRate(asker, 2)).toBe(0)
      }
    }
  })
})
