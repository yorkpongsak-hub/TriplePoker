// BADGE_MANIFEST.ts — Badge Shop asset map (เขียนใหม่ทั้งไฟล์ 2026-08-15)
// เดิมเป็น auto-generated manifest 48 keys อ้างอิงไฟล์ที่ถูกลบไปเกือบหมดแล้ว (dead code — ไม่มีไฟล์
// ไหนใน codebase import BADGES/BadgeKey จากที่นี่เลย, require() หลายตัวจะพังตอน build) — เขียนใหม่
// ให้เหลือเฉพาะ 15 badge ที่มีไฟล์ภาพจริงตอนนี้ คีย์ตรงกับ BADGE_CATALOG (BadgeKey) ฝั่ง server ที่
// server/src/game/badgeConfig.ts เป๊ะ ใช้กับแท็บ BADGES ใน ShopScreen.tsx
//
// ไม่รวม: badge_ascendant_large.png (art variant ที่ใหญ่กว่า ยังไม่มีจุดใช้งาน — ไม่ใช่ badge อีกใบ)
// และ card_monarch_conquered.png (ใช้จริงอยู่แล้วใน MonarchConquestBanner.tsx ไม่ใช่ badge ร้านค้า)

export const BADGES = {
  initiate:              require('./badge_Initiate.png'),
  adept:                 require('./badge_adept.png'),
  mastermind:            require('./badge_mastermind.png'),
  highNoble:             require('./badge_highnoble.png'),
  grandmaster:           require('./badge_grandmaster.png'),
  ascendant:             require('./badge_ascendant.png'),

  golden_rookie:         require('./badge_golden_rookie.png'),
  dedicated:             require('./badge_dedicated.png'),
  top_10:                require('./badge_top_10.png'),
  crown_collector:       require('./badge_crown_collector.png'),
  triple_jackpot:        require('./badge_triple_jackpot.png'),
  high_roller:           require('./badge_high_roller.png'),
  monarch_slayer:        require('./badge_monarch_slayer.png'),
  arena_champion:        require('./badge_arena_champion.png'),
  royal_straight_flush:  require('./badge_royal_straight_flush.png'),
} as const

export type BadgeKey = keyof typeof BADGES
