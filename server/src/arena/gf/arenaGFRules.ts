export type GFDirection = 'CLOCKWISE' | 'COUNTER_CLOCKWISE'

export interface GFPlayer {
  playerId: string
  seat: 1 | 2 | 3 | 4
  isBoss: boolean
  joinedAt: number
}

export interface GFRound {
  pile: 2 | 3
  round: 1 | 2
  direction: GFDirection
  turnOrder: string[]
  foldedPlayerIds: string[]
  calledPlayerIds: string[]
}

function rotate(ids: string[], startId: string): string[] {
  const index = ids.indexOf(startId)
  if (index < 0) throw new Error('GF_START_PLAYER_NOT_ELIGIBLE')
  return [...ids.slice(index), ...ids.slice(0, index)]
}

function ordered(players: readonly GFPlayer[], direction: GFDirection): GFPlayer[] {
  return [...players].sort((a, b) => direction === 'CLOCKWISE' ? a.seat - b.seat : b.seat - a.seat)
}

export function startPile2GF(players: readonly GFPlayer[]): GFRound {
  if (players.length < 2) throw new Error('GF_REQUIRES_AT_LEAST_TWO_PLAYERS')
  const direction: GFDirection = 'COUNTER_CLOCKWISE'
  const base = ordered(players, direction)
  const boss = players.find(player => player.isBoss)
  const starter = boss ?? [...players].sort((a, b) => a.joinedAt - b.joinedAt)[0]
  return { pile: 2, round: 1, direction, turnOrder: rotate(base.map(player => player.playerId), starter.playerId), foldedPlayerIds: [], calledPlayerIds: [] }
}

export function startPile3Round1(players: readonly GFPlayer[], lastPile2CallerId: string): GFRound {
  const direction: GFDirection = 'CLOCKWISE'
  const base = ordered(players, direction).map(player => player.playerId)
  return { pile: 3, round: 1, direction, turnOrder: rotate(base, lastPile2CallerId), foldedPlayerIds: [], calledPlayerIds: [] }
}

export function startPile3Round2(players: readonly GFPlayer[], round1: GFRound): GFRound {
  const lastCaller = round1.calledPlayerIds.at(-1)
  if (!lastCaller) throw new Error('GF_ROUND_ONE_HAS_NO_CALLER')
  const eligible = players.filter(player => round1.calledPlayerIds.includes(player.playerId) && !round1.foldedPlayerIds.includes(player.playerId))
  const direction: GFDirection = 'COUNTER_CLOCKWISE'
  const base = ordered(eligible, direction).map(player => player.playerId)
  return { pile: 3, round: 2, direction, turnOrder: rotate(base, lastCaller), foldedPlayerIds: [], calledPlayerIds: [] }
}

export function recordGFAction(round: GFRound, playerId: string, action: 'CALL' | 'FOLD'): GFRound {
  if (!round.turnOrder.includes(playerId)) throw new Error('GF_PLAYER_NOT_ELIGIBLE')
  if (round.calledPlayerIds.includes(playerId) || round.foldedPlayerIds.includes(playerId)) throw new Error('GF_ACTION_ALREADY_RECORDED')
  return action === 'CALL'
    ? { ...round, calledPlayerIds: [...round.calledPlayerIds, playerId] }
    : { ...round, foldedPlayerIds: [...round.foldedPlayerIds, playerId] }
}

export function soleRemainingPlayer(round: GFRound): string | null {
  const active = round.turnOrder.filter(id => !round.foldedPlayerIds.includes(id))
  return active.length === 1 ? active[0] : null
}
