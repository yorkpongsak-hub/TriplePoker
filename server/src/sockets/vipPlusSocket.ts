import { Server, Socket } from 'socket.io'
import { supabase, supabaseAdmin } from '../config/supabase'
import { gameConfig } from '../config/gameConfig'
import { getVipPlusAccess } from '../game/vipPlusAccess'
import { VipPlusCenterRuleset, VipPlusWagerOptionId, VIP_PLUS_CENTER_RULESETS } from '../game/vipPlusFoundation'
import {
  VIP_PLUS_ENTRY_TERMS_VERSION,
  VipPlusTableError,
  vipPlusTableRegistry,
} from '../game/vipPlusTableRegistry'
import { attachVipPlusBettingIo, buildVipPlusSnapshot, forfeitVipPlusMatch, getVipPlusMatchState, markVipPlusConnected, markVipPlusDisconnected, startVipPlusMatch, submitVipPlusArrangement, submitVipPlusAuctionBid, submitVipPlusBettingAction, submitVipPlusRearrangement } from '../game/vipPlusMatchEngine'

// มติลุงเยาะ — เพิ่ม avatarUrl ให้ Avatar หน้าชื่อผู้เล่นทุกที่นั่ง (Waiting Chamber + ในเกม) ตาม pattern
// เดียวกับ Monarch (monarch/index.tsx's MonarchPlayerAvatar) — avatar_url เก็บ preset key/emoji/URL จริง
// (ชื่อ column ทำให้เข้าใจผิดว่าเป็น URL เสมอ แต่จริงๆ resolve หลายแบบฝั่ง client)
type AuthenticatedProfile = { playerId: string; displayName: string; tokenBalance: number; avatarUrl: string | null; isVip: boolean }
const vipPlusSocketPlayers = new Map<string, { playerId: string; tableId: string }>()

async function authenticateProfile(userId: string, accessToken?: string | null): Promise<AuthenticatedProfile | null> {
  const { data: authenticated, error: authError } = await supabase.auth.getUser(accessToken ?? '')
  if (authError || authenticated.user?.id !== userId) return null
  if (!(await getVipPlusAccess(userId)).allowed) return null

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('display_name, token_balance, avatar_url, vip_status')
    .eq('user_id', userId)
    .single()
  if (profileError || !profile) return null
  return {
    playerId: userId,
    displayName: profile.display_name ?? 'Player',
    tokenBalance: profile.token_balance ?? 0,
    avatarUrl: profile.avatar_url ?? null,
    isVip: (profile.vip_status ?? 'none') !== 'none',
  }
}

function emitError(socket: Socket, error: unknown): void {
  const code = error instanceof VipPlusTableError ? error.code : 'SERVER_ERROR'
  socket.emit('vip_plus:error', { code, message: code === 'SERVER_ERROR' ? 'Something went wrong. Please try again.' : code })
}

async function finalEntryRecheck(tableId: string): Promise<void> {
  const table = vipPlusTableRegistry.get(tableId)
  if (!table) return
  const eligible = new Set<string>()
  await Promise.all(Object.values(table.seats).map(async seat => {
    if (!seat) return
    const access = await getVipPlusAccess(seat.playerId)
    const { data, error } = await supabaseAdmin.from('users').select('token_balance').eq('user_id', seat.playerId).single()
    if (access.allowed && !error && (data?.token_balance ?? 0) >= table.wager.buyIn) eligible.add(seat.playerId)
  }))
  vipPlusTableRegistry.revalidateReadyCandidates(tableId, eligible)
}

export function registerVipPlusSocket(io: Server, socket: Socket): void {
  attachVipPlusBettingIo(io)
  // Batch 1 (VIP-05 fix) — sweeper ปล่อยที่นั่ง Waiting Chamber ที่หลุดเกิน grace (C2/C7)
  // startSweeper() เป็น idempotent เรียกซ้ำได้ทุก connection โดยไม่สร้าง interval ซ้ำ
  vipPlusTableRegistry.startSweeper(
    gameConfig.vipPlus5.waitingSeatGraceMs,
    gameConfig.vipPlus5.seatSweepIntervalMs,
    results => {
      for (const result of results) {
        if (result.closedTableId) io.to(result.closedTableId).emit('vip_plus:table_closed', { tableId: result.closedTableId })
        else if (result.table) io.to(result.table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(result.table))
      }
    },
  )
  socket.on('vip_plus:list_tables', async (data: { userId: string; accessToken?: string | null }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    socket.emit('vip_plus:tables', profile ? vipPlusTableRegistry.listOpen().map(table => vipPlusTableRegistry.toPublic(table)) : [])
  })

  socket.on('vip_plus:create_table', async (data: {
    userId: string; accessToken?: string | null; optionId: VipPlusWagerOptionId
    centerRuleset?: string; foulRuleEnabled?: boolean
  }) => {
    try {
      const profile = await authenticateProfile(data.userId, data.accessToken)
      if (!profile) throw new VipPlusTableError('TABLE_NOT_FOUND')
      // ทดลองมติลุงเยาะ — server-authoritative เช็คซ้ำ ไม่เชื่อ string ที่ client ส่งมาตรงๆ (กัน value แปลกปลอม)
      const centerRuleset = VIP_PLUS_CENTER_RULESETS.includes(data.centerRuleset as VipPlusCenterRuleset)
        ? (data.centerRuleset as VipPlusCenterRuleset)
        : undefined
      const foulRuleEnabled = typeof data.foulRuleEnabled === 'boolean' ? data.foulRuleEnabled : undefined
      const table = vipPlusTableRegistry.create(profile, data.optionId, undefined, { centerRuleset, foulRuleEnabled })
      socket.join(table.tableId)
      socket.join(profile.playerId)
      vipPlusSocketPlayers.set(socket.id, { playerId: profile.playerId, tableId: table.tableId })
      socket.emit('vip_plus:seat_assigned', { tableId: table.tableId, seat: 'H1' })
      io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
    } catch (error) { emitError(socket, error) }
  })

  socket.on('vip_plus:join_table', async (data: { userId: string; accessToken?: string | null; tableId: string }) => {
    try {
      const profile = await authenticateProfile(data.userId, data.accessToken)
      if (!profile) throw new VipPlusTableError('TABLE_NOT_FOUND')
      const table = vipPlusTableRegistry.join(data.tableId, profile)
      socket.join(table.tableId)
      socket.join(profile.playerId)
      vipPlusSocketPlayers.set(socket.id, { playerId: profile.playerId, tableId: table.tableId })
      const assignedSeat = Object.entries(table.seats).find(([, seat]) => seat?.playerId === profile.playerId)?.[0]
      socket.emit('vip_plus:seat_assigned', { tableId: table.tableId, seat: assignedSeat })
      io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
    } catch (error) { emitError(socket, error) }
  })

  socket.on('vip_plus:confirm_entry', async (data: { userId: string; accessToken?: string | null; tableId: string; acceptedTermsVersion: string }) => {
    try {
      const profile = await authenticateProfile(data.userId, data.accessToken)
      if (!profile) throw new VipPlusTableError('TABLE_NOT_FOUND')
      let table = vipPlusTableRegistry.confirm(data.tableId, profile.playerId, profile.tokenBalance, data.acceptedTermsVersion)
      if (table.status === 'READY') {
        await finalEntryRecheck(table.tableId)
        table = vipPlusTableRegistry.get(table.tableId)!
      }
      io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
      if (table.status === 'READY') {
        const started = await startVipPlusMatch(io, table)
        if (!started.ok) {
          // Batch 1 — confirm() ตอนนี้ idempotent (C6) อาจมีการเรียกซ้ำหลังแมตช์เริ่มไปแล้วจริง
          // (เช่น double-tap ก่อน client disable ปุ่มทัน) ต้องไม่ tear down โต๊ะที่กำลังเล่นอยู่จริง
          if (started.reason !== 'MATCH_ALREADY_STARTED') {
            table = vipPlusTableRegistry.revalidateReadyCandidates(table.tableId, new Set())
            io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
            io.to(table.tableId).emit('vip_plus:error', { code: started.reason, message: 'The match could not start. Please confirm entry again.' })
          }
          return
        }
        io.to(table.tableId).emit('vip_plus:table_ready', { tableId: table.tableId })
      }
    } catch (error) { emitError(socket, error) }
  })

  socket.on('vip_plus:approve_reduced_start', async (data: { userId: string; accessToken?: string | null; tableId: string }) => {
    try {
      const profile = await authenticateProfile(data.userId, data.accessToken)
      if (!profile) throw new VipPlusTableError('TABLE_NOT_FOUND')
      await finalEntryRecheck(data.tableId)
      const table = vipPlusTableRegistry.approveReducedStart(data.tableId, profile.playerId)
      io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
      io.to(table.tableId).emit('vip_plus:reduced_start_approved', {
        tableId: table.tableId,
        humanPlayers: Object.keys(table.seats).length,
        blankSeats: 5 - Object.keys(table.seats).length,
      })
      const started = await startVipPlusMatch(io, table)
      if (!started.ok) {
        if (started.reason !== 'MATCH_ALREADY_STARTED') {
          const reset = vipPlusTableRegistry.revalidateReadyCandidates(table.tableId, new Set())
          io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(reset))
          io.to(table.tableId).emit('vip_plus:error', { code: started.reason, message: 'The reduced table could not start. Please confirm entry again.' })
        }
        return
      }
      io.to(table.tableId).emit('vip_plus:table_ready', { tableId: table.tableId })
    } catch (error) { emitError(socket, error) }
  })

  socket.on('vip_plus:submit_arrangement', async (data: {
    userId: string
    accessToken?: string | null
    tableId: string
    arrangement: { g1: string[]; g2: string[]; g3: string[] }
  }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    if (!profile) {
      socket.emit('vip_plus:arrangement_result', { ok: false, reason: 'PLAYER_NOT_SEATED' })
      return
    }
    const result = submitVipPlusArrangement(data.tableId, profile.playerId, data.arrangement)
    socket.emit('vip_plus:arrangement_result', result)
    if (result.ok) {
      const state = getVipPlusMatchState(data.tableId)
      const seat = state ? Object.entries(state.playerBySeat).find(([, playerId]) => playerId === profile.playerId)?.[0] : undefined
      io.to(data.tableId).emit('vip_plus:arrangement_locked', { seat })
    }
  })

  socket.on('vip_plus:betting_action', async (data: {
    userId: string
    accessToken?: string | null
    tableId: string
    action: 'CALL' | 'FOLD'
    revealedCardKeys?: string[]
  }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    const result = profile
      ? submitVipPlusBettingAction(data.tableId, profile.playerId, data.action, data.revealedCardKeys)
      : { ok: false, reason: 'PLAYER_NOT_SEATED' }
    socket.emit('vip_plus:betting_action_result', result)
  })

  socket.on('vip_plus:auction_bid', async (data: { userId: string; accessToken?: string | null; tableId: string; amount: number }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    const result = profile ? submitVipPlusAuctionBid(data.tableId, profile.playerId, data.amount) : { ok: false, reason: 'PLAYER_NOT_SEATED' }
    socket.emit('vip_plus:auction_bid_result', result)
  })

  socket.on('vip_plus:submit_rearrangement', async (data: {
    userId: string
    accessToken?: string | null
    tableId: string
    arrangement: { g1: string[]; g2: string[]; g3: string[] }
  }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    const result = profile ? submitVipPlusRearrangement(data.tableId, profile.playerId, data.arrangement) : { ok: false, reason: 'PLAYER_NOT_SEATED' }
    socket.emit('vip_plus:rearrangement_result', result)
  })

  socket.on('vip_plus:resume_match', async (data: { userId: string; accessToken?: string | null; tableId: string }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    if (!profile) {
      socket.emit('vip_plus:resume_result', { ok: false, reason: 'MATCH_NOT_FOUND' })
      return
    }
    const snapshot = buildVipPlusSnapshot(data.tableId, profile.playerId)
    if (snapshot) {
      socket.join(data.tableId)
      socket.join(profile.playerId)
      vipPlusSocketPlayers.set(socket.id, { playerId: profile.playerId, tableId: data.tableId })
      markVipPlusConnected(data.tableId, profile.playerId)
      socket.emit('vip_plus:match_snapshot', snapshot)
      return
    }
    // C2 — ยังไม่เริ่มแมตช์: ลองกู้ที่นั่งใน Waiting Chamber แทน (กลับมาทันภายใน grace ได้ที่นั่งเดิมคืน)
    const table = vipPlusTableRegistry.markReconnected(profile.playerId)
    if (table && table.tableId === data.tableId) {
      socket.join(table.tableId)
      socket.join(profile.playerId)
      vipPlusSocketPlayers.set(socket.id, { playerId: profile.playerId, tableId: table.tableId })
      const seat = Object.entries(table.seats).find(([, occupant]) => occupant?.playerId === profile.playerId)?.[0]
      socket.emit('vip_plus:seat_assigned', { tableId: table.tableId, seat })
      io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
      return
    }
    socket.emit('vip_plus:resume_result', { ok: false, reason: 'MATCH_NOT_FOUND' })
  })

  socket.on('vip_plus:forfeit', async (data: { userId: string; accessToken?: string | null; tableId: string }) => {
    const profile = await authenticateProfile(data.userId, data.accessToken)
    const ok = !!profile && forfeitVipPlusMatch(data.tableId, profile.playerId)
    if (ok) {
      vipPlusSocketPlayers.delete(socket.id)
      socket.leave(data.tableId)
    }
    socket.emit('vip_plus:forfeit_result', { ok, reason: ok ? undefined : 'MATCH_NOT_FOUND' })
  })

  socket.on('vip_plus:leave_table', async (data: { userId: string; accessToken?: string | null; tableId: string }) => {
    try {
      const profile = await authenticateProfile(data.userId, data.accessToken)
      if (!profile) throw new VipPlusTableError('TABLE_NOT_FOUND')
      const table = vipPlusTableRegistry.leave(data.tableId, data.userId)
      socket.leave(data.tableId)
      vipPlusSocketPlayers.delete(socket.id)
      if (table) io.to(table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(table))
      else io.to(data.tableId).emit('vip_plus:table_closed', { tableId: data.tableId })
    } catch (error) { emitError(socket, error) }
  })

  socket.on('disconnect', () => {
    const tracked = vipPlusSocketPlayers.get(socket.id)
    if (!tracked) return
    vipPlusSocketPlayers.delete(socket.id)
    // Batch 1 (VIP-05 fix) — C1/C7: แยกเส้นทางตามว่ายังอยู่ Waiting Chamber (status WAITING) หรือ
    // แมตช์เริ่มไปแล้ว (READY เสมอถ้าเริ่มแล้ว) ห้ามให้ registry แตะที่นั่งของแมตช์ที่กำลังเล่นอยู่จริง
    const waitingTable = vipPlusTableRegistry.get(tracked.tableId)
    if (waitingTable && waitingTable.status === 'WAITING') {
      const result = vipPlusTableRegistry.markDisconnected(tracked.playerId)
      if (result) io.to(result.table.tableId).emit('vip_plus:table_state', vipPlusTableRegistry.toPublic(result.table))
      return
    }
    markVipPlusDisconnected(tracked.tableId, tracked.playerId)
  })
}

export { VIP_PLUS_ENTRY_TERMS_VERSION }
