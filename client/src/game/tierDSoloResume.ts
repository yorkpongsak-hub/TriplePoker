import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../services/supabaseService'

const key = (userId: string) => `tier_d_solo_active:${userId}`

/** Marks a player as being on the Solo journey on this device. */
export async function markTierDSoloActive(userId: string): Promise<void> {
  await AsyncStorage.setItem(key(userId), '1')
}

/**
 * Resume after login when this device has an active Solo journey. A player who
 * already advanced beyond Level 1 also resumes on a fresh install/device.
 */
export async function shouldResumeTierDSolo(userId: string): Promise<boolean> {
  const local = await AsyncStorage.getItem(key(userId))
  if (local === '1') return true
  const { data } = await supabase.from('users').select('tier_d_solo_level').eq('user_id', userId).maybeSingle()
  return (data?.tier_d_solo_level ?? 1) > 1
}
