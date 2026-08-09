import { supabaseAdmin } from '../config/supabase'

const TIER_ORDER = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster'] as const

export function allowedTableSkins(vipStatus: string | null | undefined, tierUnlockedMax: string | null | undefined): number[] {
  if (!vipStatus || vipStatus === 'none') return []
  const tierIndex = TIER_ORDER.indexOf((tierUnlockedMax ?? 'D') as typeof TIER_ORDER[number])
  const allowed = [1]
  if (tierIndex >= TIER_ORDER.indexOf('adept')) allowed.push(2)
  if (tierIndex >= TIER_ORDER.indexOf('mastermind')) allowed.push(3)
  if (tierIndex >= TIER_ORDER.indexOf('highNoble')) allowed.push(4)
  return allowed
}

export async function getTableSkinState(userId: string): Promise<{ unlockedSkins: number[]; activeSkin: number }> {
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('vip_status, tier_unlocked_max')
    .eq('user_id', userId)
    .single()
  if (userError || !user) throw new Error('USER_NOT_FOUND')

  const unlockedSkins = allowedTableSkins(user.vip_status, user.tier_unlocked_max)
  if (unlockedSkins.length === 0) return { unlockedSkins: [], activeSkin: 0 }

  const { data: preference, error: preferenceError } = await supabaseAdmin
    .from('user_table_skins')
    .select('active_skin')
    .eq('user_id', userId)
    .maybeSingle()
  if (preferenceError) throw preferenceError
  const selected = preference?.active_skin ?? 1
  return { unlockedSkins, activeSkin: selected === 0 || unlockedSkins.includes(selected) ? selected : 1 }
}

export async function selectTableSkin(userId: string, skinId: number): Promise<{ unlockedSkins: number[]; activeSkin: number }> {
  const state = await getTableSkinState(userId)
  if (state.unlockedSkins.length === 0) throw new Error('VIP_REQUIRED')
  if (skinId !== 0 && !state.unlockedSkins.includes(skinId)) throw new Error('SKIN_LOCKED')

  const { error } = await supabaseAdmin.from('user_table_skins').upsert({
    user_id: userId,
    active_skin: skinId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  return { unlockedSkins: state.unlockedSkins, activeSkin: skinId }
}
