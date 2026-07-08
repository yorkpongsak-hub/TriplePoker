// ASSET_MANIFEST.ts
// Cards Asset Manifest — static require map สำหรับ React Native
// React Native ต้องใช้ static require เท่านั้น — ห้าม dynamic string
// Placeholder: ไฟล์ .png ยังไม่มี — ใช้ null ไปก่อน จนกว่าจะได้ asset จริง
// ขนาดที่ต้องการ: 180×252 px (@2x: 360×504 px) — ตาม AssetNaming Spec §2.6

// ── ประเภทของ require result
type ImageSource = ReturnType<typeof require> | null

// ── CARD FACES — 52 ใบ (null = placeholder รอ asset จริง)
// Pattern: card_[suit]_[value].png
// suits: spade, heart, diamond, club
// values: a, 2, 3, 4, 5, 6, 7, 8, 9, 10, j, q, k
export const CARD_IMAGES: Record<string, ImageSource> = {
  // ── Spades
  spade_a:   null, // require('./card_spade_a.png')
  spade_2:   null, // require('./card_spade_2.png')
  spade_3:   null, // require('./card_spade_3.png')
  spade_4:   null, // require('./card_spade_4.png')
  spade_5:   null, // require('./card_spade_5.png')
  spade_6:   null, // require('./card_spade_6.png')
  spade_7:   null, // require('./card_spade_7.png')
  spade_8:   null, // require('./card_spade_8.png')
  spade_9:   null, // require('./card_spade_9.png')
  spade_10:  null, // require('./card_spade_10.png')
  spade_j:   null, // require('./card_spade_j.png')
  spade_q:   null, // require('./card_spade_q.png')
  spade_k:   null, // require('./card_spade_k.png')

  // ── Hearts
  heart_a:   null, // require('./card_heart_a.png')
  heart_2:   null, // require('./card_heart_2.png')
  heart_3:   null, // require('./card_heart_3.png')
  heart_4:   null, // require('./card_heart_4.png')
  heart_5:   null, // require('./card_heart_5.png')
  heart_6:   null, // require('./card_heart_6.png')
  heart_7:   null, // require('./card_heart_7.png')
  heart_8:   null, // require('./card_heart_8.png')
  heart_9:   null, // require('./card_heart_9.png')
  heart_10:  null, // require('./card_heart_10.png')
  heart_j:   null, // require('./card_heart_j.png')
  heart_q:   null, // require('./card_heart_q.png')
  heart_k:   null, // require('./card_heart_k.png')

  // ── Diamonds
  diamond_a:  null, // require('./card_diamond_a.png')
  diamond_2:  null, // require('./card_diamond_2.png')
  diamond_3:  null, // require('./card_diamond_3.png')
  diamond_4:  null, // require('./card_diamond_4.png')
  diamond_5:  null, // require('./card_diamond_5.png')
  diamond_6:  null, // require('./card_diamond_6.png')
  diamond_7:  null, // require('./card_diamond_7.png')
  diamond_8:  null, // require('./card_diamond_8.png')
  diamond_9:  null, // require('./card_diamond_9.png')
  diamond_10: null, // require('./card_diamond_10.png')
  diamond_j:  null, // require('./card_diamond_j.png')
  diamond_q:  null, // require('./card_diamond_q.png')
  diamond_k:  null, // require('./card_diamond_k.png')

  // ── Clubs
  club_a:   null, // require('./card_club_a.png')
  club_2:   null, // require('./card_club_2.png')
  club_3:   null, // require('./card_club_3.png')
  club_4:   null, // require('./card_club_4.png')
  club_5:   null, // require('./card_club_5.png')
  club_6:   null, // require('./card_club_6.png')
  club_7:   null, // require('./card_club_7.png')
  club_8:   null, // require('./card_club_8.png')
  club_9:   null, // require('./card_club_9.png')
  club_10:  null, // require('./card_club_10.png')
  club_j:   null, // require('./card_club_j.png')
  club_q:   null, // require('./card_club_q.png')
  club_k:   null, // require('./card_club_k.png')
}

// ── CARD BACKS — bundled (default) + CDN skins
// card_back_default.png → bundled ใน App
// card_back_thai/cyberpunk/hologram/gold.png → CDN (800 Token ต่อชิ้น)
export const CARD_BACK_IMAGES: Record<string, ImageSource> = {
  default:    null, // require('./card_back_default.png')   ← 🔴 Critical — ต้องมีก่อน launch
  thai:       null, // CDN: card_back_thai.png
  cyberpunk:  null, // CDN: card_back_cyberpunk.png
  hologram:   null, // CDN: card_back_hologram.png
  gold:       null, // CDN: card_back_gold.png
}

// ── ITEM ICONS — 17 items × 4 states = 68 ไฟล์ (Sprint 6)
// Pattern: item_[item_key]_[state].png
// states: enabled, disabled, locked, empty
// ขนาด: 96×96 px (@2x: 192×192 px) — ตาม AssetNaming Spec §7.5
type ItemState = 'enabled' | 'disabled' | 'locked' | 'empty'
type ItemImageMap = Record<ItemState, ImageSource>

export const ITEM_IMAGES: Record<string, ItemImageMap> = {
  // ── Competitive Items
  eye_of_demon: {
    enabled:  null, // require('./item_eye_of_demon_enabled.png')
    disabled: null, // require('./item_eye_of_demon_disabled.png')
    locked:   null, // require('./item_eye_of_demon_locked.png')
    empty:    null, // require('./item_eye_of_demon_empty.png')
  },
  oracles_vision: {
    enabled:  null, // require('./item_oracles_vision_enabled.png')
    disabled: null, // require('./item_oracles_vision_disabled.png')
    locked:   null, // require('./item_oracles_vision_locked.png')
    empty:    null, // require('./item_oracles_vision_empty.png')
  },
  chrono_shard: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  shadow_bid: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  alliance_of_fate: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  streak_shield: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  alchemists_swap: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  thiefs_glance: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  memory_sigil: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  fortunes_spin: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },

  // ── Fun / Gesture Items
  hourglass_shatter: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  serpents_bluff: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  aegis_of_will: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  jesters_wink: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  heartbeat: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  rose_toss: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
  blown_kiss: {
    enabled:  null, disabled: null, locked: null, empty: null,
  },
}

// ── CHIPS & TOKEN COIN
// ขนาด Chip: 120×120 px | Token coin: 64×64 px
export const CHIP_IMAGES: Record<string, ImageSource> = {
  default:   null, // require('../chips/chip_default.png')   ← 🔴 Critical
  pro:       null, // require('../chips/chip_pro.png')
  boss:      null, // require('../chips/chip_boss.png')
  last_boss: null, // require('../chips/chip_last_boss.png')
}

export const TOKEN_COIN_IMAGE: ImageSource = null
// require('../chips/token_coin.png')  ← 🔴 Critical

// ── AVATAR FRAMES
// ขนาด: 256×256 px (@2x: 512×512 px) — รูปแบบวงกลม overlay
export const FRAME_IMAGES: Record<string, ImageSource> = {
  default:       null, // require('../frames/frame_default.png')  ← bundled
  gold:          null, // require('../frames/frame_gold.png')
  diamond:       null, // require('../frames/frame_diamond.png')
  fire:          null, // require('../frames/frame_fire.png')
  ice:           null, // require('../frames/frame_ice.png')
  founder_badge: null, // require('../frames/frame_founder_badge.png')
  last_boss:     null, // require('../frames/frame_last_boss.png')
}

// ── HELPER: ดึง card image จาก suit + value
export function getCardImage(suit: string, value: string): ImageSource {
  const key = `${suit}_${value}`
  return CARD_IMAGES[key] ?? null
}

// ── HELPER: ดึง item image ตาม key + state
export function getItemImage(itemKey: string, state: ItemState): ImageSource {
  return ITEM_IMAGES[itemKey]?.[state] ?? null
}

// ── HELPER: ดึง card back ตาม skin ที่ user เลือก
export function getCardBackImage(skin: string = 'default'): ImageSource {
  return CARD_BACK_IMAGES[skin] ?? CARD_BACK_IMAGES.default ?? null
}

// ── CHECKLIST สำหรับ Artist (Sprint 6 Priority)
/*
🔴 Critical — ต้องมีก่อน Launch:
  card_spade_a.png → card_club_k.png   (52 ไฟล์)
  card_back_default.png                (1 ไฟล์)
  chip_default/pro/boss/last_boss.png  (4 ไฟล์)
  token_coin.png                       (1 ไฟล์)
  frame_default.png                    (1 ไฟล์)

🟠 High — Sprint 6 (Item System):
  item_[key]_[state].png               (68 ไฟล์ = 17 items × 4 states)
  frame_gold/diamond/fire/ice.png      (4 ไฟล์)
  frame_founder_badge.png              (1 ไฟล์)

🟡 Medium — Sprint 7+ (Cosmetics):
  card_back_thai/cyberpunk/hologram/gold.png  (4 ไฟล์ — CDN)
  table themes                                (CDN)
  frame_last_boss.png                         (1 ไฟล์)
*/
