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
  expect(engine.snapshot().phase).toBe('DEAL_ANIMATION')
  engine.tick(now + 4_000)
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
  const base = { actionId: `a-${phase}-${sequence}`, actorId }
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
  test('card zones ย้ายไพ่ครบ 53 ใบตั้งแต่ Deal Animation จนกอง 3 resolve โดยไม่ซ้ำ', () => {
    const engine = new ArenaMatchEngine('m-card-zones', composition, createSeededRandom(31), 0)
    let reserveSequence = 0
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'BUY_IN_RESERVED', actionId: `zone-reserve-${++reserveSequence}`, actorId }, 1)
    }
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const assertConserved = (expected: { phase: string; stock?: number; auction?: number; discard?: number; resolved?: number }) => {
      const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', engine.snapshot().deadlineAt ?? 10, new Map())
      const handCount = view.seats.reduce((sum, seat) => sum + seat.cardCount, 0)
      const communityCount = view.communityCards.pile1.length + view.communityCards.pile2.length + view.communityCards.pile3.length
      const resolvedCount = view.cardZones.resolvedPileCounts.pile1 + view.cardZones.resolvedPileCounts.pile2 + view.cardZones.resolvedPileCounts.pile3
      const auctionCount = (view.cardZones.auction.faceUpCard ? 1 : 0) + view.cardZones.auction.blindCount
      expect(view.phase).toBe(expected.phase)
      expect(view.cardZones.stockCount + view.cardZones.discardCount + auctionCount + resolvedCount + handCount + communityCount).toBe(53)
      if (expected.stock !== undefined) expect(view.cardZones.stockCount).toBe(expected.stock)
      if (expected.auction !== undefined) expect(auctionCount).toBe(expected.auction)
      if (expected.discard !== undefined) expect(view.cardZones.discardCount).toBe(expected.discard)
      if (expected.resolved !== undefined) expect(resolvedCount).toBe(expected.resolved)
    }

    assertConserved({ phase: 'DEAL_ANIMATION', stock: 3, auction: 0, discard: 0, resolved: 0 })
    engine.tick(4_001)
    assertConserved({ phase: 'ARRANGE_1', stock: 0, auction: 3, discard: 0, resolved: 0 })
    driveTo(engine, 'AUCTION_FACE_UP')
    assertConserved({ phase: 'AUCTION_FACE_UP', stock: 0, auction: 3, discard: 0, resolved: 0 })
    driveTo(engine, 'AUCTION_BLIND')
    assertConserved({ phase: 'AUCTION_BLIND', stock: 0, auction: 2, discard: 1, resolved: 0 })
    driveTo(engine, 'FINAL_ARRANGE')
    assertConserved({ phase: 'FINAL_ARRANGE', stock: 0, auction: 0, discard: 3, resolved: 0 })
    driveTo(engine, 'REVEAL_PILE_1')
    assertConserved({ phase: 'REVEAL_PILE_1', discard: 3, resolved: 12 })
    driveTo(engine, 'REVEAL_PILE_2')
    assertConserved({ phase: 'REVEAL_PILE_2', discard: 3, resolved: 24 })
    driveTo(engine, 'REVEAL_PILE_3')
    assertConserved({ phase: 'REVEAL_PILE_3', discard: 3, resolved: 44 })
  })

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

  test('pile 1 opening exposes only the local locked grouping and pauses before resolution', () => {
    const engine = new ArenaMatchEngine('m-pile-1-opening', composition, createSeededRandom(32), 0)
    driveTo(engine, 'RESOLVE_PILE_1')
    const opening = engine.snapshot()
    expect(opening.deadlineAt).not.toBeNull()

    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const p1View = projectArenaClientSnapshot(engine, composition, connections, 'p1', opening.deadlineAt! - 1, new Map())
    const local = p1View.seats.find(seat => seat.playerId === 'p1')!
    const other = p1View.seats.find(seat => seat.playerId === 'p2')!
    expect(local.arrangedPiles?.pile1).toHaveLength(3)
    expect(local.arrangedPiles?.pile2).toHaveLength(3)
    expect(local.arrangedPiles?.pile3).toHaveLength(5)
    expect(other.arrangedPiles).toBeNull()

    engine.tick(opening.deadlineAt!)
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_1')
  })

  test('ARRANGE_1 draft stays pending, is private, and is used when the arrange timer expires', () => {
    const engine = new ArenaMatchEngine('m-arrange-draft', composition, createSeededRandom(33), 0)
    reserveAll(engine, 1)
    const draft = arrangementFor(engine, 'p1')
    const swappedDraft = {
      pile1: [draft.pile1[1], draft.pile1[0], draft.pile1[2]],
      pile2: draft.pile2,
      pile3: draft.pile3,
    }
    engine.submit({ type: 'ARRANGE_DRAFT', actionId: 'draft-p1', actorId: 'p1', ...swappedDraft }, 5)
    expect(engine.snapshot().phase).toBe('ARRANGE_1')
    expect(engine.snapshot().pendingActorIds).toContain('p1')

    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const ownView = projectArenaClientSnapshot(engine, composition, connections, 'p1', 6, new Map())
    const otherView = projectArenaClientSnapshot(engine, composition, connections, 'p2', 6, new Map())
    expect(ownView.seats.find(seat => seat.playerId === 'p1')?.arrangedPiles).toEqual(swappedDraft)
    expect(otherView.seats.find(seat => seat.playerId === 'p1')?.arrangedPiles).toBeNull()

    engine.tick(engine.snapshot().deadlineAt!)
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    expect(engine.snapshotDetail().lastArrangements.p1).toEqual(swappedDraft)
  })

  test('pile 3 Call reveals private cards publicly as 2, then 4, then 5 at showdown', () => {
    const engine = new ArenaMatchEngine('m-pile3-public-calls', composition, createSeededRandom(34), 0)
    driveTo(engine, 'GF_PILE_3_ROUND_1')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const view = () => projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    const firstCaller = engine.snapshot().pendingActorIds[0]
    const firstSelection = engine.snapshotDetail().lockedArrangements[firstCaller].pile3.slice(-2)
    engine.submit({ type: 'GF_ACTION', actionId: 'p3-r1-first', actorId: firstCaller, decision: 'CALL', revealCardIds: firstSelection }, 10)
    expect(view().gfTable?.players.find(player => player.seat === composition.seats[engine.actorIds.indexOf(firstCaller)].seat)?.revealedCards).toEqual(firstSelection)

    let sequence = 0
    while (engine.snapshot().phase === 'GF_PILE_3_ROUND_1') {
      const actorId = engine.snapshot().pendingActorIds[0]
      engine.submit({ type: 'GF_ACTION', actionId: `p3-r1-${++sequence}`, actorId, decision: 'CALL' }, 11 + sequence)
    }
    expect(engine.snapshot().phase).toBe('GF_PILE_3_ROUND_2')
    const round2Caller = engine.snapshot().pendingActorIds[0]
    const already = engine.snapshotDetail().gfRevealedCardIds[round2Caller]
    const secondSelection = engine.snapshotDetail().lockedArrangements[round2Caller].pile3.filter(id => !already.includes(id)).slice(-2)
    engine.submit({ type: 'GF_ACTION', actionId: 'p3-r2-first', actorId: round2Caller, decision: 'CALL', revealCardIds: secondSelection }, 30)
    expect(view().gfTable?.players.find(player => player.seat === composition.seats[engine.actorIds.indexOf(round2Caller)].seat)?.revealedCards).toEqual([...already, ...secondSelection])

    while (engine.snapshot().phase === 'GF_PILE_3_ROUND_2') {
      const actorId = engine.snapshot().pendingActorIds[0]
      engine.submit({ type: 'GF_ACTION', actionId: `p3-r2-${++sequence}`, actorId, decision: 'CALL' }, 31 + sequence)
    }
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_3')
    expect(view().gfTable?.players.filter(player => player.status === 'SHOWDOWN').every(player => player.revealedCards.length === 5)).toBe(true)
  })

  test('pile 2 Call reveals the caller-selected two private cards on the caller seat', () => {
    const engine = new ArenaMatchEngine('m-pile2-public-call', composition, createSeededRandom(35), 0)
    driveTo(engine, 'GF_PILE_2')
    const callerId = engine.snapshot().pendingActorIds[0]
    const selected = engine.snapshotDetail().lockedArrangements[callerId].pile2.slice(0, 2)
    engine.submit({ type: 'GF_ACTION', actionId: 'p2-public-call', actorId: callerId, decision: 'CALL', revealCardIds: selected }, 10)
    const view = projectArenaClientSnapshot(engine, composition, new ArenaConnectionManager(['p1', 'p2', 'p3']), 'p1', 11, new Map())
    expect(view.gfTable?.pile).toBe(2)
    expect(view.gfTable?.players.find(player => player.seat === composition.seats[engine.actorIds.indexOf(callerId)].seat)?.revealedCards).toEqual(selected)
  })

  test('final Pile 2 caller remains available as a public Call event after the result starts', () => {
    const engine = new ArenaMatchEngine('m-pile2-final-call-event', composition, createSeededRandom(36), 0)
    driveTo(engine, 'GF_PILE_2')
    let finalActionId = ''
    let finalCallerId = ''
    let sequence = 0
    while (engine.snapshot().phase === 'GF_PILE_2') {
      finalCallerId = engine.snapshot().pendingActorIds[0]
      finalActionId = `p2-final-call-${++sequence}`
      engine.submit({ type: 'GF_ACTION', actionId: finalActionId, actorId: finalCallerId, decision: 'CALL' }, 10 + sequence)
    }
    expect(engine.snapshot().phase).toBe('REVEAL_PILE_2')
    const view = projectArenaClientSnapshot(engine, composition, new ArenaConnectionManager(['p1', 'p2', 'p3']), 'p1', 20, new Map())
    expect(view.callReveal).toMatchObject({
      id: finalActionId,
      seat: composition.seats[engine.actorIds.indexOf(finalCallerId)].seat,
      pile: 2,
      round: 1,
      cards: expect.any(Array),
    })
    expect(view.callReveal?.cards).toHaveLength(2)
    expect(view.gfAction).toMatchObject({ id: finalActionId, decision: 'CALL', pile: 2, round: 1, cards: view.callReveal?.cards })
    expect(view.reveal?.pile).toBe(2)
  })

  test('Fold is projected as a visible Grand Finale action without exposing cards', () => {
    const engine = new ArenaMatchEngine('m-pile2-fold-event', composition, createSeededRandom(37), 0)
    driveTo(engine, 'GF_PILE_2')
    const actorId = engine.snapshot().pendingActorIds[0]
    engine.submit({ type: 'GF_ACTION', actionId: 'p2-visible-fold', actorId, decision: 'FOLD' }, 10)
    const view = projectArenaClientSnapshot(engine, composition, new ArenaConnectionManager(['p1', 'p2', 'p3']), 'p1', 11, new Map())
    expect(view.gfAction).toMatchObject({ id: 'p2-visible-fold', decision: 'FOLD', pile: 2, round: 1, cards: [] })
    expect(view.callReveal?.id).not.toBe('p2-visible-fold')
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

  test('auction sheet stays visible but locks immediately after viewer bid; pending players remain unlocked', () => {
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
    engine.submit({ type: 'FACE_UP_BID', actionId: 'bid-p1', actorId: 'p1', amountCrest: 12 }, 3)
    const afterBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(afterBid.auction).toMatchObject({ round: 'FACE_UP', locked: true })
    const stillPending = projectArenaClientSnapshot(engine, composition, connections, 'p2', 10, identities)
    expect(stillPending.auction).toMatchObject({ round: 'FACE_UP', locked: false })
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'FACE_UP_BID', actionId: `bid-${actorId}`, actorId, amountCrest: 3 }, 4)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP_RESULT')
    expect(engine.snapshot().deadlineAt).toBe(10_004)
    const resolved = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(resolved.auctionResult).toMatchObject({ round: 'FACE_UP', card: expect.any(String), winnerSeat: expect.any(Number) })
    expect(resolved.auctionResult?.winnerDisplayName).toBeTruthy()
    engine.tick(engine.snapshot().deadlineAt!)
    expect(engine.snapshot().phase).toBe('AUCTION_BLIND')
    const ineligibleWinner = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(ineligibleWinner.auction).toBeNull()
    expect(ineligibleWinner.auctionDisplay).not.toBeNull()
    const eligibleOpponent = projectArenaClientSnapshot(engine, composition, connections, 'p2', 10, identities)
    expect(eligibleOpponent.auction).toMatchObject({ round: 'BLIND', locked: false })
  })

  test('face-up auction with all zero bids pauses 10 seconds and exposes NO WINNER before blind auction', () => {
    const engine = new ArenaMatchEngine('m-face-no-bid', composition, createSeededRandom(202), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `no-bid-arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 2)
    }
    for (const actorId of [...engine.snapshot().pendingActorIds]) {
      engine.submit({ type: 'FACE_UP_BID', actionId: `no-bid-${actorId}`, actorId, amountCrest: 0 }, 3)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP_RESULT')
    expect(engine.snapshot().deadlineAt).toBe(10_003)
    const view = projectArenaClientSnapshot(engine, composition, new ArenaConnectionManager(['p1', 'p2', 'p3']), 'p1', 4, new Map())
    expect(view.auctionResult).toMatchObject({ winnerSeat: null, winnerDisplayName: 'NO WINNER' })
    expect(view.cardZones.discardCount).toBeGreaterThanOrEqual(1)
    engine.tick(10_003)
    expect(engine.snapshot().phase).toBe('AUCTION_BLIND')
  })

  test('ARRANGE_1 parks one face-up auction card on the left and two blind cards on the right', () => {
    const engine = new ArenaMatchEngine('m-auction-parking', composition, createSeededRandom(22), 0)
    reserveAll(engine, 1)
    const view = projectArenaClientSnapshot(engine, composition, new ArenaConnectionManager(['p1', 'p2', 'p3']), 'p1', 10, new Map())
    expect(view.phase).toBe('ARRANGE_1')
    expect(view.cardZones.stockCount).toBe(0)
    expect(view.cardZones.auction.faceUpCard).toBe(arenaCardKey(engine.currentDeal()!.auction.faceUp))
    expect(view.cardZones.auction.blindCount).toBe(2)
  })

  test('Blind Auction result never exposes card faces; only winner gets a private hand-filter key', () => {
    const engine = new ArenaMatchEngine('m-blind-private-result', composition, createSeededRandom(27), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `private-arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 2)
    }
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'FACE_UP_BID', actionId: `private-face-${actorId}`, actorId, amountCrest: actorId === 'p1' ? 3 : 0 }, 3)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP_RESULT')
    engine.tick(engine.snapshot().deadlineAt!)
    expect(engine.snapshot().phase).toBe('AUCTION_BLIND')
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'BLIND_BID', actionId: `private-blind-${actorId}`, actorId, amountCrest: 3, cardIndex: 0 }, 4)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_BLIND_RESULT')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const views = ['p1', 'p2', 'p3'].map(viewerId => projectArenaClientSnapshot(engine, composition, connections, viewerId, 10, new Map()))
    const winnerSeat = views[0].blindAuctionResults.find(result => result.winnerSeat !== null)?.winnerSeat
    expect(winnerSeat).toBeTruthy()
    for (const view of views) {
      for (const result of view.blindAuctionResults) expect(result).not.toHaveProperty('card')
      const viewerSeat = view.seats.find(seat => seat.isLocal)!.seat
      for (const result of view.blindAuctionResults) {
        if (result.winnerSeat === viewerSeat) expect(result.ownedCard).toEqual(expect.any(String))
        else expect(result.ownedCard).toBeUndefined()
      }
    }
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
    // หลัง p1 bid แล้ว: auction ของ p1 คงอยู่ในสถานะ locked และ auctionDisplay ยังต้องไม่ null
    const afterBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, new Map())
    expect(afterBid.auction).toMatchObject({ locked: true })
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

  test('Dual Boss ส่ง Lore เหนือ Avatar ตามผู้พูดเฉพาะช่วงปลอด active decision', () => {
    const dualComposition: ArenaMatchComposition = {
      queueId: 'q-dual-lore', kind: 'DUAL_BOSS_ENCOUNTER',
      seats: [
        { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
        { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
        { seat: 3, controller: 'AI', aiId: 'MONARCH', role: 'BOSS' },
        { seat: 4, controller: 'AI', aiId: 'SOREN', role: 'BOSS' },
      ],
      humanCount: 2, encounterRoll: 0.1, finalizedAt: 0,
    }
    const engine = new ArenaMatchEngine('m-dual-lore', dualComposition, createSeededRandom(7), 0)
    engine.submit({ type: 'BUY_IN_RESERVED', actionId: 'dual-reserve-p1', actorId: 'p1' }, 1)
    engine.submit({ type: 'BUY_IN_RESERVED', actionId: 'dual-reserve-p2', actorId: 'p2' }, 1)
    const connections = new ArenaConnectionManager(['p1', 'p2'])
    expect(engine.snapshot().phase).toBe('DUAL_BOSS_INTRO')
    const intro = projectArenaClientSnapshot(engine, dualComposition, connections, 'p1', 10, new Map())
    expect(intro.bossPresentation).toMatchObject({ bossId: 'DUAL', title: 'THE BROKEN COVENANT' })
    expect(intro.dualBossLore).toBeNull()
    expect(engine.eventLog().find(event => event.kind === 'DUAL_BOSS_ENCOUNTER')?.detail).toMatchObject({
      bosses: ['MONARCH', 'SOREN'], seats: [3, 4], humanCount: 2,
    })
    engine.submit({ type: 'DUAL_BOSS_INTRO_ACK', actionId: 'intro-p1', actorId: 'p1' }, 2)
    expect(engine.snapshot().phase).toBe('DUAL_BOSS_INTRO')
    engine.submit({ type: 'DUAL_BOSS_INTRO_ACK', actionId: 'intro-p2', actorId: 'p2' }, 3)
    expect(engine.snapshot().phase).toBe('DEAL_ANIMATION')

    driveTo(engine, 'REVEAL_PILE_1')
    const view = projectArenaClientSnapshot(engine, dualComposition, connections, 'p1', 100, new Map())
    expect(view.dualBossLore).toEqual({
      id: 'recognition-1', speakerSeat: 3, speaker: 'MONARCH',
      text: 'Soren Veyl. Exile did not erase your name.',
    })
    expect(view.seats.find(seat => seat.seat === 4)?.isBoss).toBe(true)
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
