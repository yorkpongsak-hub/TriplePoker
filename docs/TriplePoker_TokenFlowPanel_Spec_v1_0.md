# TriplePoker — Token Flow Panel Spec
> Version 1.1 | The Sage Unicorn Studio Co., Ltd. | Updated: July 2026
> Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
> อ้างอิง: CoreRules v1.2 · AutoSortFee Spec v2.0 · GameTable Layout v1.0 · Monarch Spec v1.3 · BuyIn Spec v1.1

**Changelog v1.1:**
- ล็อกตำแหน่ง Panel = Full sidebar 6 แถวเต็ม (ไม่มี collapse)
- เพิ่ม §5.1 No Rematch + §5.2 Buy-in Gate
- ตัด Debt Badge ออก (deprecated — Buy-in คำนวณให้พอจบเกมแล้ว)
- §10 เปลี่ยนจาก Open Questions → Resolved Decisions

---

## 1. Design Intent — "Every Token Is Visible"

Token Flow Panel คือตารางสรุปการเงินมุมบนขวาของจอ ที่ทำให้ผู้เล่นทั้ง 4 ขา **เห็นการไหลของ token แบบเรียลไทม์** ตลอดเกม — เงินไม่เคยหายไปเฉยๆ หรือโผล่มาจากอากาศ มันแค่ "ย้ายที่" ระหว่าง 5 ช่องบนจอเท่านั้น

หัวใจของระบบนี้คือกฎเดียว:

> **Conservation Invariant — "กฎเหล็ก"**
> ผลรวมของทุก token บนหน้าจอ ต้องเท่ากับ `4 × Buy-in` เสมอ ตลอดทั้งเกม
> (จนกว่าจะจบเกมจริง ตอนนั้น Fee & Rake จึงถูก burn ทิ้ง)

แถว **Total** ทำหน้าที่เป็น "ตัวตรวจการบ้านเรียลไทม์" — ถ้า logic การไหลผิดเมื่อไหร่ (ลืมหัก / หักซ้ำ / เสกเงิน) เลข Total จะเพี้ยนจาก `4 × Buy-in` ทันที เห็นบั๊กได้ด้วยตาเปล่าโดยไม่ต้องเปิด log

---

## 2. Panel Structure — 6 Rows × 2 Columns

ตำแหน่ง: **Full sidebar มุมบนขวา** ของ Game Table แสดง 6 แถวเต็ม **ค้างตลอดเกม** (ไม่มี collapse/ย่อ) วางซ้อนบนโซน AI — บังหลังไพ่ Boss AI บางส่วนได้ (ไพ่หลังคว่ำ ไม่มีข้อมูลเสียหาย)

| # | Label (English) | Value | ความหมาย |
|---|-----------------|-------|----------|
| 1 | `Pot G1` | จำนวน token | เงินเดิมพันกอง 1 |
| 2 | `Pot G2` | จำนวน token | เงินเดิมพันกอง 2 |
| 3 | `Pot G3` | จำนวน token | เงินเดิมพันกอง 3 (รวม Grand Finale Call) |
| 4 | `Fee & Rake` | จำนวน token | Holding tank — burn สะสมทั้งเกม |
| 5 | `All Stack` | จำนวน token | ผลรวม Stack ผู้เล่นทั้ง 4 ขา |
| 6 | **`Total`** | **จำนวน token** | **= 4 × Buy-in (คงที่ตลอดเกม)** |

**หลักการอ่านตาราง:**
- แถว 1–3 = "เงินในกองกลาง" (ออกจากมือ รอตัดสิน)
- แถว 4 = "เงินที่บ้านพักไว้" (burn สะสม — ยังไม่หายจากจอ)
- แถว 5 = "เงินที่ยังอยู่ในมือผู้เล่น"
- แถว 6 = ผลรวมทั้งหมด = ค่าคงที่ตรวจสอบ

**สูตร:**
```
Pot G1 + Pot G2 + Pot G3 + Fee & Rake + All Stack = Total = 4 × Buy-in
```

> UI Note: แถว Total เน้นสี Gold (#FFD76A) + เครื่องหมายถูก (✓ สี #8DFFB5) เมื่อตรงกับ `4 × Buy-in` · ถ้าเพี้ยน แสดงสีแดง (#FF6B6B) เป็น dev-visible warning ช่วง beta

---

## 3. Flow Rules — กฎการไหลทั้งหมด (Canon)

ทุกเหตุการณ์ในเกม = การย้าย token ระหว่างช่อง **ไม่มีการเสกหรือทำลายระหว่างเกม**

| เหตุการณ์ | จาก (source) | ไป (destination) |
|-----------|--------------|-------------------|
| **เริ่มรอบ — Ante** (auto, ต้น Hand) | Stack ทั้ง 4 คน | Pot G1 / G2 / G3 |
| **Auto Sort Fee** (กดปุ่ม) | Stack ผู้กด | Fee & Rake |
| **Auction — ชนะประมูล** | Stack ผู้ชนะประมูล | Fee & Rake |
| **Call** (Grand Finale) | Stack ผู้ Call | Pot G3 |
| **จบกอง — Human ชนะ** | Pot กองนั้น | Stack ผู้ชนะ |
| **จบกอง — Rake 5%** | Stack ผู้ชนะ | Fee & Rake |
| **จบกอง — AI ชนะ** | Pot กองนั้น | Fee & Rake (แทน burn ทันที) |
| **Triple Sweep ×2** (ส่วนเกิน) | Stack ผู้แพ้ | Pot → Stack ผู้ชนะ |
| **Triple Sweep — Rake 10%** | Stack ผู้ชนะ | Fee & Rake |
| **Monarch ×2.0** (ส่วนเกิน, A+) | virtual Stack ของ Monarch | Pot → Stack ผู้ชนะ |
| **Foul Penalty** | Stack ผู้ foul | Fee & Rake |
| **จบเกม** (5 รอบ / Monarch 1 รอบ) | Fee & Rake | 🔥 **burn จริง** (ออกจากจอ) |

### 3.1 หลักการโบนัสตัวคูณ (สำคัญ)

> **กฎทอง: "เงินรางวัลส่วนเกินจากตัวคูณทุกชนิด หักจาก Stack ผู้แพ้เสมอ — ไม่เสกจากอากาศ"**

Triple Sweep (Pot ×2) และ Monarch (Pot ×2.0) ใช้หลักเดียวกัน:
1. ส่วนเกิน 1 เท่า **ดูดจาก Stack ผู้แพ้** ไหลเข้า Pot ก่อน
2. แล้ว Pot ทั้งก้อน (2 เท่า) ไหลกลับเข้า Stack ผู้ชนะ
3. Rake หักจาก Stack ผู้ชนะ → Fee & Rake (Triple Sweep = 10%, ปกติ = 5%)

**การกระจายส่วนเกิน (Resolved §10.1):** เมื่อผู้แพ้มีหลายคน → **เฉลี่ยเท่ากันทุกคน ปัดลง** เศษที่เหลือโยนเข้า Fee & Rake
```
ตัวอย่าง Adept: ส่วนเกิน 680 ÷ ผู้แพ้ 3 คน = 226 ต่อคน (226×3 = 678)
เศษ 2 → Fee & Rake  →  conservation จริง 100%
```

เหตุผล: Buy-in ถูกคำนวณให้ผู้เล่นมี token พอเล่นจนจบ 5 รอบอยู่แล้ว (BuyIn Spec v1.1) → Stack ผู้แพ้ไม่แห้งกลางทาง ไม่ต้องพึ่งบ้านมาอุ้มโบนัส

---

## 4. Per-Tier Applicability

Panel แสดง 6 แถวเสมอทุก Tier แต่ **เหตุการณ์การไหลบางอย่างไม่เกิดใน Tier ต่ำ** (ตาม Progressive Mechanics CoreRules v1.2 §1.9)

| เหตุการณ์การไหล | Initiate | Adept | Mastermind | High Noble (A+) |
|-----------------|:--------:|:-----:|:----------:|:---------------:|
| Ante → Pot | ✅ | ✅ | ✅ | ✅ |
| Auto Sort Fee → Fee & Rake | — (ฟรี) | ✅ (-30) | ✅ (-190) | ✅ (-880) |
| Auction → Fee & Rake | ❌ | ❌ | ✅ | ✅ |
| Call → Pot G3 | ❌ | ❌ | ✅ | ✅ |
| Rake / AI-win / Foul → Fee & Rake | ✅ | ✅ | ✅ | ✅ |
| Monarch ×2.0 | ❌ | ❌ | ❌ | ✅ (เฉพาะเจอ Boss) |

> **Tier C (Initiate) = ชุด flow ขั้นต่ำสุด:** มีแค่ Ante → Pot, Rake 5%, AI-win → Fee & Rake, Foul → Fee & Rake, Triple Sweep ×2 เท่านั้น — **ไม่มี** Auto Sort fee / Auction / Call / Monarch → เหมาะเป็น Tier แรกที่ implement เพื่อเทส conservation core

---

## 5. Round & Game Lifecycle

```
เกมปกติ = 5 รอบ (Hand)   |   A+ เจอ Monarch = 1 รอบ (sudden death)

┌─ เริ่มรอบ ────────────────────────────────────────┐
│  Pot G1/G2/G3 = 0  →  จ่าย Ante จาก Stack ทั้ง 4   │
├─ ระหว่างรอบ ──────────────────────────────────────┤
│  Auto Sort / Auction  →  Fee & Rake                │
│  Call                 →  Pot G3                    │
├─ จบรอบ ───────────────────────────────────────────┤
│  Pot  →  Stack ผู้ชนะ (หัก Rake → Fee & Rake)      │
│  Pot ที่ AI ชนะ  →  Fee & Rake                     │
│  Pot กลับเป็น 0  |  Fee & Rake สะสมต่อ              │
└────────────────────────────────────────────────────┘
        ↓ วนซ้ำจนครบ 5 รอบ
┌─ จบเกม ───────────────────────────────────────────┐
│  Fee & Rake  →  🔥 burn จริง (ออกจากระบบ)          │
│  แสดง Match Result Overlay (ปุ่ม Lobby เดียว)      │
└────────────────────────────────────────────────────┘
```

**Reset scope:**
- `Pot G1/G2/G3` → reset เป็น 0 **ทุกต้นรอบ**
- `Fee & Rake` → **สะสมยาวทั้งเกม** (ไม่ reset ระหว่างรอบ) — burn ตอนจบเกมเท่านั้น
- `All Stack` → ต่อเนื่องทั้งเกม (ไม่ reset)
- `Total` → คงที่ = `4 × Buy-in` ตลอด

### 5.1 No Rematch (สำคัญต่อ conservation)

จบเกม → **ไม่มีปุ่ม Rematch** · Match Result Overlay เหลือปุ่มเดียว: `Lobby` → ดันผู้เล่นทั้ง 4 ออกจากโต๊ะเสมอ

เหตุผลเชิงระบบ: ระบบ Token Flow ตั้งอยู่บนสมมติฐานว่า Buy-in **ล็อคค่าตั้งแต่ต้นเกม** (Total = 4 × Buy-in คงที่) ถ้ามี Rematch ต่อในโต๊ะเดิม → Stack แต่ละคนตอนจบไม่เท่ากัน → "4 × Buy-in" ของเกมถัดไปนิยามไม่ได้ กฎเหล็กพัง การบังคับออกโต๊ะ → Buy-in ใหม่ ทำให้ทุกเกมเป็น **single-game session** ที่ conservation reset สะอาดทุกครั้ง (สอดคล้อง CoreRules §1.8 "มีคนกด Lobby → ทุกคนกลับ Lobby")

### 5.2 Buy-in Gate

- ระบบคำนวณ Buy-in ที่ต้องใช้ + แสดงให้ผู้เล่นเห็นตั้งแต่ **ตอนเลือกเล่น**
- เช็ค **Token wallet > Buy-in** จึงจะเข้าโต๊ะได้ (ไม่พอ = เข้าไม่ได้)
- จบเกม → Stack ที่เหลือ (กำไร/ขาดทุน) **settle กลับเข้า Token wallet**
- อยากเล่นอีก → ผ่าน gate เดิมใหม่ทุกครั้ง (ไม่มีหนี้ข้ามเกม)

---

## 6. Animation Guideline

การไหลของ token แสดงเป็น **ตัวเลขวิ่ง** (number counter tween) จาก source ไป destination

| หลักการ | รายละเอียด |
|---------|-----------|
| Engine | Reanimated 3 (Code Animation) — **ห้าม Lottie** (MVP Patch v2.1 canon) |
| useNativeDriver | ปฏิบัติตามกฎใน CLAUDE.md เสมอ (bug class เดิม 3 รอบ) |
| ทิศทางการไหล | Stack (ตำแหน่งผู้เล่น) → Panel (บนขวา) และย้อนกลับ |
| ระยะเวลา | ~400–600ms ต่อ 1 การไหล — ต่อเนื่องไม่กระตุก |
| Counter tween | ตัวเลขในช่องต้นทางลด + ช่องปลายทางเพิ่ม พร้อมกัน |
| **Invariant timing** | ตรวจ Total = 4×Buy-in ที่ **settled state เท่านั้น** (หลัง animation จบ) — ระหว่าง tween ตัวเลขอยู่ "ระหว่างทาง" ยอดชั่วขณะอาจไม่ครบ ถือเป็นปกติ |

> ⚠️ Animation เป็น **client-side visual เท่านั้น** — ค่าจริงคำนวณที่ server เสมอ (ดูข้อ 7)
> ⚠️ ห้าม special Unicode characters ใน .tsx files (canon)

---

## 7. Implementation Guideline

| หลักการ | รายละเอียด |
|---------|-----------|
| **Server-authoritative** | Token ทุกช่องคำนวณที่ server เสมอ · client รับ state มาแสดง + เล่น animation เท่านั้น |
| **Panel = pure display** | Panel ไม่คำนวณเอง · render จาก payload ที่ server ส่ง (`stacks[]`, `pot[]`, `feeRake`, `buyIn`) |
| Data source | `public.users` ใช้ `user_id` (ไม่ใช่ `id`) · game table ใช้ `supabaseAdmin` (RLS บล็อก anon) |
| Total validation | server ควรมี assertion: `sum(all buckets) === 4 × buyIn` ก่อนส่ง payload — fail = log error ไม่ crash |
| gameConfig | Ante / Rake% / AutoSortFee ดึงจาก `gameConfig.ts` (ปรับได้ไม่ต้อง redeploy) |

### 7.1 Suggested Payload Shape (ร่าง — ยืนยันตอน implement)

```typescript
// server → client ทุกครั้งที่ state เปลี่ยน
interface TokenFlowState {
  buyIn: number;              // ต่อคน — Total = buyIn * 4
  stacks: number[];          // [seat0, seat1, seat2, seat3] รวม AI seats
  pot: [number, number, number];  // [G1, G2, G3]
  feeRake: number;           // holding tank สะสม
  // Total = sum(stacks) + sum(pot) + feeRake  (server assert === buyIn*4)
}
```

> **หมายเหตุ AI Stack:** เพื่อให้ `Total = 4 × Buy-in` เป็นจริง ทุก seat รวม AI ต้องเริ่มด้วย stack = Buy-in เท่ากัน (ต่างจาก CoreRules เดิมที่ AI สุ่ม virtual token 1.5–3.0×) — **ยืนยันโมเดลนี้ตอน Phase 1 audit ของ Tier C**

---

## 8. Edge Cases

| กรณี | การจัดการ (รักษา conservation) |
|------|-------------------------------|
| **Token ติดลบระหว่างรอบ** | อนุญาตให้ Stack ติดลบได้ (CoreRules §1.6) — Total ยังคงที่เพราะเป็นการลบทางบัญชี · Buy-in Gate การันตีว่าเริ่มเกมด้วย wallet พอเล่นจบแล้ว |
| **Timeout Auto-sort** | หมดเวลา Arrangement → auto-sort ทำงาน + หัก Fee เข้า Fee & Rake ตามตารางเดียวกัน (Initiate ไม่หัก) |
| **Token ไม่พอจ่าย Auto Sort** | ปุ่ม disabled — ไม่มีการไหล · ผู้เล่นต้องจัดเอง |
| **Fee & Rake ยังไม่ burn ก่อนจบเกม** | ถูกต้องตาม design — burn เฉพาะตอนจบเกมจริงเท่านั้น |
| ~~Debt Badge 20%~~ | **DEPRECATED** — Buy-in Gate (§5.2) คำนวณให้พอจบเกมแล้ว ไม่มีหนี้ข้ามเกมอีกต่อไป |

---

## 9. UI Text (English — Beta Canon)

| จุด | ข้อความ |
|-----|--------|
| Row labels | `Pot G1` / `Pot G2` / `Pot G3` / `Fee & Rake` / `All Stack` / `Total` |
| Total tooltip | `Total always equals 4 × Buy-in` |
| End-game burn toast | `House collected: {feeRake} tokens` |
| Match Result button | `Lobby` (ปุ่มเดียว — ไม่มี Rematch) |

> UI ทั้งหมดเป็นภาษาอังกฤษ (UI/Code Language Rule) · Code comments ภาษาไทย

---

## 10. Resolved Decisions (ปิดครบแล้ว — July 2026)

| # | หัวข้อ | มติ |
|---|--------|-----|
| 1 | กระจายส่วนเกิน Triple Sweep | เฉลี่ยเท่ากันทุกผู้แพ้ ปัดลง เศษเข้า Fee & Rake (§3.1) |
| 2 | Debt Badge 20% | **Deprecated** — Buy-in Gate คำนวณให้พอจบเกม (§5.2, §8) |
| 3 | ตำแหน่ง Panel | Full sidebar 6 แถวเต็ม มุมขวาบน บังหลังไพ่ AI ได้ (§2) |
| 4 | Panel collapse | ไม่มี — แสดงเต็มตลอดเกม (§2) |
| + | No Rematch | จบเกม → ปุ่ม `Lobby` เดียว ดันออกโต๊ะ (§5.1) |
| + | Buy-in Gate | เช็ค wallet > Buy-in · settle กลับ wallet ตอนจบ (§5.2) |

### Implementation Order
เริ่ม **Tier C (Initiate) ก่อน** → เทสจน conservation ลงตัว → ค่อยขยาย Adept → Mastermind → High Noble ตามลำดับ

---

*TriplePoker Token Flow Panel Spec v1.1 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
