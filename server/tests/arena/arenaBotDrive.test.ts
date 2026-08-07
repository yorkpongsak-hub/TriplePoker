import { createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaConnectionManager } from '../../src/arena/connection/arenaConnectionManager'
import { ArenaMatchEngine } from '../../src/arena/match/arenaMatchEngine'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'
import { driveBots } from '../../src/arena/realtime/arenaSocket'

const allAiComposition: ArenaMatchComposition = {
  queueId: 'q-bots',
  kind: 'FOUR_GODS',
  seats: [
    { seat: 1, controller: 'AI', aiId: 'REAPER', role: 'FILL' },
    { seat: 2, controller: 'AI', aiId: 'CRAG', role: 'FILL' },
    { seat: 3, controller: 'AI', aiId: 'CORTEX', role: 'BOSS' },
    { seat: 4, controller: 'AI', aiId: 'CIPHER', role: 'FILL' },
  ],
  humanCount: 0,
  encounterRoll: null,
  finalizedAt: 0,
}

describe('driveBots - บอท/AI ต้องเดินเกมได้จริงโดยไม่รอ phase timeout', () => {
  test('แมตช์ AI ล้วนจบ MATCH_RESULT ได้ภายในจำนวน tick จำกัด', () => {
    const engine = new ArenaMatchEngine('m-bots', allAiComposition, createSeededRandom(42), 0)
    const connections = new ArenaConnectionManager(['unused-human'])
    const match = { engine, connections, composition: allAiComposition }
    let now = 1
    let ticks = 0
    while (!engine.snapshot().completed && ticks++ < 200) {
      driveBots(match, now)
      engine.tick(now)
      now += 1_000
    }
    expect(engine.snapshot()).toMatchObject({ phase: 'MATCH_RESULT', gameNumber: 3, completed: true })
    expect(ticks).toBeLessThan(200)
  })

  test('human ที่หลุดจนกลายเป็น bot ถูก driveBots ตอบแทนทันที ไม่ต้องรอ deadline', () => {
    const composition: ArenaMatchComposition = {
      queueId: 'q-mix',
      kind: 'FOUR_GODS',
      seats: [
        { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
        { seat: 2, controller: 'AI', aiId: 'REAPER', role: 'FILL' },
        { seat: 3, controller: 'AI', aiId: 'CRAG', role: 'BOSS' },
        { seat: 4, controller: 'AI', aiId: 'CORTEX', role: 'FILL' },
      ],
      humanCount: 1,
      encounterRoll: 0.9,
      finalizedAt: 0,
    }
    const engine = new ArenaMatchEngine('m-mix', composition, createSeededRandom(5), 0)
    engine.submit({ type: 'BUY_IN_RESERVED', actionId: 'reserve-p1', actorId: 'p1' }, 0)
    const connections = new ArenaConnectionManager(['p1'])
    connections.disconnect('p1', 0, engine.snapshot())
    connections.observe(9_000, engine.snapshot())
    expect(connections.controllerFor('p1')).toBe('BOT')
    const match = { engine, connections, composition }
    let now = 9_000
    let ticks = 0
    while (!engine.snapshot().completed && ticks++ < 200) {
      driveBots(match, now)
      engine.tick(now)
      now += 1_000
    }
    expect(engine.snapshot().completed).toBe(true)
    expect(engine.eventLog().some(event => event.actorId === 'p1' && event.kind === 'ACTION_ACCEPTED')).toBe(true)
  })
})
