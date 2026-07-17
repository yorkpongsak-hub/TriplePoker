# TriplePoker — Ascendant Tier Spec
> Version 1.1 | The Sage Unicorn Studio Co., Ltd. | Updated: July 2026
> Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
>
> **สถานะ:** Canon — แทนที่เงื่อนไข Ascendant ใน `TriplePoker_Universe_MasterPlan_v1_1` Section 5
>
> **Changelog v1.1:**
> - เพิ่ม **Account Age Gate ≥ 180 วัน** (เป้าหมาย: ผู้เล่นอยู่กับแอปหลักไม่น้อยกว่า 6 เดือนก่อนขึ้น The Arena)
> - เปลี่ยนการเริ่ม Window จาก auto-start → **Opt-in Start** ("Begin Your Ascension")
> - **ตัดเพดานบน Token 999,999 ออก** จากเงื่อนไขเข้า — Token ≥ 600,000 ถือว่าผ่าน
> - เปิดสิทธิ์แลก **Token → Crown ตั้งแต่ผ่าน Tier A+** (ไม่ต้องรอครบ 180 วัน)

---

## 1. บทบาทของ Ascendant

Ascendant คือ **Transitional Tier** ทำหน้าที่เป็นสะพานเชื่อมระหว่าง Main App (TriplePoker) กับ Companion App (TriplePoker: The Arena) — เป็นได้เพียง**ครั้งเดียวต่อบัญชี** และเป็นจุดไคลแมกซ์ก่อนก้าวเข้าสู่ Elite Tier S

**หลักการออกแบบ v1.1:** *"เวลา" คุมด้วยเวลา ไม่ใช่คุมด้วย token* — Token เป็นตัวแปรที่ขึ้นกับฝีมือ ชั่วโมงเล่น และการเติมเงิน จึงการันตีระยะเวลาไม่ได้ ส่วน Account Age Gate การันตีได้ 100% ว่าผู้เล่นทุกคนอยู่กับแอปหลักอย่างน้อย 6 เดือนก่อนเข้า Arena

---

## 2. Entry Conditions (ต้องครบทุกข้อ)

| # | เงื่อนไข | ค่า | หมายเหตุ |
|---|---------|-----|----------|
| 1 | Account Age | **≥ 180 วัน** นับจาก `created_at` ของบัญชี | เท่ากันทุกคน — VIP/ผู้เติมเงิน**ไม่ลดเวลา** |
| 2 | Token สะสม | **≥ 600,000** | ⭐ v1.1 ตัดเพดานบน 999,999 ออก — เกิน 1M ก็เข้าได้ |
| 3 | Tier | ผ่าน A+ (High Noble) แล้ว | เดิม |
| 4 | Badge | **Monarch Slayer** | เดิม — ต้องล้ม Monarch (ดู `TriplePoker_Monarch_Spec_v1_3`) |
| 5 | ความถี่ | ครั้งเดียวต่อบัญชี | เดิม |

---

## 3. Opt-in Start — "Begin Your Ascension"

- ระบบตรวจเงื่อนไขครบทั้ง 5 ข้อ → ส่ง notification + แสดง banner ใน Lobby และ Profile
- นาฬิกา 30 วัน **เริ่มเมื่อผู้เล่นกดยืนยันเท่านั้น** — ไม่ auto-start
- Popup ยืนยัน (UI ภาษาอังกฤษ): หัวข้อ **"Begin Your Ascension"** พร้อมคำเตือนชัดเจน:
  - One-time only — สิทธิ์นี้ใช้ได้ครั้งเดียวต่อบัญชี
  - 30-day window — ต้องทำ Token ถึง 1,000,000 ภายใน 30 วัน
  - ผลลัพธ์กรณีผ่าน/ไม่ผ่าน (ดู Section 4)
- ผู้เล่น eligible แล้วยังไม่กด → สถานะค้างเป็น **Eligible** ได้ไม่จำกัดเวลา ไม่มีบทลงโทษ

**เหตุผลการออกแบบ:** เพราะเป็นสิทธิ์ครั้งเดียวต่อบัญชี หาก auto-start ทันทีที่เงื่อนไขครบ อาจเริ่มตอนผู้เล่นไม่พร้อม (เช่น ช่วงงานยุ่ง) แล้วเสียโอกาสถาวร — Opt-in ให้ผู้เล่นเลือกจังหวะที่พร้อมที่สุดเอง

---

## 4. Window Rules (30 วัน)

| ผลลัพธ์ | เงื่อนไข | ผล |
|---------|---------|-----|
| ✅ **Pass** | Token ≥ 1,000,000 ณ จุดใดก็ได้ภายใน 30 วัน | เลื่อนเป็น **Elite Tier S** → เข้า The Arena |
| ❌ **Fail** | ครบ 30 วัน Token < 1,000,000 | กลับเป็น Tier A+ — สิทธิ์ Ascendant ใช้แล้ว ไม่ได้อีก |
| ⚡ **Instant Pass** | กด Begin ตอน Token ≥ 1,000,000 อยู่แล้ว | ผ่านทันที — แฟร์เพราะรอครบ 180 วันเท่ากันทุกคน |

**บทบาทใน Arena (คงเดิมจาก MasterPlan):** ผู้เล่นสถานะ Ascendant มีสิทธิ์ลุ้นตำแหน่ง **"Ascendant Star"** — 1 ใน 2 Wildcard Slot ของ Weekly Challenger Selection

---

## 5. Token → Crown Exchange (เปิดก่อน Ascendant)

| กฎ | รายละเอียด |
|----|-----------|
| จุดปลดล็อก | **ผ่าน Tier A+ (High Noble)** — ไม่ต้องรอครบ 180 วัน ไม่ต้องเข้า Ascendant |
| อัตราแลก | **1 Crown = 5,000 Token** (คงเดิม) |
| ทิศทาง | ทางเดียวเท่านั้น — แลกแล้ว**ย้อนกลับไม่ได้** |
| ประเภท Crown | **Earned Crown** เท่านั้น — ใช้ Match Stake ใน Arena ได้ (คนละก้อนกับ Crown Package IAP โดยเด็ดขาด ตาม canon เดิม) |

**บทบาทเชิงระบบ:**
- เป็น**ช่องระบาย Token** ให้ผู้เล่นที่ถึง 600,000 เร็วกว่า 180 วัน — ฟาร์มสะสม Earned Crown ระหว่างรอ
- ลดแรงกดดัน token overflow และทำให้ "ช่วงรอ" มีเป้าหมายชัดเจน
- ผู้เล่นที่รอครบวันจะเข้า Ascendant พร้อม Crown ติดกระเป๋าไป Arena ทันที — ไม่มีจุดใดต้อง "เริ่มนับหนึ่งใหม่"

**⚠️ UX Guard (บังคับ):**
- หน้าแลกต้องแสดงคำเตือนชัดเจนว่า Token ที่แลกไปแล้ว**ใช้ buy-in ในแอปหลักไม่ได้อีก**
- Confirm **2 ชั้น** ก่อนแลกทุกครั้ง
- เหตุผล: กันผู้เล่นเผลอแลกเกินจนเหลือ Token ไม่พอ buy-in High Noble (30,000/match)
- Legal disclaimer มาตรฐาน (Token/Crown ไม่มีมูลค่าเงินจริง แลกคืนไม่ได้) ต้องปรากฏในหน้าแลกตาม canon เดิม

---

## 6. กิจกรรมระหว่างรอ 180 วัน (มีอยู่แล้วในระบบ)

- **Monarch Hunt** — ล่า Monarch Slayer badge (ถ้ายังไม่มี — เป็น prerequisite อยู่แล้ว)
- **Season PS Climbing** — ไต่อันดับ Season Performance Score
- **Badge Collection** — สะสม badge ให้ครบ
- **Token Farming → Earned Crown** — สะสม Crown รอเข้า Arena

---

## 7. Implementation Notes (สำหรับ sprint ที่เกี่ยวข้อง — ยังไม่ implement ตอนนี้)

### 7.1 DB Fields
| Field | ที่มา | หมายเหตุ |
|-------|------|----------|
| `users.created_at` | มีอยู่แล้ว (Supabase auth) | ใช้คำนวณ Account Age |
| `ascendant_status` | เพิ่มใหม่ | enum: `none` / `eligible` / `active` / `passed` / `failed` |
| `ascendant_started_at` | เพิ่มใหม่ | timestamp ตอนกด "Begin Your Ascension" |

> SQL เขียนไว้แล้วรัน manual ใน Supabase Dashboard ตาม workflow เดิม + `NOTIFY pgrst, 'reload schema'` หลัง ALTER TABLE

### 7.2 Logic Placement
- **Eligibility check ทำฝั่ง server เท่านั้น** — กัน client โกงเวลาเครื่อง
- Notification trigger: เช็คตอน login + ตอน token settle หลังจบ match
- Window countdown อิง server time (`ascendant_started_at + 30 days`)

### 7.3 ลำดับงาน
Ascendant อยู่ในคิว**หลัง Monarch System** ตามลำดับงานเดิม (Monarch Slayer badge เป็น prerequisite ของระบบนี้)

---

*TriplePoker Ascendant Tier Spec v1.1 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
