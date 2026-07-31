# TriplePoker — Canon Bridge: Monarch as Herald (v1.2)

> **สถานะ:** Canon (narrative + UI/UX layer)
> **ขอบเขต:** เส้นเรื่องของ Monarch + การเชื่อมไตรภาค + บทพูด + UI/UX (minimal-change) + responsible gaming messaging
> **คู่กับ:** `TriplePoker_Monarch_Spec_v2_1.md` (engine/technical layer)
> **การเปลี่ยนแปลงจาก v1.1:** **compress บทพูดจาก 4 moments → 2 moments** (ตัด in-game arrangement line — Modal ทำหน้าที่สอนกลยุทธ์แทนแล้ว) · เพิ่ม **§8 UI/UX Addendum** (minimal-change reuse spec, dashed-box G3, text-only Lore) · Arena hook เปลี่ยนจากภาพ/โลโก้เต็ม → **text-only สำหรับ MVP**
> **หมายเหตุภาษา:** บทพูด/ข้อความบนจอ = **EN 100%** (UI Language Rule) — draft ไทยเก็บเป็น reference

---

## 1. Monarch คือใคร

- **บทบาท:** Herald — "ผู้เบิกทาง" สู่บทจบของไตรภาค
- **ตัวตน:** ผู้รู้ความจริงของจักรวาล + **อดีตพันธมิตรของ Last Boss**
- **ธรรมชาติ:** ผู้ที่ไม่เคยถอยโดยไร้เหตุผล (ตัดสิน call/fold จาก EV จริง — ดู tech spec)
- Monarch คือ **ทูตจากโลกใหม่** ที่จงใจมาแง้มประตูให้ผู้เล่นเห็นความโกลาหลที่รออยู่ ไม่ใช่ผู้พิทักษ์กฎเก่าที่หวงประตู

### ความหมายของ "Monarch Slayer"
- = **ผู้ผ่านการทดสอบจนได้รับเชิญ** (ไม่ใช่ผู้ทุบกำแพง) เป็น prerequisite สำหรับ Ascendant

### โครงการประจันหน้า (1v1)
- ผู้เล่น Human = challenger คนเดียวที่มีเดิมพันจริงกับ Monarch
- บริวาร 2 ตัว (Minion) ร่วมโต๊ะเป็นสักขี — สู้ Herald ได้แค่ยกแรก (G1) พอเกมลึกขึ้น (G2/G3) ก็ถอย
- เวทีค่อยๆ clear จาก 4 ขา → เหลือคู่เอก Human vs Herald ตัวต่อตัว

---

## 2. ทำไม 2-2-0 ถึงเหมาะกับ Monarch

กติกา 2-2-0 คือ **"รอยร้าวแรก" ของกฎ 3-3-5** — ครั้งแรกที่ distribution ถูกบิด ผู้เล่นได้ *ชิมลาง* ว่า "กฎเปลี่ยนได้"

เชื่อมภาคหลักกับภาคจบได้ 5 ชั้น: Gameplay (สัมผัสกติกาใหม่จริง) · Lore (Monarch รู้กติกาอีกชุด) · อารมณ์ (เห็นความลับก่อนใคร) · การตลาด (จำต้นแบบได้ตอนเข้า Arena) · การเรียนรู้ (ภาคหลัก = Tutorial ซ่อนเร้น)

---

## 3. บทพูด & Text Moments (v1.2 — 2 Moments)

> **เปลี่ยนจาก v1.1:** ตัด "in-game ระหว่างจัดไพ่" ทิ้ง — Modal "Monarch's Rule" (§8.4) ทำหน้าที่สอนกลไกแทนแล้ว ไม่ต้องสอนซ้ำสองชั้น

### 3.1 Toast — ก่อนจัดไพ่
- **EN:** *"The final pile will receive nothing from the table."*
- *(TH ref: "กองสุดท้ายจะไม่ได้รับสิ่งใดจากโต๊ะ")*

### 3.2 Toast — หลังจบเกม (ชนะ)
- **EN:** *"You are ready for a battlefield beyond these rules."*
- *(TH ref: "เจ้าพร้อมแล้วสำหรับสนามที่อยู่เหนือกฎเดิม")*

### 3.3 Toast — หลังจบเกม (แพ้)
- **EN:** *"When you no longer depend on what the table gives you — return to me."*
- *(TH ref: "เมื่อเจ้าเลิกพึ่งพาสิ่งที่โต๊ะมอบให้ จงกลับมาหาข้า")*

> hook ของ encounter ที่ 2 (Arena) ยังอยู่ในบทแพ้ — ไม่ต้อง retcon ตอน Arena มาถึง

---

## 4. Arena Hook — Text-Only (MVP)

> **เปลี่ยนจาก v1.1:** ตัด "โลโก้ Arena + สัญลักษณ์เงามงกุฎแตก" ออกจาก MVP — ใช้ **text-only** แทน เพิ่ม asset ทีหลังได้โดยไม่กระทบ logic

- ตอนชนะ แสดงกล่องข้อความเล็ก: **Lore Discovered** / *"The Arena is not the final battlefield."*
- ตอนแพ้: **Lore Fragment Locked** / *"Defeat Monarch to uncover the message."*
- เก็บ Boolean ใน Profile: `hasMetMonarch: true`, `hasDefeatedMonarch: true|false` — ยังไม่ต้องมีระบบสะสม Lore Archive จริง (เก็บไว้เปิดทีหลัง)

---

## 5. Trilogy Structure

| # | ชื่อแอป | มิติภาพ | สถานะกฎ | สถานะ project |
|---|---|---|---|---|
| 1 | **TriplePoker: Rise** | 2D ล้วน | กฎ 3-3-5 ศักดิ์สิทธิ์ | กำลังทำ |
| 2 | **TriplePoker: The Arena** | 2.5D | กฎเริ่มแตก | commit แน่ (~6 เดือนหลัง Main) |
| 3 | **TriplePoker: Endgame of Chaos** | 3D เต็ม | กฎทลายสิ้น | conditional (ฐานสมาชิกพอ) |

---

## 6. Two-Encounter Vision (จองไว้ — realize ที่ Arena)

MVP ทำ Single Encounter (1v1) จริง — Two-Encounter (ครั้งสอง + Arena element เช่น special Joker/limited FoW) เลื่อนไปทำที่ Arena ไม่ทิ้ง

---

## 7. Responsible Gaming Messaging

> **แกนน้ำเสียง: เตือนสติ** · **ภาษา: EN 100%**

### 7.1 Monarch Lore หลังแพ้ (moment ทรงพลังสุด)
**EN (ตัวอย่าง):** *"You think I cheated? ...I have no need to cheat. Here, I play with the same deck as you."*

### 7.2 Fair Play Manifesto (Settings/About — งานแยก ไม่อยู่ใน Sprint Pack engine)
เนื้อหา: ไพ่สุ่มยุติธรรม, server-authoritative, บอสไม่ได้ไพ่พิเศษ + ย่อหน้าเตือนสติเล่นไพ่ออนไลน์ด้วยเงินจริง

---

## 8. UI/UX Addendum — Minimal-Change Reuse Spec

> **หลักการ:** ใช้หน้าเกมหลักเดิมทั้งหมด (layout ผู้เล่น 4 คน, avatar, community area, จัดไพ่ 3-3-5, ปุ่ม Confirm, หน้าสรุปผล, card component/animation, ระบบ balance/เดิมพัน) — **ไม่สร้าง Gameplay Screen ใหม่** เพิ่มจริงแค่ 6 จุด

### 8.1 Rare Encounter Badge
- แทนที่ป้าย MONARCH เดิม เพิ่มบรรทัดบน: **RARE ENCOUNTER** / **MONARCH** / ใต้ป้าย: **SPECIAL RULE: 2–2–0**
- สีเดิมของแอป, เปลี่ยนกรอบเป็นทอง (`#E8C865`), พื้นเขียวเข้มกว่าปกติเล็กน้อย
- Fade-in 300–500ms เท่านั้น ไม่ต้อง animation ใหญ่

### 8.2 Background Overlay
- ไม่สร้าง background ใหม่ — วาง overlay เต็มจอบนพื้นหลังเดิม: `backgroundColor: 'rgba(0, 18, 10, 0.28)'`
- กรอบทองบาง (`borderColor: '#E8C865'`, `borderWidth: 2`) รอบกล่อง Monarch เท่านั้น — Minion ใช้กรอบเดิม (ให้ Monarch เด่นกว่าชัดเจน)

### 8.3 G3 Empty Visual (เรียบ — ตามที่ล็อก)
- ใต้ G2 Community เพิ่มกล่องเส้นประ ขนาดเท่าพื้นที่ไพ่ 2 ใบ ไม่มีไพ่ข้างใน:
  - `borderStyle: 'dashed'`, `borderColor: '#D6B95F'`, `backgroundColor: 'rgba(255,255,255,0.03)'`
  - ข้อความกลางกล่อง: **"No Community Card"** (หัวกล่อง: **G3 Community**)
- **สำคัญ:** ต้องชัดว่าผู้เล่นรู้ทันทีว่าไม่ใช่บั๊ก — เจตนาเดียวกับ "เงามงกุฎแตก" ใน spec เดิม แค่ asset เรียบง่ายกว่าสำหรับ MVP (เพิ่ม asset สวยทีหลังได้ไม่กระทบ logic)

### 8.4 Modal — Monarch's Rule (ก่อนจัดไพ่)
ใช้ Modal component เดิมของเกม ปุ่มเดียว ไม่มี tutorial หลายหน้า/spotlight/coach mark:

- **Title:** Monarch's Rule
- **Body (EN):**
  > G1 receives 2 community cards.
  > G2 receives 2 community cards.
  > G3 receives no community card.
  > Build G3 entirely from your hand.
- **Button:** Accept the Rule

### 8.5 Dialogue Toast (2 กล่อง — ดู §3)
ใช้ Toast/Dialogue component เดิม ไม่สร้างระบบสนทนาใหม่ — ตำแหน่ง: ก่อนจัดไพ่ (§3.1), หลังจบเกม ชนะ/แพ้ (§3.2/3.3)

### 8.6 Result Screen Header + Lore Box
หน้าสรุปผลเดิมใช้ต่อทั้งหมด เพิ่ม:
- Header บนสุด: **MONARCH'S TRIAL** / *Special Rule: 2–2–0*
- หลังผล G3 เพิ่มกล่องเล็ก (ดู §4): Lore Discovered / Lore Fragment Locked

---

## Changelog
- **v1.2** — compress บทพูด 4→2 moments · เพิ่ม §8 UI/UX Addendum (minimal-change reuse) · Arena hook → text-only สำหรับ MVP
- **v1.1** — ปรับ narrative เข้ากับ 1v1 model
- **v1.0** — narrative canon แรก
