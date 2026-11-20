import { TelemetryQueue, MAX_AGE_MS, MAX_EVENTS, MAX_QUEUE_BYTES, queueEnabled, type QueueConfig } from '../../../client/src/telemetry/queue'
import { validEvent, type TelemetryInput } from '../../../client/src/telemetry/types'
import { telemetryEventSchema } from '../../src/telemetry/schema'

const config: QueueConfig = { enabled: true, environment: 'development', serverUrl: 'http://localhost:3001', appVersion: '1.0.0', platform: 'android' }
const input = (): TelemetryInput => ({ event_name: 'app_open', session_id: '00000000-0000-4000-8000-000000000002', properties: {} })
function harness(overrides: Partial<QueueConfig> = {}) {
  let now = Date.parse('2026-10-03T00:00:00.000Z'), id = 10
  const memory = new Map<string, string>()
  const storage = {
    getItem: jest.fn(async (key: string) => memory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { memory.set(key, value) }),
  }
  const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
    const events = JSON.parse(init.body as string).events
    return new Response(JSON.stringify({ acknowledged: events.map((event: any) => event.event_id), rejected: [] }), { status: 200 })
  })
  const deps = { storage, fetch: fetcher, uuid: () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`, now: () => now, random: () => 0.5 }
  const create = () => new TelemetryQueue({ ...config, ...overrides }, deps)
  const queue = create()
  const saved = () => JSON.parse(memory.get(queue.storageKey)!)
  return { queue, create, saved, storage, memory, fetcher, advance: (ms: number) => { now += ms } }
}
afterEach(() => jest.useRealTimers())

test('disabled or unsafe configuration performs no storage/network work', async () => {
  for (const overrides of [{ enabled: false }, { serverUrl: '' }, { environment: 'production' as const, serverUrl: 'http://api.example' }, { serverUrl: 'https://user:secret@api.example' }]) {
    const h = harness(overrides); h.queue.start(); await h.queue.enqueue(input()); await h.queue.flush(); h.queue.stop()
    expect(h.storage.getItem).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled()
  }
  expect(queueEnabled({ ...config, environment: 'production', serverUrl: 'https://api.example' })).toBe(true)
})
test('identity, event IDs and original timestamp survive recreation; batches are capped at 20', async () => {
  const h = harness()
  await Promise.all(Array.from({ length: 21 }, () => h.queue.enqueue(input())))
  const before = h.saved()
  expect(new Set(before.events.map((event: any) => event.event_id)).size).toBe(21)
  for (const event of before.events) expect(telemetryEventSchema.safeParse(event).success).toBe(true)
  h.advance(1000); const restarted = h.create(); await restarted.flush()
  expect(h.saved().playerId).toBe(before.playerId)
  expect(JSON.parse(h.fetcher.mock.calls[0][1].body as string).events).toEqual(before.events.slice(0, 20))
  expect(h.saved().events).toEqual(before.events.slice(20)); await restarted.flush(); expect(h.saved().events).toHaveLength(0)
})
test('lost ACK retries the exact event after backoff and never rejects caller', async () => {
  const h = harness(); await h.queue.enqueue(input()); const before = h.saved()
  h.fetcher.mockRejectedValueOnce(new Error('offline'))
  await expect(h.queue.flush()).resolves.toBeUndefined()
  expect(h.saved()).toEqual(before); await h.queue.flush(); expect(h.fetcher).toHaveBeenCalledTimes(1)
  h.advance(1001); await h.queue.flush(); expect(h.saved().events).toHaveLength(0)
  expect(h.fetcher.mock.calls[0][1].body).toBe(h.fetcher.mock.calls[1][1].body)
})
test('429 respects Retry-After, and server-disabled/auth/body errors retain queued data', async () => {
  const h = harness(); await h.queue.enqueue(input())
  h.fetcher.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }))
  await h.queue.flush(); h.advance(59_999); await h.queue.flush(); expect(h.fetcher).toHaveBeenCalledTimes(1)
  h.advance(2); await h.queue.flush(); expect(h.saved().events).toHaveLength(0)
  for (const status of [400, 401, 403, 413, 500, 503]) {
    const other = harness(); await other.queue.enqueue(input()); other.fetcher.mockResolvedValueOnce(new Response('{}', { status }))
    await other.queue.flush(); expect(other.saved().events).toHaveLength(1)
  }
})
test('timeout aborts upload without removing events or rejecting gameplay', async () => {
  jest.useFakeTimers(); const h = harness(); await h.queue.enqueue(input())
  h.fetcher.mockImplementationOnce(() => new Promise(() => {}))
  const pending = h.queue.flush(); await jest.advanceTimersByTimeAsync(8001); await pending
  expect(h.saved().events).toHaveLength(1); expect(h.queue.diagnostics.uploadFailures).toBe(1)
  expect(h.fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
})
test('single-flight upload preserves events enqueued during network wait', async () => {
  const h = harness(); await h.queue.enqueue(input())
  let resolve!: (response: Response) => void
  h.fetcher.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const first = h.queue.flush(), second = h.queue.flush(); expect(second).toBe(first)
  await new Promise(done => setImmediate(done)); await h.queue.enqueue(input())
  const sent = JSON.parse(h.fetcher.mock.calls[0][1].body as string).events
  resolve(new Response(JSON.stringify({ acknowledged: sent.map((event: any) => event.event_id), rejected: [] })))
  await first; expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.saved().events).toHaveLength(1)
})
test('timeout also bounds a stalled response body after successful headers', async () => {
  jest.useFakeTimers(); const h = harness(); await h.queue.enqueue(input())
  h.fetcher.mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) } as Response)
  const pending = h.queue.flush(); await jest.advanceTimersByTimeAsync(8001); await pending
  expect(h.saved().events).toHaveLength(1)
  expect(h.fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
})
test('invalid/incomplete/foreign ACK retains data; valid partial rejection clears only sent events', async () => {
  for (const body of ['broken', '{}', JSON.stringify({ acknowledged: ['foreign'], rejected: [] }), JSON.stringify({ acknowledged: [], rejected: [] }), JSON.stringify({ acknowledged: [], rejected: [{ index: 99, reason: 'INVALID_EVENT' }] })]) {
    const h = harness(); await h.queue.enqueue(input()); h.fetcher.mockResolvedValueOnce(new Response(body))
    await h.queue.flush(); expect(h.saved().events).toHaveLength(1)
  }
  const h = harness(); await h.queue.enqueue(input()); await h.queue.enqueue(input()); const before = h.saved()
  h.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ acknowledged: [before.events[0].event_id], rejected: [{ index: 1, reason: 'INVALID_EVENT' }] })))
  await h.queue.flush(); expect(h.saved().events).toHaveLength(0); expect(h.queue.diagnostics.rejected).toBe(1)
})
test('storage failures never throw; failed ACK persistence remains replayable after restart', async () => {
  const h = harness(); h.storage.getItem.mockRejectedValueOnce(new Error('storage'))
  await expect(h.queue.enqueue(input())).resolves.toBeUndefined(); expect(h.queue.diagnostics.storageFailures).toBe(1)
  await h.queue.enqueue(input()); const before = h.saved()
  h.storage.setItem.mockImplementationOnce(async (key, value) => { h.memory.set(key, value) }).mockRejectedValueOnce(new Error('full'))
  await expect(h.queue.flush()).resolves.toBeUndefined(); expect(h.saved()).toEqual(before)
  await h.create().flush(); expect(h.saved().events).toHaveLength(0)
})
test('bounded queue drops oldest events and expires data after seven days', async () => {
  const h = harness(); await h.queue.enqueue(input()); const initial = h.saved()
  initial.events = Array.from({ length: MAX_EVENTS + 10 }, (_, i) => ({ ...initial.events[0], event_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
  h.memory.set(h.queue.storageKey, JSON.stringify(initial))
  const restarted = h.create(); h.fetcher.mockRejectedValueOnce(new Error('offline')); await restarted.flush()
  expect(h.saved().events.length).toBeLessThanOrEqual(MAX_EVENTS)
  expect(JSON.stringify(h.saved().events).length * 2).toBeLessThanOrEqual(MAX_QUEUE_BYTES)
  expect(h.saved().dropped).toBeGreaterThanOrEqual(10)
  h.advance(MAX_AGE_MS + 1); await restarted.flush(); expect(h.saved().events).toHaveLength(0)
})
test('corrupt storage and sensitive properties are never uploaded; inputs are cloned before await', async () => {
  const h = harness(); h.memory.set(h.queue.storageKey, '{broken')
  await h.queue.enqueue(input()); expect(h.queue.diagnostics.invalid).toBe(1)
  const mutable = input(); const pending = h.queue.enqueue(mutable)
  ;(mutable.properties as any).email = 'private@example.com'
  await pending; expect(h.saved().events).toHaveLength(2)
  await h.queue.enqueue(mutable); expect(h.saved().events).toHaveLength(2)
  const stored = h.saved(); stored.events.push({ ...stored.events[0], properties: { accessToken: 'secret' } })
  h.memory.set(h.queue.storageKey, JSON.stringify(stored)); await h.create().flush()
  expect(h.fetcher.mock.calls[0][1].body).not.toMatch(/accessToken|secret|email/)
})
test('development and production queues use different storage keys; start/stop is idempotent', async () => {
  jest.useFakeTimers(); const h = harness(); await h.queue.enqueue(input())
  const production = harness({ environment: 'production', serverUrl: 'https://api.example' })
  expect(production.queue.storageKey).not.toBe(h.queue.storageKey)
  h.queue.start(); h.queue.start(); await jest.advanceTimersByTimeAsync(1)
  expect(h.fetcher).toHaveBeenCalledTimes(1); h.queue.stop(); h.queue.stop()
  await h.queue.enqueue(input()); await jest.advanceTimersByTimeAsync(60_000); expect(h.fetcher).toHaveBeenCalledTimes(1)
})
test('client/server property contracts agree on all foundation events', async () => {
  const h = harness()
  for (const data of [input(), { ...input(), event_name: 'session_start', properties: { session_number: 2, is_return: true } }, { ...input(), event_name: 'session_end', properties: { duration_ms: 200, reason: 'background', inferred: false } }, { ...input(), event_name: 'telemetry_upload_failure', properties: { reason: 'http', count: 2, status: 503 } }]) {
    await h.queue.enqueue(data as TelemetryInput)
  }
  expect(h.saved().events).toHaveLength(4)
  for (const event of h.saved().events) { expect(validEvent(event)).toBe(true); expect(telemetryEventSchema.safeParse(event).success).toBe(true) }
})
test('unavailable native UUID module never rejects gameplay or uploads without identity', async () => {
  const storage = { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }
  const fetcher = jest.fn()
  const queue = new TelemetryQueue(config, { storage, fetch: fetcher, uuid: () => { throw new Error('Native module unavailable') } })
  await expect(queue.enqueue(input())).resolves.toBeUndefined()
  await expect(queue.flush()).resolves.toBeUndefined()
  expect(fetcher).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled()
})
