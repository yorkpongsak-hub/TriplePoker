import { ArenaConnectionManager } from '../../src/arena/connection/arenaConnectionManager'
import { buildArenaBotAction } from '../../src/arena/connection/arenaBotTakeover'
import { ArenaArrangement, bestArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { ArenaMatchEngine, ArenaMatchSnapshot } from '../../src/arena/match/arenaMatchEngine'
import { arenaCardKey, ArenaCard, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'

const dummyArrangement: ArenaArrangement = { pile1: ['as'], pile2: ['ks'], pile3: ['qs', 'js', '10s'] }

function arrangementFor(engine: ArenaMatchEngine, actorId: string): ArenaArrangement {
  const deal = engine.currentDeal()!
  const byId = new Map<string, ArenaCard>()
  ;[...deal.players.flat(), ...deal.community.pile1, ...deal.community.pile2, ...deal.community.pile3, deal.auction.faceUp, ...deal.auction.blind]
    .forEach(card => byId.set(arenaCardKey(card), card))
  const heldIds = engine.snapshotDetail().heldCardIds[actorId] ?? []
  return bestArenaArrangement(heldIds.map(id => byId.get(id)!), deal.community)
}

const composition: ArenaMatchComposition = {
  queueId: 'q1', kind: 'FOUR_GODS', humanCount: 3, encounterRoll: 0.9, finalizedAt: 0,
  seats: [
    { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
    { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
    { seat: 3, controller: 'AI', aiId: 'REAPER', role: 'BOSS' },
    { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
  ],
}

function snapshot(overrides: Partial<ArenaMatchSnapshot> = {}): ArenaMatchSnapshot {
  return {
    matchId: 'm1', phase: 'ARRANGE_1', gameNumber: 1, version: 1, deadlineAt: 50_000,
    actorIds: ['p1', 'p2', 'ai:REAPER:seat3', 'p3'], pendingActorIds: ['p1'], completed: false,
    ...overrides,
  }
}

describe('Gate 7 - disconnect lifecycle', () => {
  test('0-3s แสดง Reconnecting, 3-8s เป็น grace และ 8s Bot รับช่วง', () => {
    const manager = new ArenaConnectionManager(['p1'])
    const state = snapshot()
    manager.disconnect('p1', 1_000, state)
    expect(manager.view('p1', 4_000)).toBe('RECONNECTING')
    expect(manager.view('p1', 4_001)).toBe('DISCONNECTED_GRACE')
    expect(manager.controllerFor('p1')).toBe('HUMAN')
    manager.observe(9_000, state)
    expect(manager.controllerFor('p1')).toBe('BOT')
    expect(manager.view('p1', 9_000)).toBe('BOT_ACTIVE')
    expect(state.deadlineAt).toBe(50_000)
  })

  test('กลับภายใน 30s ก่อน Bot commit รับช่วงคืนทันที', () => {
    const manager = new ArenaConnectionManager(['p1'])
    const state = snapshot()
    manager.disconnect('p1', 0, state)
    manager.observe(8_000, state)
    expect(manager.reconnect('p1', 10_000, state)).toBe('CONNECTED')
    expect(manager.controllerFor('p1')).toBe('HUMAN')
  })

  test('กลับภายใน 30s หลัง Bot commit ต้องรอ phase ถัดไป', () => {
    const manager = new ArenaConnectionManager(['p1'])
    const state = snapshot()
    manager.disconnect('p1', 0, state)
    manager.observe(8_000, state)
    manager.recordBotAction('p1', state, 'bot-action-1')
    expect(manager.reconnect('p1', 10_000, state)).toBe('BOT_ACTIVE')
    expect(manager.controllerFor('p1')).toBe('BOT')
    manager.observe(10_001, snapshot({ phase: 'AUCTION_FACE_UP', version: 2 }))
    expect(manager.controllerFor('p1')).toBe('HUMAN')
  })

  test('กลับเกิน 30s ให้ Bot จบ Game ปัจจุบันแล้วคืนตอน Game ถัดไป', () => {
    const manager = new ArenaConnectionManager(['p1'])
    manager.disconnect('p1', 0, snapshot())
    manager.observe(8_000, snapshot())
    expect(manager.reconnect('p1', 31_000, snapshot())).toBe('BOT_UNTIL_NEXT_GAME')
    manager.observe(32_000, snapshot({ gameNumber: 2, phase: 'ARRANGE_1' }))
    expect(manager.controllerFor('p1')).toBe('HUMAN')
  })

  test('ยังไม่กลับก่อน Game ถัดไป Bot ถูกล็อกจนจบ Match', () => {
    const manager = new ArenaConnectionManager(['p1'])
    manager.disconnect('p1', 0, snapshot())
    manager.observe(8_000, snapshot())
    manager.observe(20_000, snapshot({ gameNumber: 2, phase: 'ARRANGE_1' }))
    expect(manager.reconnect('p1', 21_000, snapshot({ gameNumber: 2 }))).toBe('BOT_FOR_MATCH')
    manager.observe(22_000, snapshot({ gameNumber: 3, phase: 'MATCH_RESULT', completed: true }))
    expect(manager.controllerFor('p1')).toBe('HUMAN')
  })

  test('Bot action commit เป็น idempotent และห้าม commit action ใหม่ใน decision เดิม', () => {
    const manager = new ArenaConnectionManager(['p1'])
    const state = snapshot()
    manager.disconnect('p1', 0, state)
    manager.observe(8_000, state)
    manager.recordBotAction('p1', state, 'a1')
    manager.recordBotAction('p1', state, 'a1')
    expect(() => manager.recordBotAction('p1', state, 'a2')).toThrow('ARENA_BOT_ACTION_ALREADY_COMMITTED')
  })
})

describe('Gate 7 - Bot action bridge', () => {
  test('ใช้ arrangement ล่าสุดและ default Joker Wild Pile 3 / GF Fold', () => {
    expect(buildArenaBotAction(snapshot(), 'p1', { arrangement: dummyArrangement })).toMatchObject({
      type: 'ARRANGE_1', actorId: 'p1', ...dummyArrangement,
    })
    expect(buildArenaBotAction(snapshot({ phase: 'JOKER_DECLARE' }), 'p1', { arrangement: dummyArrangement })).toMatchObject({
      type: 'JOKER_DECLARE', mode: 'WILD', targetPile: 3,
    })
    expect(buildArenaBotAction(snapshot({ phase: 'GF_PILE_2' }), 'p1', { arrangement: dummyArrangement })).toMatchObject({
      type: 'GF_ACTION', decision: 'FOLD',
    })
  })

  test('เชื่อมกับ Match Engine โดยไม่ reset deadline และไม่ทับ Bot action ที่ commit', () => {
    const engine = new ArenaMatchEngine('m-integrated', composition, createSeededRandom(77), 0)
    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'BUY_IN_RESERVED', actionId: `reserve-${actorId}`, actorId }, 1)
    }
    const manager = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const before = engine.snapshot()
    manager.disconnect('p1', 100, before)
    manager.observe(8_100, engine.snapshot())
    const botAction = buildArenaBotAction(engine.snapshot(), 'p1', { arrangement: arrangementFor(engine, 'p1') })
    engine.submit(botAction, 8_101)
    manager.recordBotAction('p1', before, botAction.actionId)
    expect(manager.reconnect('p1', 9_000, before)).toBe('BOT_ACTIVE')

    for (const actorId of engine.snapshot().pendingActorIds) {
      engine.submit({ type: 'ARRANGE_1', actionId: `arrange-${actorId}`, actorId, ...arrangementFor(engine, actorId) }, 9_001)
    }
    manager.observe(9_002, engine.snapshot())
    expect(engine.snapshot().phase).toBe('AUCTION_FACE_UP')
    expect(manager.controllerFor('p1')).toBe('HUMAN')
    expect(before.deadlineAt).toBe(45_001)
  })
})
