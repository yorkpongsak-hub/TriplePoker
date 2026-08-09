import {
  resolveVipPlusWagerSnapshot,
  VipPlusCenterRuleset,
  VipPlusSeat,
  VipPlusWagerOptionId,
  VipPlusWagerSnapshot,
  VIP_PLUS_DEFAULT_CENTER_RULESET,
  VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED,
  VIP_PLUS_SEATS,
} from './vipPlusFoundation'

export const VIP_PLUS_ENTRY_TERMS_VERSION = '2026-08-03.v2' as const

export type VipPlusWaitingStatus = 'WAITING' | 'READY'

export interface VipPlusWaitingSeat {
  seat: VipPlusSeat
  playerId: string
  displayName: string
  // มติลุงเยาะ — Avatar หน้าชื่อผู้เล่น (preset key/emoji/URL — resolve ฝั่ง client ตาม pattern เดียวกับ
  // Monarch's MonarchPlayerAvatar) null = ยังไม่ได้ตั้งค่า/อ่านไม่ได้ ให้ client fallback เป็น emoji default
  avatarUrl: string | null
  joinedAt: number
  confirmedAt: number | null
  acceptedTermsVersion: typeof VIP_PLUS_ENTRY_TERMS_VERSION | null
  // Batch 1 (VIP-05 fix) — C2/C3: track เฉพาะช่วง Waiting Chamber เท่านั้น (ก่อนแมตช์เริ่ม)
  connected: boolean
  disconnectedAt: number | null
}

export interface VipPlusWaitingTable {
  tableId: string
  status: VipPlusWaitingStatus
  createdAt: number
  hostPlayerId: string
  wager: VipPlusWagerSnapshot
  seats: Partial<Record<VipPlusSeat, VipPlusWaitingSeat>>
  reducedStartApprovedAt: number | null
  // ทดลองมติลุงเยาะ — host เลือกตอนเปิดโต๊ะ ใช้เหมือนกันทั้ง 3 เกมของแมตช์นี้ (ยกเว้นเกม 3 ตรึง NO_G3_CENTER
  // เสมอ ดู vipPlusFoundation.ts's getVipPlusCenterLayout) เก็บไว้ที่ table เพื่อ snapshot ไปที่ match state
  // ตอนเริ่มแมตช์ (ห้ามเปลี่ยนกลางคันหลัง confirm ไปแล้ว เหมือน wager)
  centerRuleset: VipPlusCenterRuleset
  foulRuleEnabled: boolean
}

export interface VipPlusPublicWaitingTable {
  tableId: string
  status: VipPlusWaitingStatus
  createdAt: number
  // Batch 1 (VIP-05 fix, C4/C5): host โอนได้แล้ว ไม่ใช่ H1 เสมอไปอีกต่อไป — ต้องคำนวณจาก hostPlayerId จริง
  hostSeat: VipPlusSeat
  wager: VipPlusWagerSnapshot
  seats: Array<{ seat: VipPlusSeat; displayName: string; avatarUrl: string | null; confirmed: boolean; connected: boolean }>
  requiredPlayers: 5
  minimumPlayers: 3
  canHostStart: boolean
  reducedStartApproved: boolean
  entryTermsVersion: typeof VIP_PLUS_ENTRY_TERMS_VERSION
  // ทดลองมติลุงเยาะ — โชว์ให้ผู้เล่นที่กำลังจะ join เห็นด้วยว่าโต๊ะนี้ใช้กติกาอะไร ไม่ใช่แค่ host เห็น
  centerRuleset: VipPlusCenterRuleset
  foulRuleEnabled: boolean
}

// ผลลัพธ์ต่อที่นั่งที่ sweeper ปล่อยไปเพราะ grace หมด (Batch 1, C2/C7)
export interface VipPlusSweepResult {
  table: VipPlusWaitingTable | null
  closedTableId: string | null
  releasedPlayerId: string
  hostChanged: boolean
  newHostPlayerId: string | null
}

export type VipPlusTableErrorCode =
  | 'TABLE_NOT_FOUND'
  | 'TABLE_FULL'
  | 'TABLE_ALREADY_READY'
  | 'PLAYER_ALREADY_SEATED'
  | 'HOST_CANNOT_LEAVE'
  | 'PLAYER_NOT_SEATED'
  | 'INSUFFICIENT_TOKENS'
  | 'ENTRY_TERMS_REQUIRED'
  | 'ONLY_HOST_CAN_START'
  | 'MINIMUM_PLAYERS_REQUIRED'
  | 'ALL_PLAYERS_MUST_CONFIRM'

export class VipPlusTableError extends Error {
  constructor(public readonly code: VipPlusTableErrorCode) {
    super(code)
  }
}

export class VipPlusTableRegistry {
  private readonly tables = new Map<string, VipPlusWaitingTable>()
  private readonly playerTable = new Map<string, string>()
  private sequence = 0

  create(
    player: { playerId: string; displayName: string; tokenBalance: number; avatarUrl?: string | null },
    optionId: VipPlusWagerOptionId,
    now = Date.now(),
    // ทดลองมติลุงเยาะ — object แยกต่างหาก (ไม่ใช่ positional param เพิ่ม) กัน call site เดิม (เทส/ที่อื่น) พัง
    // ไม่ระบุ = ใช้ default เดิมทั้งคู่ (WITH_G3_CENTER + foul เปิด) พฤติกรรมเหมือนก่อนมี option นี้ทุกจุด
    options: { centerRuleset?: VipPlusCenterRuleset; foulRuleEnabled?: boolean } = {},
  ): VipPlusWaitingTable {
    if (this.playerTable.has(player.playerId)) throw new VipPlusTableError('PLAYER_ALREADY_SEATED')
    const wager = resolveVipPlusWagerSnapshot(optionId)
    if (player.tokenBalance < wager.buyIn) throw new VipPlusTableError('INSUFFICIENT_TOKENS')

    const tableId = `vipplus_${now}_${++this.sequence}`
    const table: VipPlusWaitingTable = {
      tableId,
      status: 'WAITING',
      createdAt: now,
      centerRuleset: options.centerRuleset ?? VIP_PLUS_DEFAULT_CENTER_RULESET,
      foulRuleEnabled: options.foulRuleEnabled ?? VIP_PLUS_DEFAULT_FOUL_RULE_ENABLED,
      hostPlayerId: player.playerId,
      wager,
      seats: {
        H1: this.makeSeat('H1', player, now),
      },
      reducedStartApprovedAt: null,
    }
    this.tables.set(tableId, table)
    this.playerTable.set(player.playerId, tableId)
    return table
  }

  join(
    tableId: string,
    player: { playerId: string; displayName: string; tokenBalance: number; avatarUrl?: string | null },
    now = Date.now(),
  ): VipPlusWaitingTable {
    const table = this.requireTable(tableId)
    if (table.status === 'READY') throw new VipPlusTableError('TABLE_ALREADY_READY')
    if (this.playerTable.has(player.playerId)) throw new VipPlusTableError('PLAYER_ALREADY_SEATED')
    if (player.tokenBalance < table.wager.buyIn) throw new VipPlusTableError('INSUFFICIENT_TOKENS')

    const seat = VIP_PLUS_SEATS.find(candidate => !table.seats[candidate])
    if (!seat) throw new VipPlusTableError('TABLE_FULL')
    table.seats[seat] = this.makeSeat(seat, player, now)
    table.reducedStartApprovedAt = null
    this.playerTable.set(player.playerId, tableId)
    return table
  }

  approveReducedStart(tableId: string, playerId: string, now = Date.now()): VipPlusWaitingTable {
    const table = this.requireTable(tableId)
    if (table.status === 'READY') throw new VipPlusTableError('TABLE_ALREADY_READY')
    if (table.hostPlayerId !== playerId) throw new VipPlusTableError('ONLY_HOST_CAN_START')
    const seats = Object.values(table.seats).filter((seat): seat is VipPlusWaitingSeat => !!seat)
    if (seats.length < 3) throw new VipPlusTableError('MINIMUM_PLAYERS_REQUIRED')
    if (!seats.every(seat => seat.confirmedAt !== null)) throw new VipPlusTableError('ALL_PLAYERS_MUST_CONFIRM')
    table.reducedStartApprovedAt = now
    table.status = 'READY'
    return table
  }

  confirm(
    tableId: string,
    playerId: string,
    tokenBalance: number,
    acceptedTermsVersion: string,
    now = Date.now(),
  ): VipPlusWaitingTable {
    const table = this.requireTable(tableId)
    if (table.status === 'READY') throw new VipPlusTableError('TABLE_ALREADY_READY')
    const seat = Object.values(table.seats).find(candidate => candidate?.playerId === playerId)
    if (!seat) throw new VipPlusTableError('PLAYER_NOT_SEATED')
    // C6 — idempotent: ยืนยันไปแล้วกดซ้ำต้องไม่ throw และไม่ overwrite confirmedAt เดิม
    if (seat.confirmedAt !== null) return table
    if (acceptedTermsVersion !== VIP_PLUS_ENTRY_TERMS_VERSION) throw new VipPlusTableError('ENTRY_TERMS_REQUIRED')
    if (tokenBalance < table.wager.buyIn) throw new VipPlusTableError('INSUFFICIENT_TOKENS')

    seat.confirmedAt = now
    seat.acceptedTermsVersion = VIP_PLUS_ENTRY_TERMS_VERSION
    this.refreshReadyStatus(table)
    return table
  }

  // Final server recheck เรียกเมื่อครบ 5 confirmations; คนที่ไม่ผ่านถูกถอน confirmation แบบ fail-closed
  revalidateReadyCandidates(tableId: string, eligiblePlayerIds: ReadonlySet<string>): VipPlusWaitingTable {
    const table = this.requireTable(tableId)
    let changed = false
    for (const seat of Object.values(table.seats)) {
      if (seat && !eligiblePlayerIds.has(seat.playerId)) {
        seat.confirmedAt = null
        seat.acceptedTermsVersion = null
        changed = true
      }
    }
    if (changed) table.reducedStartApprovedAt = null
    this.refreshReadyStatus(table)
    return table
  }

  leave(tableId: string, playerId: string): VipPlusWaitingTable | null {
    const table = this.requireTable(tableId)
    if (table.status === 'READY') throw new VipPlusTableError('TABLE_ALREADY_READY')
    const entry = Object.entries(table.seats).find(([, seat]) => seat?.playerId === playerId)
    if (!entry) throw new VipPlusTableError('PLAYER_NOT_SEATED')
    const wasHost = playerId === table.hostPlayerId
    delete table.seats[entry[0] as VipPlusSeat]
    this.playerTable.delete(playerId)
    const remaining = Object.values(table.seats).filter((seat): seat is VipPlusWaitingSeat => !!seat)
    // C4 — host ออกเองแต่ยังมีคนเหลือ: โอน host ให้คนถัดไปแทนลบทั้งโต๊ะ ยกเว้นไม่เหลือใครเลย
    if (remaining.length === 0) {
      this.tables.delete(tableId)
      return null
    }
    if (wasHost) {
      const nextHost = this.pickNextHost(table, playerId)
      if (nextHost) table.hostPlayerId = nextHost
    }
    table.status = 'WAITING'
    table.reducedStartApprovedAt = null
    return table
  }

  // C2/C3 — ผู้เล่นหลุดระหว่าง Waiting Chamber: ที่นั่งค้างไว้ก่อน (sweeper ปล่อยถ้าเกิน grace)
  // ถ้าเป็น host โอน host role ทันทีไม่รอ grace — ที่นั่งของ host เดิมยังอยู่ตามปกติ
  // C7 — ห้ามแตะถ้าแมตช์เริ่มไปแล้ว (status ไม่ใช่ WAITING แปลว่าเริ่มแล้วเสมอ ดู vipPlusSocket.ts's
  // confirm_entry/approve_reduced_start — READY จะตามด้วย startVipPlusMatch ในเรียกเดียวกันเสมอ)
  markDisconnected(playerId: string, now = Date.now()): { table: VipPlusWaitingTable; hostChanged: boolean; newHostPlayerId: string | null } | null {
    const tableId = this.playerTable.get(playerId)
    if (!tableId) return null
    const table = this.tables.get(tableId)
    if (!table || table.status !== 'WAITING') return null
    const seat = Object.values(table.seats).find(candidate => candidate?.playerId === playerId)
    if (!seat) return null
    seat.connected = false
    seat.disconnectedAt = now
    let hostChanged = false
    let newHostPlayerId: string | null = null
    if (table.hostPlayerId === playerId) {
      const nextHost = this.pickNextHost(table, playerId)
      if (nextHost) {
        table.hostPlayerId = nextHost
        hostChanged = true
        newHostPlayerId = nextHost
      }
    }
    return { table, hostChanged, newHostPlayerId }
  }

  // C2 — กลับมาทันภายใน grace ได้ที่นั่งเดิมคืน (ไม่คืน host role ตาม C3)
  markReconnected(playerId: string): VipPlusWaitingTable | null {
    const tableId = this.playerTable.get(playerId)
    if (!tableId) return null
    const table = this.tables.get(tableId)
    if (!table) return null
    const seat = Object.values(table.seats).find(candidate => candidate?.playerId === playerId)
    if (!seat) return null
    seat.connected = true
    seat.disconnectedAt = null
    return table
  }

  // C7 — sweep เฉพาะโต๊ะที่ status === 'WAITING' เท่านั้น (READY แปลว่าแมตช์เริ่มไปแล้วเสมอ)
  sweepExpiredSeats(graceMs: number, now = Date.now()): VipPlusSweepResult[] {
    const results: VipPlusSweepResult[] = []
    for (const table of [...this.tables.values()]) {
      if (table.status !== 'WAITING') continue
      const expiredEntries = Object.entries(table.seats).filter(
        ([, seat]) => seat && !seat.connected && seat.disconnectedAt !== null && now - seat.disconnectedAt > graceMs,
      ) as Array<[VipPlusSeat, VipPlusWaitingSeat]>
      for (const [seatId, seat] of expiredEntries) {
        if (!this.tables.has(table.tableId)) break // โต๊ะถูกลบไปแล้วจากรอบก่อนหน้าในลูปนี้
        delete table.seats[seatId]
        this.playerTable.delete(seat.playerId)
        const remaining = Object.values(table.seats).filter((candidate): candidate is VipPlusWaitingSeat => !!candidate)
        if (remaining.length === 0) {
          this.tables.delete(table.tableId)
          results.push({ table: null, closedTableId: table.tableId, releasedPlayerId: seat.playerId, hostChanged: false, newHostPlayerId: null })
          break
        }
        let hostChanged = false
        let newHostPlayerId: string | null = null
        if (table.hostPlayerId === seat.playerId) {
          const nextHost = this.pickNextHost(table, seat.playerId)
          if (nextHost) { table.hostPlayerId = nextHost; hostChanged = true; newHostPlayerId = nextHost }
        }
        table.status = 'WAITING'
        table.reducedStartApprovedAt = null
        results.push({ table, closedTableId: null, releasedPlayerId: seat.playerId, hostChanged, newHostPlayerId })
      }
    }
    return results
  }

  // เก็บ interval handle ไว้ให้ stopSweeper() เคลียร์ได้ (กัน leak ตอน hot-reload) — idempotent
  // เรียกซ้ำได้ปลอดภัยเพราะ registerVipPlusSocket() รันทุกครั้งที่มี connection ใหม่
  private sweepTimer: ReturnType<typeof setInterval> | null = null

  startSweeper(graceMs: number, intervalMs: number, onExpire: (results: VipPlusSweepResult[]) => void): void {
    if (this.sweepTimer) return
    this.sweepTimer = setInterval(() => {
      const results = this.sweepExpiredSeats(graceMs)
      if (results.length > 0) onExpire(results)
    }, intervalMs)
  }

  stopSweeper(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }

  get(tableId: string): VipPlusWaitingTable | null {
    return this.tables.get(tableId) ?? null
  }

  listOpen(): VipPlusWaitingTable[] {
    return [...this.tables.values()].filter(table => table.status === 'WAITING' && Object.keys(table.seats).length < 5)
  }

  toPublic(table: VipPlusWaitingTable): VipPlusPublicWaitingTable {
    const hostEntry = Object.entries(table.seats).find(([, seat]) => seat?.playerId === table.hostPlayerId)
    const hostSeat = (hostEntry?.[0] as VipPlusSeat | undefined) ?? 'H1'
    return {
      tableId: table.tableId,
      status: table.status,
      createdAt: table.createdAt,
      hostSeat,
      wager: table.wager,
      seats: VIP_PLUS_SEATS.flatMap(seat => {
        const occupant = table.seats[seat]
        return occupant
          ? [{ seat, displayName: occupant.displayName, avatarUrl: occupant.avatarUrl, confirmed: occupant.confirmedAt !== null, connected: occupant.connected }]
          : []
      }),
      requiredPlayers: 5,
      minimumPlayers: 3,
      canHostStart: this.canHostStart(table),
      reducedStartApproved: table.reducedStartApprovedAt !== null,
      entryTermsVersion: VIP_PLUS_ENTRY_TERMS_VERSION,
      centerRuleset: table.centerRuleset,
      foulRuleEnabled: table.foulRuleEnabled,
    }
  }

  clear(): void {
    this.tables.clear()
    this.playerTable.clear()
    this.sequence = 0
    this.stopSweeper()
  }

  // Feedback ลุงเยาะ — บั๊ก "Player already seated" หลังจบแมตช์กลับ Lobby แล้วเปิดโต๊ะใหม่ไม่ได้: table เดิม
  // (status READY ตั้งแต่แมตช์เริ่ม) กับ playerTable ของผู้เล่นทั้ง 5 คนไม่เคยถูกลบออกจาก registry นี้เลย
  // แม้แมตช์จะจบจริงแล้ว (finalizeVipPlusMatch ใน vipPlusMatchEngine.ts ไม่เคยแตะ registry นี้มาก่อน) —
  // เรียกตอนแมตช์จบจริงเท่านั้น (ไม่ใช่ตอน startVipPlusMatch สำเร็จ เพราะผู้เล่นยัง "ล็อค" อยู่กับแมตช์ที่
  // กำลังเล่นอยู่ ต้อง Forfeit เองก่อนถึงจะเปิดโต๊ะใหม่ได้ตามกติกาเดิม)
  releaseTable(tableId: string): void {
    const table = this.tables.get(tableId)
    if (!table) return
    for (const seat of Object.values(table.seats)) {
      if (seat) this.playerTable.delete(seat.playerId)
    }
    this.tables.delete(tableId)
  }

  private requireTable(tableId: string): VipPlusWaitingTable {
    const table = this.tables.get(tableId)
    if (!table) throw new VipPlusTableError('TABLE_NOT_FOUND')
    return table
  }

  private makeSeat(
    seat: VipPlusSeat,
    player: { playerId: string; displayName: string; avatarUrl?: string | null },
    joinedAt: number,
  ): VipPlusWaitingSeat {
    return {
      seat,
      playerId: player.playerId,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl ?? null,
      joinedAt,
      confirmedAt: null,
      acceptedTermsVersion: null,
      connected: true,
      disconnectedAt: null,
    }
  }

  // C5 — เลือก host คนถัดไป: connected เก่าสุดก่อนเสมอ ถ้าไม่มีใคร connected เลยค่อยเลือก disconnected เก่าสุด
  private pickNextHost(table: VipPlusWaitingTable, excludePlayerId: string): string | null {
    const candidates = Object.values(table.seats).filter(
      (seat): seat is VipPlusWaitingSeat => !!seat && seat.playerId !== excludePlayerId,
    )
    if (candidates.length === 0) return null
    const connectedCandidates = candidates.filter(seat => seat.connected)
    const pool = connectedCandidates.length > 0 ? connectedCandidates : candidates
    return pool.reduce((oldest, seat) => (seat.joinedAt < oldest.joinedAt ? seat : oldest)).playerId
  }

  private refreshReadyStatus(table: VipPlusWaitingTable): void {
    const seats = Object.values(table.seats)
    table.status = seats.length === 5 && seats.every(seat => seat?.confirmedAt !== null) ? 'READY' : 'WAITING'
  }

  private canHostStart(table: VipPlusWaitingTable): boolean {
    const seats = Object.values(table.seats).filter((seat): seat is VipPlusWaitingSeat => !!seat)
    return table.status === 'WAITING'
      && seats.length >= 3
      && seats.length < 5
      && seats.every(seat => seat.confirmedAt !== null)
  }
}

export const vipPlusTableRegistry = new VipPlusTableRegistry()
