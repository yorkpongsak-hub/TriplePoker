# Session Handoff — 2026-08-14 (branch: `feature/central-economy-ledger`)

> ไฟล์นี้เขียนไว้ให้ session ใหม่ (หลังพักเที่ยง) อ่านแล้วทำต่อได้ทันที ไม่ต้องไล่อ่านแชทเก่าทั้งหมด
> ลบไฟล์นี้ทิ้งได้เมื่ออ่าน/ทำต่อเสร็จแล้ว ไม่ใช่ไฟล์ถาวรของโปรเจค

## ⚠️ สำคัญที่สุด: ยังไม่ได้ commit อะไรเลยในเซสชันนี้

HEAD ยังอยู่ที่ `800fd13` (จุดเริ่มเซสชัน) — งานทั้งหมดด้านล่างเป็น **uncommitted working tree changes** ล้วนๆ
(`git status` แสดง 15 ไฟล์ modified + 7 ไฟล์ untracked) ไฟล์ยังอยู่บนดิสก์ปกติ session ใหม่จะเห็นครบ
แต่ถ้าลุงอยากให้ commit ไว้ก่อนพัก (กันเผลอ `git checkout`/`stash` ทับ) บอกได้เลย ยังไม่ได้ commit ตามกติกา
"commit เมื่อขอเท่านั้น"

```
git status --short
 M client/app/(auth)/login.tsx
 M client/app/(auth)/setup-profile.tsx
 M client/app/(home)/lobby.tsx
 M client/app/(home)/profile.tsx
 M client/app/(home)/victory.tsx
 M client/app/game/adept/index.tsx
 M client/app/game/highNoble/index.tsx
 M client/app/game/initiate/index.tsx
 M client/app/game/mastermind/index.tsx
 M client/src/store/authStore.ts
 M server/src/config/gameConfig.ts
 M server/src/economy/economyTypes.ts
 M server/src/game/matchStatsService.ts
 M server/src/routes/profile.ts
 M server/tests/game/matchStatsStreakLedger.test.ts
?? client/app/(home)/streak.tsx
?? client/app/(home)/watch-ad.tsx
?? client/src/components/vfx/RoyalStraightFlushVFX.tsx
?? server/tests/game/streakMilestone.test.ts
?? server/tests/routes/profileStreakClaim.test.ts
?? supabase/migrations/042_users_email_nullable_for_guest.sql
?? supabase/migrations/043_streak_claimed_milestone.sql
```

**สถานะเทส ณ ตอนนี้:** `tsc --noEmit` สะอาดทั้ง client/server, jest full suite **84/84 suites, 784/784 tests
ผ่านหมด** (ใช้ `node node_modules/typescript/bin/tsc --noEmit -p .` และ `node node_modules/jest/bin/jest.js`
บน Windows — `npx tsc` เจอ error "not this tsc command" ต้องเรียกไฟล์ตรงแบบนี้เท่านั้น)

---

## Migrations — รันครบแล้วทั้ง 2 ไฟล์ (ลุงยืนยันแล้ว)

- `042_users_email_nullable_for_guest.sql` — แก้ `public.users.email` ให้ nullable (Guest Play bug)
- `043_streak_claimed_milestone.sql` — เพิ่มคอลัมน์ `streak_claimed_milestone` (Streak Milestone Bonus)

ไม่มี migration ค้างรออีกแล้ว ณ จุดนี้

---

## งานที่ทำเสร็จในเซสชันนี้ (เรียงตามลำดับ)

### 1. ปิดเคส -250 TOKEN reconciliation drift
Migration 038 (Round 4 High Noble correction) ที่เข้าใจผิดว่ารันไปแล้วตั้งแต่ session ก่อน จริงๆ ไม่เคยรัน —
เจอจาก `economy_reconciliation()` โชว์ diff -250 ตอนเช้า ให้ลุงรัน SQL correction แล้ว **ยืนยันแล้วว่า
TOKEN/CREST difference = 0 ทั้งคู่** ปิดเคสสมบูรณ์

### 2. Guest Play "Play Now" — แก้ 3 ชั้นปัญหาซ้อนกัน
1. Anonymous Sign-In ยังไม่เปิดใน Supabase dashboard → ลุงเปิดแล้ว
2. Metro/Expo บน WSL2 ไม่จับการแก้ไฟล์จากฝั่ง Windows (`/mnt/c/...`) — ต้อง restart dev server เต็มตัว
   ไม่ใช่แค่ reload บนมือถือ **อัปเดต memory ของโปรเจคแล้ว** (`project_wsl2_nodemon_no_autoreload.md`) ว่า
   Metro ก็เจอปัญหานี้เหมือน nodemon ฝั่ง server ไม่ใช่แค่ server อย่างที่เคยจดไว้ผิด
3. `public.users.email` เป็น `NOT NULL` ชนกับ anonymous user ที่ไม่มี email → migration 042 แก้แล้ว

Guest Play ทำงานได้แล้วครบ flow (เข้าเล่น Initiate ทันทีไม่ต้องสมัคร)

### 3. Setup Profile — เพิ่ม Email/Password แบบตัวเลือกสำหรับ Guest
`client/app/(auth)/setup-profile.tsx` — guest ที่ตั้งชื่อจากหน้านี้ตอนนี้เห็นช่อง Email/Password เพิ่ม
(ไม่บังคับ) ถ้ากรอกจะเรียก `supabase.auth.updateUser()` แปลง anonymous → บัญชีถาวรจริง ถ้าเว้นว่างข้ามได้
(มติ: MVP ไม่บังคับ)

### 4. Confetti VFX zIndex bug (regression, ไม่ใช่บั๊กใหม่)
ริบบิ้น confetti ตอนชนะแมตช์หายไปอยู่หลัง ResultPanel — เจอว่า fix เดิม (commit `9f668ce`) ไม่เคย merge
เข้า branch นี้เลย พอร์ตกลับมาให้ครบ 4 Tier (initiate/adept/mastermind/highNoble)

### 5. P2/P4 ไพ่ในมือ Initiate — จาก 2.5D tilt กลับเป็นแนวดิ่งธรรมดา
`client/app/game/initiate/index.tsx`'s `SideSeat` component — ลบ `rotate` transform ออก เปลี่ยน
`flexDirection: row→column` ตามที่ขอ (โต๊ะแรกสุดควรมี layout พื้นฐานที่สุด)

### 6. Victory Screen — แปลข้อความไทยที่หลุดมาเป็นอังกฤษทั้งหมด
7 จุด (headline/percentile/XP/ปุ่มต่างๆ) — ตรงตาม CLAUDE.md ข้อ 2 (UI ต้องอังกฤษทั้งหมด)

### 7. ระบบ Ad Gate ทั้งแอป (งานใหญ่สุดของเซสชันนี้)
- **หน้ากลางใหม่** `client/app/(home)/watch-ad.tsx` — รับ `?mode=reward|gate` + `?returnTo=`
  - `mode=reward` (default) — ดูจบ → เรียก `/rewards/watch-ad` แจก Token จริง (ของเดิม)
  - `mode=gate` (ใหม่) — ดูจบ → **ไม่มีรางวัล** แค่ปล่อยผ่าน (ใช้เป็นด่านก่อนเข้าเล่น)
  - แสดง **RoyalStraightFlushVFX** (พอร์ตจาก commit `706bcdd` ที่ไม่เคย merge เข้า branch นี้เหมือนกัน)
    แทนปุ่ม "Watch Ad" ธรรมดา — placeholder ก่อนต่อ AdMob SDK จริง — **บังคับดูอย่างน้อย 15 วิ** ก่อนปุ่ม
    SKIP จะโผล่
- **เชื่อม 3 จุดเดิมเข้าหน้านี้:** Tier Unlock (profile.tsx), Post-Match Victory Screen (victory.tsx —
  ลบ inline ad step เดิมทิ้ง), Lobby rescue-ad (โทเคนไม่พอเข้าโต๊ะ)
- **เพิ่ม 3 จุดใหม่ใน Lobby** (`mode=gate`, สมาชิกฟรีต้องดูก่อน VIP ข้ามได้):
  1. Solo mode entry — ปุ่ม Initiate + Mastermind
  2. Multiplayer entry ก่อน Auto-Match — ปุ่ม Adept + High Noble
  3. Grandmaster (Tier S/Arena) entry — จุดที่เสนอเองแล้วลุงเห็นด้วย
  - กลไก resume: กด → เด้ง `/watch-ad?mode=gate&returnTo=/lobby?autoEnter=<tier>` → ดูจบ → กลับมาพร้อม
    query param `autoEnter` → Lobby เรียก action เดิมต่ออัตโนมัติ (รวมเช็ค buy-in เดิมด้วย) แล้วเคลียร์ param
  - **ตั้งใจไม่แตะ:** ปุ่ม Private Room (Create/Join PIN) และปุ่ม retry ใน popup "Table Closed" — ลุง
    ยืนยันแล้วว่า Private Room/VIP Plus เป็นช่องทาง VIP-exclusive อยู่แล้ว ไม่มีทางที่สมาชิกฟรีจะเจอ
    ad-gate ตรงนั้นได้อยู่แล้วโดยธรรมชาติ ไม่ต้องแก้เพิ่ม

### 8. ระบบ Streak Milestone Bonus ใหม่ทั้งระบบ (แทนที่ของเดิม)
**มติสำคัญที่ตกลงกันไว้ (ต้องรู้ก่อนทำต่อ):**
- แทนที่ระบบ Daily Play Streak เดิม (auto-grant Token ทุกวัน 1-7, ไม่มีหน้า, ไม่มี ad) **เฉพาะส่วน TOKEN**
- **XP ต่อวันยังแจกอัตโนมัติเหมือนเดิมทุกประการ ไม่ได้แตะ** (`computeDailyPlayStreak()` ทั้งฟังก์ชันไม่แก้เลย
  gameConfig เดิม `playStreak.rewards` ก็ไม่แก้ — แค่เลิกอ่านค่า `tokenReward` ของมันไปมิ้นท์)
- Milestone ใหม่: **วันที่ 3=300 / 5=500 / 7=1000 Token** (วันที่ 1 ไม่มีรางวัล) ต้องกด **Claim เอง**
- นับวันสำเร็จยังต้องเล่นจบแมตช์ก่อนเหมือนเดิม — แต่หน้า Streak เข้าได้ตลอดเวลาจาก Profile (ไม่ผูกกับ
  หลังแมตช์แบบ Victory Screen)
- ครบ 7 วัน/สตรีคขาด → `streak_claimed_milestone` รีเซ็ตเป็น 0 อัตโนมัติ (ฝั่ง `matchStatsService.ts`)

**ไฟล์ที่เกี่ยวข้อง:**
- `server/src/game/matchStatsService.ts` — export `getBangkokDateString`, เพิ่ม `STREAK_MILESTONES`/
  `getClaimableStreakMilestone()` pure function ใหม่, ลบ auto-mint loop เดิมทิ้ง, เพิ่ม
  `streak_claimed_milestone` field + reset-on-day1 logic
- `server/src/config/gameConfig.ts` — เพิ่ม `dailyEconomy.streakMilestoneRewards = {3:300,5:500,7:1000}`
  (แยกจาก `playStreak.rewards` เดิมโดยสิ้นเชิง)
- `server/src/economy/economyTypes.ts` — เพิ่ม `EconomyReason` ใหม่ `'STREAK_MILESTONE_BONUS'`
- `server/src/routes/profile.ts` — เพิ่ม `POST /profile/claim-streak-reward` (ไม่เช็ค VIP/ad เลย —
  client เป็นคนบังคับ ad-gate เองก่อนเรียก endpoint นี้)
- `client/app/(home)/streak.tsx` (ใหม่) — หน้า UI แสดง progress 4 จุด (1/3/5/7) + ปุ่ม Claim
- `client/app/(home)/profile.tsx` — การ์ด STREAK (🔥) กดได้แล้ว → เข้าหน้า `/streak`
- `client/src/store/authStore.ts` — เพิ่ม field `streak_claimed_milestone`

---

## งานที่ยังไม่ได้เทสสดบนมือถือ (รอลุงเทสหลังพักเที่ยง)

เรียงตาม priority ที่น่าจะเทสก่อน:
1. **Streak Milestone Bonus** (เพิ่งทำเสร็จ ยังไม่เคยเทสสดเลยสักครั้ง) — เล่นจบแมตช์ถึงวันที่ 3 ลองกด
   Claim ทั้งแบบ VIP (ข้าม ad ตรงเข้า) และแบบสมาชิกฟรี (ต้องผ่าน `/watch-ad?mode=gate` ก่อน) เช็คว่า
   token เข้าจริง + หน้า `/streak` เข้าจาก Profile ได้
2. **Ad Gate 3 จุดใหม่ใน Lobby** (Solo/Multiplayer/Grandmaster) — เช็คว่าสมาชิกฟรีโดนกันก่อนเข้าเกมจริง
   VIP ข้ามได้จริง และหลังดูโฆษณาจบ auto-resume เข้าเกมได้ถูกต้อง (ไม่ต้องกดปุ่มซ้ำ)
3. **Ad Gate 3 จุดเดิมที่เชื่อมใหม่** (Tier Unlock/Victory Screen/Lobby rescue-ad) — เช็คว่ายังทำงานถูกต้อง
   หลัง refactor ไปใช้หน้ากลาง (โดยเฉพาะ Victory Screen ที่ตัด inline step เดิมทิ้งไปเลย)
4. **RoyalStraightFlushVFX** บน `/watch-ad` — เช็คว่า render ถูกต้อง วนซ้ำได้ ปุ่ม SKIP โผล่หลัง 15 วิพอดี
5. Confetti zIndex fix — เช็คว่าริบบิ้นลอยเหนือแผงผลสรุปจริงในทั้ง 4 Tier
6. P2/P4 ไพ่แนวดิ่งใน Initiate — เช็คตำแหน่ง/ระยะห่างจริงบนจอ (offsetX/Y รีเซ็ตเป็น 0 อาจต้องขยับเพิ่ม)
7. Guest Play flow เต็ม — Play Now → เล่นจบ Initiate ชนะ → Victory Screen → กด Register → ตั้ง
   Email/Password (หรือข้าม) → setup-profile สำเร็จ

---

## Scope ที่ตั้งใจไม่ทำ (ถ้าลุงถามว่า "ทำไมจุดนี้ไม่มี")

- Private Room (Create/Join PIN) และ "Table Closed" retry buttons — ไม่มี ad-gate (VIP-exclusive/ไม่ได้ขอ)
- Streak Milestone Bonus ไม่มี XP component เลย (เฉพาะ TOKEN) — XP ต่อวันเดิมยังทำงานแยกอิสระ
- ยังไม่ต่อ AdMob SDK จริง — `/watch-ad` ทุก mode ยังเป็น placeholder VFX ทั้งหมด

---

## คำสั่งที่ต้องจำ (Windows quirks จากเซสชันนี้)

```bash
# Type-check (npx tsc พังบน Windows ในโปรเจคนี้ ต้องเรียกตรง)
cd client && node node_modules/typescript/bin/tsc --noEmit -p .
cd server && node node_modules/typescript/bin/tsc --noEmit -p .

# Jest (npx jest ก็พังเหมือนกัน)
cd server && node node_modules/jest/bin/jest.js
```

หลังแก้ไฟล์ฝั่ง client หรือ server ต้อง **restart dev server เต็มตัว** เสมอ (Ctrl+C แล้ว
`npx expo start --clear` / `npm run dev`) — reload บนมือถืออย่างเดียวไม่พอ เพราะ WSL2 ไม่จับการแก้ไฟล์จาก
ฝั่ง Windows ทั้ง Metro และ nodemon (ดู memory `project_wsl2_nodemon_no_autoreload.md`)
