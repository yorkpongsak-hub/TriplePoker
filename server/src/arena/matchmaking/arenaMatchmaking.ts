import { ArenaRandom } from '../cards/arenaDeck'
import { tierSConfig } from '../config/tierSConfig'
import { checkTierSEligibility } from '../eligibility/tierSEligibility'

export type FourGodId = 'REAPER' | 'CRAG' | 'CORTEX' | 'CIPHER'
// Nine Sentinels (พอร์ตมาจาก Mastermind Conquest) — ใช้เป็นตัวเติมที่นั่ง FILL แทน ARENA_MINION ทั่วไป
export type SentinelId = 'IRON_WALL' | 'CHIVALRY' | 'WAR_LORD' | 'PHANTOM' | 'DARK_SHARK' | 'ORACLE' | 'JESTER' | 'PHOENIX' | 'BLACK_MAGIC'
export type ArenaAIId = FourGodId | 'MONARCH' | 'SOREN' | SentinelId | 'ARENA_MINION'
export type ArenaSeatNumber = 1 | 2 | 3 | 4

export interface ArenaHuman {
  playerId: string
  tokenBalance: number
  tierUnlockedMax?: string | null
  joinedAt: number
}

export type ArenaSeatAssignment =
  | { seat: ArenaSeatNumber; controller: 'HUMAN'; playerId: string; role: 'CHALLENGER' | 'HUMAN_BOSS' }
  | { seat: ArenaSeatNumber; controller: 'AI'; aiId: ArenaAIId; role: 'BOSS' | 'FILL' }

export interface ArenaMatchComposition {
  queueId: string
  kind: 'FOUR_GODS' | 'BOSS_ENCOUNTER' | 'DUAL_BOSS_ENCOUNTER' | 'HUMAN_BOSS'
  seats: [ArenaSeatAssignment, ArenaSeatAssignment, ArenaSeatAssignment, ArenaSeatAssignment]
  humanCount: number
  encounterRoll: number | null
  finalizedAt: number
}

export type JoinArenaQueueResult =
  | { ok: true; status: 'WAITING'; humanCount: number }
  | { ok: true; status: 'MATCHED'; match: ArenaMatchComposition }
  | { ok: false; reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED' | 'ALREADY_JOINED' | 'QUEUE_FULL' | 'QUEUE_FINALIZED' }

const FOUR_GODS: readonly FourGodId[] = ['REAPER', 'CRAG', 'CORTEX', 'CIPHER']
const SENTINELS: readonly SentinelId[] = ['IRON_WALL', 'CHIVALRY', 'WAR_LORD', 'PHANTOM', 'DARK_SHARK', 'ORACLE', 'JESTER', 'PHOENIX', 'BLACK_MAGIC']

function randomIndex(length: number, random: ArenaRandom): number {
  const roll = random()
  if (roll < 0 || roll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
  return Math.floor(roll * length)
}

function humanSeat(seat: ArenaSeatNumber, playerId: string, role: 'CHALLENGER' | 'HUMAN_BOSS' = 'CHALLENGER'): ArenaSeatAssignment {
  return { seat, controller: 'HUMAN', playerId, role }
}

function aiSeat(seat: ArenaSeatNumber, aiId: ArenaAIId, role: 'BOSS' | 'FILL'): ArenaSeatAssignment {
  return { seat, controller: 'AI', aiId, role }
}

export class ArenaMatchmakingQueue {
  private humans: ArenaHuman[] = []
  private finalized: ArenaMatchComposition | null = null

  constructor(
    readonly queueId: string,
    readonly createdAt: number,
    private readonly random: ArenaRandom = Math.random,
  ) {
    if (!queueId.trim()) throw new Error('ARENA_QUEUE_ID_REQUIRED')
  }

  join(player: ArenaHuman, now = player.joinedAt): JoinArenaQueueResult {
    if (this.finalized) return { ok: false, reason: 'QUEUE_FINALIZED' }
    if (!checkTierSEligibility(player.tokenBalance, player.tierUnlockedMax).eligible) return { ok: false, reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED' }
    if (this.humans.some(existing => existing.playerId === player.playerId)) return { ok: false, reason: 'ALREADY_JOINED' }
    if (this.humans.length >= 3) return { ok: false, reason: 'QUEUE_FULL' }
    this.humans.push(player)

    const match = this.tryFinalize(now)
    return match
      ? { ok: true, status: 'MATCHED', match }
      : { ok: true, status: 'WAITING', humanCount: this.humans.length }
  }

  tryFinalize(now: number): ArenaMatchComposition | null {
    if (this.finalized) return this.finalized
    const elapsed = now - this.createdAt
    if (this.humans.length < tierSConfig.minimumHumans) return null
    const fastThree = this.humans.length === tierSConfig.fastBossRollHumanCount && elapsed <= tierSConfig.fastBossRollWindowSeconds * 1_000
    const twoHumanTimeout = this.humans.length === 2 && elapsed >= tierSConfig.fastBossRollWindowSeconds * 1_000
    const lateThree = this.humans.length === 3 && elapsed > tierSConfig.fastBossRollWindowSeconds * 1_000
    if (!fastThree && !twoHumanTimeout && !lateThree) return null

    this.finalized = this.buildRegularComposition(now, twoHumanTimeout)
    return this.finalized
  }

  snapshot(): { queueId: string; humanIds: string[]; finalized: boolean } {
    return { queueId: this.queueId, humanIds: this.humans.map(player => player.playerId), finalized: this.finalized !== null }
  }

  private buildRegularComposition(now: number, dualAllowed: boolean): ArenaMatchComposition {
    const encounterRoll = this.random()
    if (encounterRoll < 0 || encounterRoll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
    const encounter = encounterRoll < tierSConfig.bossEncounterRate

    if (!encounter) return this.buildFourGods(now, encounterRoll)

    if (dualAllowed) {
      const dualRoll = this.random()
      if (dualRoll < 0 || dualRoll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
      if (dualRoll < tierSConfig.dualBossRateWithinEncounterMax) {
        return {
          queueId: this.queueId,
          kind: 'DUAL_BOSS_ENCOUNTER',
          seats: [
            humanSeat(1, this.humans[0].playerId),
            humanSeat(2, this.humans[1].playerId),
            aiSeat(3, 'MONARCH', 'BOSS'),
            aiSeat(4, 'SOREN', 'BOSS'),
          ],
          humanCount: 2,
          encounterRoll,
          finalizedAt: now,
        }
      }
    }

    const boss: ArenaAIId = randomIndex(2, this.random) === 0 ? 'MONARCH' : 'SOREN'
    return this.humans.length === 3
      ? {
          queueId: this.queueId,
          kind: 'BOSS_ENCOUNTER',
          seats: [humanSeat(1, this.humans[0].playerId), humanSeat(2, this.humans[1].playerId), aiSeat(3, boss, 'BOSS'), humanSeat(4, this.humans[2].playerId)],
          humanCount: 3,
          encounterRoll,
          finalizedAt: now,
        }
      : {
          queueId: this.queueId,
          kind: 'BOSS_ENCOUNTER',
          seats: [humanSeat(1, this.humans[0].playerId), humanSeat(2, this.humans[1].playerId), aiSeat(3, boss, 'BOSS'), aiSeat(4, SENTINELS[randomIndex(SENTINELS.length, this.random)], 'FILL')],
          humanCount: 2,
          encounterRoll,
          finalizedAt: now,
        }
  }

  private buildFourGods(now: number, encounterRoll: number): ArenaMatchComposition {
    const boss = FOUR_GODS[randomIndex(FOUR_GODS.length, this.random)]
    return this.humans.length === 3
      ? {
          queueId: this.queueId,
          kind: 'FOUR_GODS',
          seats: [humanSeat(1, this.humans[0].playerId), humanSeat(2, this.humans[1].playerId), aiSeat(3, boss, 'BOSS'), humanSeat(4, this.humans[2].playerId)],
          humanCount: 3,
          encounterRoll,
          finalizedAt: now,
        }
      : {
          queueId: this.queueId,
          kind: 'FOUR_GODS',
          seats: [humanSeat(1, this.humans[0].playerId), humanSeat(2, this.humans[1].playerId), aiSeat(3, boss, 'BOSS'), aiSeat(4, SENTINELS[randomIndex(SENTINELS.length, this.random)], 'FILL')],
          humanCount: 2,
          encounterRoll,
          finalizedAt: now,
        }
  }
}

export function createHumanBossComposition(
  queueId: string,
  challengerId: string,
  humanBossId: string,
  finalizedAt: number,
): ArenaMatchComposition {
  if (!challengerId || !humanBossId || challengerId === humanBossId) throw new Error('HUMAN_BOSS_PLAYERS_INVALID')
  return {
    queueId,
    kind: 'HUMAN_BOSS',
    seats: [
      humanSeat(1, challengerId),
      aiSeat(2, 'ARENA_MINION', 'FILL'),
      humanSeat(3, humanBossId, 'HUMAN_BOSS'),
      aiSeat(4, 'ARENA_MINION', 'FILL'),
    ],
    humanCount: 2,
    encounterRoll: null,
    finalizedAt,
  }
}

export function validateArenaComposition(composition: ArenaMatchComposition): void {
  if (composition.seats.length !== 4) throw new Error('ARENA_REQUIRES_FOUR_SEATS')
  if (new Set(composition.seats.map(seat => seat.seat)).size !== 4) throw new Error('ARENA_SEATS_MUST_BE_UNIQUE')
  if (!composition.seats.some(seat => seat.controller === 'AI')) throw new Error('ARENA_REQUIRES_SERVER_AI')
  const p3 = composition.seats.find(seat => seat.seat === 3)
  if (!p3 || (p3.controller === 'AI' ? p3.role !== 'BOSS' : p3.role !== 'HUMAN_BOSS')) throw new Error('ARENA_P3_MUST_BE_BOSS')
}
