import { supabaseAdmin } from '../../config/supabase'

export interface SovereignLifecycleStore {
  transitionMatches(fromState: string, toState: string, timestampColumn: string, nowIso: string): Promise<number>
}

export class SupabaseSovereignLifecycleStore implements SovereignLifecycleStore {
  async transitionMatches(fromState: string, toState: string, timestampColumn: string, nowIso: string): Promise<number> {
    const { data, error } = await supabaseAdmin.from('sovereign_matches').update({ state: toState })
      .eq('state', fromState).lte(timestampColumn, nowIso).select('id')
    if (error) throw error
    return data?.length ?? 0
  }
}

export async function tickSovereignLifecycle(store: SovereignLifecycleStore, nowMs = Date.now()): Promise<number> {
  if (!Number.isFinite(nowMs)) throw new Error('INVALID_LIFECYCLE_TIME')
  const now = new Date(nowMs).toISOString()
  let transitions = 0
  transitions += await store.transitionMatches('PUBLISHED', 'CONFIRMATION_OPEN', 'created_at', now)
  transitions += await store.transitionMatches('CONFIRMATION_OPEN', 'CHECK_IN_PENDING', 'scheduled_standby_open_at', now)
  transitions += await store.transitionMatches('CHECK_IN_PENDING', 'CHECK_IN_OPEN', 'scheduled_check_in_open_at', now)
  transitions += await store.transitionMatches('CHECK_IN_OPEN', 'FILLING_SEATS', 'scheduled_check_in_close_at', now)
  transitions += await store.transitionMatches('READY', 'IN_PROGRESS', 'scheduled_start_at', now)
  return transitions
}

export function startSovereignLifecycleRuntime(store: SovereignLifecycleStore = new SupabaseSovereignLifecycleStore()): NodeJS.Timeout | null {
  if (process.env.SOVEREIGN_ENABLED !== 'true') return null
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try { await tickSovereignLifecycle(store) }
    catch (error) { console.error('[Sovereign] lifecycle tick failed:', error) }
    finally { running = false }
  }, 1_000)
  timer.unref()
  return timer
}
