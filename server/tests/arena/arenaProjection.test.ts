import { arenaCardKey } from '../../src/arena/cards/arenaDeck'
import { ArenaConnectionManager } from '../../src/arena/connection/arenaConnectionManager'
import { createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchEngine } from '../../src/arena/match/arenaMatchEngine'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'
import { projectArenaClientSnapshot } from '../../src/arena/realtime/arenaProjection'

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
    const identities = new Map([['p1', { displayName: 'Alice' }], ['p2', { displayName: 'Bob' }], ['p3', { displayName: 'Cara' }]])
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(view.phase).toBe('ARRANGE_1')
    const local = view.seats.find(seat => seat.playerId === 'p1')!
    const other = view.seats.find(seat => seat.playerId === 'p2')!
    expect(local.isLocal).toBe(true)
    expect(local.cards).toHaveLength(11)
    expect(other.cards).toHaveLength(0)
    expect(other.cardCount).toBe(11)
  })

  test('auction sheet หายไปทันทีหลัง viewer bid แล้ว แต่ยังโชว์ให้คนที่ยังไม่ bid', () => {
    const engine = new ArenaMatchEngine('m2', composition, createSeededRandom(2), 0)
    reserveAll(engine, 1)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `arrange-${actorId}`, actorId, arrangementHash: 'h' }, 2)
    }
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const identities = new Map<string, { displayName: string }>()
    const beforeBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(beforeBid.auction).not.toBeNull()
    engine.submit({ type: 'FACE_UP_BID', actionId: 'bid-p1', actorId: 'p1', amountCrest: 0 }, 3)
    const afterBid = projectArenaClientSnapshot(engine, composition, connections, 'p1', 10, identities)
    expect(afterBid.auction).toBeNull()
    const stillPending = projectArenaClientSnapshot(engine, composition, connections, 'p2', 10, identities)
    expect(stillPending.auction).not.toBeNull()
  })

  test('connection view ส่งต่อจาก ArenaConnectionManager ตรงๆ', () => {
    const engine = new ArenaMatchEngine('m3', composition, createSeededRandom(3), 0)
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    connections.disconnect('p2', 0, engine.snapshot())
    const view = projectArenaClientSnapshot(engine, composition, connections, 'p1', 5_000, new Map())
    const seatP2 = view.seats.find(seat => seat.playerId === 'p2')!
    expect(seatP2.connection).toBe('DISCONNECTED_GRACE')
  })
})
