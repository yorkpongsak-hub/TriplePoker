import {
  VIP_PLUS_ENTRY_TERMS_VERSION,
  VipPlusTableError,
  VipPlusTableRegistry,
} from '../../src/game/vipPlusTableRegistry'

const player = (number: number, tokenBalance = 100_000) => ({
  playerId: `p${number}`,
  displayName: `Player ${number}`,
  tokenBalance,
})

describe('VIP Plus Gate 3 table registry', () => {
  let registry: VipPlusTableRegistry

  beforeEach(() => { registry = new VipPlusTableRegistry() })

  test('creator becomes H1 and locks the selected wager snapshot', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER', 100)
    expect(table.seats.H1?.playerId).toBe('p1')
    expect(table.wager.optionId).toBe('INITIATE_WAGER')
    expect(table.wager.callAmount).toBe(50)
    expect(table.wager.buyIn).toBe(2_000)
    expect(table.status).toBe('WAITING')
  })

  test('assigns H2-H5 in fixed order and rejects a sixth player', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    for (let number = 2; number <= 5; number++) registry.join(table.tableId, player(number))
    expect(Object.values(table.seats).map(seat => seat?.seat)).toEqual(['H1', 'H2', 'H3', 'H4', 'H5'])
    expect(() => registry.join(table.tableId, player(6))).toThrow('TABLE_FULL')
  })

  test('checks required Buy-in at create, join, and confirm', () => {
    expect(() => registry.create(player(1, 1_999), 'INITIATE_WAGER')).toThrow('INSUFFICIENT_TOKENS')
    const table = registry.create(player(1), 'ADEPT_WAGER')
    expect(() => registry.join(table.tableId, player(2, 14_999))).toThrow('INSUFFICIENT_TOKENS')
    registry.join(table.tableId, player(2, 15_000))
    expect(() => registry.confirm(table.tableId, 'p2', 14_999, VIP_PLUS_ENTRY_TERMS_VERSION)).toThrow('INSUFFICIENT_TOKENS')
  })

  test('requires the exact entry terms version', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    expect(() => registry.confirm(table.tableId, 'p1', 2_000, 'stale-version')).toThrow('ENTRY_TERMS_REQUIRED')
    expect(registry.confirm(table.tableId, 'p1', 2_000, VIP_PLUS_ENTRY_TERMS_VERSION).seats.H1?.confirmedAt).not.toBeNull()
  })

  test('becomes READY only after exactly five occupied and confirmed seats', () => {
    const table = registry.create(player(1), 'MASTERMIND_WAGER')
    for (let number = 2; number <= 5; number++) registry.join(table.tableId, player(number))
    for (let number = 1; number <= 4; number++) {
      expect(registry.confirm(table.tableId, `p${number}`, 30_000, VIP_PLUS_ENTRY_TERMS_VERSION).status).toBe('WAITING')
    }
    expect(registry.confirm(table.tableId, 'p5', 30_000, VIP_PLUS_ENTRY_TERMS_VERSION).status).toBe('READY')
  })

  test('allows only H1 to approve an early start with 3-4 confirmed players', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    registry.join(table.tableId, player(2))
    registry.join(table.tableId, player(3))
    for (let number = 1; number <= 3; number++) {
      registry.confirm(table.tableId, `p${number}`, 2_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    }

    expect(registry.toPublic(table).canHostStart).toBe(true)
    expect(() => registry.approveReducedStart(table.tableId, 'p2')).toThrow('ONLY_HOST_CAN_START')
    expect(registry.approveReducedStart(table.tableId, 'p1', 500).reducedStartApprovedAt).toBe(500)
    expect(registry.toPublic(table).reducedStartApproved).toBe(true)
  })

  test('rejects early start below 3 players or while a seated player is unconfirmed', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    registry.join(table.tableId, player(2))
    registry.confirm(table.tableId, 'p1', 2_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    registry.confirm(table.tableId, 'p2', 2_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    expect(() => registry.approveReducedStart(table.tableId, 'p1')).toThrow('MINIMUM_PLAYERS_REQUIRED')

    registry.join(table.tableId, player(3))
    expect(() => registry.approveReducedStart(table.tableId, 'p1')).toThrow('ALL_PLAYERS_MUST_CONFIRM')
  })

  test('locks membership after approval and revokes approval if eligibility changes', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    registry.join(table.tableId, player(2))
    registry.join(table.tableId, player(3))
    for (let number = 1; number <= 3; number++) registry.confirm(table.tableId, `p${number}`, 2_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    registry.approveReducedStart(table.tableId, 'p1')
    expect(() => registry.join(table.tableId, player(4))).toThrow('TABLE_ALREADY_READY')
    registry.revalidateReadyCandidates(table.tableId, new Set(['p1', 'p2']))
    expect(table.reducedStartApprovedAt).toBeNull()
    expect(registry.toPublic(table).canHostStart).toBe(false)
  })

  test('final recheck fails closed and revokes invalid confirmation', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    for (let number = 2; number <= 5; number++) registry.join(table.tableId, player(number))
    for (let number = 1; number <= 5; number++) registry.confirm(table.tableId, `p${number}`, 2_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    registry.revalidateReadyCandidates(table.tableId, new Set(['p1', 'p2', 'p3', 'p4']))
    expect(table.status).toBe('WAITING')
    expect(table.seats.H5?.confirmedAt).toBeNull()
  })

  test('does not expose player IDs or accepted terms in public state', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    const payload = registry.toPublic(table)
    expect(JSON.stringify(payload)).not.toContain('p1')
    // มติลุงเยาะ — เพิ่ม avatarUrl (Avatar หน้าชื่อผู้เล่น) เข้า public seat payload แล้ว
    expect(payload.seats).toEqual([{ seat: 'H1', displayName: 'Player 1', avatarUrl: null, isVip: false, confirmed: false, connected: true }])
  })

  // Batch 1 (VIP-05 fix, C4) — เปลี่ยนพฤติกรรมเดิม: host leave ตอนยังมีคนเหลือ ต้องโอน host ไม่ใช่ลบโต๊ะ
  test('host leave transfers host to the next player instead of closing the table', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    registry.join(table.tableId, player(2))
    const result = registry.leave(table.tableId, 'p1')
    expect(result).not.toBeNull()
    expect(registry.get(table.tableId)).not.toBeNull()
    expect(registry.toPublic(table).hostSeat).toBe('H2')
    expect(() => registry.create(player(1), 'INITIATE_WAGER')).not.toThrow()
  })

  test('host leave closes the table only when no other player remains', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    expect(registry.leave(table.tableId, 'p1')).toBeNull()
    expect(registry.get(table.tableId)).toBeNull()
    expect(() => registry.create(player(1), 'INITIATE_WAGER')).not.toThrow()
  })

  test('non-host leave preserves fixed seat identity for the next joiner', () => {
    const table = registry.create(player(1), 'INITIATE_WAGER')
    registry.join(table.tableId, player(2))
    registry.join(table.tableId, player(3))
    registry.leave(table.tableId, 'p2')
    registry.join(table.tableId, player(4))
    expect(table.seats.H2?.playerId).toBe('p4')
    expect(table.seats.H3?.playerId).toBe('p3')
  })

  test('prevents one player from occupying multiple waiting tables', () => {
    registry.create(player(1), 'INITIATE_WAGER')
    expect(() => registry.create(player(1), 'ADEPT_WAGER')).toThrowError(VipPlusTableError)
  })
})
