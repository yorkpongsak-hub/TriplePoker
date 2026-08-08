import { bestArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { ArenaConnectionManager } from '../../src/arena/connection/arenaConnectionManager'
import { arenaCardKey, ArenaCard, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchAction, ArenaMatchEngine } from '../../src/arena/match/arenaMatchEngine'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'
import { projectArenaClientSnapshot } from '../../src/arena/realtime/arenaProjection'

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

function reserveAll(engine: ArenaMatchEngine, now: number): void {
  let sequence = 0
  for (const actorId of engine.snapshot().pendingActorIds) {
    engine.submit({ type: 'BUY_IN_RESERVED', actionId: `reserve-${++sequence}`, actorId }, now)
  }
}

function arrangementFor(engine: ArenaMatchEngine, actorId: string) {
  const deal = engine.currentDeal()!
  const byId = new Map<string, ArenaCard>()
  ;[...deal.players.flat(), ...deal.community.pile1, ...deal.community.pile2, ...deal.community.pile3, deal.auction.faceUp, ...deal.auction.blind]
    .forEach(card => byId.set(arenaCardKey(card), card))
  const heldIds = engine.snapshotDetail().heldCardIds[actorId] ?? []
  return bestArenaArrangement(heldIds.map(id => byId.get(id)!), deal.community)
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

// ขับ engine ไปจนถึง phase เป้าหมาย รองรับ REVEAL_PILE_X (ไม่มี pending actor เลย รอ deadline อย่างเดียว)
function driveTo(engine: ArenaMatchEngine, targetPhase: string): void {
  let sequence = 0
  let now = 1
  while (engine.snapshot().phase !== targetPhase && !engine.snapshot().completed) {
    const pending = engine.snapshot().pendingActorIds
    if (pending.length) { engine.submit(actionFor(engine, pending[0], ++sequence), now); now++ }
    else { now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1); engine.tick(now) }
  }
}

describe('arenaCardKey', () => {
  test('แปลงไพ่ปกติเป็น short code แบบเดียวกับ vipPlusCardKey', () => {
    expect(arenaCardKey({ kind: 'STANDARD', id: 'A_spades', suit: 'spades', rank: 'A', value: 14 })).toBe('as')
    expect(arenaCardKey({ kind: 'STANDARD', id: '10_hearts', suit: 'hearts', rank: '10', value: 10 })).toBe('10h')
  })

  test('Joker คงเป็น literal JOKER', () => {
    expect(arenaCardKey({ kind: 'JOKER', id: 'JOKER' })).toBe('JOKER')
  })
})

describe('projectArenaClientSnapshot - fog of war และ per-viewer gating', () => {
  test('viewer เห็นไพ่ตัวเองเท่านั้น ฝ่ายอื่นเห็นแค่ cardCount', () => {
    const engine = new ArenaMatchEngine('m1', composition, createSeededRandom(1), 0)
    reserveAll(engine, 1)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const identities = new Map([['p1', { displayName: 'Alice', avatar: 'wolf' }], ['p2', { displayName: 'Bob', avatar: '' }], ['p3', { displayName: 'Cara', avatar: '' }]])
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(view.phase).toBe('ARRANGE_1')
    const local = view.seats.find(seat => seat.playerId === 'p1')!
    const other = view.seats.find(seat => seat.playerId === 'p2')!
    expect(local.isLocal).toBe(true)
    expect(local.cards).toHaveLength(11)
    expect(other.cards).toHaveLength(0)
    expect(other.cardCount).toBe(11)
  })

  test('avatar: Human ใช้ preset key จริงจาก identities (fallback ว่างถ้าไม่มีข้อมูล), AI ใช้สัญลักษณ์ตัวอักษรเดิม', () => {
    const engine = new ArenaMatchEngine('m1b', composition, createSeededRandom(1), 0)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const identities = new Map([['p1', { displayName: 'Alice', avatar: 'wolf' }]]) // p2/p3 ไม่มีข้อมูล avatar เลย
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    const p1 = view.seats.find(seat => seat.playerId === 'p1')!
    const p2 = view.seats.find(seat => seat.playerId === 'p2')!
    const boss = view.seats.find(seat => seat.seat === 3)!
    expect(p1).toMatchObject({ controller: 'HUMAN', avatar: 'wolf' })
    expect(p2).toMatchObject({ controller: 'HUMAN', avatar: '' }) // ไม่มีใน identities -> fallback ว่าง ไม่ใช่สัญลักษณ์เดิม
    expect(boss).toMatchObject({ controller: 'AI', avatar: '♛' })
  })

  test('auction sheet หายไปทันทีหลัง viewer bid แล้ว แต่ยังโชว์ให้คนที่ยังไม่ bid', () => {
    const engine = new ArenaMatchEngine('m2', composition, createSeededRandom(2), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 2)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const identities = new Map<string, { displayName: string; avatar: string }>()
    const beforeBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(beforeBid.auction).not.toBeNull()
    engine.submit({ type: 'FACE_UP_BID', actionId: 'bid-p1', actorId: 'p1', amountCrest: 0 }, 3)
    const afterBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(afterBid.auction).toBeNull()
    const stillPending = projectArenaClientSnapshot(engine, composition, connections, 'p2', 10, identities)
    expect(stillPending.auction).not.toBeNull()
  })

  test('communityCards.pile3 ส่งมาครบ 2 ช่องเสมอ — ใบที่ 2 เป็น "" (placeholder หลังไพ่) จนกว่าจะหงายจริงหลังประมูลรอบสอง', () => {
    const engine = new ArenaMatchEngine('m2b', composition, createSeededRandom(2), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 2)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const beforeReveal = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(beforeReveal.communityCards.pile3).toHaveLength(2)
    expect(beforeReveal.communityCards.pile3[1]).toBe('')

    driveTo(engine, 'FINAL_ARRANGE')
    expect(engine.snapshot().phase).toBe('FINAL_ARRANGE')
    const afterReveal = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(afterReveal.communityCards.pile3).toHaveLength(2)
    expect(afterReveal.communityCards.pile3[1]).not.toBe('')
  })

  test('auctionDisplay เห็นได้ทุกคนตลอดช่วงประมูล (ต่างจาก auction ที่เห็นเฉพาะคนกำลังบิดตาตัวเอง) และเป็น null นอกช่วงนั้น', () => {
    const engine = new ArenaMatchEngine('m2c', composition, createSeededRandom(2), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 2)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const deal = engine.currentDeal()!
    const expectedFaceUp = arenaCardKey(deal.auction.faceUp)

    // ก่อน bid: p1 กำลัง bid ตาตัวเอง (auction ไม่ null) — auctionDisplay ก็ต้องไม่ null เหมือนกัน
    const beforeBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(beforeBid.auctionDisplay).toEqual({ faceUpCard: expectedFaceUp })
    engine.submit({ type: 'FACE_UP_BID', actionId: 'bid-p1', actorId: 'p1', amountCrest: 0 }, 3)
    // หลัง p1 bid แล้ว: auction (ของ p1) เป็น null แต่ auctionDisplay ต้องยังไม่ null เพราะทุกคนต้องเห็นไพ่ประมูลตลอด
    const afterBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(afterBid.auction).toBeNull()
    expect(afterBid.auctionDisplay).toEqual({ faceUpCard: expectedFaceUp })
    // p2 ยังไม่ได้ bid เลย (ไม่ pending สำหรับ auction ของ p1) ก็ต้องเห็น auctionDisplay เหมือนกัน
    const p2View = projectArenaClientSnapshot(engine, composition, connections, 'p2', 10, new Map())
    expect(p2View.auctionDisplay).toEqual({ faceUpCard: expectedFaceUp })

    // ก่อนเข้า auction เลย (ARRANGE_1) ต้องเป็น null
    const engine2 = new ArenaMatchEngine('m2d', composition, createSeededRandom(2), 0)
    reserveAll(engine2, 1)
    expect(engine2.snapshot().phase).toBe('ARRANGE_1')
    expect(projectArenaClientSnapshot(engine2, composition, connections, 'p1', 10, new Map()).auctionDisplay).toBeNull()
  })

  test('pilesResolved: false ทุกกองตอนต้นเกม แล้วเป็น true ทีละกองตามลำดับที่ resolve จริง (แยก engine ต่อ checkpoint กัน driveTo ต่อกันซ้ำ actionId เดิม)', () => {
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])

    const fresh = new ArenaMatchEngine('m2e-fresh', composition, createSeededRandom(1), 0)
    reserveAll(fresh, 1)
    expect(projectArenaClientSnapshot(fresh, composition, connections, 'p1', 10, new Map()).pilesResolved)
      .toEqual({ pile1: false, pile2: false, pile3: false })

    const afterPile1 = new ArenaMatchEngine('m2e-p1', composition, createSeededRandom(1), 0)
    reserveAll(afterPile1, 1)
    driveTo(afterPile1, 'REVEAL_PILE_1')
    expect(projectArenaClientSnapshot(afterPile1, composition, connections, 'p1', 10, new Map()).pilesResolved)
      .toEqual({ pile1: true, pile2: false, pile3: false })

    const afterPile2 = new ArenaMatchEngine('m2e-p2', composition, createSeededRandom(1), 0)
    reserveAll(afterPile2, 1)
    driveTo(afterPile2, 'REVEAL_PILE_2')
    if (!afterPile2.snapshot().completed) {
      expect(projectArenaClientSnapshot(afterPile2, composition, connections, 'p1', 10, new Map()).pilesResolved)
        .toEqual({ pile1: true, pile2: true, pile3: false })
    }
  })

  test('connection view ส่งต่อจาก ArenaConnectionManager ตรงๆ', () => {
    const engine = new ArenaMatchEngine('m3', composition, createSeededRandom(3), 0)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    connections.disconnect('p2', 0, engine.snapshot())
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 5_000, new Map())
    const seatP2 = view.seats.find(seat => seat.playerId === 'p2')!
    expect(seatP2.connection).toBe('DISCONNECTED_GRACE')
  })

  test('bossPresentation เป็น null เสมอสำหรับ Four Gods (ผู้เล่นเจอมาแล้วตั้งแต่ High Noble ไม่ต้องมี Intro)', () => {
    const engine = new ArenaMatchEngine('m-boss-four-gods', composition, createSeededRandom(1), 0)
    reserveAll(engine, 1)
    expect(engine.snapshot().phase).toBe('ARRANGE_1')
    expect(engine.snapshot().gameNumber).toBe(1)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(view.bossPresentation).toBeNull()
  })

  test('bossPresentation โผล่มาจริงตอนเจอ Monarch/Soren เกม 1 ช่วง ARRANGE_1 เท่านั้น พร้อมข้อมูลครบ', () => {
    const monarchComposition: ArenaMatchComposition = {
      queueId: 'q-monarch', kind: 'BOSS_ENCOUNTER',
      seats: [
        { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
        { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
        { seat: 3, controller: 'AI', aiId: 'MONARCH', role: 'BOSS' },
        { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
      ],
      humanCount: 3, encounterRoll: 0.1, finalizedAt: 0,
    }
    const engine = new ArenaMatchEngine('m-boss-monarch', monarchComposition, createSeededRandom(1), 0)
    reserveAll(engine, 1)
    expect(engine.snapshot().phase).toBe('ARRANGE_1')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const view = projectArenaClientSnapshot(engine, monarchComposition, connections, 'p1', 10, new Map())
    expect(view.bossPresentation).toMatchObject({
      bossId: 'MONARCH', title: 'MONARCH', subtitle: 'THE WATCHER',
      atmosphere: 'A shadow falls over the table...',
      quote: 'Power is easy to claim. Restraint is harder to prove.',
    })
  })

  test('reveal เป็น null นอกช่วง REVEAL_PILE_X', () => {
    const engine = new ArenaMatchEngine('m4', composition, createSeededRandom(4), 0)
    reserveAll(engine, 1)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(view.phase).toBe('ARRANGE_1')
    expect(view.reveal).toBeNull()
  })

  test('reveal โผล่มาจริงตอน REVEAL_PILE_1 เหมือนกันทุก viewer (ไม่ผูก fog of war แบบ per-viewer เหมือน cards ในมือ)', () => {
    const engine = new ArenaMatchEngine('m5', composition, createSeededRandom(21), 0)
    reserveAll(engine, 0)
    driveTo(engine, 'REVEAL_PILE_1')
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_1')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const p1View = projectArenaClientSnapshot(engine, composition, connections, 'p1', 100, new Map())
    const p2View = projectArenaClientSnapshot(engine, composition, connections, 'p2', 100, new Map())
    expect(p1View.reveal).not.toBeNull()
    expect(p1View.reveal).toEqual(p2View.reveal)
    expect(p1View.reveal!.pile).toBe(1)
    expect(p1View.reveal!.cards.length).toBeGreaterThan(0)
    expect(p1View.reveal!.highlightedCards.length).toBe(5)
    expect(typeof p1View.reveal!.winnerDisplayName).toBe('string')
  })
})
