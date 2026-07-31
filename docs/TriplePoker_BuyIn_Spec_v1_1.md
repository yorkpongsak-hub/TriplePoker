# TriplePoker — Buy-in & Match Settlement Spec
> Version 1.1 | The Sage Unicorn Studio Co., Ltd. | Updated: July 16, 2026
> Canon Decisions confirmed by Founder — สอดคล้อง CoreRules v1.3 (Ante/Pot/Call/Debt Recovery)

**Changelog v1.1 (2026-07-16):**
- แก้บั๊ก game balance: **Buy-in Adept 1,000 → 2,000** — worst case จริง (คำนวณด้วย Ante จากโค้ดจริง) คือ 1,500 ซึ่งสูงกว่า Buy-in เดิม (1,000) ทำให้ "หมด stack กลางเกมเป็นไปไม่ได้" ไม่จริงตามที่ spec รับประกันไว้
- คำนวณ worst case ใหม่ทุก Tier ด้วย Ante/Call จริงจาก `gameConfig.ts` (แทนเลขเก่าจาก CoreRules v1.2) — เพิ่มคอลัมน์ Safety Margin ให้เห็นชัดว่าแต่ละ Tier ปลอดภัยแค่ไหน
- Tier อื่น (Initiate/Mastermind/High Noble/Last Boss) **ไม่เปลี่ยน Buy-in** — worst case จริงยังต่ำกว่า Buy-in เดิมอยู่แล้ว

> **MVP Freeze Addendum — 31 กรกฎาคม 2026:** `gameConfig.ts` เป็น Canon สำหรับ Beta:
> Initiate 500 · Adept 2,000 · Mastermind 15,000 · High Noble 30,000 · Last Boss 60,000
> ชุดนี้แทนตาราง v1.1 เดิมเฉพาะค่า Buy-in จนกว่าจะจบ Beta economy tuning

---

## 1. หลักการ: Escrow Model

```
เข้าโต๊ะ  → หัก Buy-in จาก DB ครั้งเดียว (escrow → table stack)
ระหว่างเล่น → Ante / Pot / Call / Auction ทั้งหมดหักจาก stack ใน memory
             (server-side เท่านั้น — ไม่แตะ DB, client ห้ามคำนวณเอง)
จบแมตช์  → Settle ครั้งเดียว: token = token − buyin + finalStack
```

**เหตุผล:** DB write เหลือ 2 ครั้ง/แมตช์/คน · กันโกงหนีกลางเกม (token ถูก escrow แล้ว) · ตัด race condition

---

## 2. ตาราง Buy-in ต่อ Tier ⭐ Canon (v1.1 — recalculated จาก Ante จริงใน gameConfig.ts)

> ที่มา: worst case ต่อแมตช์ 5 rounds = (Ante รวม + Call สูงสุด 2 rounds) × 5 โดยไม่ได้ Pot คืนเลย
> Ante รวม/คน และ Call max อ้างอิงจาก CoreRules v1.3 (Section 2.1 / 3) — sync กับ `gameConfig.ts` จริง

| Tier | Ante/hand | Max optional/hand | Maximum ×5 | **Buy-in** | หมายเหตุ |
|------|-----------|-------------------|------------|------------|----------|
| Initiate | 70 | — | 350 | **500** | ครอบคลุมทั้งหมด |
| Adept | 300 | Auto Sort 35 | 1,675 | **2,000** | ครอบคลุมทั้งหมด |
| Mastermind | 1,000 | Auto Sort 165 + Auction 150 + Call 300×2 | 9,575 | **15,000** | ครอบคลุมทั้งหมด |
| High Noble | 3,000 | Auto Sort 750 + Auction 500 + Call 1,000×2 | 31,250 | **30,000** | ครอบคลุม Ante; optional action ต้อง disable เมื่อ Stack ไม่พอ |
| The Last Boss *(Arena Phase 3 — reserve ค่าไว้)* | 6,000 | Auction 1,000 + Call 2,000×2 | 55,000 | **60,000** | Arena ห้าม Auto Sort |

**คุณสมบัติสำคัญสำหรับ MVP:** Buy-in ครอบคลุม Ante บังคับครบ 5 รอบทุก Tier
ส่วน action ที่เลือกจ่ายเองต้องตรวจ Stack ฝั่ง server และ disable/reject เมื่อเงินไม่พอ โดยเฉพาะ High Noble
Debt Recovery Flow (CoreRules หมวด 4) คงไว้เป็น safety net — ไม่ถูกเรียกใช้ในกรณีปกติ
> v1.1: ทุก Tier ผ่านเงื่อนไขนี้แล้ว (Adept เดิมไม่ผ่าน — แก้แล้วในรอบนี้)

**AI Virtual Buy-in:** AI ทุกตัวได้ virtual stack = Buy-in เท่ากับ Human (แทนกติกาสุ่ม 1.5–3.0× เดิม
เพื่อให้ stack บนโต๊ะเท่ากันทุกขา — อัปเดต CoreRules ในรอบถัดไป)

---

## 3. Flow การเข้าโต๊ะ

```
ผู้เล่นเลือก Tier ใน Lobby
    │
    ├─► token < Buy-in?
    │       └─► Popup "Not Enough Tokens"
    │               ├─► [Watch Ad] → +500 token/ad (rate เดิมตาม Debt Flow)
    │               │       └─► วนจนพอ → เข้า flow ปกติ
    │               ├─► [Buy Tokens] → ไป Shop
    │               └─► [Cancel] → กลับ Lobby
    │
    ├─► ครั้งแรกของ Tier นี้?
    │       └─► Confirm Dialog: "Entry Buy-in: X tokens. This amount is
    │           deducted now and settled when the match ends."
    │           [Confirm] / [Cancel]
    │           — แสดงเฉพาะครั้งแรกต่อ Tier (flag ใน AsyncStorage:
    │             buyInConfirmed_[tier]) ครั้งถัดไปหักเงียบ + toast แจ้งยอด
    │
    └─► Server หัก Buy-in จาก DB (atomic) → สร้าง table stack → เข้าโต๊ะ
```

---

## 4. Settlement ตอนจบแมตช์

| กรณี | การ Settle |
|------|-----------|
| จบแมตช์ปกติ (ครบ 5 rounds) | token = token − buyin + finalStack (DB write 1 ครั้ง) |
| ผู้เล่นกด Lobby กลางเกม / หลุด / หนี | settle ทันทีด้วย **stack ที่เหลือ ณ ตอนนั้น** — Ante ที่จ่ายเข้า Pot ไปแล้วไม่คืน (Pot ค้าง → จบ hand ตามกติกาเดิม, AI ชนะ = burn) |
| Server crash กลางแมตช์ | Recovery: escrow record ใน DB มีสถานะ `in_match` → restore stack จาก snapshot ล่าสุด หรือคืน buyin เต็ม (fail-safe เข้าข้างผู้เล่น) |

**DB Schema เพิ่ม:** ตาราง `match_escrow`
```
escrow_id | user_id | tier | buyin_amount | status (in_match/settled/refunded)
| final_stack | created_at | settled_at
```
> SQL รัน manual ใน Supabase Dashboard เสมอ — server ใช้ service_role client

---

## 5. gameConfig.ts

```typescript
// ─── Buy-in per Tier (Escrow Model) ───
buyIn: {
  initiate:   500,
  adept:      2000,  // v1.1: แก้จาก 1000 — worst case จริง 1,500 สูงกว่า buy-in เดิม (บั๊ก game balance)
  mastermind: 15000,
  highNoble:  30000,
  lastBoss:   60000,  // reserve — Arena Phase 3
},
adRescueAmount: 500,  // token ต่อ 1 rewarded ad (ตาม Debt Flow เดิม)
```

**สิ่งที่ต้องลบ:** ค่า hardcode 5,000 ที่ใช้ทุก Tier อยู่ตอนนี้

---

## 6. UI ที่เกี่ยวข้อง

- **Tier card ใน Lobby:** แสดง Buy-in ใต้ชื่อ Tier เช่น "Buy-in: 9,000" (JetBrains Mono, Gold #FFC857)
- **Confirm Dialog (ครั้งแรก/Tier):** ตาม Section 3 — ปุ่มใช้ ActionButton style
- **Toast ครั้งถัดไป:** "Buy-in deducted: −9,000" มุมบน แสดง 2 วิ
- **In-table stack display:** Top Bar แสดง stack ปัจจุบัน (ไม่ใช่ token ใน DB) — label "STACK"
- **Result Panel:** แสดงบรรทัด "Buy-in −X / Returned +Y / Net ±Z" ก่อนแถว Final Token Balance

---

*TriplePoker Buy-in & Match Settlement Spec v1.1 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
