# TriplePoker: Rise — Economy & Progression Spec v2.0

**สถานะ:** Canon — ใช้แทน Economy section ใน CoreRules v1.2 ที่ขัดกัน  
**วันที่:** 30 กรกฎาคม 2026  
**ผ่านการตัดสินใจโดย:** ลุงเยาะ (Founder & Chief Architect)  
**อ้างอิง:** TriplePoker_Rise_Tier_Economy_6_Month_Progression.md, TriplePoker_Rise_Economy_Simulation_5_Rounds.md  
**Simulation:** Monte Carlo 3,000 runs/profile, 5 rounds/match, Rake 5%

> **MVP Freeze Addendum — 31 กรกฎาคม 2026:** เพื่อปิด Release Candidate ภายในกันยายน
> ให้ `server/src/config/gameConfig.ts` เป็น Canon สำหรับ Ante/Pot และ Buy-in ชั่วคราวตลอด MVP/Beta
> โดยคงชุดค่าที่ผ่าน Token Flow implementation และ mobile test แล้วตาม §3 ด้านล่าง
> ตัวเลข simulation เดิมในเอกสารนี้ต้องรันใหม่หลัง Beta ก่อนปรับ economy รอบ Production

---

## 1. เป้าหมายหลัก

ออกแบบ economy ที่:

- ผู้เล่นระดับ Competent (กลุ่มเป้าหมายหลัก) ใช้เวลา ~3 สัปดาห์ถึง Mastermind, ~3 เดือนถึง High Noble
- **Strong player เท่านั้น** ที่ถึง Arena (S+) ใน 6 เดือน — Arena = Elite content
- Competent ถึง Arena ราวเดือนที่ 7–8 ซึ่งเป็น buffer ให้พัฒนา TriplePoker: The Arena
- Token ไม่เฟ้อจนผู้เล่นนั่งรอ Time Gate เฉย ๆ — economy ตึงตลอดทาง

---

## 2. สิ่งที่เปลี่ยนจาก Canon เดิม

| รายการ | ค่าเดิม (CoreRules v1.2) | ค่าใหม่ (Spec นี้) | เหตุผล |
|---|---|---|---|
| Grand Finale Call (Mastermind) | 600 | **300** | Call คือตัวปั๊ม token หลัก (~84% ของกำไร Strong ที่ HighNoble) ลดครึ่งเพื่อชะลอไม่ให้ถึง 1M ก่อน 3 เดือน |
| Grand Finale Call (High Noble) | 2,000 | **1,000** | เหตุผลเดียวกัน |
| Grand Finale Call (Last Boss) | 4,000 | **2,000** | สัดส่วนเดียวกัน |
| Token Range ทั้งชุด | 10k/40k/100k | **6k/20k/100k/1M** | Align กับ Progression Gate threshold + timeline ใหม่ |
| Progression Gate | ไม่มี | **Token + Time + Skill (3 แกน)** | คุมความเร็วไม่ให้ขึ้น tier เร็วเกินไป Time Gate เป็นตัวคุมหลัก |

---

## 3. สิ่งที่คงเดิม (ไม่แตะ)

- Ante/Pot ทุก Tier: C 10/20/40, B 60/100/140, A 200/300/500, A+ 500/1,000/1,500
- Auto Sort Fee: Initiate 0, Adept 35, Mastermind 165, High Noble 750 (ตามมติ 2026-07-25 — สูตร % ของ Ante กอง 3, อ่านผ่าน `getAutoSortFee()` ใน gameConfig.ts เสมอ)
- Buy-in: Initiate 500, Adept 2,000, Mastermind 15,000, High Noble 30,000, Last Boss 60,000
- Rake: 5% ทุก tier ทุก case
- Daily Income: 700 Token/วัน (Daily Refill 500 + Login Ad Bonus 200)
- Starting Token: 3,000
- Timer: Initiate locked, Adept 90s, Mastermind 105s, High Noble 120s

---

## 4. Grand Finale Call — Single Source of Truth

```ts
grandFinale: {
  callAmount: {
    initiate:   null,   // ไม่มี Grand Finale
    adept:      null,   // ไม่มี Grand Finale
    mastermind: 300,    // เดิม 600 → ลดครึ่ง
    highNoble:  1_000,  // เดิม 2,000 → ลดครึ่ง
    lastBoss:   2_000,  // เดิม 4,000 → ลดครึ่ง
  }
}
```

### กฎ Implement

- ลบ `call` ออกจาก `tokenPot.tiers` หรือหยุดอ่านค่าจากตำแหน่งนั้น
- Client, Server, Bot และ UI ต้องเรียก helper เดียวกัน
- เพิ่ม validation ตอนเริ่มระบบ เพื่อแจ้ง error หาก Tier ใดมีค่า Call ซ้ำหรือขัดกัน

---

## 5. Token Range

```ts
tierRanges: {
  initiate:   { min: 100,         max: 5_999 },
  adept:      { min: 6_000,       max: 19_999 },
  mastermind: { min: 20_000,      max: 99_999 },
  highNoble:  { min: 100_000,     max: 999_999 },
  lastBoss:   { min: 1_000_000,   max: Infinity },
}
```

- Token Range `min` = Progression Gate `minToken` (ต้อง align เสมอ)
- Token Range ใช้กำหนดระดับเศรษฐกิจ แต่ **ยอด Token เพียงอย่างเดียวต้องไม่ปลดล็อก Tier** — ต้องผ่านครบ 3 แกน

---

## 6. Progression Gate (3-Axis)

| ปลดล็อก | minToken | minDays | Skill Gate (MVP) |
|---|---:|---:|---|
| Adept (B) | 6,000 | 3 วัน | "pass" (ผ่านไว้ก่อน) |
| Mastermind (A) | 20,000 | 10 วัน | "pass" (ผ่านไว้ก่อน) |
| High Noble (A+) | 100,000 | 90 วัน | "pass" → wire Nine Sentinels ทีหลัง |
| Ascendant Star | 600,000 | (ไม่มี time gate เพิ่ม) | monarchSlayer (คงเดิม) |
| Arena / S+ | 1,000,000 | 180 วัน | "pass" → wire เงื่อนไข Arena ทีหลัง |

### กฎสำคัญ

- การปลดล็อกเกิดขึ้นต่อเมื่อ **ผ่านครบทุกเงื่อนไข** ไม่ใช่ผ่านเงื่อนไขใดเงื่อนไขหนึ่ง
- Tier ที่ปลดล็อกแล้ว **ไม่ถูกลดเมื่อ Balance ลดลง**
- `minDays` นับจาก **account creation date (server-side, timezone Asia/Bangkok)** — anchor เดียวกับ Ascendant gate
- Client ห้ามคำนวณ minDays เอง — ต้องขอจาก Server เท่านั้น
- Skill Gate `"pass"` = boolean flag default true → เปลี่ยนเป็น false + wire logic เมื่อ Nine Sentinels / Monarch implement เสร็จ

### โครงสร้าง Config

```ts
progressionGate: {
  adept:      { minToken: 6_000,     minDays: 3,    skill: "pass" },
  mastermind: { minToken: 20_000,    minDays: 10,   skill: "pass" },
  highNoble:  { minToken: 100_000,   minDays: 90,   skill: "pass" },
  ascendant:  { minToken: 600_000,   minDays: null,  skill: "monarchSlayer" },
  arena:      { minToken: 1_000_000, minDays: 180,  skill: "pass" },
}
```

---

## 7. Timeline ที่ได้จาก Simulation (Median)

| Tier | Casual (2 match/d) | Competent (3 match/d) | Strong (4 match/d) |
|---|---|---|---|
| Adept | D5 | D4 | D4 |
| Mastermind | D35 | **D21** | D14 |
| High Noble | never (token ไม่ถึง) | **D90** (time gate) | **D90** (time gate) |
| Arena ≤180d | 0% | 3% (ถึงเดือน 7–8) | **100%** |
| Token@D180 | ~6,900 | ~805,000 | ~2,500,000 |

### ข้อสังเกตจาก Simulation

- **Mastermind คือ tier ที่ผู้เล่นอยู่ยาวที่สุด** (~D21–D90 สำหรับ Competent = ~70 วัน) — ต้องมี content เพียงพอ: Fog of War, Blind Auction, Grand Finale, Nine Sentinels 5-round conquest
- **Casual ไม่ถึง High Noble ใน 180 วัน** — เพราะเล่น 2 match/วัน + win prob ต่ำ token ไม่โต ต้องเล่นมากขึ้นหรือซื้อ Token (IAP) ซึ่งเป็น monetization ที่ตั้งใจ
- **Strong ถึง 1M ตั้งแต่ ~D51** แต่ถูก Time Gate 180 กัน — ช่วงนี้ token ยังโตต่อไม่สูญหาย เป็นรอยต่อก่อน Arena
- **Grand Finale Call คือตัวปั๊ม token หลัก** (~84% ของกำไร Strong ที่ HighNoble) การลดครึ่งจึงมีผลมากกว่าลด Ante

---

## 8. getTierFromToken() Refactor

ต้อง refactor เป็น ceiling model ตาม Token Range ใหม่:

```ts
// เดิม: getTierFromToken(balance) → tier เดียว
// ใหม่:
getMaxTierFromToken(balance): TierName    // tier สูงสุดที่ balance เอื้อ
getPlayableTiers(user): TierName[]        // tier ที่ปลดล็อกแล้ว (ไม่ลด tier เมื่อ balance ต่ำ)
canUnlockTier(user, tier): { passed: boolean, missing: string[] }  // เช็ค 3 แกน
```

- `getPlayableTiers` ต้องตรวจ Progression Gate ครบ 3 แกนก่อนเพิ่ม tier ใหม่เข้า list
- tier ที่ปลดล็อกแล้วต้องเล่นได้เสมอแม้ balance ต่ำกว่า min (แต่ต้องมี buy-in พอ)
- Scheduled Tier Window system ใช้ `getPlayableTiers` แทน `getTierFromToken` เดิม

---

## 9. Server Authority

Server ต้องเป็นผู้ตัดสิน:

- Tier ปัจจุบัน + tier ที่ปลดล็อกแล้ว
- อายุบัญชีและ Time Gate (นับจาก `created_at` ใน `public.users`)
- Token Balance
- Skill Gate progress
- สิทธิ์เข้า Queue ของแต่ละ Tier
- การหัก Call, Ante, Auction, Auto Sort และ Rake
- การจ่าย Pot และรางวัล

Client มีหน้าที่แสดงผลและส่งคำขอเท่านั้น ห้ามเชื่อถือค่า Tier, Token หรือวันที่จาก Client

---

## 10. Test Cases ขั้นต่ำ

- มี Token ถึง threshold แต่วันไม่ครบ → ห้ามปลดล็อก
- วันครบ แต่ Token ไม่ถึง → ห้ามปลดล็อก
- Token และวันครบ แต่ Skill Gate ยังไม่ผ่าน → ห้ามปลดล็อก (เมื่อ wire แล้ว)
- ผ่านครบทั้ง 3 Gate → ปลดล็อก tier ได้
- Client แก้วันที่เครื่อง → ไม่มีผลต่อ Time Gate
- Tier ที่ปลดล็อกแล้ว + balance ต่ำกว่า range min → ยังเล่น tier นั้นได้ (ถ้ามี buy-in พอ)
- Skill Gate = "pass" → ไม่ block (default MVP)

---

## 11. ลำดับ Implement (MVP)

1. แก้ `gameConfig.ts`: Call Amount ลดครึ่ง + Token Range ชุดใหม่
2. รวม Call Amount ให้เหลือ Single Source of Truth (`grandFinale.callAmount`)
3. เพิ่ม `progressionGate` config ใน `gameConfig.ts`
4. Refactor `getTierFromToken()` → ceiling model (`getMaxTierFromToken` + `getPlayableTiers` + `canUnlockTier`)
5. เพิ่ม Server validation: ตรวจ 3 แกนก่อนปลดล็อก tier
6. ปรับ Lobby/Matchmaking ให้ใช้ `getPlayableTiers` แทน
7. เพิ่ม `unlocked_tiers` field ใน DB (หรือคำนวณ on-the-fly จาก account age + token + skill flags)
8. เขียน Unit Test ตาม Test Cases ข้อ 10

---

## 12. Spec ที่ถูกแทนที่

| Spec เดิม | Section ที่ถูกแทน |
|---|---|
| CoreRules v1.2 | `callAmount` values (600/2,000/4,000 → 300/1,000/2,000) |
| CoreRules v1.2 | Token Range / tier boundaries |
| TriplePoker_Rise_Tier_Economy_6_Month_Progression.md | Token Range, Time Gate values (ปรับตาม timeline ใหม่) |
| TriplePoker_Rise_Economy_Simulation_5_Rounds.md | ใช้เป็นฐาน simulation แต่ค่าใน spec นี้เป็น canon |

Spec อื่นที่ **ยังคงเดิม** ไม่ถูกแทนที่: AutoSortFee v2.0, BuyIn v1.1, Monarch v1.3, Ascendant v1.1, TierWindow v1.0, LobbyMatchmaking v1.1
