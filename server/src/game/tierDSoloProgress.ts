import { supabaseAdmin } from '../config/supabase'
import type { TierDProgress } from './tierDSolo'

export async function persistTierDLevelOutcome(userId: string, won: boolean): Promise<TierDProgress | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('settle_tier_d_solo_level', { p_user_id: userId, p_won: won })
    if (error || !data || typeof data.level !== 'number') return null
    return { level: data.level, currentWinStreak: data.currentWinStreak, bestWinStreak: data.bestWinStreak }
  } catch (error) {
    console.error('[TIER_D_SOLO] progress persistence failed', error)
    return null
  }
}
