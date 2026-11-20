import { supabaseAdmin } from '../config/supabase'
import { authorityTelemetry } from '../telemetry/authority'
/** Atomic consume happens before a Bomb becomes defused; retry returns the original consumption result. */
export async function consumeTierDBombDefuser(userId: string, bombEventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('consume_tier_d_bomb_defuser', { p_user_id: userId, p_bomb_event_id: bombEventId })
  if (error) throw error
  if(data===true)authorityTelemetry.bombUse(userId,bombEventId)
  return data === true
}
