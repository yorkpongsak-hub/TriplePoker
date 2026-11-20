import type { FastifyInstance } from 'fastify'
import { storeTelemetry } from '../telemetry/store'
import { takeRate, type RateState } from '../security/runtimeSecurity'
import { telemetryBatchSchema, telemetryConfig, telemetryEventSchema, type TelemetryRow } from '../telemetry/schema'

export async function telemetryRoutes(app: FastifyInstance) {
  const rates = new Map<string, RateState>()
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, state] of rates) if (state.resetAt <= now) rates.delete(key)
  }, 60_000)
  cleanup.unref()
  app.addHook('onClose', async () => { clearInterval(cleanup) })

  app.post('/telemetry/batch', { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const config = telemetryConfig()
    if (!config.enabled) return reply.header('Retry-After', '60').status(503).send({ error: 'TELEMETRY_DISABLED' })
    if (!takeRate(rates, request.ip, 30, 60_000)) {
      return reply.header('Retry-After', '60').status(429).send({ error: 'RATE_LIMITED' })
    }
    const batch = telemetryBatchSchema.safeParse(request.body)
    if (!batch.success) return reply.status(400).send({ error: 'INVALID_BATCH' })

    const rows: TelemetryRow[] = []
    const rejected: { index: number; event_id?: string; reason: string }[] = []
    const ids = new Set<string>()
    batch.data.events.forEach((input, index) => {
      const parsed = telemetryEventSchema.safeParse(input)
      if (!parsed.success) {
        rejected.push({ index, reason: 'INVALID_EVENT' })
        return
      }
      const event = parsed.data
      if (['token_balance_change','item_use','item_reward','ad_reward'].includes(event.event_name)) {
        rejected.push({ index, event_id: event.event_id, reason: 'CLIENT_AUTHORITY_FORBIDDEN' })
        return
      }
      if (['game_start', 'game_end', 'first_game_complete'].includes(event.event_name)
        && 'mode' in event.properties && (event.properties.mode !== 'training' || event.properties.tier !== 'training')) {
        rejected.push({ index, event_id: event.event_id, reason: 'CLIENT_AUTHORITY_FORBIDDEN' })
        return
      }
      if (Date.parse(event.occurred_at) > Date.now() + 5 * 60_000) {
        rejected.push({ index, event_id: event.event_id, reason: 'FUTURE_TIMESTAMP' })
        return
      }
      if (!ids.has(event.event_id)) {
        ids.add(event.event_id)
        rows.push({ ...event, environment: config.environment, source: 'client' })
      }
    })
    if (rows.length) {
      try {
        await storeTelemetry(rows)
      } catch {
        // ไม่บันทึก payload, IP หรือข้อความฐานข้อมูลที่อาจมีข้อมูลผู้เล่น
        app.log.warn({ code: 'TELEMETRY_STORE_FAILED' }, 'Telemetry storage unavailable')
        return reply.header('Retry-After', '5').status(503).send({ error: 'TELEMETRY_UNAVAILABLE' })
      }
    }
    // ACK หลัง DB สำเร็จเท่านั้น; retry event เดิมไม่เขียนทับข้อมูลเก่า
    return { acknowledged: [...ids], rejected }
  })
}
