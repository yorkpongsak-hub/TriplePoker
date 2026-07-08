// ANIMATION_MANIFEST.ts
// Animations Asset Manifest — Lottie JSON map สำหรับ effects ทั้งหมด
// ใช้กับ lottie-react-native (react-native-reanimated 3)
// Format: .json (Lottie) — Scalable, ขนาดเล็ก
// ตาม AssetNaming Spec §6 + ItemGraphic Spec §3

// ── ประเภทของ Lottie source
type LottieSource = ReturnType<typeof require> | null

// ── Animation Level (ตาม ItemGraphic Spec §3)
// Level 1: Full-screen effect (overlay ทับหน้าจอชั่วคราว)
// Level 2: HUD/Seat area effect (เฉพาะพื้นที่เล็ก)
export type AnimationLevel = 1 | 2

// ── Animation metadata
export interface AnimationMeta {
  source:    LottieSource
  durationMs: number   // ระยะเวลา animation (ms)
  level:     AnimationLevel
  loop:      boolean
}

// ────────────────────────────────────────────────────────────
// LEVEL 1 — Full-screen Item Effects
// ────────────────────────────────────────────────────────────

// Eye of the Demon — Gold + Dark Red Particles (2.5 วิ)
const FX_ITEM_EYE_OF_DEMON: AnimationMeta = {
  source:     null, // require('./fx_item_eye_of_demon.json')
  durationMs: 2500,
  level:      1,
  loop:       false,
}

// Oracle's Vision — Teal Glow + Fog (1.5 วิ)
const FX_ITEM_ORACLES_VISION: AnimationMeta = {
  source:     null, // require('./fx_item_oracles_vision.json')
  durationMs: 1500,
  level:      1,
  loop:       false,
}

// Chrono Shard — Purple + Clock Shatter (2.0 วิ)
const FX_ITEM_CHRONO_SHARD: AnimationMeta = {
  source:     null, // require('./fx_item_chrono_shard.json')
  durationMs: 2000,
  level:      1,
  loop:       false,
}

// Fortune's Spin — Orange + Gold Coins (3.0 วิ)
const FX_ITEM_FORTUNES_SPIN: AnimationMeta = {
  source:     null, // require('./fx_item_fortunes_spin.json')
  durationMs: 3000,
  level:      1,
  loop:       false,
}

// Hourglass Shatter — Red + Sand Particles (1.5 วิ)
const FX_ITEM_HOURGLASS_SHATTER: AnimationMeta = {
  source:     null, // require('./fx_item_hourglass_shatter.json')
  durationMs: 1500,
  level:      1,
  loop:       false,
}

// Serpent's Bluff — Dark Green + Snake Shadow (1.0 วิ)
const FX_ITEM_SERPENTS_BLUFF: AnimationMeta = {
  source:     null, // require('./fx_item_serpents_bluff.json')
  durationMs: 1000,
  level:      1,
  loop:       false,
}

// ────────────────────────────────────────────────────────────
// LEVEL 2 — HUD / Seat Area Effects
// ────────────────────────────────────────────────────────────

// Shadow Bid — Icon pulse สีจาง
const FX_ITEM_SHADOW_BID: AnimationMeta = {
  source:     null, // require('./fx_item_shadow_bid.json')
  durationMs: 600,
  level:      2,
  loop:       false,
}

// Alliance of Fate — Beam เชื่อมระหว่าง Seat
const FX_ITEM_ALLIANCE_BEAM: AnimationMeta = {
  source:     null, // require('./fx_item_alliance_beam.json')
  durationMs: 1000,
  level:      2,
  loop:       false,
}

// Streak Shield — Green glow รอบ Avatar
const FX_ITEM_STREAK_SHIELD: AnimationMeta = {
  source:     null, // require('./fx_item_streak_shield.json')
  durationMs: 800,
  level:      2,
  loop:       false,
}

// The Alchemist's Swap — Swap animation ระหว่าง Seat
const FX_ITEM_SWAP_ANIM: AnimationMeta = {
  source:     null, // require('./fx_item_swap_anim.json')
  durationMs: 1200,
  level:      2,
  loop:       false,
}

// Thief's Glance — Eye icon blink + Glow
const FX_ITEM_PEEK_EYE: AnimationMeta = {
  source:     null, // require('./fx_item_peek_eye.json')
  durationMs: 700,
  level:      2,
  loop:       false,
}

// Memory Sigil — Log overlay popup
const FX_ITEM_MEMORY_LOG: AnimationMeta = {
  source:     null, // require('./fx_item_memory_log.json')
  durationMs: 500,
  level:      2,
  loop:       false,
}

// Aegis of Will — Shield animation รอบ Seat
const FX_ITEM_AEGIS_SHIELD: AnimationMeta = {
  source:     null, // require('./fx_item_aegis_shield.json')
  durationMs: 600,
  level:      2,
  loop:       false,
}

// Jester's Wink — HUD icon กระพริบ (3 วิ)
const FX_ITEM_JESTER_WINK: AnimationMeta = {
  source:     null, // require('./fx_item_jester_wink.json')
  durationMs: 3000,
  level:      2,
  loop:       false,
}

// Heartbeat — Floating animation ข้ามโต๊ะ
const FX_ITEM_HEARTBEAT: AnimationMeta = {
  source:     null, // require('./fx_item_heartbeat.json')
  durationMs: 1500,
  level:      2,
  loop:       false,
}

// Rose Toss — กุหลาบแดงพุ่งข้ามโต๊ะ
const FX_ITEM_ROSE_TOSS: AnimationMeta = {
  source:     null, // require('./fx_item_rose_toss.json')
  durationMs: 1500,
  level:      2,
  loop:       false,
}

// Blown Kiss — จูบ + ดาวกระจายรอบเป้าหมาย
const FX_ITEM_BLOWN_KISS: AnimationMeta = {
  source:     null, // require('./fx_item_blown_kiss.json')
  durationMs: 1500,
  level:      2,
  loop:       false,
}

// ────────────────────────────────────────────────────────────
// WIN / ENTRY FX (Cosmetic)
// ────────────────────────────────────────────────────────────

const FX_WIN_COINS: AnimationMeta = {
  source:     null, // require('./fx_win_coins.json')   ← default Win FX
  durationMs: 2000,
  level:      1,
  loop:       false,
}

const FX_WIN_FLOWERS: AnimationMeta = {
  source:     null, // require('./fx_win_flowers.json')
  durationMs: 2000,
  level:      1,
  loop:       false,
}

const FX_ENTRY_LIGHTNING: AnimationMeta = {
  source:     null, // require('./fx_entry_lightning.json')
  durationMs: 1500,
  level:      1,
  loop:       false,
}

const FX_ENTRY_FIREWORKS: AnimationMeta = {
  source:     null, // require('./fx_entry_fireworks.json')
  durationMs: 2000,
  level:      1,
  loop:       false,
}

// ────────────────────────────────────────────────────────────
// PROGRESSION FX
// ────────────────────────────────────────────────────────────

const FX_LEVEL_UP: AnimationMeta = {
  source:     null, // require('./fx_level_up.json')
  durationMs: 2500,
  level:      1,
  loop:       false,
}

const FX_TIER_UP: AnimationMeta = {
  source:     null, // require('./fx_tier_up.json')
  durationMs: 3000,
  level:      1,
  loop:       false,
}

const FX_ACHIEVEMENT_UNLOCK: AnimationMeta = {
  source:     null, // require('./fx_achievement_unlock.json')
  durationMs: 2000,
  level:      1,
  loop:       false,
}

// ────────────────────────────────────────────────────────────
// ROYAL FLUSH — Special (4.0 วิ)
// ────────────────────────────────────────────────────────────

const FX_ROYAL_FLUSH: AnimationMeta = {
  source:     null, // require('./fx_royal_flush.json')
  durationMs: 4000,
  level:      1,
  loop:       false,
}

// ────────────────────────────────────────────────────────────
// MASTER MAP — ใช้ key เพื่อเรียก animation
// ────────────────────────────────────────────────────────────

export const ANIMATIONS: Record<string, AnimationMeta> = {
  // Item FX Level 1
  'item.eye_of_demon':       FX_ITEM_EYE_OF_DEMON,
  'item.oracles_vision':     FX_ITEM_ORACLES_VISION,
  'item.chrono_shard':       FX_ITEM_CHRONO_SHARD,
  'item.fortunes_spin':      FX_ITEM_FORTUNES_SPIN,
  'item.hourglass_shatter':  FX_ITEM_HOURGLASS_SHATTER,
  'item.serpents_bluff':     FX_ITEM_SERPENTS_BLUFF,

  // Item FX Level 2
  'item.shadow_bid':         FX_ITEM_SHADOW_BID,
  'item.alliance_beam':      FX_ITEM_ALLIANCE_BEAM,
  'item.streak_shield':      FX_ITEM_STREAK_SHIELD,
  'item.swap_anim':          FX_ITEM_SWAP_ANIM,
  'item.peek_eye':           FX_ITEM_PEEK_EYE,
  'item.memory_log':         FX_ITEM_MEMORY_LOG,
  'item.aegis_shield':       FX_ITEM_AEGIS_SHIELD,
  'item.jester_wink':        FX_ITEM_JESTER_WINK,
  'item.heartbeat':          FX_ITEM_HEARTBEAT,
  'item.rose_toss':          FX_ITEM_ROSE_TOSS,
  'item.blown_kiss':         FX_ITEM_BLOWN_KISS,

  // Win / Entry FX
  'win.coins':               FX_WIN_COINS,
  'win.flowers':             FX_WIN_FLOWERS,
  'entry.lightning':         FX_ENTRY_LIGHTNING,
  'entry.fireworks':         FX_ENTRY_FIREWORKS,

  // Progression
  'progression.level_up':        FX_LEVEL_UP,
  'progression.tier_up':         FX_TIER_UP,
  'progression.achievement':     FX_ACHIEVEMENT_UNLOCK,

  // Special
  'special.royal_flush':     FX_ROYAL_FLUSH,
}

// ── HELPER: ดึง animation meta จาก key
export function getAnimation(key: string): AnimationMeta | null {
  return ANIMATIONS[key] ?? null
}

// ── HELPER: ดึง animation สำหรับ item key
// ใช้ตาม item key จาก itemPhaseController
export function getItemAnimation(itemKey: string): AnimationMeta | null {
  const mapping: Record<string, string> = {
    super_vision:     'item.eye_of_demon',
    vision:           'item.oracles_vision',
    chrono_shard:     'item.chrono_shard',
    free_sort:        'item.fortunes_spin',  // placeholder
    alliance_of_fate: 'item.alliance_beam',
    streak_shield:    'item.streak_shield',
    swap:             'item.swap_anim',
    auction_peek:     'item.peek_eye',
    recall:           'item.memory_log',
    auction_veil:     'item.shadow_bid',
    jesters_wink:     'item.jester_wink',
    aegis_of_will:    'item.aegis_shield',
    hourglass_shatter:'item.hourglass_shatter',
    serpents_bluff:   'item.serpents_bluff',
    heartbeat:        'item.heartbeat',
    rose_toss:        'item.rose_toss',
    blown_kiss:       'item.blown_kiss',
  }
  const animKey = mapping[itemKey]
  return animKey ? getAnimation(animKey) : null
}

// ── CHECKLIST สำหรับ Motion Designer
/*
🟠 High — Sprint 6 (Item System):
  fx_item_eye_of_demon.json         (2.5 วิ — Gold + Dark Red Particles)
  fx_item_oracles_vision.json       (1.5 วิ — Teal Glow + Fog)
  fx_item_chrono_shard.json         (2.0 วิ — Purple + Clock Shatter)
  fx_item_fortunes_spin.json        (3.0 วิ — Orange + Gold Coins)
  fx_item_hourglass_shatter.json    (1.5 วิ — Red + Sand Particles)
  fx_item_serpents_bluff.json       (1.0 วิ — Dark Green + Snake Shadow)
  fx_item_shadow_bid.json           (0.6 วิ — Icon pulse)
  fx_item_alliance_beam.json        (1.0 วิ — Beam ระหว่าง Seat)
  fx_item_streak_shield.json        (0.8 วิ — Green glow)
  fx_item_swap_anim.json            (1.2 วิ — Swap ระหว่าง Seat)
  fx_item_peek_eye.json             (0.7 วิ — Eye blink)
  fx_item_memory_log.json           (0.5 วิ — Log overlay)
  fx_item_aegis_shield.json         (0.6 วิ — Shield anim)
  fx_item_jester_wink.json          (3.0 วิ — HUD blink)
  fx_item_heartbeat.json            (1.5 วิ — Float cross table)
  fx_item_rose_toss.json            (1.5 วิ — Rose cross table)
  fx_item_blown_kiss.json           (1.5 วิ — Kiss + stars)
  fx_win_coins.json                 (2.0 วิ — เหรียญทอง default)

🟡 Medium — Sprint 7+:
  fx_win_flowers.json
  fx_entry_lightning.json
  fx_entry_fireworks.json
  fx_level_up.json
  fx_tier_up.json
  fx_achievement_unlock.json
  fx_royal_flush.json               (4.0 วิ — Full-screen Royal Flush)
*/
