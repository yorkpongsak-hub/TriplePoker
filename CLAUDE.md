# CLAUDE.md — TriplePoker Project

> ไฟล์นี้คือกติกาบังคับสำหรับ Claude Code ทุก session
> อ้างอิง: TriplePoker_MasterPlan_v10_0 (Game Design Canon v1.0)

---

## 👤 เจ้าของโปรเจค

- **ลุงเยาะ** (Asst. Prof. Pongnathee Maneekul) — Founder & Chief Architect, The Sage Unicorn Studio Co., Ltd.
- Solo indie developer ทำทุก role
- เป้าหมาย: รายได้เสริม 10,000–30,000 THB/เดือน | **Launch: October 2026 (Android Only)**

---

## 🗣️ กติกาการสื่อสาร (บังคับทุกครั้ง)

1. **สื่อสารกับลุงเยาะเป็นภาษาไทยเสมอ** — ทุกคำอธิบาย ทุกคำถาม
2. **UI/labels/menus/popups/errors/system messages ในเกม: ภาษาอังกฤษทั้งหมด** (Global users)
3. **Code comments: ภาษาไทย**
4. **ก่อนสร้างหรือแก้ไขไฟล์ใดๆ ต้องถามยืนยันก่อนเสมอ ห้ามแก้โดยไม่ได้รับอนุญาต**
5. เมื่อเจอปัญหาหรือทางเลือก **เสนอ 2 แนวทางเท่านั้น:** 🅰️ MVP (ลดความซับซ้อน) และ 🅱️ Full System พร้อม recommendation ชัดเจน — ห้ามเสนอ 3 แนวทาง
6. **ถามประเด็นที่ยังไม่เคลียร์ให้ครบก่อนลงมือ ห้ามข้ามไปทำถ้ายังมีจุดคลุมเครือ**
7. QA รวม: เทสหาบั๊กทีเดียวหลัง feature ใหญ่ครบ ไม่ไล่แก้ minor bug ระหว่างทาง

---

## 🏗️ Architecture Rules (ห้ามละเมิด)

1. **แยกไฟล์ต่อ Tier** — ห้ามใช้ dynamic route `[tier]` เด็ดขาด
   - `app/game/initiate/` | `app/game/adept/` | `app/game/mastermind/` | `app/game/highNoble/`
   - Tier ใหม่ = copy จาก Tier ที่เสร็จแล้วมาแก้เฉพาะจุด (pattern หลักของโปรเจค)
2. **Rewrite แทน patch** เมื่อไฟล์สะสม patch มากจนเริ่ม corrupt
3. **Two Apps, One Database** — Main App + The Arena (Phase 3) ใช้ Supabase DB เดียวกัน
4. Config-driven ทั้งระบบผ่าน `gameConfig.ts` — ห้าม hardcode ค่า Ante/Pot/Fee ในไฟล์ Tier
5. Last Boss Tier อยู่ในแอปแยก (The Arena) — ห้ามเอา logic มาปนใน Main App

## 🛠️ Tech Stack

- **Client:** React Native + Expo (Android only MVP) + Zustand + Reanimated 4
- **Server:** Node.js + Fastify + Socket.IO + TypeScript
- **DB:** Supabase PostgreSQL (project ref: `aeinnlaxscikarzupprn`) + Upstash Redis (REST client)
- **Env:** WSL2 บน Windows | รัน Expo จาก `/client` ด้วย `npx expo start --clear` (LAN mode)

## 🌐 Dev Networking (updated 2026-07-13)

- WSL2 ใช้ mirrored networking mode (`.wslconfig`: `networkingMode=mirrored`) — WSL ได้ IP เดียวกับ Windows
- Server: Fastify port 3001, bind `0.0.0.0`
- Client ชี้ `http://192.168.1.106:3001` (LAN IP ของเครื่อง MSI, router อาจแจกใหม่ได้ — ถ้าต่อไม่ได้ให้เช็ค `ipconfig` ก่อน)
- Expo ใช้ LAN mode: `npx expo start --clear` (เลิกใช้ `--tunnel`)
- Firewall rules มีแล้ว: port 3001 (server), 8081 (Metro), Hyper-V VM firewall ตั้ง `DefaultInboundAction=Allow` แล้ว
- **ห้ามแนะนำ/ตั้ง `netsh portproxy` หรือ localtunnel อีก** — เป็นวิธีเก่าที่เลิกใช้แล้ว
- ทดสอบ: มือถือเปิด `http://192.168.1.106:3001/health` ต้องได้ response (คอมตัวเองอาจเข้า LAN IP ไม่ได้ — เป็น quirk ของ mirrored mode ให้ใช้ `localhost` แทน ไม่ใช่บั๊ก)

---

## 🐛 Known Bugs & Fixes (ห้ามทำผิดซ้ำ)

| # | กติกา |
|---|---|
| 1 | `userStore.userId` ต้อง sync จาก `authStore` ใน `_layout.tsx` — ไม่งั้น userId ว่างทั้งแอป |
| 2 | `game_join` ใช้ **pull model** เท่านั้น (กัน race condition `round_start` มาก่อน socket mount) |
| 3 | `public.users` ใช้ `user_id` เป็น PK ไม่ใช่ `id` — query ต้อง `.eq('user_id', session.user.id)` |
| 4 | หลัง `ALTER TABLE` ต้องรัน `NOTIFY pgrst, 'reload schema';` เสมอ |
| 5 | ห้ามเรียก `bestOf7` ผิด context — ใช้ `evaluateHand` ตรงๆ |
| 6 | `evaluateHand` รับเกิน 5 ใบทำ flush/straight เพี้ยน — ต้องใช้ `bestThreeFromN` เลือก best 3 ก่อน |
| 7 | AI arrangement foul filter ต้องใช้ `compareHands(h2, h3)` ตรงๆ ห้ามสร้าง fake hand |
| 8 | `autoSort.ts`: condition ต้องเป็น `n !== 11 && n !== 12` (รองรับมือ 12 ใบ) |
| 9 | `foulChecker.ts`: ใช้ `pile3.length < 3` (ไม่ใช่ `!== 5 && !== 3`) |
| 10 | **ห้ามใช้ Unicode `──` `→` `—` ใน .tsx files** — Babel parse ไม่ออก |
| 11 | แก้ `.env` แล้วต้อง restart Expo ถึงจะโหลดค่าใหม่ |
| 12 | `gfRevealedCards` เป็น `Record<string, string[]>` (per-player) |

---

## ⚖️ Economy & Legal Rules (ห้ามละเมิดเด็ดขาด)

1. **Crown Package (ซื้อด้วยเงินจริง) ห้ามไหลระหว่างผู้เล่นทุกกรณี** — ใช้ได้เฉพาะ The Crown Vault cosmetics เท่านั้น ห้ามใช้ Match Stake
2. Earned Crown (Token→Crown 1:5,000) เท่านั้นที่ใช้ Match Stake ได้
3. Fan tribute ให้ Human Boss: **Token เท่านั้น** ห้าม Crown ทุกกรณี
4. **ทุกโต๊ะทุก Tier ต้องมี Bot/AI อย่างน้อย 1 ตัวเสมอ** (ป้องกัน gambling classification — รวม VIP Private table)
5. Legal disclaimer ต้องคงไว้: "Crown และ Token ไม่สามารถแลกเปลี่ยนเป็นเงินได้"
6. Revenue Share Human Boss — **ยังไม่ตัดสินใจ** รอปรึกษาทนาย gaming law ห้าม implement

## 🎮 Game Design Canon (สรุปที่กระทบโค้ด)

- **Tier structure:** Initiate (2★) → Adept (3★) → Mastermind (4★) → High Noble (5★) → Last Boss (5★+⚡ #FFD76A, แอปแยก)
- **Blind Auction** ปลดล็อกที่ Mastermind ขึ้นไป
- **Triple Sweep Jackpot:** ชนะ 3 กอง = Pot ×2, Rake 5% (ยกเลิก Rake 10% แยกแล้ว — 2026-07-17), Penalty หาร 3 (ทุก Tier)
- **Auto Sort Fee** (ยังไม่โค้ด): Initiate ฟรี | Adept 30 | Mastermind 100 | High Noble 250 | Last Boss 500 — client counter ใน AsyncStorage, backend หักตอน submit + คง `freeRoundsForNewUser=10`
- **Monarch spawn rate** (High Noble): Monarch 3% / Reaper 28% / Crag 25% / Cortex 25% / Cipher 19% — adaptive personality ล็อกตอน deal
- **Nine Sentinels** (Mastermind Conquest): Iron Wall / Chivalry / War Lord / Phantom / Dark Shark / Oracle / Jester / Phoenix / Black Magic — reuse pattern Four Gods, Jester สุ่ม weight 1-10 ใหม่ทุกเกม (pattern เดียวกับ Cipher)
- **Unlock Tier S:** ผ่าน A+ AND token > 1,000K (ไม่ผูก 9/9 Sentinels)
- **Arena:** Deck 53 ใบ (52+Joker), Joker อยู่ได้เฉพาะ Auction card1/card2/Pile3 hidden — ห้าม Auto Sort ทุกชนิด (Hardcore Rule)

---

## 📋 สถานะปัจจุบัน & งานคงค้าง

**เสร็จแล้ว:** Tier C, B, A (core flow), A+ 100% | Auth Flow | Lock-up Token | Room Registry (Redis) | DB 4+1 migrations (002_name_protection รันแล้ว) | Landing page | Sprint 8: `nameValidator.ts` (3-layer) + `POST /auth/register` | **The Nine Sentinels (Boss Selection + aiEngine 9 personalities + `conquered_sentinels`)** — select.tsx/story.tsx/index.tsx + gameLoop.ts wiring เสร็จ, รอ migration 005 + avatar assets ก่อนเทสจริง (ดู pending #3-4 ด้านล่าง) | **High Noble Multiplayer (3 Human จริง + Four Gods Boss)** — `highNobleMultiEngine.ts` ใหม่ทั้งไฟล์ (ไม่แตะ gameLoop.ts เดิม), `roomRegistry.ts` ผูก Boss seat เป็น Four Gods จริง, `gameSocket.ts`/`lobby.tsx`/`highNoble/index.tsx` ต่อครบ — เทสผ่านสคริปต์ 3-socket จริง (5 รอบเต็ม + disconnect mid-arrangement) ดู pending #13-15 ก่อนขึ้นจริง | **Monarch System จริง (Spec v1.3 — เขียนทับ mechanic เก่าที่เป็น placeholder ทั้งหมด)** — บอสลับ 3%+pity (max ของโต๊ะ, การันตีเกม 30) สุ่มตอนห้อง High Noble เต็ม, `monarchSpawn.ts` (spawn+pity DB), `monarchAI.ts` (ล็อคบุคลิกตาม hand strength ตอนแจกไพ่ Round 1 เท่านั้น เดเลเกตไป aiEngine.ts เดิม), Pot ×2 ระดับ match + `monarch_victories` + Dual-Track Performance Score (`psEngine.ts`: Career/`performance_score` ไม่รีเซ็ต + Season/`ps_season` รีเซ็ตตาม tournament) ใน `highNobleMultiEngine.ts`, `ascendantGate.ts` (stub เงื่อนไขเข้า Ascendant พร้อม wire), client boss intro + Profile (Season PS เด่น/Career PS รอง/badge/hint) — เทสใหม่ 27 เทสผ่านหมด, migration 006 รันแล้ว — ระบบ `tier:'monarch'` queue เดิม (สลับบุคลิกทุก Round) ถูกลบทิ้งทั้งหมดแล้ว

**Pending (เรียงตาม priority):**
1. Profile screen — เชื่อม Supabase จริงแทน MOCK (ยังเหลือ `streakDays` ที่เป็น MOCK อยู่ — token/crown/xp/PS/monarch_victories ต่อ Supabase จริงแล้ว)
2. Auth Guard fix — display names `^user_[a-f0-9]{8}$`
3. **ก่อนเทส Nine Sentinels:** รัน `supabase/migrations/005_nine_sentinels.sql` บน Supabase dashboard เอง + `NOTIFY pgrst, 'reload schema';`
4. Nine Sentinels asset อยู่ที่ `client/assets/sentinels/boss_[id].png` (แยกจาก Four Gods/Monarch ใน `bosses/`) — ใช้รูปเดียวกันทั้ง portrait (select/story) และ avatar ในเกม ไม่มี square-crop แยก (ต่างจาก Four Gods ที่มี `_avatar.png` แยก) — ถ้าจะทำ crop จริงทีหลัง ต้องแก้ path ใน 3 ไฟล์: select.tsx, story.tsx, mastermind/index.tsx (BOSS_AVATAR map)
5. Motto ของ Chivalry / War Lord ยังเป็น placeholder ("Motto coming soon.") ใน `client/app/game/mastermind/story.tsx` — รอ MasterPlan v1.1 เติมของจริง
6. Auction bid style ตัวเลข (willBid %/level) ของ 9 Sentinels ใน `gameLoop.ts` เป็นการตีความจากคำอธิบายเชิงคุณภาพใน MasterPlan (canon ให้แค่คำบรรยาย ไม่ใช่ตัวเลข) — ควรปรับจูนหลัง playtest จริง
7. Auto Sort Fee system
8. Boss Card Counting AI Enhancement (Pile2 Winner Signal) สำหรับ Crag+Cipher
9. Fan Hand View (VIP cosmetic, Reanimated 3) — Sprint 6-7
10. **QA รวม:** 6 test suites เดิมพังอยู่ (พบตอนทำ nameValidator, ไม่เกี่ยวกับ feature นี้) — `foulChecker.test.ts`, `itemPhaseController.test.ts`, `pileResolution.test.ts`, `minionAI.test.ts`, `aiFillSystem.test.ts`, `blindAuction.test.ts` (ส่วนใหญ่เป็น TS type error เรื่อง `Tier` type) — เลขจริงไม่ตรง "197/197 PASS" ด้านล่าง ต้องไล่แก้รวดเดียวตอน QA รวม + เพิ่ม QA flow ของ Mastermind Conquest (select→story→5 รอบ→conquest overlay→9/9 message) และ Monarch System (spawn/pity→personality lock→Pot×2 settlement→PS dual-track) เข้าไปในรอบ QA รวมนี้ด้วย
11. **ก่อน push ขึ้น GitHub ครั้งแรก:** ต้องล้าง GitHub token ที่หลุดใน git history ของ `server/jest.config.js` (commit `ec11cc4`) ก่อน — ใช้ `git filter-repo` หรือ BFG rewrite history (destructive, ต้องขอยืนยันลุงก่อนรันจริง)
12. **High Noble Multiplayer — ยังไม่เทสผ่าน UI จริง:** สร้าง/เทสผ่านสคริปต์ socket.io-client ล้วน (bypass เบราว์เซอร์) เพราะ Dev Login ใช้ไม่ได้ (`test1@triplepoker.dev`/`password` ขึ้น "Invalid login credentials" จริงจาก Supabase) — ต้องหา dev account ที่ใช้ได้ หรือปิด email confirmation ชั่วคราวใน Supabase dashboard ก่อนเทส 3 เบราว์เซอร์จริง
13. **High Noble Multiplayer Grand Finale reconnect:** `resendHNRoundStartToPlayer` (ใช้ตอน client เปิด socket ใหม่หลัง matchmaking) รองรับแค่ phase `'arrangement'` เหมือนต้นแบบ Adept เดิม — ถ้า client หลุดแล้วต่อกลับระหว่าง auction/discard/grand_finale จะไม่ได้ state คืน (ต้องรอ disconnect handler แทนที่ด้วย AI แทน ไม่ true-reconnect)
14. **Monarch: `ascendantGate.ts` เป็น stub** — `checkAscendantEligibility()` เขียนพร้อมใช้แล้ว แต่ยังไม่ได้ wire เข้า promotion flow จริง เพราะไม่มี Ascendant tier promotion logic อยู่ในโค้ดเลย (ไม่เคยมีมาก่อนงาน Monarch) — รอ Ascendant Tier ถูก implement เต็มรูปแบบ
15. **Monarch: token persistence gap แก้เฉพาะ High Noble** — เจอบั๊กเดิมว่า `match_end` คืนแค่ locked ante ไม่เคย persist ผลแพ้/ชนะจริงของแมตช์ลง `token_balance` เลย แก้แล้วเฉพาะ `highNobleMultiEngine.ts` (`persistHNNetTokenResult` ใน `gameLoop.ts`, ฟังก์ชันใหม่ ไม่แตะของเดิม) เพราะเป็น prerequisite ของ Monarch Pot×2 — บั๊กเดียวกันนี้น่าจะมีใน single-player และ Adept multiplayer ด้วย แต่อยู่นอกขอบเขตงานนี้ตามกติกาห้ามแตะ tier อื่น ต้องแก้แยกทีหลัง

**Deferred to v1.1:** XP/Leveling, Last Boss UI, Social, Push Notifications, Lottie, iOS

---

## 🔧 Workflow Rules

1. **Git:** ทำงานบน branch แยกเสมอ ห้าม commit ตรงเข้า main — ลุง review diff ก่อน merge
2. **SQL:** เขียน SQL ให้ลุงรันบน Supabase dashboard เอง — ห้าม execute SQL ตรง
3. **Assets:** boss art `boss_[key].png` (512×640) + avatar 256×256 ที่ `assets/bosses/` | card back `card_back_[skin_key].png` (360×504 @2x)
4. **เอกสาร:** pattern `TriplePoker_[Topic]_v[X]_[Y].md` — เอกสาร canon อยู่ที่ `docs/`
5. ก่อนรัน bash ที่เกี่ยวกับ path ให้ confirm path จริงก่อน
6. Tests ต้องผ่านครบก่อนถือว่างานเสร็จ (ปัจจุบัน 197/197 PASS — ห้ามทำให้ตก)

## 🎨 Official Theme (WebsiteTheme_Spec_v1_0)

- BG: `#0F2418` / `#163A25` / `#1C4830` | Gold: `#FFD76A` / `#FFC857`
- Green Highlight: `#8DFFB5` | Red: `#FF6B6B` | Text: `#F5F2E8` / `#C8C4B0` / `#7A7A6A`
- Border: `#2A4A34` / `#3A5A44` | Fonts: Cinzel (heading) / Inter (body) / JetBrains Mono (ตัวเลข/token)