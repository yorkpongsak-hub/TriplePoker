import { supabaseAdmin } from '../config/supabase'
import type { TelemetryRow } from './schema'

export async function storeTelemetry(rows: TelemetryRow[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      supabaseAdmin.rpc('telemetry_ingest_events', { p_events: rows }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('TELEMETRY_STORE_TIMEOUT')), 5_000) }),
    ])
    if (result.error) throw new Error('TELEMETRY_STORE_FAILED')
  } finally { if (timer) clearTimeout(timer) }
}
