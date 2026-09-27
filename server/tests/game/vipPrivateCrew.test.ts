import { addVipCrewMember, createVipCrew, CREW_ARRANGEMENT_MS, CREW_TABLE_CAPACITY, VipPrivateCrewRegistry } from '../../src/game/vipPrivateCrew'

const owner = 'owner'
const players = ['owner', 'p2', 'p3', 'p4']
function crew() { return players.slice(1).reduce((value, id) => addVipCrewMember(value, { playerId: id, displayName: id, addedAt: 1 }), createVipCrew(owner)) }
function open(registry: VipPrivateCrewRegistry) {
  const session = registry.createSession({ ownerId: owner, ownerName: 'Owner', pin: '2468' }, 100)
  for (const id of players.slice(1)) registry.join({ sessionId: session.sessionId, playerId: id, displayName: id, pin: '2468', crew: crew() }, 101)
  return session
}

describe('VIP Private Crew Table', () => {
  test('admits only crew members with the PIN and enforces four first-come seats', () => {
    const registry = new VipPrivateCrewRegistry(); const session = registry.createSession({ ownerId: owner, ownerName: 'Owner', pin: '2468' })
    expect(() => registry.join({ sessionId: session.sessionId, playerId: 'outsider', displayName: 'No', pin: '2468', crew: crew() })).toThrow('NOT_CREW_MEMBER')
    expect(() => registry.join({ sessionId: session.sessionId, playerId: 'p2', displayName: 'P2', pin: '0000', crew: crew() })).toThrow('INVALID_PIN')
    for (const id of players.slice(1)) registry.join({ sessionId: session.sessionId, playerId: id, displayName: id, pin: '2468', crew: crew() })
    expect(session.seats).toHaveLength(CREW_TABLE_CAPACITY)
    const expanded = addVipCrewMember(crew(), { playerId: 'p5', displayName: 'P5', addedAt: 2 })
    expect(() => registry.join({ sessionId: session.sessionId, playerId: 'p5', displayName: 'P5', pin: '2468', crew: expanded })).toThrow('TABLE_FULL')
  })

  test('only the online owner can deal and arrangement deadline is two minutes', () => {
    const registry = new VipPrivateCrewRegistry(); const session = open(registry)
    expect(() => registry.deal(session.sessionId, 'p2')).toThrow('ONLY_OWNER')
    registry.markConnected(session.sessionId, owner, false)
    expect(() => registry.deal(session.sessionId, owner)).toThrow('OWNER_MUST_BE_ONLINE')
    registry.markConnected(session.sessionId, owner, true)
    registry.deal(session.sessionId, owner, 1_000, () => .5)
    expect(session.currentMatch!.deadlineAt - session.currentMatch!.startedAt).toBe(CREW_ARRANGEMENT_MS)
    expect(() => registry.deal(session.sessionId, owner)).toThrow('NOT_WAITING_FOR_DEAL')
  })

  test('scores are authoritative, zero-sum and retained across seat changes', () => {
    const registry = new VipPrivateCrewRegistry(); const session = open(registry); registry.deal(session.sessionId, owner, 1_000, () => .42)
    for (const id of players) {
      const match = session.currentMatch!
      const hand = match.hands[id]
      registry.submitArrangement(session.sessionId, id, { pile1: hand.slice(0, 3), pile2: hand.slice(3, 6), pile3: hand.slice(6, 11) })
    }
    expect(session.phase).toBe('REVEALING')
    expect(Object.values(session.currentMatch!.result!.deltas).reduce((sum, value) => sum + value, 0)).toBe(0)
    registry.finishReveal(session.sessionId)
    const oldScore = session.participants.p2.score
    registry.leaveSeat(session.sessionId, 'p2')
    expect(session.participants.p2.score).toBe(oldScore)
    expect(session.phase).toBe('WAITING_FOR_DEAL')
  })

  test('END SESSION is owner-only and locks future mutations', () => {
    const registry = new VipPrivateCrewRegistry(); const session = open(registry)
    expect(() => registry.endSession(session.sessionId, 'p2')).toThrow('ONLY_OWNER')
    registry.endSession(session.sessionId, owner, 2_000)
    expect(session.phase).toBe('ENDED')
    expect(() => registry.markConnected(session.sessionId, owner, true)).toThrow('SESSION_ENDED')
  })
})
