# TriplePoker — Buy-in & Match Settlement Spec
> ⚠️ DEPRECATED — ใช้ v1.1 แทน (docs/TriplePoker_BuyIn_Spec_v1_1.md)
> Buy-in Adept ในไฟล์นี้ (1,000) เป็นค่าเก่าที่มีบั๊ก game balance — ถูกแก้เป็น 2,000 ใน v1.1 แล้ว
> Version 1.0 | The Sage Unicorn Studio Co., Ltd. | Updated: July 12, 2026
> Canon Decisions confirmed by Founder — สอดคล้อง CoreRules v1.2 (Ante/Pot/Call/Debt Recovery)

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

## 2. ตาราง Buy-in ต่อ Tier ⭐ Canon

> ที่มา: worst case ต่อแมตช์ 5 rounds = (Ante รวม + Call สูงสุด 2 rounds) × 5 โดยไม่ได้ Pot คืนเลย

| Tier | Ante/hand | Call max/hand | Worst case ×5 | **Buy-in** |
|------|-----------|---------------|----------------|------------|
| Initiate | 70 | — | 350 | **500** |
| Adept | 170 | — | 850 | **1,000** |
| Mastermind | 530 | 1,200 | 8,650 | **9,000** |
| High Noble | 1,750 | 4,000 | 28,750 | **30,000** |
| The Last Boss *(Arena Phase 3 — reserve ค่าไว้)* | 3,500 | 8,000 | 57,500 | **60,000** |

**คุณสมบัติสำคัญ:** Buy-in ≥ worst case ⟹ **หมด stack กลางเกมเป็นไปไม่ได้**
Debt Recovery Flow (CoreRules หมวด 4) คงไว้เป็น safety net — ไม่ถูกเรียกใช้ในกรณีปกติ

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
  adept:      1000,
  mastermind: 9000,
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

*TriplePoker Buy-in & Match Settlement Spec v1.0 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
