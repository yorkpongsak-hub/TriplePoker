// ─────────────────────────────────────────────────────────────────────────────
// arenaTableWinner.test.ts — resolveArenaTableWinner() + psGained (Grandmaster item 6/7)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { ArenaConnectionManager } from '../../src/arena/connection/arenaConnectionManager'
import { bestArenaArrangement } from '../../src/arena/arrangement/arenaArrangement'
import { arenaCardKey, ArenaCard, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { ArenaMatchAction, ArenaMatchEngine } from '../../src/arena/match/arenaMatchEngine'
import { ArenaMatchComposition } from '../../src/arena/matchmaking/arenaMatchmaking'
import { projectArenaClientSnapshot, resolveArenaTableWinner } from '../../src/arena/realtime/arenaProjection'

jest.setTimeout(30_000)

const fourGodsComposition: ArenaMatchComposition = {
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

const monarchComposition: ArenaMatchComposition = {
  queueId: 'q-monarch',
  kind: 'BOSS_ENCOUNTER',
  seats: [
    { seat: 1, controller: 'HUMAN', playerId: 'p1', role: 'CHALLENGER' },
    { seat: 2, controller: 'HUMAN', playerId: 'p2', role: 'CHALLENGER' },
    { seat: 3, controller: 'AI', aiId: 'MONARCH', role: 'BOSS' },
    { seat: 4, controller: 'HUMAN', playerId: 'p3', role: 'CHALLENGER' },
  ],
  humanCount: 3, encounterRoll: 0.1, finalizedAt: 0,
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

function playMatch(seed: number, matchComposition: ArenaMatchComposition, matchId: string): ArenaMatchEngine {
  const engine = new ArenaMatchEngine(matchId, matchComposition, createSeededRandom(seed), 1_000)
  let sequence = 0
  let now = 1_001
  while (!engine.snapshot().completed && sequence < 1_000) {
    const pending = engine.snapshot().pendingActorIds
    if (pending.length) {
      engine.submit(actionFor(engine, pending[0], ++sequence), now++)
    } else {
      now = Math.max(now + 1, engine.snapshot().deadlineAt ?? now + 1)
      engine.tick(now)
    }
  }
  if (!engine.snapshot().completed) throw new Error('simulation did not complete')
  return engine
}

describe('resolveArenaTableWinner', () => {
  test('เลือกผู้ชนะจาก endingCrest สูงสุดจริง ตรงกับการหา max ด้วยมือ (หลาย seed)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const engine = playMatch(seed, fourGodsComposition, `winner-${seed}`)
      const breakdown = engine.settlementBreakdown()
      const expectedMax = breakdown.reduce((a, b) => (b.endingCrest > a.endingCrest ? b : a))
      const { winnerId } = resolveArenaTableWinner(engine, fourGodsComposition)
      expect(winnerId).toBe(expectedMax.playerId)
    }
  })

  test('isHumanWinner true เมื่อผู้ชนะเป็นที่นั่ง HUMAN, false เมื่อเป็น AI (Boss/Sentinel)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const engine = playMatch(seed, fourGodsComposition, `human-flag-${seed}`)
      const { winnerId, isHumanWinner } = resolveArenaTableWinner(engine, fourGodsComposition)
      const winnerSeat = fourGodsComposition.seats.find((seat, index) => engine.actorIds[index] === winnerId)
      expect(isHumanWinner).toBe(winnerSeat?.controller === 'HUMAN')
    }
  })

  test('isRareBoss: false สำหรับ Four Gods (REAPER), true สำหรับ Monarch', () => {
    const fourGodsEngine = playMatch(11, fourGodsComposition, 'rare-boss-four-gods')
    expect(resolveArenaTableWinner(fourGodsEngine, fourGodsComposition).isRareBoss).toBe(false)

    const monarchEngine = playMatch(11, monarchComposition, 'rare-boss-monarch')
    expect(resolveArenaTableWinner(monarchEngine, monarchComposition).isRareBoss).toBe(true)
  })
})

describe('arenaProjection result.psGained', () => {
  test('psGained ตรงกับสูตร Grandmaster (win / not-win-non-negative / negative) ตาม viewer', () => {
    const engine = playMatch(3, fourGodsComposition, 'ps-gained-1')
    expect(engine.snapshot().phase).toBe('MATCH_RESULT')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const { winnerId, isRareBoss } = resolveArenaTableWinner(engine, fourGodsComposition)
    const breakdown = engine.settlementBreakdown()

    for (const viewerId of ['p1', 'p2', 'p3']) {
      const view = projectArenaClientSnapshot(engine, fourGodsComposition, connections, viewerId, 10, new Map())
      const localBreakdown = breakdown.find(entry => entry.playerId === viewerId)!
      const expected = viewerId === winnerId
        ? (isRareBoss ? 12 : 7)
        : (localBreakdown.netCrest >= 0 ? 4 : 2)
      expect(view.result?.psGained).toBe(expected)
    }
  })

  test('psGained ผู้ชนะเจอ Monarch ได้ +12 (ไม่ใช่ +7)', () => {
    const engine = playMatch(11, monarchComposition, 'ps-gained-monarch')
    expect(engine.snapshot().phase).toBe('MATCH_RESULT')
    const connections = new ArenaConnectionManager(['p1', 'p2', 'p3'])
    const { winnerId, isHumanWinner } = resolveArenaTableWinner(engine, monarchComposition)
    if (!isHumanWinner) return // AI ชนะโต๊ะรอบนี้ — ข้าม (ไม่มี human ให้เช็คค่า win)
    const view = projectArenaClientSnapshot(engine, monarchComposition, connections, winnerId, 10, new Map())
    expect(view.result?.psGained).toBe(12)
  })
})
