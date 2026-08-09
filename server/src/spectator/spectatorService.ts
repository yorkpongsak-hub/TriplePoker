import { randomUUID } from 'crypto'
import { ActiveTableSummary, BroadcastStatus, DelayedSpectatorEvent, SpectatorEvent, SpectatorSnapshot } from './spectatorTypes'
import { sanitizePublicEvent } from './publicEventSanitizer'

export const DEFAULT_SPECTATOR_DELAY_MS = 30_000
export const DEFAULT_VIEWER_LIMIT = 10

type Broadcast = {
  broadcastId: string; tableId: string; tierId: string; tierName: string
  enabledByUserId: string; delayMs: number; viewerLimit: number
  status: BroadcastStatus; bossName?: string; matchStatus: string
  round: number; totalRounds: number; viewers: Set<string>
  events: DelayedSpectatorEvent[]; snapshots: SpectatorSnapshot[]
}

type EmitDelayed = (broadcastId: string, event: DelayedSpectatorEvent) => void

export class SpectatorService {
  private broadcasts = new Map<string, Broadcast>()
  private byTable = new Map<string, string>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  constructor(private emitDelayed?: EmitDelayed) {}

  create(input: { tableId: string; tierId: string; tierName: string; enabledByUserId: string; delayMs?: number; viewerLimit?: number }): string {
    if (this.byTable.has(input.tableId)) throw new Error('INVALID_TABLE_STATE')
    const broadcastId = randomUUID()
    this.broadcasts.set(broadcastId, {
      ...input, broadcastId, delayMs: input.delayMs ?? DEFAULT_SPECTATOR_DELAY_MS,
      viewerLimit: input.viewerLimit ?? DEFAULT_VIEWER_LIMIT, status: 'WAITING_FOR_MATCH',
      matchStatus: 'MATCHING', round: 0, totalRounds: 5, viewers: new Set(), events: [], snapshots: [],
    })
    this.byTable.set(input.tableId, broadcastId)
    return broadcastId
  }

  start(tableId: string, bossName?: string): void {
    const b = this.requireByTable(tableId)
    if (b.status !== 'WAITING_FOR_MATCH') throw new Error('INVALID_TABLE_STATE')
    b.status = 'BROADCASTING'; b.bossName = bossName; b.matchStatus = 'BOSS_REVEAL'
  }

  list(tierId?: string): ActiveTableSummary[] {
    return [...this.broadcasts.values()]
      .filter(b => b.status !== 'WAITING_FOR_MATCH' && (!tierId || b.tierId === tierId))
      .map(b => ({
        tableId: b.tableId, broadcastId: b.broadcastId, tierId: b.tierId, tierName: b.tierName,
        bossName: b.bossName, liveStatus: b.status === 'BROADCASTING'
          ? (b.viewers.size >= b.viewerLimit ? 'FULL' : 'LIVE') : 'ENDING',
        matchStatus: b.matchStatus, round: b.round, totalRounds: b.totalRounds,
        viewerCount: b.viewers.size, viewerLimit: b.viewerLimit,
        canWatch: b.status === 'BROADCASTING' && b.viewers.size < b.viewerLimit,
      }))
  }

  join(broadcastId: string, userId: string, serverNow = Date.now()): { snapshot?: SpectatorSnapshot; replay: DelayedSpectatorEvent[]; viewerCount: number; viewerLimit: number } {
    const b = this.require(broadcastId)
    if (b.status === 'FINISHED' || b.status === 'CANCELLED') throw new Error('BROADCAST_ALREADY_ENDED')
    if (b.status !== 'BROADCASTING') throw new Error('BROADCAST_NOT_AVAILABLE')
    if (!b.viewers.has(userId) && b.viewers.size >= b.viewerLimit) throw new Error('SPECTATOR_LIMIT_REACHED')
    b.viewers.add(userId)
    const spectatorTime = serverNow - b.delayMs
    const snapshot = [...b.snapshots].reverse().find(s => s.snapshotAt <= spectatorTime)
    const after = snapshot?.snapshotAt ?? 0
    return {
      snapshot: snapshot && { ...snapshot, viewerCount: b.viewers.size },
      replay: b.events.filter(e => e.occurredAt > after && e.occurredAt <= spectatorTime),
      viewerCount: b.viewers.size, viewerLimit: b.viewerLimit,
    }
  }

  leave(broadcastId: string, userId: string): number {
    const b = this.broadcasts.get(broadcastId)
    if (!b) return 0
    b.viewers.delete(userId)
    return b.viewers.size
  }

  publish(tableId: string, rawEvent: unknown, occurredAt = Date.now()): DelayedSpectatorEvent | null {
    const b = this.requireByTable(tableId)
    if (b.status !== 'BROADCASTING') return null
    const payload = sanitizePublicEvent(rawEvent)
    if (!payload) return null
    if (payload.type === 'ROUND_STARTED') { b.round = payload.round; b.totalRounds = payload.totalRounds; b.matchStatus = 'IN_PROGRESS' }
    if (payload.type === 'SHOWDOWN_RESULTS') b.matchStatus = 'SHOWDOWN'
    if (payload.type === 'MATCH_FINISHED') b.matchStatus = 'FINISHED'
    const event = { eventId: randomUUID(), tableId, occurredAt, broadcastAt: occurredAt + b.delayMs, payload }
    b.events.push(event)
    const wait = Math.max(0, event.broadcastAt - Date.now())
    const timer = setTimeout(() => { this.timers.delete(event.eventId); this.emitDelayed?.(b.broadcastId, event) }, wait)
    this.timers.set(event.eventId, timer)
    return event
  }

  saveSnapshot(tableId: string, snapshot: Omit<SpectatorSnapshot, 'viewerCount' | 'viewerLimit'>): void {
    const b = this.requireByTable(tableId)
    b.snapshots.push({ ...snapshot, viewerCount: b.viewers.size, viewerLimit: b.viewerLimit })
    if (b.snapshots.length > 30) b.snapshots.shift()
  }

  finish(tableId: string, reason = 'MATCH_FINISHED'): void {
    const b = this.requireByTable(tableId)
    b.status = 'FINISHED'; b.matchStatus = 'FINISHED'
    this.publishEnded(b, reason)
  }

  getBroadcastId(tableId: string): string | undefined { return this.byTable.get(tableId) }

  private publishEnded(b: Broadcast, reason: string): void {
    const event: DelayedSpectatorEvent = { eventId: randomUUID(), tableId: b.tableId, occurredAt: Date.now(), broadcastAt: Date.now() + b.delayMs, payload: { type: 'BROADCAST_ENDED', reason } }
    const timer = setTimeout(() => this.emitDelayed?.(b.broadcastId, event), b.delayMs)
    this.timers.set(event.eventId, timer)
  }
  private require(id: string): Broadcast { const b = this.broadcasts.get(id); if (!b) throw new Error('BROADCAST_NOT_FOUND'); return b }
  private requireByTable(tableId: string): Broadcast { const id = this.byTable.get(tableId); if (!id) throw new Error('BROADCAST_NOT_FOUND'); return this.require(id) }
}
