# TriplePoker — Asset Naming & Management Spec
**Version:** 1.0  
**Project:** TriplePoker  
**Studio:** The Sage Unicorn Studio Co., Ltd.  
**Founder & Chief Architect:** Assistant Professor Pongnathee Maneekul  
**Updated:** May 2026
 
---
 
## 1. หลักการและกฎหลัก (Naming Convention Rules)
 
### 1.1 Pattern มาตรฐาน
```
[category]_[identifier]_[variant].[ext]
```
 
### 1.2 กฎที่ต้องปฏิบัติเสมอ
 
| กฎ | ถูก ✅ | ผิด ❌ |
|----|--------|--------|
| lowercase ทั้งหมด | `card_spade_a.png` | `Card_Spade_A.png` |
| ใช้ underscore `_` คั่น | `table_default.jpg` | `table-default.jpg` |
| ห้ามเว้นวรรค | `sfx_s1_deal_default.mp3` | `sfx s1 deal.mp3` |
| ห้ามอักขระพิเศษ | `item_eye_of_demon.png` | `item_eye-of-demon!.png` |
| ระบุ variant เสมอ | `card_back_default.png` | `card_back.png` |
 
### 1.3 Format ไฟล์ตามประเภท
 
| ประเภท | Format | เหตุผล |
|--------|--------|--------|
| ไพ่, UI icons, Items | `.png` | รองรับ transparency |
| Table background | `.jpg` | ขนาดไฟล์เล็กกว่า (ไม่ต้อง transparency) |
| SFX | `.mp3` | รองรับ iOS + Android |
| Animation / Effects | `.json` (Lottie) | Scalable, ขนาดเล็ก |
 
---
 
## 2. หมวด Cards (ไพ่)
 
### 2.1 โครงสร้างโฟลเดอร์
```
assets/cards/
├── card_[suit]_[value].png     ← หน้าไพ่ 52 ใบ
├── card_back_default.png       ← หลังไพ่ default (bundled)
└── card_back_[skin_key].png    ← หลังไพ่ตาม Card Skin ที่ซื้อ (CDN)
```
 
### 2.2 Suit Keys
 
| ชื่อ | Key |
|------|-----|
| โพดำ | `spade` |
| ใจแดง | `heart` |
| ข้าวหลามตัด | `diamond` |
| ดอกจิก | `club` |
 
### 2.3 Value Keys
 
| ไพ่ | Key |
|-----|-----|
| Ace | `a` |
| 2–10 | `2` `3` `4` `5` `6` `7` `8` `9` `10` |
| Jack | `j` |
| Queen | `q` |
| King | `k` |
 
### 2.4 รายชื่อไฟล์ครบทั้ง 52 ใบ
```
card_spade_a.png      card_heart_a.png      card_diamond_a.png      card_club_a.png
card_spade_2.png      card_heart_2.png      card_diamond_2.png      card_club_2.png
card_spade_3.png      card_heart_3.png      card_diamond_3.png      card_club_3.png
card_spade_4.png      card_heart_4.png      card_diamond_4.png      card_club_4.png
card_spade_5.png      card_heart_5.png      card_diamond_5.png      card_club_5.png
card_spade_6.png      card_heart_6.png      card_diamond_6.png      card_club_6.png
card_spade_7.png      card_heart_7.png      card_diamond_7.png      card_club_7.png
card_spade_8.png      card_heart_8.png      card_diamond_8.png      card_club_8.png
card_spade_9.png      card_heart_9.png      card_diamond_9.png      card_club_9.png
card_spade_10.png     card_heart_10.png     card_diamond_10.png     card_club_10.png
card_spade_j.png      card_heart_j.png      card_diamond_j.png      card_club_j.png
card_spade_q.png      card_heart_q.png      card_diamond_q.png      card_club_q.png
card_spade_k.png      card_heart_k.png      card_diamond_k.png      card_club_k.png
```
 
### 2.5 หลังไพ่ (Card Back)
```
card_back_default.png         ← bundled ใน App
card_back_thai.png            ← CDN (Card Skin: Thai, 800 Token)
card_back_cyberpunk.png       ← CDN (Card Skin: Cyberpunk, 800 Token)
card_back_hologram.png        ← CDN (Card Skin: Hologram, 800 Token)
card_back_gold.png            ← CDN (Card Skin: Gold, 800 Token)
```
 
### 2.6 ขนาด Asset ที่แนะนำ
- หน้าไพ่: **180 × 252 px** (@2x: 360 × 504 px)
- หลังไพ่: **180 × 252 px** (@2x: 360 × 504 px)
---
 
## 3. หมวด Table Background (ฉากหลังโต๊ะ)
 
### 3.1 โครงสร้างโฟลเดอร์
```
assets/tables/                        ← bundled (default เท่านั้น)
CDN: /tables/                         ← themes + seasonal ทั้งหมด
├── table_default.jpg
├── table_[theme_key].jpg
└── table_[theme_key]_[season_key].jpg
```
 
### 3.2 Theme Keys (Cosmetic — Table Theme, 1,200 Token)
 
| ชื่อ Theme | Key |
|-----------|-----|
| Default (ฟรี) | `default` |
| Thai | `thai` |
| Cyberpunk | `cyberpunk` |
| Hologram | `hologram` |
| Gold | `gold` |
 
### 3.3 Season Keys (CDN — เปิด/ปิดผ่าน gameConfig)
 
| เทศกาล | Key | ช่วงเวลา |
|--------|-----|---------|
| ตรุษจีน | `lunar_new_year` | ก.พ. |
| สงกรานต์ | `songkran` | เม.ย. |
| Halloween | `halloween` | ต.ค. |
| ปลายปี | `year_end` | พ.ย.–ธ.ค. |
 
### 3.4 รายชื่อไฟล์ทั้งหมด
```
— Bundled ใน App —
table_default.jpg
 
— CDN: Themes (ดาวน์โหลดเมื่อซื้อ) —
table_thai.jpg
table_cyberpunk.jpg
table_hologram.jpg
table_gold.jpg
 
— CDN: Seasonal Override (เปิดอัตโนมัติตาม gameConfig) —
table_default_lunar_new_year.jpg
table_default_songkran.jpg
table_default_halloween.jpg
table_default_year_end.jpg
 
table_thai_songkran.jpg           ← Theme ซื้อแล้ว + เทศกาลพิเศษ
table_gold_lunar_new_year.jpg
table_cyberpunk_halloween.jpg
```
 
### 3.5 ขนาด Asset ที่แนะนำ
- **1080 × 1920 px** (Portrait Full HD) หรือ **1284 × 2778 px** (iPhone Pro Max)
---
 
## 4. หมวด Chip / Token
 
### 4.1 โครงสร้างโฟลเดอร์
```
assets/chips/
├── chip_[tier].png         ← Chip ตาม Tier
└── token_coin.png          ← Token icon ใน HUD
```
 
### 4.2 รายชื่อไฟล์
```
chip_default.png             ← bundled — ใช้ใน Beginner
chip_pro.png                 ← bundled — ใช้ใน Pro Tier
chip_boss.png                ← bundled — ใช้ใน Boss Tier
chip_last_boss.png           ← bundled — ใช้ใน Last Boss Tier
token_coin.png               ← bundled — แสดงใน HUD ทุกที่
token_coin_lunar_new_year.png  ← CDN Seasonal (เหรียญทอง ตรุษจีน)
```
 
### 4.3 ขนาด Asset ที่แนะนำ
- Chip: **120 × 120 px** (@2x: 240 × 240 px)
- Token coin: **64 × 64 px** (@2x: 128 × 128 px)
---
 
## 5. หมวด SFX (เสียง)
 
### 5.1 โครงสร้างโฟลเดอร์
```
assets/sounds/
├── sfx_[code]_[variant]_[pack].mp3
```
 
### 5.2 รายชื่อไฟล์ครบทั้งหมด
```
— S1: ไพ่แจก —
sfx_s1_deal_default.mp3
sfx_s1_deal_thai.mp3          ← Sound Pack: Thai (600 Token)
sfx_s1_deal_cyberpunk.mp3     ← Sound Pack: Cyberpunk (600 Token)
 
— S2: ไพ่พลิก / หงาย —
sfx_s2_flip_default.mp3
sfx_s2_flip_thai.mp3
sfx_s2_flip_cyberpunk.mp3
 
— S3: ไพ่คว่ำ —
sfx_s3_slap_default.mp3
sfx_s3_slap_thai.mp3
sfx_s3_slap_cyberpunk.mp3
 
— S4: Token ไหลเข้า Pot —
sfx_s4_token_default.mp3
sfx_s4_token_thai.mp3
sfx_s4_token_cyberpunk.mp3
 
— S5: ชนะ Pot —
sfx_s5_win_default.mp3
sfx_s5_win_pile3_default.mp3  ← Pile 3 ดังกว่า (ใหญ่กว่า)
sfx_s5_win_thai.mp3
sfx_s5_win_pile3_thai.mp3
sfx_s5_win_cyberpunk.mp3
sfx_s5_win_pile3_cyberpunk.mp3
 
— S6: Countdown Timer —
sfx_s6_tick_slow.mp3          ← เหลือ 30% (1 ครั้ง/วิ)
sfx_s6_tick_fast.mp3          ← เหลือ 10% (3 ครั้ง/วิ)
sfx_s6_buzz.mp3               ← หมดเวลา
 
— S7: Foul / Error —
sfx_s7_foul.mp3
 
— S8: Full-screen Item FX —
sfx_s8_eye_of_demon.mp3
sfx_s8_oracles_vision.mp3
sfx_s8_chrono_shard.mp3
sfx_s8_fortunes_spin.mp3
sfx_s8_hourglass_shatter.mp3
sfx_s8_serpents_bluff.mp3
 
— S9: Royal Flush Special —
sfx_s9_royal_flush.mp3
```
 
> **หมายเหตุ:** S6–S9 ใช้ Default เท่านั้น — Sound Pack แทนได้เฉพาะ S1–S5
 
### 5.3 Loading Strategy
 
| กลุ่ม | วิธีโหลด |
|-------|---------|
| S1–S7 (default pack) | Preload ตั้งแต่เข้าโต๊ะ |
| S8, S9 | Lazy load (โหลดเมื่อต้องใช้) |
| Sound Pack ที่ซื้อ | Download ครั้งเดียว → cache ในอุปกรณ์ |
 
---
 
## 6. หมวด Animation / Effects (Lottie)
 
### 6.1 โครงสร้างโฟลเดอร์
```
assets/animations/
├── fx_[effect_key].json
```
 
### 6.2 รายชื่อไฟล์
```
— Win / Entry FX (Cosmetic ซื้อได้) —
fx_win_coins.json              ← Win FX default: เหรียญทอง
fx_win_flowers.json            ← Win FX: ดอกไม้ร่วง (1,000 Token)
fx_entry_lightning.json        ← Entry FX: สายฟ้า (1,500 Token)
fx_entry_fireworks.json        ← Entry FX: ดอกไม้ไฟ (1,500 Token)
 
— Royal Flush —
fx_royal_flush.json            ← Full-screen particle effect (4 วิ)
 
— Item Effects (Full-screen Level 1) —
fx_item_eye_of_demon.json      ← Gold + Dark Red Particles (2.5 วิ)
fx_item_oracles_vision.json    ← Teal Glow + Fog (1.5 วิ)
fx_item_chrono_shard.json      ← Purple + Clock Shatter (2.0 วิ)
fx_item_fortunes_spin.json     ← Orange + Gold Coins (3.0 วิ)
fx_item_hourglass_shatter.json ← Red + Sand Particles (1.5 วิ)
fx_item_serpents_bluff.json    ← Dark Green + Snake Shadow (1.0 วิ)
 
— Item Effects (HUD/Seat Level 2) —
fx_item_streak_shield.json     ← Green glow รอบ Avatar
fx_item_alliance_beam.json     ← Beam เชื่อมระหว่าง Seat
fx_item_swap_anim.json         ← Swap animation ระหว่าง Seat
fx_item_shadow_bid.json        ← Icon pulse สีจาง
fx_item_peek_eye.json          ← Eye icon blink + Glow
fx_item_memory_log.json        ← Log overlay popup
fx_item_aegis_shield.json      ← Shield animation รอบ Seat
fx_item_jester_wink.json       ← HUD icon กระพริบ
fx_item_heartbeat.json         ← Floating animation ข้ามโต๊ะ
fx_item_rose_toss.json
fx_item_blown_kiss.json
 
— Progression —
fx_level_up.json               ← Level Up celebration
fx_tier_up.json                ← Tier Up celebration
fx_achievement_unlock.json     ← Achievement popup
```
 
---
 
## 7. หมวด Item Icons
 
### 7.1 โครงสร้างโฟลเดอร์
```
assets/items/
├── item_[item_key]_[state].png
```
 
### 7.2 State Keys
 
| State | Key | ลักษณะ |
|-------|-----|--------|
| ใช้งานได้ | `enabled` | สีเต็ม, ชัดเจน |
| ใช้งานไม่ได้ | `disabled` | สีจาง 40% |
| ล็อค | `locked` | สีจาง + icon กากบาท |
| Stock = 0 | `empty` | สีจางมาก + แสดง "0" |
 
### 7.3 Item Keys ทั้งหมด
 
| หมวด | Item | Key |
|------|------|-----|
| Competitive | Eye of the Demon | `eye_of_demon` |
| Competitive | Oracle's Vision | `oracles_vision` |
| Competitive | Chrono Shard | `chrono_shard` |
| Competitive | Fortune's Spin | `fortunes_spin` |
| Competitive | Hourglass Shatter | `hourglass_shatter` |
| Competitive | Serpent's Bluff | `serpents_bluff` |
| Competitive | Shadow Bid | `shadow_bid` |
| Competitive | Alliance of Fate | `alliance_of_fate` |
| Competitive | Streak Shield | `streak_shield` |
| Competitive | The Alchemist's Swap | `alchemists_swap` |
| Fun | Thief's Glance | `thiefs_glance` |
| Fun | Memory Sigil | `memory_sigil` |
| Fun | Aegis of Will | `aegis_of_will` |
| Fun | Jester's Wink | `jesters_wink` |
| Fun | Heartbeat | `heartbeat` |
| Fun | Rose Toss | `rose_toss` |
| Fun | Blown Kiss | `blown_kiss` |
 
### 7.4 ตัวอย่างชื่อไฟล์ครบ 4 states (1 Item)
```
item_eye_of_demon_enabled.png
item_eye_of_demon_disabled.png
item_eye_of_demon_locked.png
item_eye_of_demon_empty.png
```
> ต้องทำครบทุก Item × 4 states = **68 ไฟล์**
 
### 7.5 ขนาด Asset ที่แนะนำ
- **96 × 96 px** (@2x: 192 × 192 px)
---
 
## 8. หมวด Avatar Frame
 
### 8.1 โครงสร้างโฟลเดอร์
```
assets/frames/
├── frame_[variant].png
```
 
### 8.2 รายชื่อไฟล์
```
frame_default.png               ← bundled — กรอบเริ่มต้น (ฟรี)
frame_gold.png                  ← Avatar Frame: Gold (500 Token)
frame_diamond.png               ← Avatar Frame: Diamond (500 Token)
frame_fire.png                  ← Avatar Frame: Fire (500 Token)
frame_ice.png                   ← Avatar Frame: Ice (500 Token)
frame_founder_badge.png         ← Founder's Badge (พิเศษ ไม่ขาย)
frame_last_boss.png             ← สำหรับ The Last Boss เท่านั้น
```
 
### 8.3 ขนาด Asset ที่แนะนำ
- **256 × 256 px** (@2x: 512 × 512 px) — รูปแบบวงกลม overlay
---
 
## 9. วิธีที่ App เรียกใช้ Asset
 
### 9.1 Local Asset — ฝังใน Bundle
 
```typescript
// ✅ ใช้สำหรับ Asset ที่ bundled (ไพ่, default chip, default SFX)
// React Native ต้องใช้ static require — ไม่รองรับ dynamic string
 
// การ์ด
const cardImage = require(`../assets/cards/card_spade_a.png`);
 
// วิธีที่ถูกต้องสำหรับ dynamic card ใน React Native
const CARD_IMAGES: Record<string, any> = {
  'spade_a':   require('../assets/cards/card_spade_a.png'),
  'spade_2':   require('../assets/cards/card_spade_2.png'),
  // ... ครบ 52 ใบ
};
const getCardImage = (suit: string, value: string) =>
  CARD_IMAGES[`${suit}_${value}`];
```
 
### 9.2 Remote Asset — CDN
 
```typescript
// ✅ ใช้สำหรับ Table Theme, Seasonal, Sound Pack, Card Skin (ซื้อจาก CDN)
import { gameConfig } from '../config/gameConfig';
 
// แปลง key → URL
const getRemoteAsset = (category: string, key: string): string => {
  return `${gameConfig.assets.cdn_base_url}/${category}/${key}`;
};
 
// ตัวอย่างใช้งาน
const tableBg = getRemoteAsset('tables', `table_${gameConfig.assets.seasonal_theme}.jpg`);
const cardBack = getRemoteAsset('cards', `card_back_${userProfile.card_skin}.png`);
```
 
### 9.3 Sound Pack Resolver
 
```typescript
// ✅ เลือก SFX ตาม pack ที่ผู้เล่นใช้
const SOUND_PACK_LOCAL: Record<string, any> = {
  'sfx_s1_deal_default': require('../assets/sounds/sfx_s1_deal_default.mp3'),
  'sfx_s2_flip_default': require('../assets/sounds/sfx_s2_flip_default.mp3'),
  // ... ต่อครบทุก SFX
};
 
const getSoundAsset = (code: string, pack: string = 'default') => {
  const key = `sfx_${code}_${pack}`;
  // ถ้า pack = default → ใช้ local bundle
  if (pack === 'default') return SOUND_PACK_LOCAL[key];
  // ถ้า pack อื่น → ใช้ cached URI จาก CDN download
  return getCachedSoundUri(key);
};
```
 
---
 
## 10. gameConfig.ts — Assets Block
 
```typescript
// server/src/config/gameConfig.ts
// หมวด assets — ควบคุมได้จาก server ไม่ต้อง redeploy
 
assets: {
  cdn_base_url: "https://cdn.triplepoker.app",
 
  // ── Seasonal Theme ──────────────────────────────────────────────
  // เปลี่ยน key นี้จาก server เพื่อเปิด seasonal asset อัตโนมัติ
  // ค่าที่ใช้ได้: "default" | "lunar_new_year" | "songkran"
  //              | "halloween" | "year_end"
  seasonal_theme:  "default",
  seasonal_active: false,
  seasonal_start:  "2027-04-10",   // ISO date
  seasonal_end:    "2027-04-17",
 
  // ── Asset Versions (cache busting) ──────────────────────────────
  // เพิ่ม version เมื่ออัพเดท asset บน CDN
  // App จะ re-download ถ้า version ไม่ตรงกับ cached
  asset_version: {
    tables:     "1.0.0",
    cards:      "1.0.0",
    items:      "1.0.0",
    animations: "1.0.0",
    sounds:     "1.0.0",
  },
 
  // ── Feature Flags สำหรับ Asset ──────────────────────────────────
  enable_seasonal_chip:  false,  // เปิด token_coin seasonal
  enable_seasonal_sound: false,  // เปิด SFX seasonal (อนาคต)
}
```
 
---
 
## 11. Artist Checklist — ไฟล์ที่ต้องส่ง
 
### Phase 1: Sprint 3 (Day 1 — ต้องมีก่อน Launch)
 
| ไฟล์ | จำนวน | Priority |
|------|--------|----------|
| `card_[suit]_[value].png` | 52 | 🔴 Critical |
| `card_back_default.png` | 1 | 🔴 Critical |
| `table_default.jpg` | 1 | 🔴 Critical |
| `chip_default.png` `chip_pro.png` `chip_boss.png` `chip_last_boss.png` | 4 | 🔴 Critical |
| `token_coin.png` | 1 | 🔴 Critical |
| `frame_default.png` | 1 | 🔴 Critical |
 
### Phase 2: Sprint 6 (Item System)
 
| ไฟล์ | จำนวน | Priority |
|------|--------|----------|
| `item_[key]_[state].png` (17 items × 4 states) | 68 | 🟠 High |
| `frame_gold/diamond/fire/ice.png` | 4 | 🟠 High |
| `frame_founder_badge.png` | 1 | 🟠 High |
| `frame_last_boss.png` | 1 | 🟡 Medium |
 
### Phase 3: Sprint 7+ (Cosmetics & Seasonal)
 
| ไฟล์ | จำนวน | Priority |
|------|--------|----------|
| `table_[theme_key].jpg` (4 themes) | 4 | 🟡 Medium |
| `card_back_[skin_key].png` (4 skins) | 4 | 🟡 Medium |
| Seasonal tables (4 เทศกาล) | 4+ | 🟡 Medium |
| `token_coin_lunar_new_year.png` | 1 | 🟡 Medium |
 
---
 
## 12. CDN Folder Structure
 
```
cdn.triplepoker.app/
├── tables/
│   ├── table_default.jpg
│   ├── table_thai.jpg
│   ├── table_cyberpunk.jpg
│   ├── table_default_songkran.jpg
│   └── ...
├── cards/
│   ├── card_back_thai.png
│   ├── card_back_cyberpunk.png
│   └── ...
├── animations/
│   ├── fx_win_flowers.json
│   ├── fx_entry_lightning.json
│   └── ...
├── sounds/
│   ├── sfx_s1_deal_thai.mp3
│   ├── sfx_s1_deal_cyberpunk.mp3
│   └── ...
└── chips/
    └── token_coin_lunar_new_year.png
```
 
---
 
*TriplePoker Asset Naming & Management Spec v1.0 — The Sage Unicorn Studio Co., Ltd.*  
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
 