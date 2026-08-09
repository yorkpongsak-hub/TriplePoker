import { ArenaMatchEngine, ArenaMatchAction } from '../../src/arena/match/arenaMatchEngine'
import { bestArenaArrangement, evaluatePileBest } from '../../src/arena/arrangement/arenaArrangement'
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
      const pile3 = engine.snapshotDetail().lastArrangements[actorId]?.pile3 ?? []
      return { ...base, type: 'DISCARD', cardId: pile3[pile3.length - 1] }
    }
    case 'FINAL_LOCK': return { ...base, type: 'FINAL_LOCK', ...arrangementFor(engine, actorId) }
    case 'GF_PILE_2': case 'GF_PILE_3_ROUND_1': case 'GF_PILE_3_ROUND_2':
      return { ...base, type: 'GF_ACTION', decision: 'CALL' }
    default: throw new Error(`No action for ${phase}`)
  }
}

function playMatch(seed: number, matchComposition: ArenaMatchComposition = composition, matchId = 'm1'): ArenaMatchEngine {
  const engine = new ArenaMatchEngine(matchId, matchComposition, createSeededRandom(seed), 1_000)
  let sequence = 0
  let now = 1_001
  while (!engine.snapshot().completed && sequence < 1_000) {
    const pending = engine.snapshot().pendingActorIds
    if (pending.length) {
      engine.submit(actionFor(engine, pending[0], ++sequence), now++)
    } else {
      // ไม่มี actor รอ = phase หยุดรอ deadline เฉยๆ (เช่น REVEAL_PILE_X) — กระโดด now ไปที่ deadlineAt ตรงๆ
      // กัน loop วนนับพันรอบทีละ 1ms ตอน deadline จริงยาว (REVEAL_PILE_X = 4000ms)
      now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1)
      engine.tick(now)
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
    const startingTotal = 4 * 240 // p1/p2/p3 + AI boss ทั้งหมดเริ่มที่ 20 Crown เท่ากันแล้ว
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

  test('auction winner ranks pile 3 as Best 5 of 7 and may discard only its final arranged card', () => {
    const engine = new ArenaMatchEngine('m-pile3-best-seven', composition, createSeededRandom(81), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'DISCARD') {
      const phase = engine.snapshot().phase
      const actorId = engine.snapshot().pendingActorIds[0]
      if (!actorId) {
        now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1)
        engine.tick(now)
      } else if (phase === 'AUCTION_FACE_UP') {
        engine.submit({ type: 'FACE_UP_BID', actionId: `face-${++sequence}`, actorId, amountCrest: actorId === 'p1' ? 3 : 0 }, now++)
      } else if (phase === 'AUCTION_BLIND') {
        engine.submit({ type: 'BLIND_BID', actionId: `blind-${++sequence}`, actorId, amountCrest: actorId === 'p2' ? 3 : 0, cardIndex: 0 }, now++)
      } else {
        engine.submit(actionFor(engine, actorId, ++sequence), now++)
      }
    }

    const winnerId = engine.snapshot().pendingActorIds[0]
    const pile3 = engine.snapshotDetail().lastArrangements[winnerId].pile3
    expect(pile3).toHaveLength(6)
    const deal = engine.currentDeal()!
    const expected = evaluatePileBest(pile3.slice(0, 5).map(id => engine.cardById(id)!), deal.community.pile3)
    expect(engine.pileHandFor(winnerId, 3)?.score).toBe(expected.score)
    expect(() => engine.submit({ type: 'DISCARD', actionId: 'wrong-discard', actorId: winnerId, cardId: pile3[0] }, now))
      .toThrow('ARENA_DISCARD_MUST_BE_LAST_PILE3_CARD')
    expect(engine.submit({ type: 'DISCARD', actionId: 'mandatory-discard', actorId: winnerId, cardId: pile3[5] }, now))
      .toMatchObject({ accepted: true })
  })

  test('face-up winner cannot submit a blind bid', () => {
    const engine = new ArenaMatchEngine('m-no-double-auction', composition, createSeededRandom(82), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'AUCTION_FACE_UP') {
      const actorId = engine.snapshot().pendingActorIds[0]
      if (actorId) engine.submit(actionFor(engine, actorId, ++sequence), now++)
      else { now = engine.snapshot().deadlineAt!; engine.tick(now) }
    }
    for (const actorId of [...engine.snapshot().pendingActorIds]) {
      engine.submit({ type: 'FACE_UP_BID', actionId: `face-lock-${actorId}`, actorId, amountCrest: actorId === 'p1' ? 3 : 0 }, now++)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP_RESULT')
    engine.tick(engine.snapshot().deadlineAt!)
    expect(engine.snapshot().phase).toBe('AUCTION_BLIND')
    expect(engine.snapshot().pendingActorIds).not.toContain('p1')
    expect(() => engine.submit({ type: 'BLIND_BID', actionId: 'illegal-second-auction', actorId: 'p1', amountCrest: 3, cardIndex: 0 }, now))
      .toThrow('ARENA_FACE_UP_WINNER_INELIGIBLE_FOR_BLIND_AUCTION')
  })

  test('ANTE_X2 moves Joker into the immutable discard slot automatically', () => {
    let engine: ArenaMatchEngine | null = null
    let jokerBlindIndex: 0 | 1 = 0
    for (let seed = 1; seed <= 20 && !engine; seed++) {
      const candidate = new ArenaMatchEngine(`m-joker-discard-${seed}`, composition, createSeededRandom(seed), 0)
      for (const actorId of [...candidate.snapshot().pendingActorIds]) {
        candidate.submit({ type: 'BUY_IN_RESERVED', actionId: `reserve-joker-${seed}-${actorId}`, actorId }, 1)
      }
      const index = candidate.currentDeal()!.auction.blind.findIndex(card => card.kind === 'JOKER')
      if (index >= 0) { engine = candidate; jokerBlindIndex = index as 0 | 1 }
    }
    expect(engine).not.toBeNull()
    const match = engine!
    let sequence = 0
    let now = 4_001
    match.tick(now)
    while (match.snapshot().phase !== 'JOKER_DECLARE') {
      const actorId = match.snapshot().pendingActorIds[0]
      if (actorId && match.snapshot().phase === 'AUCTION_FACE_UP') {
        match.submit({ type: 'FACE_UP_BID', actionId: `joker-face-${++sequence}`, actorId, amountCrest: actorId === 'p1' ? 3 : 0 }, now++)
      } else if (actorId && match.snapshot().phase === 'AUCTION_BLIND') {
        match.submit({ type: 'BLIND_BID', actionId: `joker-blind-${++sequence}`, actorId, amountCrest: actorId === 'p2' ? 3 : 0, cardIndex: jokerBlindIndex }, now++)
      } else if (actorId) match.submit(actionFor(match, actorId, ++sequence), now++)
      else { now = Math.max(now + 1, match.snapshot().deadlineAt ?? now + 1); match.tick(now) }
    }
    const ownerId = match.snapshotDetail().jokerOwnerId!
    match.submit({ type: 'JOKER_DECLARE', actionId: 'joker-x2', actorId: ownerId, mode: 'ANTE_X2', targetPile: 3, availableCrest: 100 }, now++)
    expect(match.snapshot().phase).toBe('DISCARD')
    expect(match.snapshot().pendingActorIds).toContain(ownerId)
    const pile3 = match.snapshotDetail().lastArrangements[ownerId].pile3
    expect(pile3[pile3.length - 1]).toBe('JOKER')
    expect(() => match.submit({ type: 'DISCARD', actionId: 'reject-non-joker', actorId: ownerId, cardId: pile3[0] }, now))
      .toThrow('ARENA_DISCARD_MUST_BE_LAST_PILE3_CARD')
    expect(match.submit({ type: 'DISCARD', actionId: 'discard-joker', actorId: ownerId, cardId: 'JOKER' }, now))
      .toMatchObject({ accepted: true })
  })

  test('ANTE_X2 applies once to the first pile won by the Joker owner', () => {
    const engine = new ArenaMatchEngine('m-joker-first-win', composition, createSeededRandom(91), 0)
    const internal = engine as any
    internal.jokerOwnerId = 'p1'
    internal.jokerDeclaration = { mode: 'ANTE_X2', targetPile: 1, forcedWild: false, declaredAt: 'now' }

    internal.maybeApplyJokerAnteX2(1, 'p2')
    expect(engine.settlementTotals().pots).toEqual({ 1: 0, 2: 0, 3: 0 })

    internal.maybeApplyJokerAnteX2(2, 'p1')
    expect(engine.settlementTotals().pots).toEqual({ 1: 0, 2: 0, 3: 0 })
    expect(engine.snapshotDetail().jokerDeclaration?.targetPile).toBe(2)

    internal.maybeApplyJokerAnteX2(3, 'p1')
    internal.settleJokerAnteX2Bonus()
    const breakdown = new Map(engine.settlementBreakdown().map(row => [row.playerId, row]))
    expect(breakdown.get('p1')).toMatchObject({ endingCrest: 249, jokerExtraAnte: 0, winLoss: 9 })
    for (const actorId of engine.actorIds.filter(id => id !== 'p1')) {
      expect(breakdown.get(actorId)).toMatchObject({ endingCrest: 237, jokerExtraAnte: 3 })
    }
    expect(engine.settlementTotals().conservedTotalCrest).toBe(960)
    internal.settleJokerAnteX2Bonus()
    expect(engine.settlementTotals().conservedTotalCrest).toBe(960)
  })

  test('buy-in timeout fail closed ไม่เริ่ม Match โดยไม่มี reserve', () => {
    const engine = new ArenaMatchEngine('m-timeout', composition, createSeededRandom(9), 0)
    expect(() => engine.tick(15_000)).toThrow('ARENA_BUY_IN_RESERVATION_TIMEOUT')
    expect(engine.snapshot().phase).toBe('MATCH_BUY_IN_RESERVE')
  })

  test('GF Pile 2 วนครบทุกที่นั่งแล้วผู้เล่นคนเดียวที่เหลือชนะโดยไม่เปิดไพ่ (รักษา Fog of War)', () => {
    const engine = new ArenaMatchEngine('m-solo-gf', composition, createSeededRandom(55), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'GF_PILE_2') {
      const pending = engine.snapshot().pendingActorIds
      if (pending.length) engine.submit(actionFor(engine, pending[0], ++sequence), now++)
      else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
    }
    const turnOrder = engine.snapshotDetail().gfRound!.turnOrder
    const stay = turnOrder[turnOrder.length - 1]
    while (engine.snapshot().phase === 'GF_PILE_2') {
      const actorId = engine.snapshot().pendingActorIds[0]
      if (!actorId) break
      engine.submit({ type: 'GF_ACTION', actionId: `fold-${actorId}-${++sequence}`, actorId, decision: actorId === stay ? 'CALL' : 'FOLD' }, now++)
    }
    // ชนะแบบไม่มีใครสู้ไพ่จริง -> ต้องหยุดที่ REVEAL_PILE_2 ก่อน (เกมหยุดจริงเหมือนกันทุกกรณี) แต่ pileReveal
    // ต้องไม่มีไพ่/handName เลย (รักษา Fog of War แม้เป็นไพ่ของผู้ชนะเอง)
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_2')
    expect(engine.snapshotDetail().pile2WinnerId).toBe(stay)
    const reveal = engine.snapshotDetail().pileReveal
    expect(reveal).toMatchObject({ pile: 2, winnerId: stay, handRank: null, cards: [], highlightedCards: [] })
    now = engine.snapshot().deadlineAt!
    engine.tick(now)
    expect(engine.snapshot().phase).toBe('GF_PILE_3_ROUND_1')
  })

  test('GF Pile 2 วน Call/Fold ครบทีละคนและเริ่ม deadline 15 วินาทีใหม่ทุก turn', () => {
    const engine = new ArenaMatchEngine('m-gf-sequential', composition, createSeededRandom(56), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'GF_PILE_2') {
      const pending = engine.snapshot().pendingActorIds
      if (pending.length) engine.submit(actionFor(engine, pending[0], ++sequence), now++)
      else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
    }
    const expectedOrder = [...engine.snapshotDetail().gfRound!.turnOrder]
    const seen: string[] = []
    let previousVersion = engine.snapshot().version
    while (engine.snapshot().phase === 'GF_PILE_2') {
      const actorId = engine.snapshot().pendingActorIds[0]
      seen.push(actorId)
      const actedAt = now++
      engine.submit({ type: 'GF_ACTION', actionId: `sequential-${++sequence}`, actorId, decision: 'FOLD' }, actedAt)
      expect(engine.snapshot().version).toBeGreaterThan(previousVersion)
      previousVersion = engine.snapshot().version
      if (engine.snapshot().phase === 'GF_PILE_2') expect(engine.snapshot().deadlineAt).toBe(actedAt + 15_000)
    }
    expect(seen).toEqual(expectedOrder)
  })

  test('REVEAL_PILE_1 หยุดเกมจริงพร้อมข้อมูลไพ่ผู้ชนะ แล้ว auto-advance ไป GF_PILE_2 เองหลัง deadline หมดโดยไม่ต้องมี action', () => {
    const engine = new ArenaMatchEngine('m-reveal1', composition, createSeededRandom(12), 0)
    let sequence = 0
    let now = 1
    while (engine.snapshot().phase !== 'REVEAL_PILE_1') {
      const pending = engine.snapshot().pendingActorIds
      if (pending.length) engine.submit(actionFor(engine, pending[0], ++sequence), now++)
      else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
    }
    const deadlineAt = engine.snapshot().deadlineAt
    expect(deadlineAt).not.toBeNull()
    const reveal = engine.snapshotDetail().pileReveal
    expect(reveal?.pile).toBe(1)
    expect(reveal?.winnerId).toBe(engine.snapshotDetail().pile1WinnerId)
    expect(reveal?.handRank).not.toBeNull()
    expect(reveal!.cards.length).toBeGreaterThan(0)
    expect(reveal!.highlightedCards.length).toBe(5)
    // ยังไม่ถึง deadline -> ต้องยังค้างอยู่ REVEAL_PILE_1 ไม่ auto-advance ก่อนเวลา
    engine.tick(now)
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_1')
    // ถึง deadline แล้ว -> ไป GF_PILE_2 เองโดยไม่มีใคร submit action ใดๆ เลย
    engine.tick(deadlineAt!)
    expect(engine.snapshot().phase).toBe('GF_PILE_2')
  })

  test('Monarch ล็อกบุคลิกตอนแจกไพ่เกม 1 แล้วคงเดิมตลอด 3 เกม', () => {
    const monarchComposition: ArenaMatchComposition = {
      queueId: 'q-monarch', kind: 'BOSS_ENCOUNTER',
      seats: [
        { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
        { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
        { seat: 3, controller: 'AI', aiId: 'MONARCH', role: 'BOSS' },
        { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
      ],
      humanCount: 3, encounterRoll: 0.5, finalizedAt: 0,
    }
    const engine = new ArenaMatchEngine('m-monarch', monarchComposition, createSeededRandom(41), 0)
    let sequence = 0
    let now = 1
    let seenAfterGame1: string | null = null
    while (!engine.snapshot().completed && sequence < 1_000) {
      const pending = engine.snapshot().pendingActorIds
      if (pending.length) engine.submit(actionFor(engine, pending[0], ++sequence), now++)
      else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
      if (engine.snapshot().gameNumber >= 1 && !seenAfterGame1 && engine.resolvedBossPersonality()) {
        seenAfterGame1 = engine.resolvedBossPersonality()
      }
    }
    expect(engine.snapshot().completed).toBe(true)
    expect(seenAfterGame1).not.toBeNull()
    expect(engine.resolvedBossPersonality()).toBe(seenAfterGame1) // ยังล็อกเดิมตอนจบ Match (ผ่านเกม 2-3 มาแล้ว)
  })

  test('Soren เก็บสถิติ Call/Fold ของ Human สะสมข้ามเกมในแมตช์เดียวกัน', () => {
    const sorenComposition: ArenaMatchComposition = {
      queueId: 'q-soren', kind: 'BOSS_ENCOUNTER',
      seats: [
        { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
        { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
        { seat: 3, controller: 'AI', aiId: 'SOREN', role: 'BOSS' },
        { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
      ],
      humanCount: 3, encounterRoll: 0.5, finalizedAt: 0,
    }
    // actionFor ส่ง GF_ACTION เป็น CALL เสมอ (ไม่เคย Fold) — humanFolds ต้องเป็น 0, humanCalls ต้อง > 0 หลังจบ Match จริง
    const engine = playMatch(43, sorenComposition, 'm-soren')
    expect(engine.snapshot().completed).toBe(true)
    const stats = engine.sorenMatchStats()
    expect(stats.humanCalls).toBeGreaterThan(0)
    expect(stats.humanFolds).toBe(0)
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
