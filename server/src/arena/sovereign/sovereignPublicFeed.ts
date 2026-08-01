import { sovereignConfig } from '../config/sovereignConfig'

export type SovereignPublicEventType =
  | 'PUBLIC_MATCH_STARTED' | 'PUBLIC_PHASE_CHANGED' | 'PUBLIC_CARD_BACK_COUNT_CHANGED'
  | 'PUBLIC_CENTER_CARD_REVEALED' | 'PUBLIC_ACTION_RESOLVED' | 'PUBLIC_CROWN_MOVED'
  | 'PUBLIC_PILE_REVEALED' | 'PUBLIC_PILE_RESULT' | 'PUBLIC_PLAYER_REPLACED'
  | 'PUBLIC_MATCH_RESULT' | 'PUBLIC_MATCH_ENDED'

export interface SovereignPublicEvent {
  eventId: string
  matchId: string
  sequence: number
  type: SovereignPublicEventType
  publicPayload: Record<string, unknown>
  occurredAt: string
  visibleAt: string
  schemaVersion: number
}

const ALLOWED_TYPES = new Set<SovereignPublicEventType>([
  'PUBLIC_MATCH_STARTED','PUBLIC_PHASE_CHANGED','PUBLIC_CARD_BACK_COUNT_CHANGED','PUBLIC_CENTER_CARD_REVEALED',
  'PUBLIC_ACTION_RESOLVED','PUBLIC_CROWN_MOVED','PUBLIC_PILE_REVEALED','PUBLIC_PILE_RESULT',
  'PUBLIC_PLAYER_REPLACED','PUBLIC_MATCH_RESULT','PUBLIC_MATCH_ENDED',
])
const FORBIDDEN_KEY = /(hand|hidden|private|seed|strategy|planned|auth|token|device|anti.?cheat|wallet|face.?down)/i

function assertPublicPayload(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertPublicPayload(item, `${path}[${index}]`))
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`SPECTATOR_SECRET_FIELD:${path}.${key}`)
    assertPublicPayload(child, `${path}.${key}`)
  }
}

export function createSovereignPublicEvent(input: Omit<SovereignPublicEvent, 'visibleAt'>): SovereignPublicEvent {
  if (!ALLOWED_TYPES.has(input.type)) throw new Error('PUBLIC_EVENT_TYPE_NOT_ALLOWED')
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new Error('INVALID_PUBLIC_SEQUENCE')
  assertPublicPayload(input.publicPayload)
  const occurredAtMs = Date.parse(input.occurredAt)
  if (!Number.isFinite(occurredAtMs)) throw new Error('INVALID_PUBLIC_OCCURRED_AT')
  return { ...input, visibleAt: new Date(occurredAtMs + sovereignConfig.spectatorDelayMs).toISOString() }
}

export class SovereignDelayedFeed {
  private events: SovereignPublicEvent[] = []
  private seenIds = new Set<string>()

  append(event: SovereignPublicEvent): void {
    if (this.seenIds.has(event.eventId)) return
    const previous = this.events[this.events.length - 1]
    if (previous && event.sequence !== previous.sequence + 1) throw new Error('PUBLIC_SEQUENCE_GAP')
    this.events.push(event)
    this.seenIds.add(event.eventId)
  }

  visibleAfter(now: string, afterSequence = 0): SovereignPublicEvent[] {
    const nowMs = Date.parse(now)
    if (!Number.isFinite(nowMs)) throw new Error('INVALID_PUBLIC_READ_TIME')
    return this.events.filter(event => event.sequence > afterSequence && Date.parse(event.visibleAt) <= nowMs)
  }

  snapshotThrough(now: string): { throughSequence: number; events: SovereignPublicEvent[] } {
    const visible = this.visibleAfter(now)
    return { throughSequence: visible.length > 0 ? visible[visible.length - 1].sequence : 0, events: visible }
  }
}

export class SovereignSpectatorCapacity {
  private viewers = new Map<string, { joinedAt: number; graceExpiresAt: number | null }>()

  join(viewerId: string, nowMs: number): { admitted: boolean; position: number | null } {
    if (this.viewers.has(viewerId)) return { admitted: true, position: [...this.viewers.keys()].indexOf(viewerId) + 1 }
    if (this.viewers.size >= sovereignConfig.maxSpectatorsPerMatch) return { admitted: false, position: null }
    this.viewers.set(viewerId, { joinedAt: nowMs, graceExpiresAt: null })
    return { admitted: true, position: this.viewers.size }
  }

  disconnect(viewerId: string, nowMs: number): boolean {
    const viewer = this.viewers.get(viewerId)
    if (!viewer) return false
    viewer.graceExpiresAt = nowMs + sovereignConfig.spectatorReconnectGraceMs
    return true
  }

  reconnect(viewerId: string, nowMs: number): boolean {
    const viewer = this.viewers.get(viewerId)
    if (!viewer || viewer.graceExpiresAt === null || nowMs > viewer.graceExpiresAt) return false
    viewer.graceExpiresAt = null
    return true
  }

  expireGrace(nowMs: number): string[] {
    const expired: string[] = []
    for (const [viewerId, viewer] of this.viewers) {
      if (viewer.graceExpiresAt !== null && nowMs > viewer.graceExpiresAt) {
        this.viewers.delete(viewerId)
        expired.push(viewerId)
      }
    }
    return expired
  }

  leave(viewerId: string): void { this.viewers.delete(viewerId) }
  get count(): number { return this.viewers.size }
}
