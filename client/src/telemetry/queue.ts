import { validEvent, validUuid, type TelemetryEnvironment, type TelemetryEvent, type TelemetryInput, type TelemetryPlatform, type TelemetryContext } from './types'

export const BATCH_SIZE = 20
export const MAX_EVENTS = 500
export const MAX_QUEUE_BYTES = 256 * 1024
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const INTERVAL_MS = 30_000
type State = { version: 1; playerId: string; events: TelemetryEvent[]; dropped: number; receipts?: string[]; sessions?: number }
export type QueueConfig = {
  enabled: boolean; environment: TelemetryEnvironment; serverUrl: string
  appVersion: string; platform: TelemetryPlatform; buildNumber?: string
}
export type QueueDependencies = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
  fetch: (url: string, init: RequestInit) => Promise<Response>
  uuid: () => string
  now?: () => number
  random?: () => number
}

export function queueEnabled(config: QueueConfig) {
  try {
    const url = new URL(config.serverUrl)
    return config.enabled && ['development', 'production'].includes(config.environment)
      && !!url.hostname && !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || (config.environment === 'development' && url.protocol === 'http:'))
  } catch { return false }
}

export class TelemetryQueue {
  private state?: State
  private serial: Promise<unknown> = Promise.resolve()
  private inFlight?: Promise<void>
  private timer?: ReturnType<typeof setInterval>
  private nextAttemptAt = 0
  private attempts = 0
  private readonly now: () => number
  private readonly random: () => number
  readonly diagnostics = { storageFailures: 0, uploadFailures: 0, rejected: 0, invalid: 0, dropped: 0 }
  readonly storageKey: string

  constructor(private readonly config: QueueConfig, private readonly deps: QueueDependencies) {
    this.now = deps.now ?? Date.now
    this.random = deps.random ?? Math.random
    this.storageKey = `rise.telemetry.v1.${config.environment}`
  }
  get enabled() { return queueEnabled(this.config) }
  newId(): string | undefined {
    if (!this.enabled) return undefined
    try { const id = this.deps.uuid(); return validUuid(id) ? id : undefined } catch { return undefined }
  }
  async createSession(): Promise<(TelemetryContext & { session_number: number; is_return: boolean }) | undefined> {
    if (!this.enabled) return undefined
    try {
      return await this.ordered(async () => {
        await this.initialize()
        const session_id = this.newId(); if (!session_id) return undefined
        const sessions = Math.min(1_000_000, (this.state!.sessions ?? 0) + 1)
        await this.save({ ...this.state!, sessions })
        return { player_id: this.state!.playerId, session_id, app_version: this.config.appVersion,
          platform: this.config.platform, session_number: sessions, is_return: sessions > 1 }
      })
    } catch { this.diagnostics.storageFailures++; return undefined }
  }

  private ordered<T>(work: () => Promise<T>): Promise<T> {
    const result = this.serial.catch(() => undefined).then(work)
    this.serial = result.catch(() => undefined)
    return result
  }

  private bounded(state: State): State {
    const events = state.events.filter(event => validEvent(event) && event.player_id === state.playerId
      && Date.parse(event.occurred_at) >= this.now() - MAX_AGE_MS && Date.parse(event.occurred_at) <= this.now() + 5 * 60_000)
    let dropped = state.dropped + state.events.length - events.length
    while (events.length > MAX_EVENTS || JSON.stringify(events).length * 2 > MAX_QUEUE_BYTES) { events.shift(); dropped++ }
    return { ...state, events, dropped }
  }

  private async save(state: State) {
    await this.deps.storage.setItem(this.storageKey, JSON.stringify(state))
    this.state = state
    this.diagnostics.dropped = state.dropped
  }

  private async initialize() {
    if (this.state) return
    const raw = await this.deps.storage.getItem(this.storageKey)
    let state: State | undefined
    if (raw) {
      try {
        const saved = JSON.parse(raw)
        if (saved.version === 1 && validUuid(saved.playerId) && Array.isArray(saved.events)
          && Number.isSafeInteger(saved.dropped) && saved.dropped >= 0) state = {
            version: 1, playerId: saved.playerId, events: saved.events, dropped: saved.dropped,
            receipts: Array.isArray(saved.receipts) ? saved.receipts.filter((v: unknown) => typeof v === 'string' && v.length <= 180).slice(-1000) : [],
            sessions: Number.isInteger(saved.sessions) && saved.sessions >= 0 && saved.sessions <= 1_000_000 ? saved.sessions : 0,
          }
        else this.diagnostics.invalid++
      } catch { this.diagnostics.invalid++ }
    }
    if (!state) {
      const playerId = this.deps.uuid()
      if (!validUuid(playerId)) throw new Error('INVALID_TELEMETRY_ID')
      state = { version: 1, playerId, events: [], dropped: 0 }
    }
    await this.save(this.bounded(state))
  }

  async enqueue(input: TelemetryInput, onceKey?: string): Promise<void> {
    if (!queueEnabled(this.config)) return
    // clone ทันที ป้องกัน caller แก้ object ระหว่างรอ storage
    let copy: TelemetryInput
    try { copy = JSON.parse(JSON.stringify(input)) } catch { this.diagnostics.invalid++; return }
    try {
      await this.ordered(async () => {
        await this.initialize()
        if (onceKey && (onceKey.length > 180 || this.state!.receipts?.includes(onceKey))) return
        const event = { ...copy, event_id: this.deps.uuid(), schema_version: 1,
          occurred_at: new Date(this.now()).toISOString(), player_id: this.state!.playerId,
          app_version: this.config.appVersion, platform: this.config.platform,
          ...(this.config.buildNumber ? { build_number: this.config.buildNumber } : {}),
        }
        if (!validEvent(event)) { this.diagnostics.invalid++; return }
        await this.save(this.bounded({ ...this.state!, events: [...this.state!.events, event],
          ...(onceKey ? { receipts: [...(this.state!.receipts ?? []), onceKey].slice(-1000) } : {}) }))
      })
    } catch { this.diagnostics.storageFailures++ }
  }

  start(): void {
    if (!queueEnabled(this.config) || this.timer) return
    this.timer = setInterval(() => { void this.flush() }, INTERVAL_MS)
    void this.flush()
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }

  flush(): Promise<void> {
    if (!queueEnabled(this.config) || this.now() < this.nextAttemptAt) return Promise.resolve()
    if (this.inFlight) return this.inFlight
    this.inFlight = this.upload().catch(() => { this.retry() }).finally(() => { this.inFlight = undefined })
    return this.inFlight
  }

  private retry(retryAfterMs = 0) {
    this.diagnostics.uploadFailures++
    this.attempts = Math.min(this.attempts + 1, 10)
    const delay = Math.min(60_000, 1000 * 2 ** (this.attempts - 1)) * (0.75 + this.random() * 0.5)
    this.nextAttemptAt = this.now() + Math.max(delay, Math.min(3_600_000, retryAfterMs))
  }

  private async upload(): Promise<void> {
    let events: TelemetryEvent[]
    try {
      events = await this.ordered(async () => {
        await this.initialize()
        await this.save(this.bounded(this.state!))
        return this.state!.events.slice(0, BATCH_SIZE)
      })
    } catch { this.diagnostics.storageFailures++; this.retry(); return }
    if (!events.length) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const { response, ack } = await Promise.race([
        (async () => {
          const response = await this.deps.fetch(`${this.config.serverUrl.replace(/\/$/, '')}/telemetry/batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            // RN and Node's ambient AbortSignal declarations differ; runtime
            // fetch and AbortController use the same platform implementation.
            body: JSON.stringify({ events }), signal: controller.signal as RequestInit['signal'],
          })
          // timeout ครอบคลุม response body ด้วย ไม่ใช่แค่ HTTP headers
          return { response, ack: response.ok ? await response.json() as unknown : undefined }
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')) }, 8_000)
        }),
      ])
      if (!response.ok) {
        const header = response.headers.get('Retry-After')
        const delay = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - this.now()) : 0
        // เก็บข้อมูลไว้เมื่อ config/auth/server ผิด; ไม่ทิ้งทั้ง batch เพราะ HTTP error
        this.retry(Number.isFinite(delay) ? Math.max(0, delay) : 0)
        return
      }
      if (!ack || typeof ack !== 'object') { this.retry(); return }
      const { acknowledged, rejected } = ack as { acknowledged: unknown; rejected: unknown }
      const sent = new Set(events.map(event => event.event_id))
      if (!Array.isArray(acknowledged) || !Array.isArray(rejected)
        || acknowledged.some(id => typeof id !== 'string' || !sent.has(id))
        || rejected.some(item => !item || !Number.isInteger(item.index) || item.index < 0 || item.index >= events.length
          || !['INVALID_EVENT', 'FUTURE_TIMESTAMP', 'CLIENT_AUTHORITY_FORBIDDEN'].includes(item.reason))) { this.retry(); return }
      const removed = new Set<string>(acknowledged)
      for (const item of rejected) removed.add(events[item.index].event_id)
      if (removed.size !== sent.size) { this.retry(); return }
      try {
        await this.ordered(async () => {
          await this.save({ ...this.state!, events: this.state!.events.filter(event => !removed.has(event.event_id)) })
        })
      } catch { this.diagnostics.storageFailures++; this.retry(); return }
      this.diagnostics.rejected += rejected.length
      this.attempts = 0
      this.nextAttemptAt = 0
    } catch { this.retry() }
    finally { if (timer) clearTimeout(timer); controller.abort() }
  }
}
