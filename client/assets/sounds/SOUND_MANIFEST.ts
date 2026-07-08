// SOUND_MANIFEST.ts
// Sounds Asset Manifest — static require map สำหรับ SFX ทั้งหมด
// ใช้กับ expo-av (Expo Audio) — ตาม AssetNaming Spec §5 + Sound Design Spec
//
// Loading Strategy (ตาม Sound Design Spec §5.3):
//   S1–S7 default → Preload ตั้งแต่เข้าโต๊ะ
//   S8, S9         → Lazy load (โหลดเมื่อต้องใช้)
//   Sound Pack     → Download ครั้งเดียว → cache ในอุปกรณ์
//
// Placeholder: null = รอ asset จริงจาก Sound Designer

type SoundSource = ReturnType<typeof require> | null

// ── S1: ไพ่แจก (~0.3 วิ/ใบ)
// Trigger: ทุกครั้งที่ไพ่ถูกแจก (11 ใบ × 4 คน)
export const SFX_S1_DEAL: Record<string, SoundSource> = {
  default:   null, // require('./sfx_s1_deal_default.mp3')    ← 🔴 Critical
  thai:      null, // require('./sfx_s1_deal_thai.mp3')       ← Sound Pack Thai
  cyberpunk: null, // require('./sfx_s1_deal_cyberpunk.mp3')  ← Sound Pack Cyberpunk
}

// ── S2: ไพ่พลิก / หงาย (~0.2 วิ)
// Trigger: Reveal ไพ่ Pile 1/2/3, Showdown, Auction reveal
export const SFX_S2_FLIP: Record<string, SoundSource> = {
  default:   null, // require('./sfx_s2_flip_default.mp3')
  thai:      null, // require('./sfx_s2_flip_thai.mp3')
  cyberpunk: null, // require('./sfx_s2_flip_cyberpunk.mp3')
}

// ── S3: ไพ่คว่ำ (~0.2 วิ)
// Trigger: Fog of War / ผู้แพ้คว่ำไพ่ / Fold
export const SFX_S3_SLAP: Record<string, SoundSource> = {
  default:   null, // require('./sfx_s3_slap_default.mp3')
  thai:      null, // require('./sfx_s3_slap_thai.mp3')
  cyberpunk: null, // require('./sfx_s3_slap_cyberpunk.mp3')
}

// ── S4: Token ไหลเข้า Pot (~0.5 วิ)
// Trigger: เริ่มแต่ละ Pile / ผู้เล่น Call
export const SFX_S4_TOKEN: Record<string, SoundSource> = {
  default:   null, // require('./sfx_s4_token_default.mp3')
  thai:      null, // require('./sfx_s4_token_thai.mp3')
  cyberpunk: null, // require('./sfx_s4_token_cyberpunk.mp3')
}

// ── S5: ชนะ Pot (~1.5 วิ | Pile 3 ดังกว่า)
// Trigger: Reveal Winner แต่ละ Pile
export const SFX_S5_WIN: Record<string, SoundSource> = {
  default:        null, // require('./sfx_s5_win_default.mp3')
  pile3_default:  null, // require('./sfx_s5_win_pile3_default.mp3')   ← Pile 3 louder
  thai:           null, // require('./sfx_s5_win_thai.mp3')
  pile3_thai:     null, // require('./sfx_s5_win_pile3_thai.mp3')
  cyberpunk:      null, // require('./sfx_s5_win_cyberpunk.mp3')
  pile3_cyberpunk:null, // require('./sfx_s5_win_pile3_cyberpunk.mp3')
}

// ── S6: Countdown Timer (Default only — Sound Pack ไม่แทน S6)
// sfx_s6_tick_slow.mp3  → เหลือ 30% (1 ครั้ง/วิ)
// sfx_s6_tick_fast.mp3  → เหลือ 10% (3 ครั้ง/วิ) + Haptic
// sfx_s6_buzz.mp3       → หมดเวลา + Haptic แรง
export const SFX_S6_TIMER: Record<string, SoundSource> = {
  tick_slow: null, // require('./sfx_s6_tick_slow.mp3')
  tick_fast: null, // require('./sfx_s6_tick_fast.mp3')
  buzz:      null, // require('./sfx_s6_buzz.mp3')
}

// ── S7: Foul / Error (~0.5 วิ)
// Trigger: FoulChecker detect foul / invalid action
export const SFX_S7_FOUL: SoundSource = null
// require('./sfx_s7_foul.mp3')  ← 🔴 Critical

// ── S8: Full-screen Item Effects (Lazy load)
// Default only — Sound Pack ไม่แทน S8
export const SFX_S8_ITEMS: Record<string, SoundSource> = {
  eye_of_demon:      null, // require('./sfx_s8_eye_of_demon.mp3')      ← 1.5 วิ: Demon growl
  oracles_vision:    null, // require('./sfx_s8_oracles_vision.mp3')    ← 1.0 วิ: Mystic harp
  chrono_shard:      null, // require('./sfx_s8_chrono_shard.mp3')      ← 1.5 วิ: Clock shatter
  fortunes_spin:     null, // require('./sfx_s8_fortunes_spin.mp3')     ← 2.0 วิ: Wheel + coins
  hourglass_shatter: null, // require('./sfx_s8_hourglass_shatter.mp3') ← 1.0 วิ: Glass + sand
  serpents_bluff:    null, // require('./sfx_s8_serpents_bluff.mp3')    ← 0.8 วิ: Whisper + hiss
}

// ── S9: Royal Flush Special (~4.0 วิ, Lazy load)
// Trigger: Royal Flush ที่ Showdown เท่านั้น
// ทุกคนในโต๊ะได้ยิน — เสียงพิเศษที่สุดในเกม
export const SFX_S9_ROYAL_FLUSH: SoundSource = null
// require('./sfx_s9_royal_flush.mp3')  ← Lazy load

// ── Volume Settings (ตาม Sound Design Spec §4)
export const VOLUME_DEFAULTS = {
  sfx:      0.8,  // SFX ปรับได้ 0–100%
  item_fx:  0.9,  // Item FX (S8) ปรับได้ 0–100%
  special:  1.0,  // Royal Flush (S9) ปรับไม่ได้
  haptic:   true, // Haptic On/Off
} as const

// ── Sound Pack Resolver
// เลือก SFX ตาม sound pack ที่ผู้เล่นซื้อ
// pack = 'default' → ใช้ local bundle
// pack = 'thai' / 'cyberpunk' → ใช้ cached URI จาก CDN download
export function getSfxSource(
  category: 'deal' | 'flip' | 'slap' | 'token' | 'win' | 'win_pile3',
  pack: string = 'default'
): SoundSource {
  switch (category) {
    case 'deal':
      return SFX_S1_DEAL[pack] ?? SFX_S1_DEAL.default
    case 'flip':
      return SFX_S2_FLIP[pack] ?? SFX_S2_FLIP.default
    case 'slap':
      return SFX_S3_SLAP[pack] ?? SFX_S3_SLAP.default
    case 'token':
      return SFX_S4_TOKEN[pack] ?? SFX_S4_TOKEN.default
    case 'win':
      return SFX_S5_WIN[pack] ?? SFX_S5_WIN.default
    case 'win_pile3': {
      const key = `pile3_${pack}`
      return SFX_S5_WIN[key] ?? SFX_S5_WIN.pile3_default
    }
    default:
      return null
  }
}

// ── Preload list (S1–S7 default) — โหลดตั้งแต่เข้าโต๊ะ
// ใช้กับ expo-av: Audio.Sound.createAsync()
export const PRELOAD_SOUNDS = [
  SFX_S1_DEAL.default,
  SFX_S2_FLIP.default,
  SFX_S3_SLAP.default,
  SFX_S4_TOKEN.default,
  SFX_S5_WIN.default,
  SFX_S5_WIN.pile3_default,
  SFX_S6_TIMER.tick_slow,
  SFX_S6_TIMER.tick_fast,
  SFX_S6_TIMER.buzz,
  SFX_S7_FOUL,
].filter(Boolean) // กรอง null ออก (ตอนยังไม่มี asset จริง)

// ── CHECKLIST สำหรับ Sound Designer
/*
🔴 Critical — ต้องมีก่อน Launch (S1–S7 default):
  sfx_s1_deal_default.mp3
  sfx_s2_flip_default.mp3
  sfx_s3_slap_default.mp3
  sfx_s4_token_default.mp3
  sfx_s5_win_default.mp3
  sfx_s5_win_pile3_default.mp3
  sfx_s6_tick_slow.mp3
  sfx_s6_tick_fast.mp3
  sfx_s6_buzz.mp3
  sfx_s7_foul.mp3

🟠 High — Sprint 6 (Item System, Lazy load):
  sfx_s8_eye_of_demon.mp3
  sfx_s8_oracles_vision.mp3
  sfx_s8_chrono_shard.mp3
  sfx_s8_fortunes_spin.mp3
  sfx_s8_hourglass_shatter.mp3
  sfx_s8_serpents_bluff.mp3

🟡 Medium — Sprint 7+:
  sfx_s9_royal_flush.mp3
  Sound Pack: Thai (S1–S5 × thai variants)
  Sound Pack: Cyberpunk (S1–S5 × cyberpunk variants)
*/
