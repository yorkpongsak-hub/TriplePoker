# TriplePoker — Sprint Progress Report
**The Sage Unicorn Studio Co., Ltd.**
**Founder & Chief Architect:** Assistant Professor Pongnathee Maneekul
**Updated:** June 18, 2026
 
---
 
> ### ⚡ MVP Pivot — May 28, 2026
> **เป้าหมายใหม่:** รายได้เสริม 10,000–30,000 บาท/เดือน (Android Only)
> **Platform:** Android Only (iOS เลื่อนไปหลัง launch)
> **Launch Target:** ~~January 2027~~ → **October 2026** 🚀
> **สิ่งที่ตัดออก:** XP/Leveling · Last Boss UI · Social Layer · Push Notifications · Lottie JSON
> **สิ่งที่เลื่อน:** ทุกอย่างที่ตัดออก → **v1.1** หลัง DAU ดีแล้ว
 
> ### 🎮 Tier Redesign — June 18, 2026
> **Tier Structure ใหม่ 5 ระดับ** (แทนที่ Beginner/Pro/Boss/Last Boss เดิม)
> Initiate (100–9,999) · Adept (10,000–39,999) · Mastermind (40,000–99,999) · High Noble (100,000+) · The Last Boss (ตามเงื่อนไข)
> **Blind Auction** ปลดล็อกที่ Mastermind (เดิม Pro) · **Ante/Pot** ปรับใหม่ทุก Tier
> **Triple Sweep Jackpot** — ชนะ 3 กองในรอบเดียว = Pot ×2, Rake 10%, Penalty หาร 3 (ใช้ทุก Tier)
> อัปเดตใน `CoreRules_v1_2.md` · ต้อง patch `gameConfig.ts` ก่อน Sprint 7
 
---
**สถานะ: DONE**
 
| ไฟล์ | หมายเหตุ |
|---|---|
| `supabase.ts` | Supabase client |
| `routes/auth.ts` | Google + **Apple** OAuth ✏️ (เปลี่ยนจาก Facebook) |
| `utils/nameValidator.ts` | validateDisplayName() 3-layer ⭐ Backport จาก Sprint 8 |
| `models/user.ts` | User model + `display_name` + `avatar_config` ✏️ |
| `001_initial_schema.sql` | DB Schema ทุกตาราง |
 
---
 
## ✅ Sprint 2 — Config & API Foundation
**สถานะ: DONE**
 
| ไฟล์ | หมายเหตุ |
|---|---|
| `gameConfig.ts` | Config-driven ทั้งระบบ · v1.2: เพิ่ม `aiConfig` + `dde_mcts` |
| `redis.ts` | Upstash Redis |
| `seasonConfig.ts` | Season config |
| `token.ts` | Token model |
 
---
 
## ✅ Sprint 3 — Core Game Engine + Game Table UI
**สถานะ: DONE | Tests: 20/20 ✅**
 
**Backend:** `deck.ts` · `cardEngine.ts` · `handEvaluator.ts` · `foulChecker.ts` · `gameRoom.ts` · `gameSocket.ts`
 
**Frontend:** `AppNavigator.tsx` · `GameTable.tsx` · `Card.tsx` · `ArrangementPhase.tsx`
 
---
 
## ✅ Sprint 4 — Full Game Flow
**สถานะ: DONE | Tests: 35/35 ✅**
 
**Backend:** `pileResolution.ts` · `blindAuction.ts` · `grandFinale.ts` · `endOfMatch.ts` · `routes/user.ts` · `gameSocket.ts` (update)
 
**Frontend (20 ไฟล์):** `PileReveal.tsx` · `FogOfWar.tsx` · `PreAuctionScore.tsx` · `AuctionOverlay.tsx` · `DiscardPhase.tsx` · `GrandFinale.tsx` · `EndOfMatch.tsx` · store/ · hooks/ · services/ · constants/ · types/
 
**Patch (Sprint 5):**
- `pileResolution.ts` — เพิ่ม exported functions: `calcPot`, `resolvePile`, `getTierByToken`, `buildTokenUpdates`
- `blindAuction.ts` — เพิ่ม exported functions: `isAuctionEnabled`, `startBlindAuction`, `submitBid`, `resolveBlindAuction`, `submitTeamSignal`, `getAuctionState`, `cancelAuction`
- `gameConfig.ts` — แก้ import path `'./gameConfig'` → `'../config/gameConfig'`
---
 
## ✅ Sprint 5 — AI System
**สถานะ: DONE | Tests: 90/90 ✅**
 
**Backend (5 ไฟล์):**
- `minionAI.ts` — Beginner AI · `first_valid` strategy · Fisher-Yates shuffle · MAX 1,000 attempts
- `eliteAI.ts` — Pro AI · `best_of_n` N=5 · เลือก Total Hand Strength สูงสุด
- `bossAI.ts` — 4 จตุรเทพ (Reaper / The Crag / Cortex / Cipher) · Weighted Score แยก personality
- `lastBossAI.ts` — Dual Algorithm: DDE (วันคู่) + MCTS (วันคี่) · Server-side only · Early Checkpoint 190ms
- `aiFillSystem.ts` — AI Fill System · Human ≥ 2 · AI ≤ 2 · Virtual Token 1.5–3.0×
**Frontend (3 ไฟล์):** `AIThinkingIndicator.tsx` · `AIPersonalityBadge.tsx` · `AIFillNotifyBanner.tsx`
 
**Tests (5 ไฟล์):**
 
| ไฟล์ | Cases |
|---|---|
| `minionAI.test.ts` | 10 |
| `eliteAI.test.ts` | 11 |
| `bossAI.test.ts` | 29 |
| `lastBossAI.test.ts` | 20 |
| `aiFillSystem.test.ts` | 20 |
 
---
 
## ✅ Sprint 6 — Items HUD + Shop + Assets + Login/Profile
**สถานะ: DONE | Tests: 37/37 ✅**
 
### Backend (6 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `middleware/vipGuard.ts` | ตรวจ `is_vip` · Fastify middleware + `assertVip()` |
| `items/itemPhaseController.ts` | Enable/Disable/Lock ทุก phase · Mutual lock Eye↔Thief's Glance |
| `items/allianceOfFate.ts` | Separate module pattern · 3s signal + 10s select timeout · executeSwap |
| `items/lootBox.ts` | Drop table 3 กล่อง · `is_locked` Free member · `getLootBoxOdds()` |
| `items/shopAPI.ts` | Buy competitive/fun/gesture/bag expansion · Open loot box · Inventory |
| `routes/shop.ts` | 7 endpoints · vipGuard preHandler · Error status codes |
 
### Backend Tests (3 ไฟล์)
 
| ไฟล์ | Cases | หมายเหตุ |
|---|---|---|
| `itemPhaseController.test.ts` | 17 | 🐛 Bug fixed: `PHASE_ENABLED_MAP.deal` ลืม `chrono_shard` |
| `lootBox.test.ts` | 10 | |
| `allianceOfFate.test.ts` | 10 | |
 
### Frontend HUD (2 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `hud/CompetitiveItems.tsx` | Swipe panel ซ้าย · 4 Quick slots + All Items 10 ตัว · Enable/Disable/Lock/Empty states |
| `hud/FunItems.tsx` | Swipe panel ขวา · Fun Items tab + Gestures tab · Target Selector Modal |
 
### Frontend Shop (3 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `shop/ShopScreen.tsx` | 8 หมวดสินค้า · VIP-only badge 🔒 · Upgrade bottom sheet + benefit list |
| `shop/LootBoxReveal.tsx` | Box shake → burst animation · Reveal ทีละชิ้น (500ms delay) · Locked badge |
| `shop/TokenPackage.tsx` | 5 Pack (Starter→Founder's) · Bonus % badge · Confirm modal · IAP shell |
 
### Assets (3 ไฟล์)
 
| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `assets/cards/ASSET_MANIFEST.ts` | 52 ใบ + back 5 variants + item icons + chip/frame helpers | ✅ |
| `assets/sounds/SOUND_MANIFEST.ts` | Sound Pack resolver · Preload list | ✅ |
| `assets/animations/ANIMATION_MANIFEST.ts` | **MVP Patch v2.1** — ลบ Lottie ทั้งหมด · Code Animation keys + 14 Sprite keys | ✅ Patched |
 
> ⚡ **MVP Patch (May 28, 2026):** `ANIMATION_MANIFEST.ts` — ตัด Lottie JSON ทั้งหมดออก
> Lottie เดิม 2 ไฟล์ (`fx_win_flowers` + `fx_last_boss_encounter`) → **เลื่อนไป v1.1**
> Sprite keys เหลือ 14 ไฟล์ (ตัด level_up / tier_up / achievement_unlock ออก)
> Win FX MVP → ใช้ `COIN_RAIN` + `WIN_SEAT_PULSE` (Code Animation แทน)
 
### Sprint 6 Extra — Login & Profile (4 ไฟล์)
 
| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `app/(auth)/login.tsx` | Google + Apple Sign In · Ad placeholder · redirect setup-profile | ✅ สร้างแล้ว |
| `app/(auth)/setup-profile.tsx` | ตั้งชื่อ + validate · เลือก Avatar · บันทึก | ⏳ ยังไม่ได้เทส |
| `app/(home)/profile.tsx` | Profile card · 7 Nav links · VIP banner | ⏳ ยังไม่ได้เทส |
| `src/components/profile/AvatarPicker.tsx` | Frame 7 แบบ · Preset 24 แบบ · AvatarDisplay reusable | ⏳ ยังไม่ได้เทส |
 
> ⚠️ **Blocker:** ต้องการ Google Cloud OAuth + Supabase OAuth setup ก่อนเทสได้
 
**App Flow (Auth → Google Only สำหรับ MVP Android):**
```
เปิดแอปครั้งแรก
  └─► login.tsx → Google OAuth
        └─► ไม่มี display_name → setup-profile.tsx
              ├─► Step 1: ตั้งชื่อ + validate
              ├─► Step 2: เลือก Avatar
              └─► บันทึก → profile.tsx
 
เปิดแอปซ้ำ
  └─► login.tsx → มี session + display_name แล้ว
        ├─► Free → AdMob → profile.tsx
        └─► VIP → profile.tsx ตรง
```
 
---
 
## 🔜 Sprint 7 — Retention + Monetization
**สถานะ: NEXT**
 
> ⚠️ **Pre-Sprint 7 Patch:** ต้อง patch `gameConfig.ts` ก่อน — อัปเดต tier keys และค่า Ante/Pot/Call ให้ตรงกับ Tier Structure ใหม่ (CoreRules v1.2)
 
### Backend (7 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `retention/streakSystem.ts` | นับ Streak · Shield auto-use · Grace Period (Free 1 ครั้ง/cycle) |
| `retention/dailyLogin.ts` | Free +200 (ดูโฆษณา) / VIP +300 อัตโนมัติ |
| `retention/milestoneReward.ts` | D7 / D15 / D30 rewards แยก Free และ VIP |
| `retention/tokenEconomy.ts` | Monitor burn ratio · velocity · inflation rate |
| `monetization/admob.ts` | Rewarded Video → Token · 8 touchpoints A1–A8 |
| `monetization/revenueCat.ts` | VIP subscription + IAP + webhook (set `is_vip`) |
| `monetization/tokenPackage.ts` | Token Pack purchase flow |
 
### Frontend (3 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `retention/StreakUI.tsx` | Streak display + Shield auto-use popup |
| `retention/MilestonePopup.tsx` | D7/D15/D30 reward popup |
| `retention/RewardedAd.tsx` | Rewarded video ad flow |
 
---
 
## ⏳ Sprint 8 MVP — Onboarding + Polish
**สถานะ: PLANNED**
 
> ⚡ ลดขนาดจากเดิม — ตัด XP/Leveling/Achievement/Last Boss UI ทั้งหมดออก
 
### Frontend (1 ไฟล์)
 
| ไฟล์ | หน้าที่ |
|---|---|
| `social/Onboarding.tsx` | 5 slides + Interactive Tutorial (Beginner Simplified Mode) |
 
### Polish Items
- Socket.IO real network stability test (3G/4G, background/foreground)
- Token economy calibration กับ real playtesting data
- Performance pass (60fps target)
- Google Play store listing + screenshots + policy disclosure
---
 
## ⏳ Sprint 9 MVP — Analytics + Launch
**สถานะ: PLANNED**
 
> ⚡ Android Only — ตัด iOS/Apple Store submission ออก
 
- Firebase Analytics + Crashlytics integration
- `gameConfig.ts` burn ratio final tuning
- Google Play Store submission
- Beta testing (closed track ก่อน)
- **Monitor D7 Retention** — ถ้า < 20% ต้องปรับ gameplay loop ก่อน full release
---
 
## 🗄️ Deferred to v1.1 (Post-MVP)
 
รายการต่อไปนี้จะกลับมาทำ **หลัง launch เมื่อ DAU และ revenue แสดงแนวโน้มดี:**
 
| Feature | เหตุผลที่เลื่อน |
|---|---|
| XP / Leveling / Achievement system | เพิ่ม complexity ไม่จำเป็นสำหรับ revenue |
| Last Boss Encounter UI + Hall of Bosses | ต้องการ XP system ก่อน (AI logic พร้อมแล้ว) |
| Social Feed + Follow System | ไม่จำเป็นสำหรับ monetization ตั้งต้น |
| Push Notifications | Streak + Daily Login พอสำหรับ MVP retention |
| Lottie JSON (fx_win_flowers + fx_last_boss) | Win FX ใช้ Code Animation แทนได้ |
| iOS / Apple Developer Account | เพิ่ม complexity + $99/ปี ไม่คุ้มตอนนี้ |
| Season / Clan / Tournament | Long-term feature |
 
---
 
## 📊 ตัวเลขรวม (MVP Pivot)
 
| รายการ | จำนวน |
|---|---|
| Sprint ที่เสร็จ | 6 / 9 MVP |
| ไฟล์ทั้งหมด (S1–6) | ~79 ไฟล์ |
| Test Cases | 197 / 197 PASS ✅ |
| Auth Provider | Google (Android MVP) · Apple (v1.1) |
| Platform | **Android Only** (iOS → v1.1) |
| Overall Progress | **~70%** |
| Launch Target | **October 2026** 🚀 |
 
---
 
## 💰 Revenue Re-Baseline (MVP Reality Check)
 
| Revenue Stream | Projection เดิม | Realistic (Thai Market) | หมายเหตุ |
|---|---|---|---|
| AdMob eCPM | $3–4 | **$0.5–1.5** | Thai market ต่ำกว่า global มาก |
| VIP Subscription | ~25% of revenue | **~40–50% of revenue** | Key driver จริงๆ ต้อง push VIP |
| IAP Shop | ~15% of revenue | ~15–20% of revenue | ใกล้เคียงเดิม |
| **รายได้ที่คาดหวัง (Base)** | **15,000/เดือน** | **10,000–20,000/เดือน** | ถ้า DAU 300–500 · VIP conversion 4–6% |
 
> 💡 **Key Insight:** เป้า 10k–30k/เดือนยังทำได้ แต่ต้องพึ่ง VIP conversion มากกว่า Ads
> Monitor: ถ้า VIP conversion < 3% หลัง D30 → ต้องปรับ VIP benefit หรือ pricing
 
---
 
## 🗓️ Action Items ตอนนี้
 
| รายการ | ความเร่งด่วน | กำหนด | หมายเหตุ |
|---|---|---|---|
| **Google Cloud OAuth Setup** | 🔴 ทำได้เลย | วันนี้/พรุ่งนี้ | ฟรี · ต้องการแค่ Gmail |
| **Supabase Google OAuth Config** | 🔴 | หลัง Google Cloud | หลังได้ Client ID + Secret |
| **เทส Login Flow บนเครื่องจริง** | 🔴 | หลัง OAuth พร้อม | เคลียร์ blocker Sprint 6 Extra |
| **สมัคร Google Play Developer** | 🟠 | หลัง 15 มิ.ย. | $25 · รอบัญชีบริษัทเปิด |
| **รับ Art ชุดแรก** | 🟠 | สัปดาห์หน้า | 52 ใบ + table + chips |
| **เริ่ม Sprint 7 Code** | 🟡 | พรุ่งนี้ | เริ่มได้เลยโดยไม่รอ account |
 
---
 
## 📱 Test Run Log — Sprint 6 Extra (May 17, 2026)
 
### Environment Notes (สำคัญ)
- รัน Expo จาก `/TriplePoker/client` เท่านั้น
- ใช้ WSL terminal · รัน `npx expo start --tunnel --clear` เสมอ
- ห้ามใช้ Unicode `──` `→` `—` ใน .tsx files (Babel parse ไม่ออก)
- `.env` ต้อง restart Expo ถึงจะโหลดได้
### Test Cases Status
 
| Test Case | ผล | หมายเหตุ |
|---|---|---|
| 1. Login โหลดและแสดงครบ | ✅ PASS | |
| 2. ปุ่ม Google Sign In แสดง | ✅ PASS | Android OK |
| 3. Google → OAuth flow | ⏳ รอ | Blocker: Google Cloud OAuth |
| 4–14. Setup Profile / Profile / Avatar | ⏳ รอ | Blocker: OAuth flow ก่อน |
 
---
 
*TriplePoker Sprint Progress Report v1.9 — MVP Pivot Edition*
*The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
*Updated: June 18, 2026*