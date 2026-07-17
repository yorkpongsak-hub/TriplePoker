# TriplePoker — Master Plan v10.0 (Consolidated)
**The Sage Unicorn Studio Co., Ltd.**
**Founder & Chief Architect:** Assistant Professor Pongnathee Maneekul
**Updated:** June 19, 2026
**สถานะ:** ฉบับรวมล่าสุด — แทนที่ MasterPlan v8.0 + ChangeLog v9.0 + SprintPlan v1.6 + CoreRules v1.1
 
---
 
## 1. ภาพรวมโครงการ
 
| รายการ | ค่า |
|---|---|
| ชื่อเกม | **TriplePoker** |
| บริษัท | The Sage Unicorn Studio Co., Ltd. (ทุน 350,000 บาท) |
| รูปแบบ | One-person indie studio |
| Platform | **Android Only** (iOS → v1.1) |
| Launch Target | **October 2026** |
| เป้ารายได้ | 10,000–30,000 บาท/เดือน (supplemental income) |
| Tech Stack | React Native+Expo / Fastify+Socket.IO+TS / Supabase / Upstash Redis / AdMob / RevenueCat |
 
---
 
## 2. Tier Structure (ฉบับล่าสุด — แทนที่ Beginner/Pro/Boss เดิมทั้งหมด)
 
6 ระดับ: **Demo (D) → Initiate (C) → Adept (B) → Mastermind (A) → High Noble (S) → The Last Boss (S+)**
 
| Tier | Token Range | Sequential Reveal | Fog of War | Blind Auction | Grand Finale Betting | Discard Phase | AI |
|---|---|---|---|---|---|---|---|
| Initiate | 100–9,999 | ❌ (พร้อมกัน) | ❌ | ❌ | ❌ | ❌ (Pile3=5ใบเต็ม) | First-valid |
| Adept | 10,000–39,999 | ❌ (พร้อมกัน) | ❌ | ❌ | ❌ | ❌ | First-valid |
| Mastermind | 40,000–99,999 | ✅ | ✅ | ✅ | ✅ | ✅ | Minion (First-valid) |
| High Noble | 100,000+ | ✅ | ✅ | ✅ | ✅ | ✅ | จตุรเทพ (DDE) |
| The Last Boss | ตามเงื่อนไข | ✅ | ✅ | ✅ | ✅ | ✅ | DDE/MCTS |
 
**Arrangement Timer:** Initiate 90s · Adept 75s · Mastermind 60s · High Noble 35s · The Last Boss 75s
> หมายเหตุ: Last Boss แยกเวลาจาก High Noble — ให้เวลาคิดมากขึ้นเพราะ AI เก่งระดับ DDE/MCTS, ความยากอยู่ที่ฝีมือไม่ใช่ time pressure (แก้ High Noble 50s→35s ให้ตรง gameConfig.ts จริง — 2026-07-16)
 
**Ante/Pot (S1/S2, ดูรายละเอียดเต็มใน CoreRules v1.3):**
> ตัวเลขอ้างอิง CoreRules v1.3 + BuyIn_Spec v1.1 (sync กับ gameConfig.ts จริง — แก้จากเลขเก่าที่ค้างมาจาก v1.2/v1.0)
 
| Tier | Ante รวม/คน | Pot Pile1/2/3 |
|---|---|---|
| Initiate | 70 | 40 / 80 / 160 |
| Adept | 300 | 240 / 400 / 560 |
| Mastermind | 1,000 | 800 / 1,200 / 2,000 |
| High Noble | 3,000 | 2,000 / 4,000 / 6,000 |
| The Last Boss | 6,000 | 4,000 / 8,000 / 12,000 |
 
**Triple Sweep Jackpot** (ทุก Tier): ชนะ 3 กองในรอบเดียว = Pot ×2, Rake 5% (ยกเลิก Rake 10% แยกแล้ว — 2026-07-17), Penalty/คน = floor(Pot÷3)
 
---
 
## 3. สถานะ Sprint (ปัจจุบัน — June 19, 2026)
 
### เสร็จแล้ว (Sprint 1–6, 197/197 tests ✅)
- S1: Auth (Google+Apple OAuth), DB Schema, nameValidator
- S2: gameConfig.ts, Redis, Token model
- S3: Core Engine + Game Table UI (20/20)
- S4: Full Game Flow — pileResolution, blindAuction, grandFinale (35/35)
- S5: AI System — Minion/Elite/Boss/LastBoss algorithm + AI Fill (90/90) — **logic พร้อม รอ UI ต่อ Tier**
- S6: Items HUD, Shop, Login/Profile (37/37)
### live.tsx = Initiate Tier (เสร็จสมบูรณ์ — ใช้เป็น base clone ขยายไป Tier อื่น)
 
### กำลังทำ — Sprint 7 (Revised, แบ่งเป็น 4 เฟส)
 
| เฟส | งาน | หมายเหตุ |
|---|---|---|
| **7A** | ยืนยัน fix ไพ่กะพริบครบ edge case + เทส Showdown ทุก case (ฟาวล์ 1 คน/ทุกคน, Triple Sweep, ปกติ) บน live.tsx | ต้องนิ่งก่อน clone ไป Tier อื่น |
| **7B** | Clone **Adept** จาก live.tsx — เปลี่ยน 1 AI → 1 Human slot + matchmaking/waiting room UI | ง่ายสุด ทดสอบ pattern clone |
| **7C** | **Mastermind** — แยกเทสทีละฟีเจอร์: Fog of War → Blind Auction UI → Grand Finale Betting → Discard Phase (manual) | จุดเปลี่ยนสำคัญที่สุด ไม่ทำพร้อมกันทั้งหมด |
| **7D** | Retention + Monetization: Streak/DailyLogin/Milestone/TokenEconomy ก่อน (ไม่รอ Play Console) → RevenueCat/AdMob (รอ D-U-N-S + Play Console verify) | คู่ขนานกับการรอ verify บัญชี |
 
### ต่อไป — Sprint 8
- **High Noble** Tier: จตุรเทพ AI personality + UI (รอ art assets จากทีม)
- Onboarding (5 slides + Interactive Tutorial)
- nameValidator patch เข้า routes/auth.ts (ค้างจาก S1)
### ต่อไป — Sprint 9
- Firebase Analytics + Crashlytics
- gameConfig.ts burn ratio final tuning
- Google Play Store submission + Beta testing (closed track)
- Monitor D7 Retention (เป้า ≥20%)
### เลื่อนไปทำหลังสุด
- **The Last Boss Tier** — รอ Master Plan finalize เงื่อนไข encounter ก่อน (มีเวลาหลายเดือน)
### Deferred to v1.1 (หลัง launch, DAU > 500 sustained + revenue > 15,000 บาท/เดือน ต่อเนื่อง 2 เดือน)
XP/Leveling/Achievement · Last Boss Encounter UI + Hall of Bosses · Social Feed/Follow · Push Notifications · Lottie JSON (fx_win_flowers, fx_last_boss) · iOS/Apple Developer Account · Season/Clan/Tournament
 
---
 
## 4. Business / Admin Checklist
 
| รายการ | สถานะ | หมายเหตุ |
|---|---|---|
| เปิดบัญชีบริษัท | ✅ เสร็จ | |
| ขอ D-U-N-S Number | 🔴 ทำวันนี้ | ฟรีจาก Dun & Bradstreet, รอ 1-3 วันทำการ |
| Google Play Console (Organization) | 🟠 รอ D-U-N-S | $25 ครั้งเดียว, ต้องมีเอกสารบริษัทครบ (Certificate of Incorporation, Business License, VAT) |
| Google Cloud OAuth | 🔴 ทำได้เลย | ฟรี ไม่ต้องรอ |
| AdMob Account | 🟡 ทำคู่กับ Play Console | ฟรี |
| RevenueCat Account | 🟡 สมัครได้เลย แต่ผูก Play Billing ต้องรอ Play Console + package name | ฟรี tier |
 
---
 
## 5. Revenue Model (Re-baselined, Thai Market Reality)
 
| Stream | Realistic Projection |
|---|---|
| AdMob eCPM | $0.5–1.5 (ไม่ใช่ $3-4 แบบ global) |
| VIP Subscription | ~40-50% ของรายได้ — **key driver หลัก** |
| IAP Shop | ~15-20% |
| รายได้คาดหวัง | 10,000–20,000 บาท/เดือน ถ้า DAU 300-500, VIP conversion 4-6% |
 
**VIP Pricing:** VIP 99 บาท/เดือน (comfort features) · VIP Pro 159 บาท/เดือน (Competitive Items + Grand Master milestone + badge)
 
**Monitor:** ถ้า VIP conversion < 3% หลัง D30 → ต้องปรับ benefit/pricing
 
---
 
## 6. Risk Register (อัปเดต)
 
| ความเสี่ยง | ระดับ | Mitigation |
|---|---|---|
| Google Play Gambling Flag | 🟠 MEDIUM | เตรียม store listing + policy disclosure ก่อน submit |
| AdMob eCPM ต่ำกว่าคาด | 🟠 MEDIUM | Push VIP conversion แทน |
| DAU Cold Start | 🔴 HIGH | AI Fill ช่วยช่วงแรก · Monitor D7 retention ตั้งแต่สัปดาห์แรก |
| Socket.IO Real Network | 🟠 MEDIUM | Test บน 3G/4G จริงก่อน launch |
| Patch accumulation corruption (live.tsx) | 🟡 LOW (เรียนรู้แล้ว) | Clean rewrite แทนการ patch ซ้อนเยอะ |
 
---
 
## 7. หลักการทำงาน (Key Principles — คงไว้ตลอดโครงการ)
 
- Confirm ก่อนสร้าง/แก้ไฟล์ทุกครั้ง
- Patch ผ่าน Python script ที่ copy-paste ได้ใน WSL terminal
- UI = English, Code comment = Thai
- แยกไฟล์ต่างหากต่อ Tier (ไม่ config-driven ไฟล์เดียว) เพื่อให้แต่ละ Tier รู้สึกแตกต่างจริง
- ทำทีละ issue ไม่สะสม TODO กลางเซสชัน
- VFX: 75% Code Animation / 20% Sprite Sheet / 5% Lottie (2 ไฟล์เท่านั้น)
- EAS Build (cloud) แทน local Android SDK
---
 
*TriplePoker Master Plan v10.0 — Consolidated*
*The Sage Unicorn Studio Co., Ltd.*