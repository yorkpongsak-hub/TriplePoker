import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { createDeck, shuffleDeck, type Card } from './deck'
import { compareHands } from './handEvaluator'
import { evaluateSharedPile, isSharedArrangementFoul, physicalCardKey, type ThreePiles } from './sharedCardRules'

export const CREW_MAX_MEMBERS = 10
export const CREW_TABLE_CAPACITY = 4
export const CREW_ARRANGEMENT_MS = 120_000
export const CREW_DEFAULT_POINTS: CrewPilePoints = { g1: 1, g2: 2, g3: 3 }

export type CrewPilePoints = { g1: number; g2: number; g3: number }
export type CrewSessionPhase = 'WAITING_FOR_DEAL' | 'ARRANGING' | 'REVEALING' | 'ENDED'
export type CrewSeatStatus = 'ONLINE' | 'DISCONNECTED'
export type CrewArrangement = ThreePiles

export interface CrewMember { playerId: string; displayName: string; addedAt: number }
export interface VipCrew { ownerId: string; members: CrewMember[]; updatedAt: number }
export interface CrewSeat { playerId: string; displayName: string; joinedAt: number; status: CrewSeatStatus; disconnectedAt: number | null }
export interface CrewParticipant { playerId: string; displayName: string; score: number; matchesPlayed: number }
export interface CrewPileResult { pile: 1 | 2 | 3; deltas: Record<string, number>; winners: string[] }
export interface CrewMatchResult { matchNumber: number; pileResults: CrewPileResult[]; deltas: Record<string, number>; fouled: Record<string, boolean>; completedAt: number }

export interface CrewMatchState {
  matchId: string
  startedAt: number
  deadlineAt: number
  hands: Record<string, Card[]>
  community: ThreePiles
  arrangements: Record<string, CrewArrangement | undefined>
  fouled: Record<string, boolean>
  result?: CrewMatchResult
}

export interface CrewSession {
  sessionId: string
  ownerId: string
  pinDigest: string
  phase: CrewSessionPhase
  createdAt: number
  endedAt: number | null
  matchCount: number
  points: CrewPilePoints
  comboEnabled: boolean
  seats: CrewSeat[]
  participants: Record<string, CrewParticipant>
  currentMatch?: CrewMatchState
  results: CrewMatchResult[]
  version: number
}

export type CrewErrorCode =
  | 'CREW_FULL' | 'MEMBER_ALREADY_REGISTERED' | 'OWNER_IS_IMPLICIT_MEMBER'
  | 'INVALID_PIN' | 'NOT_CREW_MEMBER' | 'TABLE_FULL' | 'SESSION_NOT_FOUND'
  | 'SESSION_ENDED' | 'OWNER_MUST_BE_ONLINE' | 'ONLY_OWNER' | 'FOUR_PLAYERS_REQUIRED'
  | 'NOT_WAITING_FOR_DEAL' | 'NOT_ARRANGING' | 'PLAYER_NOT_SEATED' | 'ALREADY_SUBMITTED'
  | 'INVALID_POINTS' | 'INVALID_ARRANGEMENT' | 'STALE_SESSION'

export class CrewTableError extends Error {
  constructor(public readonly code: CrewErrorCode) { super(code) }
}

const digestPin = (pin: string) => createHash('sha256').update(`triplepoker-crew:${pin}`).digest('hex')
const validPin = (pin: string) => /^\d{4,8}$/.test(pin)
const validPoints = (points: CrewPilePoints) => [points.g1, points.g2, points.g3].every(value => Number.isInteger(value) && value > 0 && value <= 10_000)

export function createVipCrew(ownerId: string, now = Date.now()): VipCrew {
  return { ownerId, members: [], updatedAt: now }
}

export function addVipCrewMember(crew: VipCrew, member: CrewMember, now = Date.now()): VipCrew {
  if (member.playerId === crew.ownerId) throw new CrewTableError('OWNER_IS_IMPLICIT_MEMBER')
  if (crew.members.some(row => row.playerId === member.playerId)) throw new CrewTableError('MEMBER_ALREADY_REGISTERED')
  if (crew.members.length >= CREW_MAX_MEMBERS) throw new CrewTableError('CREW_FULL')
  return { ...crew, members: [...crew.members, { ...member, addedAt: member.addedAt || now }], updatedAt: now }
}

export function removeVipCrewMember(crew: VipCrew, playerId: string, now = Date.now()): VipCrew {
  return { ...crew, members: crew.members.filter(member => member.playerId !== playerId), updatedAt: now }
}

export function createCrewInviteToken(): string { return randomBytes(24).toString('base64url') }

export class VipPrivateCrewRegistry {
  private readonly sessions = new Map<string, CrewSession>()
  private readonly ownerSession = new Map<string, string>()

  createSession(input: { ownerId: string; ownerName: string; pin: string; points?: CrewPilePoints; comboEnabled?: boolean }, now = Date.now()): CrewSession {
    if (!validPin(input.pin)) throw new CrewTableError('INVALID_PIN')
    const points = input.points ?? CREW_DEFAULT_POINTS
    if (!validPoints(points)) throw new CrewTableError('INVALID_POINTS')
    const previousId = this.ownerSession.get(input.ownerId)
    const previous = previousId ? this.sessions.get(previousId) : undefined
    if (previous && previous.phase !== 'ENDED') throw new CrewTableError('STALE_SESSION')
    const session: CrewSession = {
      sessionId: `crew_${randomUUID()}`, ownerId: input.ownerId, pinDigest: digestPin(input.pin),
      phase: 'WAITING_FOR_DEAL', createdAt: now, endedAt: null, matchCount: 0,
      points: { ...points }, comboEnabled: input.comboEnabled ?? true,
      seats: [{ playerId: input.ownerId, displayName: input.ownerName, joinedAt: now, status: 'ONLINE', disconnectedAt: null }],
      participants: { [input.ownerId]: { playerId: input.ownerId, displayName: input.ownerName, score: 0, matchesPlayed: 0 } },
      results: [], version: 1,
    }
    this.sessions.set(session.sessionId, session); this.ownerSession.set(input.ownerId, session.sessionId)
    return session
  }

  restore(session: CrewSession): void {
    this.sessions.set(session.sessionId, session)
    if (session.phase !== 'ENDED') this.ownerSession.set(session.ownerId, session.sessionId)
  }

  get(sessionId: string): CrewSession | undefined { return this.sessions.get(sessionId) }

  join(input: { sessionId: string; playerId: string; displayName: string; pin: string; crew: VipCrew }, now = Date.now()): CrewSession {
    const session = this.requireActive(input.sessionId)
    if (input.crew.ownerId !== session.ownerId || (input.playerId !== session.ownerId && !input.crew.members.some(member => member.playerId === input.playerId))) throw new CrewTableError('NOT_CREW_MEMBER')
    if (!this.pinMatches(session.pinDigest, input.pin)) throw new CrewTableError('INVALID_PIN')
    const existing = session.seats.find(seat => seat.playerId === input.playerId)
    if (existing) { existing.status = 'ONLINE'; existing.disconnectedAt = null; this.bump(session); return session }
    if (session.seats.length >= CREW_TABLE_CAPACITY) throw new CrewTableError('TABLE_FULL')
    session.seats.push({ playerId: input.playerId, displayName: input.displayName, joinedAt: now, status: 'ONLINE', disconnectedAt: null })
    session.participants[input.playerId] ??= { playerId: input.playerId, displayName: input.displayName, score: 0, matchesPlayed: 0 }
    this.bump(session); return session
  }

  markConnected(sessionId: string, playerId: string, connected: boolean, now = Date.now()): CrewSession {
    const session = this.requireActive(sessionId); const seat = session.seats.find(row => row.playerId === playerId)
    if (!seat) throw new CrewTableError('PLAYER_NOT_SEATED')
    seat.status = connected ? 'ONLINE' : 'DISCONNECTED'; seat.disconnectedAt = connected ? null : now; this.bump(session); return session
  }

  leaveSeat(sessionId: string, playerId: string): CrewSession {
    const session = this.requireActive(sessionId)
    if (playerId === session.ownerId) throw new CrewTableError('ONLY_OWNER')
    if (session.phase === 'ARRANGING' || session.phase === 'REVEALING') throw new CrewTableError('NOT_WAITING_FOR_DEAL')
    const before = session.seats.length; session.seats = session.seats.filter(seat => seat.playerId !== playerId)
    if (before === session.seats.length) throw new CrewTableError('PLAYER_NOT_SEATED')
    this.bump(session); return session
  }

  deal(sessionId: string, ownerId: string, now = Date.now(), random: () => number = Math.random): CrewSession {
    const session = this.requireActive(sessionId)
    if (ownerId !== session.ownerId) throw new CrewTableError('ONLY_OWNER')
    if (session.phase !== 'WAITING_FOR_DEAL') throw new CrewTableError('NOT_WAITING_FOR_DEAL')
    if (session.seats.length !== CREW_TABLE_CAPACITY) throw new CrewTableError('FOUR_PLAYERS_REQUIRED')
    const owner = session.seats.find(seat => seat.playerId === ownerId)
    if (!owner || owner.status !== 'ONLINE') throw new CrewTableError('OWNER_MUST_BE_ONLINE')
    const deck = shuffleWith(createDeck(), random); let cursor = 0; const hands: Record<string, Card[]> = {}
    for (const seat of session.seats) { hands[seat.playerId] = deck.slice(cursor, cursor + 11); cursor += 11 }
    const community = { pile1: deck.slice(cursor, cursor + 2), pile2: deck.slice(cursor + 2, cursor + 4), pile3: deck.slice(cursor + 4, cursor + 6) }
    session.currentMatch = { matchId: randomUUID(), startedAt: now, deadlineAt: now + CREW_ARRANGEMENT_MS, hands, community, arrangements: {}, fouled: {} }
    session.phase = 'ARRANGING'; this.bump(session); return session
  }

  submitArrangement(sessionId: string, playerId: string, arrangement: CrewArrangement): CrewSession {
    const session = this.requireActive(sessionId)
    if (session.phase !== 'ARRANGING' || !session.currentMatch) throw new CrewTableError('NOT_ARRANGING')
    const hand = session.currentMatch.hands[playerId]
    if (!hand) throw new CrewTableError('PLAYER_NOT_SEATED')
    if (session.currentMatch.arrangements[playerId]) throw new CrewTableError('ALREADY_SUBMITTED')
    if (!this.validArrangement(hand, arrangement)) throw new CrewTableError('INVALID_ARRANGEMENT')
    session.currentMatch.arrangements[playerId] = cloneArrangement(arrangement)
    session.currentMatch.fouled[playerId] = isSharedArrangementFoul(arrangement, session.currentMatch.community)
    if (session.seats.every(seat => session.currentMatch!.arrangements[seat.playerId])) this.resolve(session)
    this.bump(session); return session
  }

  endSession(sessionId: string, ownerId: string, now = Date.now()): CrewSession {
    const session = this.requireActive(sessionId)
    if (ownerId !== session.ownerId) throw new CrewTableError('ONLY_OWNER')
    if (session.phase === 'ARRANGING' || session.phase === 'REVEALING') throw new CrewTableError('NOT_WAITING_FOR_DEAL')
    session.phase = 'ENDED'; session.endedAt = now; this.ownerSession.delete(ownerId); this.bump(session); return session
  }

  private resolve(session: CrewSession): void {
    const match = session.currentMatch!; const ids = session.seats.map(seat => seat.playerId)
    const deltas = Object.fromEntries(ids.map(id => [id, 0])) as Record<string, number>
    const pileResults: CrewPileResult[] = []
    const pairWins = new Map<string, number>()
    for (const pile of [1, 2, 3] as const) {
      const pileDeltas = Object.fromEntries(ids.map(id => [id, 0])) as Record<string, number>; const point = session.points[`g${pile}`]
      const winners = new Set<string>()
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const left = ids[a], right = ids[b]; const comparison = compareCrewPlayers(match, left, right, pile)
        if (comparison === 0) continue
        const winner = comparison > 0 ? left : right; const loser = comparison > 0 ? right : left
        pileDeltas[winner] += point; pileDeltas[loser] -= point; winners.add(winner)
        pairWins.set(`${winner}|${loser}`, (pairWins.get(`${winner}|${loser}`) ?? 0) + 1)
      }
      for (const id of ids) deltas[id] += pileDeltas[id]
      pileResults.push({ pile, deltas: pileDeltas, winners: [...winners] })
    }
    if (session.comboEnabled) {
      const bonus = session.points.g1 + session.points.g2 + session.points.g3
      for (const [pair, wins] of pairWins) if (wins === 3) { const [winner, loser] = pair.split('|'); deltas[winner] += bonus; deltas[loser] -= bonus }
    }
    if (Object.values(deltas).reduce((sum, value) => sum + value, 0) !== 0) throw new Error('CREW_SCORE_NOT_ZERO_SUM')
    const result: CrewMatchResult = { matchNumber: session.matchCount + 1, pileResults, deltas, fouled: { ...match.fouled }, completedAt: Date.now() }
    match.result = result; session.matchCount += 1; session.results.push(result)
    for (const id of ids) { session.participants[id].score += deltas[id]; session.participants[id].matchesPlayed += 1 }
    session.phase = 'REVEALING'
  }

  finishReveal(sessionId: string): CrewSession {
    const session = this.requireActive(sessionId)
    if (session.phase !== 'REVEALING' || !session.currentMatch?.result) throw new CrewTableError('NOT_WAITING_FOR_DEAL')
    session.phase = 'WAITING_FOR_DEAL'; session.currentMatch = undefined; this.bump(session); return session
  }

  private requireActive(id: string): CrewSession { const session = this.sessions.get(id); if (!session) throw new CrewTableError('SESSION_NOT_FOUND'); if (session.phase === 'ENDED') throw new CrewTableError('SESSION_ENDED'); return session }
  private bump(session: CrewSession): void { session.version += 1 }
  private pinMatches(digest: string, pin: string): boolean { if (!validPin(pin)) return false; const actual = Buffer.from(digestPin(pin)); const expected = Buffer.from(digest); return actual.length === expected.length && timingSafeEqual(actual, expected) }
  private validArrangement(hand: Card[], arrangement: CrewArrangement): boolean {
    if (arrangement.pile1.length !== 3 || arrangement.pile2.length !== 3 || arrangement.pile3.length !== 5) return false
    return [...arrangement.pile1, ...arrangement.pile2, ...arrangement.pile3].map(physicalCardKey).sort().join('|') === hand.map(physicalCardKey).sort().join('|')
  }
}

function compareCrewPlayers(match: CrewMatchState, left: string, right: string, pile: 1 | 2 | 3): number {
  if (match.fouled[left] !== match.fouled[right]) return match.fouled[left] ? -1 : 1
  if (match.fouled[left] && match.fouled[right]) return 0
  return compareHands(evaluateSharedPile(match.arrangements[left]!, match.community, pile), evaluateSharedPile(match.arrangements[right]!, match.community, pile))
}

function cloneArrangement(value: CrewArrangement): CrewArrangement { return { pile1: [...value.pile1], pile2: [...value.pile2], pile3: [...value.pile3] } }
function shuffleWith(deck: Card[], random: () => number): Card[] { const copy = [...deck]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }

export const vipPrivateCrewRegistry = new VipPrivateCrewRegistry()

export const crewCardKey = (card: Card): string => `${card.rank.toLowerCase()}${card.suit[0]}`

/** Viewer-safe projection: only the requesting player's private hand/layout is exposed. */
export function buildCrewSessionView(session: CrewSession, viewerId: string) {
  const match = session.currentMatch
  return {
    sessionId: session.sessionId, ownerId: session.ownerId, phase: session.phase,
    createdAt: session.createdAt, endedAt: session.endedAt, matchCount: session.matchCount,
    points: session.points, comboEnabled: session.comboEnabled, seats: session.seats,
    participants: Object.values(session.participants), version: session.version,
    match: match ? {
      matchId: match.matchId, startedAt: match.startedAt, deadlineAt: match.deadlineAt,
      hand: (match.hands[viewerId] ?? []).map(crewCardKey),
      community: Object.fromEntries(Object.entries(match.community).map(([key, cards]) => [key, cards.map(crewCardKey)])),
      arrangement: match.arrangements[viewerId] ? Object.fromEntries(Object.entries(match.arrangements[viewerId]!).map(([key, cards]) => [key, cards.map(crewCardKey)])) : null,
      submittedPlayerIds: Object.keys(match.arrangements), fouled: match.result ? match.fouled : undefined,
      result: match.result,
    } : null,
  }
}
