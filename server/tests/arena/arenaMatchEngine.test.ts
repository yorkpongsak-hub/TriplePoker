import { ArenaMatchEngine, ArenaMatchAction } from '../../src/arena/match/arenaMatchEngine'
import { bestArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { arenaCardKey, ArenaCard, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'

// Round 2: arrangement เรียก bestArenaArrangement จริง (ค้นหาไพ่) ไม่ใช่ string ฟรีแล้ว ต่อ Match ใช้เวลาหลักวินาที
jest.setTimeout(15_000)

const composition: ArenaMatchComposition = {
  queueId: 'q1',
  kind: 'FOUR_GODS',
  seats: [
    { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
    { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
    { seat: 3, controller: 'AI', aiId: 'REAPER', role: 'BOSS' },
    { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
  ],
  humanCount: 3,
  encounterRoll: 0.9,
  finalizedAt: 0,
}

function dealCardsById(engine: ArenaMatchEngine): Map<string, ArenaCard> {
  const deal = engine.currentDeal()!
  const all = [...deal.players.flat(), ...deal.community.pile1, ...deal.community.pile2, ...deal.community.pile3, deal.auction.faceUp, ...deal.auction.blind]
  return new Map(all.map(card => [arenaCardKey(card), card]))
}

function heldCards(engine: ArenaMatchEngine, actorId: string): ArenaCard[] {
  const ids = engine.snapshotDetail().heldCardIds[actorId] ?? []
  const byId = dealCardsById(engine)
  return ids.map(id => byId.get(id)!)
}

function arrangementFor(engine: ArenaMatchEngine, actorId: string) {
  return bestArenaArrangement(heldCards(engine, actorId), engine.currentDeal()!.community)
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

function playMatch(seed: number): ArenaMatchEngine {
  const engine = new ArenaMatchEngine('m1', composition, createSeededRandom(seed), 1_000)
  let sequence = 0
  let now = 1_001
  while (!engine.snapshot().completed && sequence < 1_000) {
    const pending = engine.snapshot().pendingActorIds
    if (pending.length) {
      engine.submit(actionFor(engine, pending[0], ++sequence), now++)
    } else {
      engine.tick(now++)
    }
  }
  if (!engine.snapshot().completed) throw new Error('simulation did not complete')
  return engine
}

describe('Gate 5 - end-to-end Arena match state machine', () => {
  test('เดินครบ 3 Games และจบ MATCH_RESULT', () => {
    const engine = playMatch(123)
    expect(engine.snapshot()).toMatchObject({ phase: 'MATCH_RESULT', gameNumber: 3, completed: true })
    expect(engine.eventLog().filter(event => event.kind === 'GAME_DEALT')).toHaveLength(3)
    expect(engine.eventLog().some(event => event.phase === 'AUCTION_FACE_UP')).toBe(true)
    expect(engine.eventLog().some(event => event.phase === 'GF_PILE_3_ROUND_2')).toBe(true)
  })

  test('seed และ action stream เดิมสร้าง phase/event stream เดิม', () => {
    const first = playMatch(999).eventLog().map(({ sequence, kind, phase, actorId, detail }) => ({ sequence, kind, phase, actorId, detail }))
    const second = playMatch(999).eventLog().map(({ sequence, kind, phase, actorId, detail }) => ({ sequence, kind, phase, actorId, detail }))
    expect(second).toEqual(first)
  })

  test('action retry id เดิมเป็น idempotent แต่ payload identity ชนกันถูกปฏิเสธ', () => {
    const engine = new ArenaMatchEngine('m-retry', composition, createSeededRandom(7), 0)
    const action: ArenaMatchAction = { type: 'BUY_IN_RESERVED', actionId: 'same', actorId: 'p1' }
    expect(engine.submit(action, 1)).toMatchObject({ accepted: true, duplicate: false })
    expect(engine.submit(action, 2)).toMatchObject({ accepted: true, duplicate: true })
    expect(() => engine.submit({ ...action, actorId: 'p2' }, 3)).toThrow('ARENA_ACTION_ID_CONFLICT')
  })

  // Round 2: arrangement เป็นการค้นหาไพ่จริง (bestArenaArrangement) ไม่ใช่ string ฟรีแล้ว (~0.5-2s ต่อ Match)
  // ลดจำนวน seed จาก 1,000 เหลือ 6 เพื่อให้ชุดเทสรันจบในเวลาที่สมเหตุสมผล — รวม assertion ของ completion +
  // settlement conservation ไว้ในลูปเดียวกัน (แทนที่จะรัน playMatch ซ้ำสองรอบสำหรับสองเทสแยกกัน)
  test('จำลอง 6 Matches: ทุก Match ต้องจบครบสาม Games และ Settlement conservation คงที่', () => {
    const startingTotal = 3 * 228 + 100_000 // p1/p2/p3 = requiredReservationCrest, AI boss = virtual balance non-persisted
    for (let seed = 1; seed <= 6; seed++) {
      const engine = playMatch(seed)
      expect(engine.snapshot().gameNumber).toBe(3)
      expect(engine.snapshot().phase).toBe('MATCH_RESULT')
      expect(engine.settlementTotals().conservedTotalCrest).toBe(startingTotal)
    }
  }, 120_000)

  test('บังคับ phase guard และ GF turn order', () => {
    const engine = new ArenaMatchEngine('m-guard', composition, createSeededRandom(8), 0)
    expect(() => engine.submit({ type: 'ARRANGE_1', actionId: 'bad', actorId: 'p1', pile1: [], pile2: [], pile3: [] }, 1))
      .toThrow('ARENA_ACTION_WRONG_PHASE')
  })

  test('buy-in timeout fail closed ไม่เริ่ม Match โดยไม่มี reserve', () => {
    const engine = new ArenaMatchEngine('m-timeout', composition, createSeededRandom(9), 0)
    expect(() => engine.tick(15_000)).toThrow('ARENA_BUY_IN_RESERVATION_TIMEOUT')
    expect(engine.snapshot().phase).toBe('MATCH_BUY_IN_RESERVE')
  })

  test('เหลือผู้เล่นคนเดียวใน GF Pile 2 ชนะทันทีโดยไม่ต้องเทียบไพ่ (รักษา Fog of War)', () => {
    const engine = new ArenaMatchEngine('m-solo-gf', composition, createSeededRandom(55), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'GF_PILE_2') {
      const pending = engine.snapshot().pendingActorIds
      if (pending.length) engine.submit(actionFor(engine, pending[0], ++sequence), now++)
      else engine.tick(now++)
    }
    const turnOrder = engine.snapshotDetail().gfRound!.turnOrder
    const stay = turnOrder[turnOrder.length - 1]
    while (engine.snapshot().phase === 'GF_PILE_2') {
      const actorId = engine.snapshot().pendingActorIds[0]
      if (!actorId) break
      engine.submit({ type: 'GF_ACTION', actionId: `fold-${actorId}-${++sequence}`, actorId, decision: actorId === stay ? 'CALL' : 'FOLD' }, now++)
    }
    expect(engine.snapshot().phase).toBe('GF_PILE_3_ROUND_1')
    expect(engine.snapshotDetail().pile2WinnerId).toBe(stay)
  })

  test('decision deadlines ใช้ default actions จน Match จบได้', () => {
    const engine = new ArenaMatchEngine('m-defaults', composition, createSeededRandom(10), 0)
    let sequence = 0
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'BUY_IN_RESERVED', actionId: `reserve-${++sequence}`, actorId }, sequence)
    }
    let guard = 0
    while (!engine.snapshot().completed && guard++ < 300) {
      const snapshot = engine.snapshot()
      if (snapshot.deadlineAt !== null) engine.tick(snapshot.deadlineAt)
      else engine.tick(guard + 100_000)
    }
    expect(engine.snapshot().completed).toBe(true)
    expect(engine.eventLog().filter(event => event.kind === 'DEFAULT_ACTION').length).toBeGreaterThan(0)
  })
})
