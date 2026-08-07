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
- **Auto Sort Fee** (มติลุงเยาะ 2026-07-25 — เขียนทับเลขตายตัวชุดเดิมทั้งหมด): คิดเป็น **% ของ Ante กอง 3** ไม่ใช่เลขตายตัว — C ฟรี | B 25% (=35) | A 33% (=165) | A+ 50% (=750) | Last Boss 50% (=1,500 แต่ Arena ห้าม Auto Sort อยู่แล้ว) · ยกเลิกระบบ free rounds ถาวร (`freeRoundsForNewUser` ลบทิ้งแล้ว) เสีย fee ทุกครั้งที่กด · เจตนา: ยิ่ง Tier สูงยิ่งแพง เพื่อกึ่งบังคับให้ผู้เล่นฝึกจัดไพ่เองก่อนขึ้น Arena · **อ่านค่าผ่าน `getAutoSortFee(tier)` ใน `gameConfig.ts` เสมอ ห้าม hardcode ตัวเลขอีก** (ต้นเหตุที่เคยขัดกัน 3 แหล่งคือมันถูก hardcode ไว้หลายที่) · ฝั่ง client รับผ่าน `autoSortFee` ใน payload `round_start` ไม่มีเลขของตัวเอง
- **Monarch spawn rate** (High Noble): Monarch 3% / Reaper 28% / Crag 25% / Cortex 25% / Cipher 19% — adaptive personality ล็อกตอน deal
- **Nine Sentinels** (Mastermind Conquest): Iron Wall / Chivalry / War Lord / Phantom / Dark Shark / Oracle / Jester / Phoenix / Black Magic — reuse pattern Four Gods, Jester สุ่ม weight 1-10 ใหม่ทุกเกม (pattern เดียวกับ Cipher)
- **Unlock Tier S:** ผ่าน A+ AND token > 1,000K (ไม่ผูก 9/9 Sentinels)
- **Arena:** Deck 53 ใบ (52+Joker), Joker อยู่ได้เฉพาะ Auction card1/card2/Pile3 hidden — ห้าม Auto Sort ทุกชนิด (Hardcore Rule)

---

## 📋 สถานะปัจจุบัน & งานคงค้าง

**เสร็จแล้ว:** Tier C, B, A (core flow), A+ 100% | Auth Flow | Lock-up Token | Room Registry (Redis) | DB 4+1 migrations (002_name_protection รันแล้ว) | Landing page | Sprint 8: `nameValidator.ts` (3-layer) + `POST /auth/register` | **The Nine Sentinels (Boss Selection + aiEngine 9 personalities + `conquered_sentinels`)** — select.tsx/story.tsx/index.tsx + gameLoop.ts wiring เสร็จ, รอ migration 005 + avatar assets ก่อนเทสจริง (ดู pending #3-4 ด้านล่าง) | **High Noble Multiplayer (3 Human จริง + Four Gods Boss)** — `highNobleMultiEngine.ts` ใหม่ทั้งไฟล์ (ไม่แตะ gameLoop.ts เดิม), `roomRegistry.ts` ผูก Boss seat เป็น Four Gods จริง, `gameSocket.ts`/`lobby.tsx`/`highNoble/index.tsx` ต่อครบ — เทสผ่านสคริปต์ 3-socket จริง (5 รอบเต็ม + disconnect mid-arrangement) ดู pending #10-12 ก่อนขึ้นจริง | **Monarch System จริง (Spec v1.3 — เขียนทับ mechanic เก่าที่เป็น placeholder ทั้งหมด)** — บอสลับ 3%+pity (max ของโต๊ะ, การันตีเกม 30) สุ่มตอนห้อง High Noble เต็ม, `monarchSpawn.ts` (spawn+pity DB), `monarchAI.ts` (ล็อคบุคลิกตาม hand strength ตอนแจกไพ่ Round 1 เท่านั้น เดเลเกตไป aiEngine.ts เดิม), Pot ×2 ระดับ match + `monarch_victories` + Dual-Track Performance Score (`psEngine.ts`: Career/`performance_score` ไม่รีเซ็ต + Season/`ps_season` รีเซ็ตตาม tournament) ใน `highNobleMultiEngine.ts`, `ascendantGate.ts` (เงื่อนไขเข้า Ascendant — ต่อจริงแล้วผ่าน `crownVaultService.ts`, ดู pending #14 เรื่อง migration ที่ยังไม่ได้รัน), client boss intro + Profile (Season PS เด่น/Career PS รอง/badge/hint) — เทสใหม่ 27 เทสผ่านหมด, migration 006 รันแล้ว — ระบบ `tier:'monarch'` queue เดิม (สลับบุคลิกทุก Round) ถูกลบทิ้งทั้งหมดแล้ว | **Token Flow Panel (Initiate / Adept / Mastermind — TokenFlowPanel_Spec_v1_1)** — ตารางมุมขวาบน 6 แถว (`G1/G2/G3/F&R/4P/Total`) บังคับกฎเหล็ก `Pot×3 + Fee&Rake + All Stack = 4 × Buy-in` เสมอ · `server/src/game/tokenFlow.ts` ใหม่ (pure function ล้วน + 28 unit tests) · `gameLoop.ts` wire 7 จุด **gate `tier === 'initiate'` ทุกจุด** Tier อื่นยังใช้ `calcDeltas()` เดิมไม่เปลี่ยนพฤติกรรม · ของใหม่ที่ไม่เคยมีมาก่อน: **Pot เป็น bucket จริง** (เดิมไม่มี Pot ในระบบเลย — net ทีเดียวตอน showdown) + Ante หักตอนต้นรอบ + `feeRake` สะสมทั้งเกม burn ตอนจบ + Triple Sweep ×2 ใน Tier C (ใช้สูตรเดียวกับ Mastermind/HighNoble: `bonus = ante กอง3 × จำนวนผู้แพ้` ดูดจาก stack ผู้แพ้จริง ไม่เสกเงิน) · **มติลุงเยาะ 2026-07-25:** AI ชนะเก็บเงินเข้ากระเป๋าตัวเอง (ไม่ burn ตาม Spec §3) · Foul รายคนคงพฤติกรรมเดิม · foul ครบทุกคน → Pot เข้า Fee&Rake · rake 5% ทุกกรณี · **ลบปุ่ม Rematch ของ Initiate แล้ว** (Spec §5.1 No Rematch — Buy-in ต้องล็อคตั้งแต่ต้นเกม) · เทสจริงบนมือถือผ่านครบแล้ว

> **ขยายไป Adept (Total 8,000)** — multiplayer 2H+2AI ใช้ `MultiMatchState` ผ่าน `startMultiRound`/`resolveMultiShowdown` (settleRound ตัวเดียวกับ Tier C) · ของใหม่: **Auto Sort Fee ระบบจริง** server-authoritative (`auto_sort_request` → `auto_sort_ack`, `autoSortUsed` เก็บฝั่ง server, client ต้องมี state `autoSortPaid` แยกจาก `sortDone` เพราะ `sortDone` reset ทุกครั้งที่ผู้เล่นสลับไพ่เอง — ถ้าใช้ตัวเดียวกันจะโดนเก็บเงินซ้ำในรอบเดียว) · เทสจริงผ่านแล้ว
>
> **ขยายไป Mastermind (Total 60,000 หลัง buy-in ขึ้นเป็น 15,000)** — Tier นี้ **ไม่ได้ใช้ showdown path เดียวกับ Tier C/B** แต่แตกไปที่ `resolveMastermindPile12()` แล้วจบที่ `finalizeGrandFinale()` ซึ่งเดิมหัก Ante **ตอนจบเกม** ไม่ใช่ต้นรอบ · แก้โดยเพิ่ม helper `usesTokenFlow(tier)` ใน `gameLoop.ts` แล้วแยก `finalizeGrandFinale` เป็น 2 เส้นทาง (**โค้ด calcDeltas เดิมของ High Noble/Last Boss ยังอยู่ครบไม่ถูกแตะ** เพราะใช้ฟังก์ชันเดียวกัน) · ⚠️ ห้ามหัก Ante ทั้งต้นรอบและตอนจบพร้อมกัน และ jackpot ต้องคิดที่เดียว (`settleMastermindRound` คิดให้แล้ว) · ทางเดินเงินใหม่ 2 ทางที่ Tier ล่างไม่มี: **Blind Auction bid → Fee & Rake** (มติลุงเยาะ: ไม่ burn ทันทีตาม `auctionBurn: 1.0` เพราะเงินหายกลางเกมจะทำให้กฎเหล็กพัง — ผลทางเศรษฐศาสตร์เท่ากัน ต่างแค่จังหวะ) และ **Grand Finale Call → Pot 3** · `state.extraPaid` เก็บยอดที่จ่ายระหว่างรอบไว้รายงานใน `displayDeltas` เท่านั้น **ห้ามนำไปหักซ้ำ** · เงินไม่พอ = ปุ่มถูก disable / ประมูลไม่ได้ไพ่ / ถูกบังคับ Fold ไม่มีทาง stack ติดลบ (มีเทสคุมทั้ง 3 เคส) · ไม่มีปุ่ม Rematch · เทสจริงผ่านแล้ว

> ⚠️ **UI ของ Initiate = ต้นแบบบังคับของทุก Tier ที่จะทำต่อ** (มติลุงเยาะ 2026-07-25): ปุ่ม `i` + Timer อยู่ซ้ายสุดผ่าน prop `leftSlot` ของ `GameTopBar` (opt-in — Tier ที่ไม่ส่งได้ layout เดิม) · `TokenFlowPanel` ชิดขอบบนขวา · ที่นั่ง Boss ใช้ `alignItems:'flex-end'` + `paddingRight: PANEL_WIDTH + PANEL_RIGHT` (import จาก TokenFlowPanel) ทำให้กรอบไพ่ชนขอบ Panel พอดีทุกขนาดจอ ห้ามใช้เลขตายตัว · ไม่มีปุ่ม Rematch · burn toast ตอนจบเกม
>
> ⚠️ **ย้าย `i` เข้า `leftSlot` แล้วต้องลบปุ่ม `i` เดิมที่ลอยอยู่มุมซ้าย (`position:'absolute', top:70`) ทิ้งด้วยเสมอ** — ไม่งั้นได้ปุ่ม 2 อันซ้อนกัน (เคยพลาดมาแล้วที่ Mastermind)
>
> ⚠️ **Grand Finale ใช้ปุ่ม `CALL` / `FOLD` จริงเท่านั้น** (มติลุงเยาะ 2026-07-25 — ใช้กับทั้ง Mastermind และ High Noble): เลิกใช้ gesture ทั้งหมดแล้ว (เดิม แตะไพ่ซ้ำ = Call · ปัดลง = Fold · มีกล่องคำอธิบาย 2 บรรทัด) · **แตะไพ่ = เลือกใบที่จะหงายเท่านั้น** ไม่ยิง action เอง กันกดพลาดเสียเงิน · ถ้าไม่เลือกใบไหน client จะไม่ส่ง `revealedCardKey` แล้ว server เลือกใบอ่อนสุดให้เอง (`pickRevealCard`) · `GFHandView` (VIP fan) เหลือ prop `onSelect` อย่างเดียว ไม่มี `onCall`/`onFold` แล้ว
>
> ✅ **Fan Hand View เสร็จแล้ว** (ของเดิมเข้าใจผิดว่ายังไม่ทำ) — `PlayerHandView.tsx` มี 2 โหมดตาม VIP status (Free: กรอบทองแถวเดียว / VIP: fan จริงแบบพัดไพ่จีน pivot-rotation) ต่อใช้จริงแล้วใน `highNoble/index.tsx`
>
> ✅ **Ascendant Tier + The Crown Vault (2026-07-30)** — เชื่อม Main App กับ The Arena: entry gate จริง (`ascendantGate.ts`: token≥600k + Monarch Slayer + เคยปลด HighNoble + ครั้งเดียวต่อบัญชี, ไม่มี Account Age Gate — 180 วันเป็นเงื่อนไขคนละเส้นทาง "เส้นทางสำรอง" ผ่าน `progressionGate.arena`), `crownVaultService.ts` ใหม่คุม Buy Ascendant Pass (instant pass ถ้า token≥1M อยู่แล้ว)/Buy Arena Pass (ด่านสุดท้ายบังคับทั้ง 2 เส้นทาง)/Token→Crown Exchange, `routes/crownVault.ts` แยกจาก `shop.ts` เดิมที่ยังไม่ได้ register, atomic RPC ใหม่ 4 ตัวกัน race condition (`deduct_user_tokens`/`credit_user_crown`/`deduct_user_crown`/`exchange_token_to_crown`) — เทสใหม่ 25 เทสผ่านหมด, migration 010 ยังไม่ได้รัน (ดู pending #14)

**Pending (เรียงตาม priority):**
1. Profile screen — เชื่อม Supabase จริงแทน MOCK (ยังเหลือ `streakDays` ที่เป็น MOCK อยู่ — token/crown/xp/PS/monarch_victories ต่อ Supabase จริงแล้ว)
2. Auth Guard fix — display names `^user_[a-f0-9]{8}$`
3. **ก่อนเทส Nine Sentinels:** รัน `supabase/migrations/005_nine_sentinels.sql` บน Supabase dashboard เอง + `NOTIFY pgrst, 'reload schema';`
4. Nine Sentinels asset อยู่ที่ `client/assets/sentinels/boss_[id].png` (แยกจาก Four Gods/Monarch ใน `bosses/`) — ใช้รูปเดียวกันทั้ง portrait (select/story) และ avatar ในเกม ไม่มี square-crop แยก (ต่างจาก Four Gods ที่มี `_avatar.png` แยก) — ถ้าจะทำ crop จริงทีหลัง ต้องแก้ path ใน 3 ไฟล์: select.tsx, story.tsx, mastermind/index.tsx (BOSS_AVATAR map)
5. Auction bid style ตัวเลข (willBid %/level) ของ 9 Sentinels ใน `gameLoop.ts` เป็นการตีความจากคำอธิบายเชิงคุณภาพใน MasterPlan (canon ให้แค่คำบรรยาย ไม่ใช่ตัวเลข) — ควรปรับจูนหลัง playtest จริง
6. **Auto Sort Fee ฝั่ง High Noble ยังไม่หักเงินจริง** — ระบบทำเสร็จแล้วสำหรับ Adept (35) และ Mastermind (165): server-authoritative เต็มตัว (`requestAutoSort` ใน `gameLoop.ts` รองรับทั้ง `multiMatchStates` และ `matchStates`, client ได้แค่ "ขอ" ผ่าน `auto_sort_request` แล้วรอ `auto_sort_ack` ถึงจะจัดไพ่ให้) · ⚠️ **High Noble ปุ่มแสดง `750` ถูกต้องแล้วแต่เป็น hardcode และยังไม่หักเงิน** เพราะ Tier นั้นยังไม่ได้ wire Token Flow — ตอนทำ Tier A+ ต้องเปลี่ยนไปรับ `autoSortFee` จาก payload `round_start` เหมือน 2 Tier ก่อนหน้า และเอา `costBadge="750"` ที่ hardcode ไว้ออก
7. Boss Card Counting AI Enhancement (Pile2 Winner Signal) สำหรับ Crag+Cipher
8. **QA รวม:** สถานะเทสจริง ณ 2026-07-25 (หลังงาน Token Flow ครบ 3 Tier) = **232 passed / 7 failed (239 total, 16 suites)** — รายการ 6 suites เดิมที่เคยจดไว้ล้าสมัยแล้ว (`foulChecker`/`itemPhaseController`/`minionAI` กลับมาผ่านแล้ว ส่วน `pileResolution`/`aiFillSystem`/`blindAuction` ไม่มีไฟล์ในโปรเจคแล้ว) · ที่พังจริงตอนนี้เหลือ 2 suites: **`psEngine.test.ts` (6 เทส)** + **`adeptAFK.test.ts` Case 5 (1 เทส — `settleAndEndMultiMatch` คืน null)** ทั้งคู่พังมาก่อนงาน Token Flow Panel (พิสูจน์แล้วด้วยการ revert `gameLoop.ts` กลับ HEAD แล้วรันเทียบ) ต้องไล่แก้รวดเดียวตอน QA รวม + เพิ่ม QA flow ของ Mastermind Conquest (select→story→5 รอบ→conquest overlay→9/9 message) และ Monarch System (spawn/pity→personality lock→Pot×2 settlement→PS dual-track) เข้าไปในรอบ QA รวมนี้ด้วย · **อัปเดต 2026-07-30:** เทสรวมทั้งโปรเจค (รวมชุด Ascendant/Crown Vault ใหม่) ผ่านครบ 298/298 (20 suites) แล้ว — 2 suites ที่เคยพังข้างต้นกลับมาผ่านแล้วเช่นกัน แต่ยังไม่ได้ตรวจว่าแก้จากงานไหน เก็บไว้ยืนยันอีกทีตอน QA รวมจริง
9. **ก่อน push ขึ้น GitHub ครั้งแรก:** ต้องล้าง GitHub token ที่หลุดใน git history ของ `server/jest.config.js` (commit `ec11cc4`) ก่อน — ใช้ `git filter-repo` หรือ BFG rewrite history (destructive, ต้องขอยืนยันลุงก่อนรันจริง)
10. **High Noble Multiplayer — ยังไม่เทสผ่าน UI จริง:** สร้าง/เทสผ่านสคริปต์ socket.io-client ล้วน (bypass เบราว์เซอร์) เพราะ Dev Login ใช้ไม่ได้ (`test1@triplepoker.dev`/`password` ขึ้น "Invalid login credentials" จริงจาก Supabase) — ต้องหา dev account ที่ใช้ได้ หรือปิด email confirmation ชั่วคราวใน Supabase dashboard ก่อนเทส 3 เบราว์เซอร์จริง
11. **High Noble Multiplayer Grand Finale reconnect:** `resendHNRoundStartToPlayer` (ใช้ตอน client เปิด socket ใหม่หลัง matchmaking) รองรับแค่ phase `'arrangement'` เหมือนต้นแบบ Adept เดิม — ถ้า client หลุดแล้วต่อกลับระหว่าง auction/discard/grand_finale จะไม่ได้ state คืน (ต้องรอ disconnect handler แทนที่ด้วย AI แทน ไม่ true-reconnect)
12. **Monarch: token persistence gap แก้เฉพาะ High Noble** — เจอบั๊กเดิมว่า `match_end` คืนแค่ locked ante ไม่เคย persist ผลแพ้/ชนะจริงของแมตช์ลง `token_balance` เลย แก้แล้วเฉพาะ `highNobleMultiEngine.ts` (`persistHNNetTokenResult` ใน `gameLoop.ts`, ฟังก์ชันใหม่ ไม่แตะของเดิม) เพราะเป็น prerequisite ของ Monarch Pot×2 — บั๊กเดียวกันนี้น่าจะมีใน single-player และ Adept multiplayer ด้วย แต่อยู่นอกขอบเขตงานนี้ตามกติกาห้ามแตะ tier อื่น ต้องแก้แยกทีหลัง

13. **`server/tsconfig.json` พัง — `tsc` ใช้ตรวจ type ไม่ได้ทั้งโปรเจค:** `include` มี `tests/**/*` แต่ `rootDir` ตั้งเป็น `./src` → ทุกไฟล์ใน `tests/` โยน `TS6059` ออกมาหมดทุกครั้งที่รัน `tsc --noEmit` (น่าจะเป็นต้นเหตุที่ pending #8 เคยจดว่า "ส่วนใหญ่เป็น TS type error") โค้ดใน `src` เองสะอาด 0 error · แก้ได้ด้วยการเพิ่ม `tsconfig.build.json` แยกสำหรับ build หรือถอด `rootDir` ออก — เก็บไว้ทำตอน QA รวมตามกติกา "ไม่ไล่แก้ minor ระหว่างทาง"
14. **Ascendant Tier + Crown Vault — รอรัน migration + เทสจริง:** Backend (`ascendantGate.ts`/`crownVaultService.ts`/`routes/crownVault.ts`) และ Client MVP tab (`ShopScreen.tsx`'s "CROWN VAULT") เสร็จแล้ว เทสผ่าน 25 unit tests (ดูรายละเอียดที่ `crownVaultService.test.ts`/`ascendantGate.test.ts`) — ⚠️ ต้องรัน `supabase/migrations/010_ascendant_crown_vault.sql` บน Supabase dashboard เองก่อน (มี `NOTIFY pgrst, 'reload schema';` ให้แล้ว) ถึงจะเทส endpoint จริงได้ · ยังไม่ได้เทส UI ผ่านเบราว์เซอร์/มือถือจริงเลย (แซนด์บ็อกซ์รัน `nodemon`/WSL2 dev server ไม่ได้)
15. **Grandmaster (Tier S) — Audit 2026-08-07, Round 1+2 เสร็จ 2026-08-07:** เนื้อเกมจริงต่อครบวงจรแล้ว (จัดไพ่ → ตัดสินผู้ชนะ → หักเงินจริง) รายละเอียด:
    - **Round 1 (commit `aaa7b2e`):** gameplay projection จริงต่อ viewer ผ่าน `arenaProjection.ts` ใหม่ + personalized emit ใน `arenaSocket.ts` + บอท/AI ตอบสนองทันทีผ่าน `driveBots()`
    - **Round 2:** ไพ่ 11 ใบแบ่ง 3/3/5 (pile3 ยืดหยุ่น 3-6 ก่อน Discard) แบบเดียวกับ Tier ล่างทุกประการ (`server/src/arena/arrangement/arenaArrangement.ts` ใหม่ — พอร์ตจาก `foulChecker.ts`/`aiEngine.ts` ให้ใช้ `evaluateArenaHand`/`ArenaCard`) · `arenaMatchEngine.ts`: action `ARRANGE_1`/`FINAL_ARRANGE`/`FINAL_LOCK` รับ `{pile1,pile2,pile3}` จริงแทน `arrangementHash`, validate ทุกครั้งว่าตรงกับไพ่ที่ถืออยู่จริง (`heldCardIds`, canonical id = `arenaCardKey()` เดียวกับที่ client เห็น ไม่ใช่ `card.id` ดิบ — client reverse-map กลับไม่ได้), `RESOLVE_PILE_1/2/3` ตัดสินผู้ชนะจริงผ่าน `evaluateArenaHand` (solo-GF-survivor ชนะไม่ต้องเปิดไพ่ตาม spec §7.6) · **Settlement engine ต่อเข้า runtime จริงแล้ว** — `ArenaMatchEngine` มี `ArenaSettlementEngine` ฝังใน ยิง command จริงทุกจุด (Ante ตอน Deal, Auction/Call ตอนเกิดขึ้น, Boss Fee ครั้งเดียวตอนเริ่ม Match, Pile Payout ตอน resolve, Sweep Jackpot, End Match) → `arenaSocket.ts` drain แล้ว persist ผ่าน `ArenaSettlementPersistence` จริง, `BUY_IN_RESERVED` เช็คยอด `ArenaCrestLedger` จริงก่อนเข้าห้อง (ไม่หักเงินล่วงหน้า หักตามจริงที่เกิดขึ้น) · Client: `PlayerHandView.tsx` (shared component เดิมของ Tier ล่าง) ใช้จัดไพ่ tap-to-swap ใน `GrandmasterTableView.tsx` ช่วง ARRANGE_1/FINAL_ARRANGE/FINAL_LOCK + Discard sheet ใหม่
    - **Trade-off ที่ตั้งใจ (บันทึกไว้กันงงทีหลัง):** `bestArenaArrangement` (ใช้ทั้งเป็น AI arrangement และ timeout default) เปลี่ยนจาก brute force เต็มรูปแบบ (แบบ `aiEngine.ts` เดิม) มาเป็น greedy **ไม่เช็ค foul** เพราะ Joker wild ทำให้ `evaluateArenaHand` แพงกว่า `evaluateHand` มาก brute force เดิมช้าเกิน (~500ms/ครั้งตอน 12 ใบ) จะบล็อก event loop ทุก tick — บอทอาจ foul เองได้บ้าง (แค่เสียกองนั้น ไม่ crash)
    - **ยังไม่ทำ (milestone ถัดไป):** UI "เปิดไพ่ฝ่ายตรงข้ามตอน showdown" (`ArenaOverlays.tsx` ยังไม่มี surface นี้ — ตอนนี้ผลลัพธ์ถูกต้องแต่เห็นแค่ตัวเลข ไม่เห็นไพ่คู่แข่ง) · Sovereign (S+) ยังไม่มีหน้าจอโต๊ะเล่นจริง มีแค่ lobby (qualify/check-in/standby) — ดู pending เดิมเรื่องนี้แยกต่างหาก
    - เทส: `server/tests/arena/arenaArrangement.test.ts` ใหม่ + `arenaMatchEngine.test.ts` เพิ่ม settlement conservation test (ยืนยัน Crest รวมทั้งโต๊ะไม่หาย/ไม่เกิดเพิ่มตลอด Match จริงหลายรอบ) — ลด stress-test seed จาก 1,000 เหลือ 6-20 เพราะ arrangement คำนวณจริงแล้วช้ากว่า string ฟรีเดิมมาก (matchEngine test suite ทั้งไฟล์ ~50-90s)

**Deferred to v1.1:** XP/Leveling, Last Boss UI, Social, Push Notifications, Lottie, iOS

---

## 🔧 Workflow Rules

1. **Git:** ทำงานบน branch แยกเสมอ ห้าม commit ตรงเข้า main — ลุง review diff ก่อน merge
2. **SQL:** เขียน SQL ให้ลุงรันบน Supabase dashboard เอง — ห้าม execute SQL ตรง
3. **Assets:** boss art `boss_[key].png` (512×640) + avatar 256×256 ที่ `assets/bosses/` | card back `card_back_[skin_key].png` (360×504 @2x)
4. **เอกสาร:** pattern `TriplePoker_[Topic]_v[X]_[Y].md` — เอกสาร canon อยู่ที่ `docs/`
5. ก่อนรัน bash ที่เกี่ยวกับ path ให้ confirm path จริงก่อน
6. Tests ต้องผ่านครบก่อนถือว่างานเสร็จ — **baseline ล่าสุด ณ 2026-07-30: 298 passed / 298 total (20 suites)** ห้ามทำให้ตัวที่ผ่านอยู่ตก · baseline เดิม 2026-07-25 (232 passed / 7 failed / 239 total) ล้าสมัยแล้ว ดู pending #8 (ยังไม่ได้ตรวจว่า 2 suites ที่เคยพังแก้จากงานไหน) · เลข "197/197" เดิมเป็นตัวเลขที่ไม่เคยตรงกับของจริง · **วิธีรันบน Windows: `node node_modules\jest\bin\jest.js`** (ไม่มี `.bin/jest.cmd` เพราะ node_modules ถูก install จากฝั่ง WSL — `npx jest` จะขึ้น "not recognized")

## 🎨 Official Theme (WebsiteTheme_Spec_v1_0)

- BG: `#0F2418` / `#163A25` / `#1C4830` | Gold: `#FFD76A` / `#FFC857`
- Green Highlight: `#8DFFB5` | Red: `#FF6B6B` | Text: `#F5F2E8` / `#C8C4B0` / `#7A7A6A`
- Border: `#2A4A34` / `#3A5A44` | Fonts: Cinzel (heading) / Inter (body) / JetBrains Mono (ตัวเลข/token)