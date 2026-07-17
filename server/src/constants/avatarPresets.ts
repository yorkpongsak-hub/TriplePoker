// constants/avatarPresets.ts
// Single Source of Truth ฝั่ง Server สำหรับ Avatar Preset ทั้งหมด (key + tier)
// ต้องตรงกับ client/src/components/profile/AvatarPicker.tsx (PRESET_AVATARS) เป๊ะ —
// ถ้าเพิ่ม/แก้/ลบ preset ต้องแก้ทั้ง 2 ที่พร้อมกัน
//
// tier: 'free' = ใช้ได้ทุกคน | 'vip' = ต้องเป็น VIP ขึ้นไป | 'vip_pro' = ต้องเป็น VIP PRO เท่านั้น (Pro Exclusive)

export type AvatarTier = 'free' | 'vip' | 'vip_pro'

export interface AvatarPresetDef {
  key: string
  tier: AvatarTier
}

export const AVATAR_PRESETS: AvatarPresetDef[] = [
  // ── Free — 12 แบบเดิม (emoji)
  { key: 'wolf',     tier: 'free' },
  { key: 'fox',      tier: 'free' },
  { key: 'owl',      tier: 'free' },
  { key: 'snake',    tier: 'free' },
  { key: 'shark',    tier: 'free' },
  { key: 'panther',  tier: 'free' },
  { key: 'eagle',    tier: 'free' },
  { key: 'bear',     tier: 'free' },
  { key: 'raven',    tier: 'free' },
  { key: 'tiger',    tier: 'free' },
  { key: 'skull',    tier: 'free' },
  { key: 'joker',    tier: 'free' },

  // ── VIP — 12 แบบเดิม (emoji)
  { key: 'dragon',   tier: 'vip' },
  { key: 'unicorn',  tier: 'vip' },
  { key: 'phoenix',  tier: 'vip' },
  { key: 'demon',    tier: 'vip' },
  { key: 'ninja',    tier: 'vip' },
  { key: 'samurai',  tier: 'vip' },
  { key: 'wizard',   tier: 'vip' },
  { key: 'robot',    tier: 'vip' },
  { key: 'ghost',    tier: 'vip' },
  { key: 'alien',    tier: 'vip' },
  { key: 'crown',    tier: 'vip' },
  { key: 'reaper',   tier: 'vip' },

  // ── VIP ใหม่ (รูปภาพ, avatar_vip_01–09@2x ที่ client/assets/avatars/) —
  // 01-06 = VIP ธรรมดา | 07-09 = VIP PRO Exclusive
  { key: 'avatar_vip_01', tier: 'vip' },
  { key: 'avatar_vip_02', tier: 'vip' },
  { key: 'avatar_vip_03', tier: 'vip' },
  { key: 'avatar_vip_04', tier: 'vip' },
  { key: 'avatar_vip_05', tier: 'vip' },
  { key: 'avatar_vip_06', tier: 'vip' },
  { key: 'avatar_vip_07', tier: 'vip_pro' },
  { key: 'avatar_vip_08', tier: 'vip_pro' },
  { key: 'avatar_vip_09', tier: 'vip_pro' },
]

// Preset default ตอน revert (VIP หมดอายุ / preset ไม่ถูกต้อง)
export const DEFAULT_AVATAR_KEY = 'wolf'

const PRESET_MAP = new Map(AVATAR_PRESETS.map(p => [p.key, p]))

export function getAvatarPreset(key: string): AvatarPresetDef | undefined {
  return PRESET_MAP.get(key)
}

// ลำดับ tier ไว้เทียบว่า preset "สูงกว่า" vip_status ปัจจุบันหรือไม่ (none < vip < vip_pro)
const TIER_RANK: Record<AvatarTier, number> = { free: 0, vip: 1, vip_pro: 2 }
const VIP_STATUS_RANK: Record<'none' | 'vip' | 'vip_pro', number> = { none: 0, vip: 1, vip_pro: 2 }

// true ถ้า vipStatus ปัจจุบันเพียงพอสำหรับ preset นี้ (key ไม่รู้จัก → false)
export function isAvatarKeyAllowed(key: string, vipStatus: 'none' | 'vip' | 'vip_pro'): boolean {
  const preset = getAvatarPreset(key)
  if (!preset) return false
  return VIP_STATUS_RANK[vipStatus] >= TIER_RANK[preset.tier]
}
