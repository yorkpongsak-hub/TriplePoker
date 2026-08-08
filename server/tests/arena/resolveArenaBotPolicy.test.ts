import { ArenaMatchEngine } from '../../src/arena/match/arenaMatchEngine'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'
import { resolveArenaBotPolicy } from '../../src/arena/ai/resolveArenaBotPolicy'
import { createSeededRandom } from '../../src/arena/cards/arenaDeck'

function compositionWithFillSeat(aiId: 'DARK_SHARK' | 'ARENA_MINION'): ArenaMatchComposition {
  return {
    queueId: 'q-policy', kind: 'FOUR_GODS',
    seats: [
      { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
      { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
      { seat: 3, controller: 'AI', aiId: 'REAPER', role: 'BOSS' },
      { seat: 4, controller: 'AI', aiId, role: 'FILL' },
    ],
    humanCount: 2, encounterRoll: 0.9, finalizedAt: 0,
  }
}

describe('resolveArenaBotPolicy — เกทว่าที่นั่งไหนมีบุคลิกจริง', () => {
  test('ที่นั่ง BOSS (Four Gods) มีบุคลิกเสมอ ได้ policy ไม่ว่างเปล่า', () => {
    const composition = compositionWithFillSeat('ARENA_MINION')
    const engine = new ArenaMatchEngine('m-policy-boss', composition, createSeededRandom(1), 0)
    const policy = resolveArenaBotPolicy(engine, composition, engine.actorIds[2], Math.random)
    expect(policy.bidCrest).toBeDefined()
    expect(policy.jokerMode).toBeDefined()
  })

  test('ที่นั่ง FILL ที่เป็น Nine Sentinel จริง (DARK_SHARK) ได้บุคลิกจริงเหมือน BOSS ไม่ใช่ policy ว่างอีกต่อไป', () => {
    const composition = compositionWithFillSeat('DARK_SHARK')
    const engine = new ArenaMatchEngine('m-policy-sentinel', composition, createSeededRandom(2), 0)
    const policy = resolveArenaBotPolicy(engine, composition, engine.actorIds[3], Math.random)
    expect(policy.bidCrest).toBe(12) // dark_shark ประมูลสูงสุดเสมอแบบ deterministic — ยืนยันว่าบุคลิกจริงถูกเรียกใช้
    expect(policy.jokerMode).toBeDefined()
  })

  test('ที่นั่ง FILL ที่เป็น ARENA_MINION ทั่วไป (ไม่ใช่ Sentinel) ยังคงได้ policy ว่างเปล่าเหมือนเดิม — ตัวเติมโต๊ะธรรมดาไม่ตั้งใจให้เป็นคู่แข่งจริง', () => {
    const composition = compositionWithFillSeat('ARENA_MINION')
    const engine = new ArenaMatchEngine('m-policy-minion', composition, createSeededRandom(3), 0)
    const policy = resolveArenaBotPolicy(engine, composition, engine.actorIds[3], Math.random)
    expect(policy).toEqual({})
  })
})
