import {
  ArenaMatchmakingQueue,
  createHumanBossComposition,
  validateArenaComposition,
} from '../../src/arena/matchmaking/arenaMatchmaking'

function sequenceRandom(...values: number[]): () => number {
  let index = 0
  return () => {
    if (index >= values.length) throw new Error('TEST_RANDOM_EXHAUSTED')
    return values[index++]
  }
}

const eligible = (playerId: string, joinedAt: number) => ({ playerId, joinedAt, tokenBalance: 1_000_001 })

describe('Gate 4 - Arena entry and queue safety', () => {
  test('Token ต้องมากกว่า 1M แบบ exclusive', () => {
    const queue = new ArenaMatchmakingQueue('q1', 0)
    expect(queue.join({ playerId: 'p1', joinedAt: 0, tokenBalance: 1_000_000 })).toEqual({
      ok: false,
      reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED',
    })
  })

  test('กัน duplicate join และไม่ finalize ก่อน Human ขั้นต่ำ', () => {
    const queue = new ArenaMatchmakingQueue('q1', 0)
    expect(queue.join(eligible('p1', 0))).toEqual({ ok: true, status: 'WAITING', humanCount: 1 })
    expect(queue.join(eligible('p1', 1))).toEqual({ ok: false, reason: 'ALREADY_JOINED' })
    expect(queue.tryFinalize(60_000)).toBeNull()
  })

  test('finalize เป็น idempotent และห้าม join หลัง match ถูกสร้าง', () => {
    const queue = new ArenaMatchmakingQueue('q1', 0, sequenceRandom(0.9, 0))
    queue.join(eligible('p1', 0))
    queue.join(eligible('p2', 1))
    const first = queue.tryFinalize(60_000)
    const retry = queue.tryFinalize(60_001)
    expect(retry).toBe(first)
    expect(queue.join(eligible('p3', 60_001))).toEqual({ ok: false, reason: 'QUEUE_FINALIZED' })
  })
})

describe('Gate 4 - legal Arena compositions', () => {
  test('Human 3 คนภายใน 60 วิ + encounter miss ใช้ Four God ที่ P3', () => {
    const queue = new ArenaMatchmakingQueue('q-fast', 0, sequenceRandom(0.9, 0.7))
    queue.join(eligible('p1', 1_000))
    queue.join(eligible('p2', 2_000))
    const result = queue.join(eligible('p3', 3_000))
    expect(result.ok && result.status === 'MATCHED' ? result.match.kind : null).toBe('FOUR_GODS')
    if (!result.ok || result.status !== 'MATCHED') throw new Error('expected match')
    expect(result.match.seats).toEqual([
      { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
      { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
      { seat: 3, controller: 'AI', aiId: 'CORTEX', role: 'BOSS' },
      { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
    ])
    validateArenaComposition(result.match)
  })

  test('Human 3 คน + encounter hit สุ่ม Monarch/Soren และไม่มี Dual เกินสี่ที่นั่ง', () => {
    const queue = new ArenaMatchmakingQueue('q-boss', 0, sequenceRandom(0.2, 0.9))
    queue.join(eligible('p1', 1))
    queue.join(eligible('p2', 2))
    const result = queue.join(eligible('p3', 3))
    if (!result.ok || result.status !== 'MATCHED') throw new Error('expected match')
    expect(result.match.kind).toBe('BOSS_ENCOUNTER')
    expect(result.match.seats[2]).toEqual({ seat: 3, controller: 'AI', aiId: 'SOREN', role: 'BOSS' })
    expect(result.match.seats).toHaveLength(4)
    validateArenaComposition(result.match)
  })

  test('Human 2 คนครบ 60 วิ + encounter miss เติม Four God P3 และ Minion P4', () => {
    const queue = new ArenaMatchmakingQueue('q-two', 0, sequenceRandom(0.8, 0))
    queue.join(eligible('p1', 1))
    queue.join(eligible('p2', 2))
    expect(queue.tryFinalize(59_999)).toBeNull()
    const match = queue.tryFinalize(60_000)!
    expect(match.kind).toBe('FOUR_GODS')
    expect(match.seats[2]).toEqual({ seat: 3, controller: 'AI', aiId: 'REAPER', role: 'BOSS' })
    expect(match.seats[3]).toEqual({ seat: 4, controller: 'AI', aiId: 'ARENA_MINION', role: 'FILL' })
    validateArenaComposition(match)
  })

  test('Dual Boss เกิดได้เฉพาะโต๊ะ Human 2 คนและไม่เกิน configured encounter share', () => {
    const queue = new ArenaMatchmakingQueue('q-dual', 0, sequenceRandom(0.1, 0.05))
    queue.join(eligible('p1', 1))
    queue.join(eligible('p2', 2))
    const match = queue.tryFinalize(60_000)!
    expect(match.kind).toBe('DUAL_BOSS_ENCOUNTER')
    expect(match.seats.slice(2)).toEqual([
      { seat: 3, controller: 'AI', aiId: 'MONARCH', role: 'BOSS' },
      { seat: 4, controller: 'AI', aiId: 'SOREN', role: 'BOSS' },
    ])
    validateArenaComposition(match)
  })

  test('Human Boss อยู่ P3 และมี AI เติมอีกสองที่นั่ง', () => {
    const match = createHumanBossComposition('q-human-boss', 'challenger', 'boss-player', 123)
    expect(match.kind).toBe('HUMAN_BOSS')
    expect(match.seats[2]).toEqual({ seat: 3, controller: 'HUMAN', playerId: 'boss-player', role: 'HUMAN_BOSS' })
    expect(match.seats.filter(seat => seat.controller === 'AI')).toHaveLength(2)
    validateArenaComposition(match)
  })

  test('validator ปฏิเสธโต๊ะ Human ล้วน', () => {
    const match = createHumanBossComposition('q', 'p1', 'p3', 1)
    const invalid = {
      ...match,
      seats: match.seats.map((seat, index) => ({ seat: (index + 1) as 1 | 2 | 3 | 4, controller: 'HUMAN' as const, playerId: `p${index + 1}`, role: index === 2 ? 'HUMAN_BOSS' as const : 'CHALLENGER' as const })) as typeof match.seats,
    }
    expect(() => validateArenaComposition(invalid)).toThrow('ARENA_REQUIRES_SERVER_AI')
  })
})
