import { supabaseAdmin } from '../config/supabase'
import type { TierDRewardItem } from './tierDRewards'

export async function getTierDFreezeDurations(userId: string): Promise<number[]> {
  const { data, error } = await supabaseAdmin.from('tier_d_item_inventory').select('freeze_durations').eq('user_id', userId).eq('item_key', 'freeze').maybeSingle()
  if (error) throw error
  return data?.freeze_durations ?? []
}
export async function commitTierDItem(input: { userId: string; roomId: string; item: TierDRewardItem; requestId: string;
  persistent: boolean; expectedRevision: number; snapshot: unknown }): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc('commit_tier_d_item_action', {
    p_user_id: input.userId, p_room_id: input.roomId, p_item_key: input.item, p_request_id: input.requestId,
    p_persistent: input.persistent, p_expected_revision: input.expectedRevision, p_snapshot: input.snapshot,
  })
  if (error) throw error
  if (data !== true) throw new Error('Item transaction was rejected. Reconnect to restore authoritative state.')
}
