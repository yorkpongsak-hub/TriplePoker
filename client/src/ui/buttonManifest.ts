// buttonManifest.ts — จุดเดียวที่ require() ภาพปุ่ม/พาเนล UI ทั้งหมดของโปรเจค
// Metro bundler ต้องการ require() แบบ static (ห้าม dynamic path) — ทุกจอห้าม require ภาพเหล่านี้ตรงๆ ให้ import จากไฟล์นี้เท่านั้น

// ─── Action Buttons (1536×1024 — ปุ่มกว้าง 3:2 สำหรับ Play / Ready / Auto Sort) ───
export const ACTION_BUTTON_IMAGES = {
  play_royal_flush: require('../../assets/ui/buttons/btn_play_royal_flush.png'),
  ready: require('../../assets/ui/buttons/btn_ready.png'),
  auto_sort: require('../../assets/ui/buttons/btn_auto_sort.png'),
} as const

export type ActionButtonName = keyof typeof ACTION_BUTTON_IMAGES

// ─── Menu Buttons (~313×313 — ปุ่มจัตุรัสเมนู/ไอคอน) ───
export const MENU_BUTTON_IMAGES = {
  achievements: require('../../assets/ui/buttons/btn_achievements.png'),
  battle: require('../../assets/ui/buttons/btn_battle.png'),
  daily_reward: require('../../assets/ui/buttons/btn_daily_reward.png'),
  events: require('../../assets/ui/buttons/btn_events.png'),
  exit: require('../../assets/ui/buttons/btn_exit.png'),
  friends: require('../../assets/ui/buttons/btn_friends.png'),
  hall_of_fame: require('../../assets/ui/buttons/btn_hall_of_fame.png'),
  lobby: require('../../assets/ui/buttons/btn_lobby.png'),
  mail: require('../../assets/ui/buttons/btn_mail.png'),
  profile: require('../../assets/ui/buttons/btn_profile.png'),
  quests: require('../../assets/ui/buttons/btn_quests.png'),
  ranking: require('../../assets/ui/buttons/btn_ranking.png'),
  rematch: require('../../assets/ui/buttons/btn_rematch.png'),
  settings: require('../../assets/ui/buttons/btn_settings.png'),
  shop: require('../../assets/ui/buttons/btn_shop.png'),
  treasure: require('../../assets/ui/buttons/btn_treasure.png'),
} as const

export type MenuButtonName = keyof typeof MENU_BUTTON_IMAGES

// ─── Panels ───
export const PANEL_IMAGES = {
  result_bg: require('../../assets/ui/panels/panel_result_bg.png'),
} as const

export type PanelName = keyof typeof PANEL_IMAGES
