# TriplePoker — Canon Bridge: Monarch as Herald (v1.0)

> **สถานะ:** Canon (narrative layer)
> **ขอบเขต:** เส้นเรื่องของ Monarch + การเชื่อมไตรภาค + บทพูด + responsible gaming messaging
> **คู่กับ:** `TriplePoker_Monarch_Spec_v2_0.md` (technical layer)
> **หมายเหตุภาษา:** บทพูด/ข้อความที่โผล่บนจอผู้เล่นเป็น **EN 100%** (ตาม UI Language Rule) — draft ไทยต้นฉบับของลุงเยาะเก็บไว้เป็น reference ใต้แต่ละบท ปรับ wording ได้

---

## 1. Monarch คือใคร

- **บทบาท:** Herald — "ผู้เบิกทาง" สู่บทจบของไตรภาค
- **ตัวตน:** ผู้รู้ความจริงของจักรวาล + **อดีตพันธมิตรของ Last Boss**
- **ธรรมชาติ:** ผู้ที่ไม่เคยถอย (สู้ทุกกองด้วยเหตุผล ไม่ใช่ AI สู้ตายมั่ว — ดู EV decision ใน tech spec)
- Monarch คือ **ทูตจากโลกใหม่** ที่จงใจมาแง้มประตูให้ผู้เล่นเห็นความโกลาหลที่รออยู่ ไม่ใช่ผู้พิทักษ์กฎเก่าที่หวงประตู

### ความหมายของ "Monarch Slayer"
- = **ผู้ผ่านการทดสอบจนได้รับเชิญ** (ไม่ใช่ผู้ทุบกำแพง)
- เป็น prerequisite สำหรับ Ascendant (คงเดิม)

---

## 2. ทำไม 2-2-0 ถึงเหมาะกับ Monarch

กติกา 2-2-0 คือ **"รอยร้าวแรก" ของกฎ 3-3-5** — ครั้งแรกที่ distribution ถูกบิด ผู้เล่นได้ *ชิมลาง* ว่า "กฎเปลี่ยนได้"

เชื่อมภาคหลักกับภาคจบได้ 5 ชั้น:
1. **Gameplay** — ผู้เล่นสัมผัสกติกาใหม่จริง ไม่ใช่แค่อ่านข้อความ
2. **Lore** — Monarch แสดงว่าเขารู้กติกาอีกชุดหนึ่ง
3. **อารมณ์** — ผู้เล่นรู้สึกได้เห็นความลับก่อนคนทั่วไป
4. **การตลาด** — เข้า Arena แล้วจำได้ทันทีว่าเคยพบต้นแบบจาก Monarch
5. **การเรียนรู้** — ภาคหลักกลายเป็น Tutorial ซ่อนเร้นของภาคจบ

### นัยเชิงสัญลักษณ์
2-2-0 คือการยกกองอ่อน (G1/G2) ขึ้นเทียบเท่ากองแข็งสุด (G3) — บทจบเรียกร้องให้ผู้เล่น "เก่งครบทุกชั้น ไม่มีที่ให้หลบ" ("กองสุดท้ายแข็งแกร่งเพราะสิ่งที่เจ้ากล้ายอมเสีย")

---

## 3. บทพูด & Text Moments

### 3.1 Pre-Game (หลังแจก community 2-2-0 หยุดก่อนกอง 3)
- แสดงข้อความสั้น + Pile 3 เป็นช่องว่างเงามงกุฎแตก
- **EN:** *"You are used to receiving every pile in full. But in the true arena, no one hands you everything."*
- *(TH ref: "เจ้าคุ้นเคยกับการได้รับไพ่ครบทุกกอง แต่ในสนามประลองจริง ไม่มีใครมอบทุกสิ่งให้เจ้า")*

### 3.2 In-Game (ระหว่างจัดไพ่)
- บทที่สอน gameplay + หว่าน lore พร้อมกัน
- **EN:** *"The final pile is not strong because of the cards you were given — it is strong because of what you dared to sacrifice from the first two."*
- *(TH ref: "กองสุดท้ายไม่ได้แข็งแกร่งเพราะไพ่ที่ได้รับ แต่มันแข็งแกร่งเพราะสิ่งที่เจ้ากล้ายอมเสียจากสองกองแรก")*

### 3.3 Post-Game — แพ้
- ผู้เล่นรับรู้ว่ามีกติกาอีกระดับ แต่ยังไม่ได้ข้อมูลสำคัญ (ทำหน้าที่เป็น hook ของ encounter ที่ 2 ใน Arena)
- **EN:** *"You still cling to rules others laid down for you. When you are ready to play with nothing to lean on — return to me."*
- *(TH ref: "เจ้ายังยึดติดกับกติกาที่ผู้อื่นวางไว้ เมื่อพร้อมจะเล่นโดยไม่มีสิ่งค้ำจุน จงกลับมาหาข้า")*

### 3.4 Post-Game — ชนะ
- **EN:** *"Good... you can build the final pile even with nothing from the table. The arena you go to next does not always deal a community pile as you know it."*
- *(TH ref: "ดี… เจ้าสามารถสร้างกองสุดท้ายได้ แม้ไม่มีไพ่จากโต๊ะ สนามที่เจ้าจะไปต่อจากนี้ ไม่ได้แจกไพ่กองกลางเหมือนที่เจ้ารู้จักเสมอไป")*
- ตามด้วย **Arena hook visual** (section 4)

---

## 4. Arena Hook (ตอนชนะ)

- แสดง **โลโก้แอป The Arena** + **สัญลักษณ์ generic** (เงามงกุฎแตกที่ค่อยๆ ประกอบกลับ หรือประตูมืด)
- ไม่เปิดเผยรายละเอียด Arena ทั้งหมด (Arena ยังไม่ถูกออกแบบ — asset ค่อย update ทีหลัง)
- hook ชี้ไปที่ **The Arena** (แอป 2 ที่ commit แน่) ไม่ใช่ Endgame โดยตรง → ถ้า Endgame ไม่เกิด story ก็ไม่พัง

---

## 5. Trilogy Structure

ไตรภาค = **สามแอป + ไต่ระดับมิติภาพขนานกับกฎที่ค่อยๆ สลาย:**

| # | ชื่อแอป | มิติภาพ | สถานะกฎ | สถานะ project |
|---|---|---|---|---|
| 1 | **TriplePoker: Rise** | 2D ล้วน | กฎ 3-3-5 ศักดิ์สิทธิ์ | กำลังทำ |
| 2 | **TriplePoker: The Arena** | 2.5D (2D gameplay + 3D เฉพาะ Intro/ตอนจบ) | กฎเริ่มแตก | commit แน่ (~6 เดือนหลัง Main) |
| 3 | **TriplePoker: Endgame of Chaos** | 3D เต็มรูปแบบ | กฎทลายสิ้น (หลายด่าน หลายกติกา) | **conditional** — เกิดถ้าฐานสมาชิกพอ |

- Endgame = "โลกที่กฎถูกทลาย" หลายด่าน แต่ละด่านกติกาต่างกัน (Monarch 2-2-0 คือ "ตัวอย่างแรก" ของความโกลาหลนี้)
- design language: ยิ่งโลกโกลาหลขึ้น ภาพยิ่งมีมิติขึ้น — เล่าเรื่องด้วยตัวเทคโนโลยีเอง

---

## 6. Two-Encounter Vision (จองไว้ — realize ที่ Arena)

> MVP ทำ **Single Encounter** จริง แต่ Canon เก็บวิสัยทัศน์ Two-Encounter ไว้เต็ม (ไม่ทิ้ง แค่เลื่อนที่อยู่ไป Arena)

- **Encounter 1** (Rise): เล่น 2-2-0 → เกิดความสงสัย ("มีกติกาอีกระดับ")
- **Encounter 2** (Arena): เล่น 2-2-0 + องค์ประกอบจาก Arena (special Joker / limited Fog of War) → เมื่อชนะ → Monarch เปิดคำเชิญเข้าภาคจบ
- Monarch ทำหน้าที่ครบ 3: **ผู้ทดสอบ · ผู้สอน · ผู้ส่งต่อ** ผู้เล่นเข้าบทสุดท้าย

---

## 7. Responsible Gaming Messaging

> **แกนน้ำเสียง: เตือนสติ (responsible gaming, โทนห่วงใย)** · **ภาษา: EN 100%**
> จุดยืน: คนทำเกมไพ่ออนไลน์ออกมาเตือนสติผู้เล่นเอง = integrity ที่ทำให้ TriplePoker มี soul ต่างจากเกมโกงเงินทั่วไป
> เชื่อมกับ Monarch = ผู้เปิดเผยความจริงของจักรวาล

### 7.1 จุดที่ 1 — Monarch Lore หลังแพ้ (moment ที่ทรงพลังสุด)
- จังหวะที่ผู้เล่นเพิ่งแพ้บอสที่จัดไพ่เก่งกว่า กำลังสงสัย "มันโกงเรารึเปล่า?"
- ยิงสองนก: ตอกย้ำ TriplePoker fair + หว่านเมล็ดให้ฉุกคิดเรื่องเกมอื่น (ไม่ด่าใครตรงๆ)
- **EN (ตัวอย่าง ปรับได้):** *"You think I cheated? ...I have no need to cheat. But remember — out there, many tables hide the dealer's hand from your eyes. Here, I play with the same deck as you."*

### 7.2 จุดที่ 2 — Fair Play Manifesto (หน้า static ใน Settings/About)
- "ที่อยู่ถาวร" ของจุดยืน ใครสงสัยเปิดอ่านได้
- เนื้อหา: การันตีของ TriplePoker (ไพ่สุ่มยุติธรรม, server-authoritative, บอสไม่ได้ไพ่พิเศษ, RNG ตรวจสอบได้) + ย่อหน้าเตือนสติทั่วไปเรื่องเล่นไพ่ออนไลน์ด้วยเงินจริง (เล่นอย่างมีสติ, กำหนดงบของตัวเอง)

### 7.3 ตัด (ไว้พิจารณาทีหลัง)
- Onboarding / payment notice — ตัดออกจาก MVP (กันกระทบ conversion) เก็บไว้เสริม responsible gaming เต็มรูปแบบทีหลัง

---

## Changelog
- **v1.0** — narrative canon แรก: Monarch = Herald, บทพูด 4 moments, trilogy 3 แอป, two-encounter vision, responsible gaming messaging
