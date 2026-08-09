# TriplePoker: Beyond the Rules — Entry Fee Economy (MVP) v1.0

**Status:** Canon — not yet implemented

**Date:** 2026-08-04

**Applies to:** TriplePoker: Beyond the Rules (The Arena app) — PvE Chapter / Boss Rush mode

**Relationship to existing systems:** This is a **new, separate mode** from the existing Tier S+ PvP arena match economy (`server/src/arena/config/tierSConfig.ts` → `tierSEconomyConfig.entryFeeCrest = 12` flat per match). That flat PvP entry fee is untouched by this document. `CREST_PER_CROWN = 12` (`server/src/arena/economy/crest.ts`) already matches this spec's exchange rate and can be reused as-is.

---

## 1. สกุลเงิน

- **1 Crown = 12 Crest**
- Crown เป็นสกุลเงินหลักของเกมภาคจบ (Beyond the Rules)
- Crest เป็นหน่วยย่อยสำหรับค่าธรรมเนียมระดับต้นและระดับกลาง

## 2. ค่าธรรมเนียมเข้าเล่นแต่ละระดับ (Chapter Entry Fee)

| ระดับด่าน | ค่าธรรมเนียม |
|---|---|
| Chapter I | 1 Crest |
| Chapter II | 2 Crest |
| Chapter III | 4 Crest |
| Chapter IV | 8 Crest |
| Final Chapter | 1 Crown |

## 3. Boss Entry Fee

| Boss | ค่าธรรมเนียม |
|---|---|
| Nine Sentinels | 6 Crest |
| Four Gods | 9 Crest |
| Monarch | 1 Crown |
| Soren Veyl | 2 Crown |
| CAELUM (The Last Boss) | 3 Crown |
| The Immortal (Annual Event) | 5 Crown |

## 4. ระบบ Retry

- **ด่านทั่วไป:** Retry = 25% ของค่าธรรมเนียมเข้าเล่น
- **Boss ทุกตัว:** Retry = 50% ของค่าธรรมเนียมเข้าเล่น

## 5. กฎการปัดเศษ

เพื่อให้เป็นประโยชน์แก่ผู้เล่น:

- หากคำนวณแล้วมีเศษของ Crest ให้ **ปัดลงเสมอ (Round Down)**
- หากผลลัพธ์ต่ำกว่า 1 Crest ให้คิด **ขั้นต่ำ 1 Crest**

### ตัวอย่าง

| ค่าเข้า | Retry |
|---|---|
| 1 Crest | 1 Crest |
| 2 Crest | 1 Crest |
| 4 Crest | 1 Crest |
| 8 Crest | 2 Crest |
| 9 Crest | 4 Crest |
| 1 Crown | 6 Crest |
| 2 Crown | 1 Crown |
| 3 Crown | 1 Crown 6 Crest |
| 5 Crown | 2 Crown 6 Crest |

## 6. แนวคิดการออกแบบ

- ใช้ตัวเลขแบบ 1 → 2 → 4 → 8 → 12 (1 Crown) เพื่อให้จดจำง่าย
- ช่วงต้นเกมใช้ Crest เป็นหลัก เพื่อให้ผู้เล่นค่อย ๆ สะสม Crown
- ช่วงท้ายเกมเปลี่ยนมาใช้ Crown เพื่อเพิ่มความรู้สึกว่ากำลังเข้าสู่การผจญภัยระดับสูง
- ระบบ Retry มีต้นทุนแต่ไม่ลงโทษผู้เล่นมากเกินไป ช่วยให้กล้าลองด่านยากและทดลองกลยุทธ์ใหม่ ๆ ได้
- การปัดเศษลงทุกครั้ง (ยกเว้นขั้นต่ำ 1 Crest) เป็นนโยบาย Player-Friendly ที่ทำให้เศรษฐกิจของเกมดูยุติธรรมและเป็นมิตรกับผู้เล่น

สเปกนี้เหมาะสำหรับใช้เป็น MVP Economy ของเกมภาคจบ และสามารถต่อยอดเพิ่มค่าธรรมเนียมสำหรับด่านพิเศษหรือโหมด Seasonal ในอนาคตได้โดยไม่ต้องปรับโครงสร้างหลักของระบบครับ

## 7. Open Questions (ยังไม่ได้ตัดสินใจ — ต้องเคลียร์ก่อน implement)

- ยังไม่มี "Chapter" progression structure ใดๆ ในโค้ดปัจจุบันเลย (ทั้ง Main App/Rise และ Arena) — ต้องออกแบบ data model ใหม่ทั้งหมด (chapter state, unlock gate, per-user progress)
- บอส **Soren Veyl** และ **The Immortal** มีอยู่ในเอกสาร story (`TriplePoker_Universe_Story_and_Cross_App_Integration_Spec.md`) แต่ยังไม่มี AI personality / gameplay implementation เหมือน Monarch หรือ CAELUM
- ยังไม่ระบุว่า Chapter/Boss fee หักจาก Crown/Crest ก้อนไหน (Earned เท่านั้น หรือรวม Purchased Crest — ดูกติกา Economy/Legal Rule #1 ของ Main App ที่ล็อก Crown Package ไว้เฉพาะ cosmetics เป็นตัวอย่างของกติกาที่ต้องตัดสินใจให้ชัดสำหรับ Beyond the Rules ด้วย)
- ยังไม่ระบุว่า mode นี้อยู่ใน repo/deployment เดียวกับ Arena Tier S+ ปัจจุบัน (โฟลเดอร์ `server/src/arena/`) หรือเป็นแอปคนละตัวจริงๆ ตาม Architecture Rule "Two Apps, One Database"
