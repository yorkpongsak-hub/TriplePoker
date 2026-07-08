# TriplePoker — Name Protection Spec v1.0
**Last Updated:** 2026-05-15
**Status:** Approved
**Sprint:** 1 (Auth / User Registration)
 
---
 
## 1. Overview
 
ระบบป้องกันไม่ให้สมาชิกตั้งชื่อที่ตรงกับหรือใกล้เคียงกับ The Last Boss (ทั้งปัจจุบันและในอดีต)
รวมถึงชื่อสงวนที่ Admin กำหนดเพิ่มเติมได้ เพื่อรักษาความศักดิ์สิทธิ์ของตำแหน่ง The Last Boss
 
---
 
## 2. Protected Name Sources — 3 Layers
 
การตรวจสอบชื่อจะ query **3 ตาราง** พร้อมกันทุกครั้ง:
 
| Layer | Table | หน้าที่ | ถาวร? |
|-------|-------|---------|-------|
| 1 | `bosses` | Current Boss ที่ครองตำแหน่งอยู่ + Past bosses ทั้งหมด | ✅ ตลอดกาล |
| 2 | `graveyard` | อดีต Boss ที่ถูก Sacrifice แล้ว จารึกไม่ลบ | ✅ ตลอดกาล |
| 3 | `reserved_names` | Admin blacklist — เพิ่ม/ลบได้ | ⚙️ Admin-managed |
 
> **หลักการ:** ชื่อ Last Boss ไม่ว่าจะเป็นของใคร ณ เวลาใด — ห้ามซ้ำตลอดกาล
 
---
 
## 3. Database Schema
 
### 3.1 reserved_names Table (ใหม่)
 
```sql
-- ตารางชื่อสงวน — Admin เพิ่ม/ลบได้
CREATE TABLE reserved_names (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL,
  -- normalized_name: lowercase + trim + remove extra spaces (สำหรับ matching)
  normalized_name VARCHAR(50) NOT NULL GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
  ) STORED,
  reason        VARCHAR(100) DEFAULT NULL,  -- เหตุผลที่ reserve (optional)
  added_by      UUID REFERENCES users(id),  -- Admin user id
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (normalized_name)
);
 
-- Index สำหรับ lookup เร็ว
CREATE INDEX idx_reserved_names_normalized ON reserved_names (normalized_name);
```
 
### 3.2 bosses Table — Normalized Column (เพิ่มเติม)
 
```sql
-- เพิ่ม normalized_name ใน bosses table (ถ้ายังไม่มี)
ALTER TABLE bosses
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(display_name, '\s+', ' ', 'g')))
  ) STORED;
 
CREATE INDEX IF NOT EXISTS idx_bosses_normalized ON bosses (normalized_name);
```
 
### 3.3 graveyard Table — Normalized Column (เพิ่มเติม)
 
```sql
-- เพิ่ม normalized_name ใน graveyard table (ถ้ายังไม่มี)
ALTER TABLE graveyard
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(display_name, '\s+', ' ', 'g')))
  ) STORED;
 
CREATE INDEX IF NOT EXISTS idx_graveyard_normalized ON graveyard (normalized_name);
```
 
---
 
## 4. Normalization Rules
 
การ normalize ชื่อก่อนเปรียบเทียบ ทั้ง input จากผู้ใช้ และ stored names:
 
| Step | Rule | ตัวอย่าง |
|------|------|---------|
| 1 | Lowercase ทั้งหมด | `"I am York"` → `"i am york"` |
| 2 | Trim leading/trailing spaces | `"  I am York  "` → `"i am york"` |
| 3 | Collapse multiple spaces เป็น 1 | `"I  am  York"` → `"i am york"` |
 
> **หมายเหตุ:** ระบบนี้ใช้ **Exact match หลัง normalize** เท่านั้น
> ไม่ใช้ fuzzy match — Admin ต้องเพิ่ม variations เองใน `reserved_names` ถ้าต้องการ
 
---
 
## 5. Validation Flow
 
### 5.1 Trigger Points
 
ระบบตรวจสอบชื่อ **2 กรณี:**
1. **Registration** — ตอนสมัครสมาชิกครั้งแรก
2. **Change Display Name** — ตอนเปลี่ยนชื่อในโปรไฟล์
### 5.2 Backend Function
 
```typescript
// src/utils/nameValidator.ts
// ตรวจสอบชื่อผู้เล่นก่อน register หรือเปลี่ยนชื่อ
 
import { supabase } from '../db/supabase';
 
/**
 * normalize: lowercase + trim + collapse spaces
 * ใช้ทั้ง input และ stored names
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
 
export interface NameValidationResult {
  allowed: boolean;
  reason?: 'BOSS_NAME' | 'GRAVEYARD_NAME' | 'RESERVED_NAME' | 'INVALID_FORMAT';
  message?: string;
}
 
/**
 * validateDisplayName
 * คืนค่า allowed: true ถ้าใช้ได้
 * คืนค่า allowed: false พร้อม reason ถ้าไม่ได้
 */
export async function validateDisplayName(
  inputName: string
): Promise<NameValidationResult> {
 
  // ─── 1. ตรวจ format ก่อน ────────────────────────────────────────────
  const trimmed = inputName.trim();
 
  if (trimmed.length < 3 || trimmed.length > 30) {
    return {
      allowed: false,
      reason: 'INVALID_FORMAT',
      message: 'Name must be 3–30 characters.',
    };
  }
 
  // อนุญาต: ตัวอักษร, ตัวเลข, space, ขีดกลาง, ขีดล่าง
  const formatRegex = /^[a-zA-Z0-9ก-๙\s\-_]+$/;
  if (!formatRegex.test(trimmed)) {
    return {
      allowed: false,
      reason: 'INVALID_FORMAT',
      message: 'Name contains invalid characters.',
    };
  }
 
  const normalized = normalizeName(trimmed);
 
  // ─── 2. ตรวจ bosses table (Layer 1) ────────────────────────────────
  const { data: bossMatch } = await supabase
    .from('bosses')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();
 
  if (bossMatch) {
    return {
      allowed: false,
      reason: 'BOSS_NAME',
      message: 'This name belongs to a legendary Last Boss and cannot be used.',
    };
  }
 
  // ─── 3. ตรวจ graveyard table (Layer 2) ─────────────────────────────
  const { data: graveyardMatch } = await supabase
    .from('graveyard')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();
 
  if (graveyardMatch) {
    return {
      allowed: false,
      reason: 'GRAVEYARD_NAME',
      message: 'This name is eternally inscribed in the Hall of Bosses.',
    };
  }
 
  // ─── 4. ตรวจ reserved_names table (Layer 3) ─────────────────────────
  const { data: reservedMatch } = await supabase
    .from('reserved_names')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle();
 
  if (reservedMatch) {
    return {
      allowed: false,
      reason: 'RESERVED_NAME',
      message: 'This name is reserved and cannot be used.',
    };
  }
 
  // ─── 5. ผ่านทุก Layer → อนุญาต ──────────────────────────────────────
  return { allowed: true };
}
```
 
### 5.3 Flow Diagram
 
```
User กรอกชื่อ
      │
      ▼
[1] Format Check
   ├─ ❌ ความยาว / อักขระไม่ถูกต้อง → Error: INVALID_FORMAT
   └─ ✅ ผ่าน
      │
      ▼
[2] Normalize (lowercase + trim + collapse spaces)
      │
      ▼
[3] Query bosses table
   ├─ ❌ ตรงกัน → Error: BOSS_NAME
   └─ ✅ ไม่ตรง
      │
      ▼
[4] Query graveyard table
   ├─ ❌ ตรงกัน → Error: GRAVEYARD_NAME
   └─ ✅ ไม่ตรง
      │
      ▼
[5] Query reserved_names table
   ├─ ❌ ตรงกัน → Error: RESERVED_NAME
   └─ ✅ ไม่ตรง
      │
      ▼
   ✅ ALLOWED — บันทึกชื่อได้
```
 
---
 
## 6. Error Messages (UI — English)
 
| Reason | Error Message แสดงใน App |
|--------|--------------------------|
| `BOSS_NAME` | "This name belongs to a legendary Last Boss and cannot be used." |
| `GRAVEYARD_NAME` | "This name is eternally inscribed in the Hall of Bosses." |
| `RESERVED_NAME` | "This name is reserved and cannot be used." |
| `INVALID_FORMAT` (ความยาว) | "Name must be between 3 and 30 characters." |
| `INVALID_FORMAT` (อักขระ) | "Name contains invalid characters. Use letters, numbers, spaces, hyphens, or underscores only." |
 
---
 
## 7. Seed Data — First Last Boss
 
```sql
-- ─────────────────────────────────────────────────────────────────────
-- SEED: First Last Boss — "I am York"
-- บันทึก ณ วันที่เปิดระบบ (Day 1)
-- ─────────────────────────────────────────────────────────────────────
 
INSERT INTO bosses (
  id,
  display_name,
  user_id,        -- NULL = System-seeded Boss (ก่อนมีผู้เล่นจริง)
  is_current,
  crowned_at,
  notes
) VALUES (
  gen_random_uuid(),
  'I am York',
  NULL,
  TRUE,
  NOW(),
  'The First Last Boss — Founder of the Legend'
);
 
-- reserved_names: เพิ่ม variations ของ "I am York" ไว้ด้วย (optional)
INSERT INTO reserved_names (name, reason) VALUES
  ('I am York',  'First Last Boss — Founder'),
  ('IamYork',    'Variation of First Last Boss'),
  ('I m York',   'Variation of First Last Boss');
```
 
> **หมายเหตุ:** `normalized_name` จะถูกสร้างอัตโนมัติจาก Generated Column
> ไม่ต้อง insert `normalized_name` ตรงๆ
 
---
 
## 8. Admin Panel Behavior
 
### 8.1 เพิ่มชื่อสงวน (Add Reserved Name)
 
Admin เพิ่มชื่อใน `reserved_names` ผ่าน Admin Panel หรือ SQL โดยตรง:
 
```sql
-- ตัวอย่าง: เพิ่ม variation ที่ไม่ต้องการ
INSERT INTO reserved_names (name, reason, added_by)
VALUES ('york', 'Shortened variation of First Boss', '<admin_user_id>');
```
 
**ใน Admin Panel:**
- ช่อง input: ชื่อที่ต้องการ reserve
- ช่อง reason: เหตุผล (optional)
- ระบบ auto-normalize ก่อน save
- แสดง list ชื่อสงวนทั้งหมดพร้อม created_at และ added_by
### 8.2 ลบชื่อสงวน (Remove Reserved Name)
 
ลบได้เฉพาะ `reserved_names` เท่านั้น:
 
```sql
-- ลบ reserved name โดย id
DELETE FROM reserved_names WHERE id = '<uuid>';
```
 
> ⚠️ **ห้ามลบ** ชื่อออกจาก `bosses` หรือ `graveyard`
> ชื่อ Last Boss เป็น permanent record ตลอดกาล
 
### 8.3 สิทธิ์ Admin
 
| Action | Permission |
|--------|-----------|
| ดู reserved_names ทั้งหมด | Admin |
| เพิ่ม reserved_names | Admin |
| ลบ reserved_names | Admin |
| แก้ไข bosses / graveyard | ❌ ห้าม (System-only) |
 
---
 
## 9. Integration Points
 
| Sprint | File | การใช้งาน |
|--------|------|-----------|
| Sprint 1 | `src/routes/auth.ts` | เรียก `validateDisplayName()` ตอน register |
| Sprint 1 | `src/routes/user.ts` | เรียก `validateDisplayName()` ตอน PATCH /profile |
| Sprint 8 | `src/progression/lastBossEncounter.ts` | เมื่อ Boss ใหม่ขึ้นครอง → insert ชื่อเก่าลง `graveyard` อัตโนมัติ |
 
---
 
## 10. Edge Cases
 
| กรณี | การจัดการ |
|------|-----------|
| ผู้เล่นที่เป็น Last Boss อยู่ เปลี่ยนชื่อตัวเอง | ❌ ห้ามเปลี่ยนชื่อขณะดำรงตำแหน่ง Boss |
| ชื่อเดิมของผู้เล่นทั่วไปที่ตั้งก่อน Boss ใหม่ขึ้นครอง | ✅ อนุญาตให้คงชื่อไว้ แต่ห้าม **ตั้งใหม่** ซ้ำ |
| ระบบ DB ล่มระหว่าง query | ❌ Reject ทันที (fail-safe) พร้อม error: "Please try again." |
| ชื่อที่มีอักขระพิเศษ เช่น emoji | ❌ Format check จัดการก่อนถึง Layer 1 |
 
---
 
*TriplePoker_NameProtection_Spec_v1_0.md — Approved*