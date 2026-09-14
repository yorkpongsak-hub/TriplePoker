# TRIPLEPOKER: RISE — LEAGUE GAMEPLAY CANON v1.1

> Canon สรุปกติกา League Mode ที่ตกลงล่าสุด

## 1. League Progression

| League | Level | AI opponents | Arrange Timer |
|---|---:|---:|---:|
| Bronze | 1–50 | 1 | Unlimited |
| Silver | 51–100 | 1 | 5:00 |
| Gold | 101–150 | 1 | 3:00 |
| Platinum | 151–200 | 2 | 2:30 |
| Diamond | 201–250 | 2 | 2:00 |
| Elite | 251–350 | 2 | 1:45 |
| Master | 351–500 | 3 | 1:30 |
| Grandmaster | 501–700 | 3 | 1:15 |
| Legend | 701–1000 | 3 | 1:00 |
| Mythic | 1001–1500 | 3 | 0:45 |

- Bronze ไม่มี Mission และไม่มี Hand Multiplier
- ตั้งแต่ Silver เป็นต้นไป เปิด Mission และ Hand Multiplier
- ชนะ Lv. สุดท้ายของ League รับ Trophy ทันที ไม่มี Boss Gate เพิ่ม
- พิชิต Elite → Unlock Tier C
- พิชิต Master → Unlock Tier B
- พิชิต Grandmaster → Unlock Tier A
- พิชิต Legend → Unlock Tier A+
- หลัง Lv.1500 เดินต่อ Lv.1501, 1502, ... แบบ Endless ภายใต้ Mythic
- Endless ไม่บีบเวลาเพิ่มจาก Mythic
- แพ้ Lv. → อยู่ Lv. เดิม ไม่มีตก Level และ Retry ได้
- Retry → สุ่มไพ่, Mission, AI arrangement และค่าที่เกี่ยวข้องใหม่ทั้งหมด

## 2. League Mode Scope

League Mode ไม่มีระบบ Auction เพื่อควบคุม Dev scope และทำให้ Solo progression เข้าใจง่าย

แกนหลักคือ:
- Arrange cards
- Shared Missions
- AI competition
- Timer
- Items
- Reveal G1 → G2 → G3
- Score / Combo / Super Combo


## 2A. Bronze Guided Reveal — Learning Curve

Bronze เป็น League สำหรับเรียนรู้กติกาหลัก จึงใช้การเปิดไพ่ AI ล่วงหน้าแบบค่อย ๆ ลดข้อมูลช่วยเหลือ โดย AI ต้อง Arrange และ Lock ไพ่ทั้ง 3 กองก่อนเปิดให้ Player เห็น และห้ามเปลี่ยน arrangement หลัง Reveal

| Bronze Level | AI cards revealed before Player arrangement | Purpose |
|---|---|---|
| Lv.1–20 | G1 + G2 + G3 | เรียนรู้ Hand ranking, `G1 < G2 < G3` และการจัดเพื่อเอาชนะ AI |
| Lv.21–40 | G1 + G2 | เริ่มฝึกคาดเดา Hidden G3 |
| Lv.41–50 | G1 only | Transition ไปสู่การเล่นจริงที่ข้อมูล AI ถูกซ่อน |
| Silver Lv.51+ | None by default | Training wheels removed |

- Bronze ไม่มี Mission, Hand Multiplier และ Timer ตามกติกาเดิม
- Bronze Guided Reveal เป็น learning mechanic ไม่ใช่ Open Challenge แบบสุ่ม
- Bronze ไม่เปิดใช้ Undo เพราะ Player ได้ข้อมูล AI ล่วงหน้าอยู่แล้ว
- ตั้งแต่ Silver เป็นต้นไป การเล่นปกติจะไม่เปิดไพ่ AI ล่วงหน้า เว้นแต่ Lv. นั้นสุ่มเข้า Open Challenge

## 2B. Open Challenge — Random Reveal Modifier

ตั้งแต่ Silver เป็นต้นไป รวมถึง Mythic Endless ทุก Lv. มีสิทธิ์สุ่มเข้า **Open Challenge** เป็น Special Challenge Modifier ได้ตลอดเวลา

เมื่อ Open Challenge เกิดขึ้น:
1. AI ทุกตัว Arrange ไพ่ G1/G2/G3 ให้เสร็จและ Lock ทั้งหมดก่อน Reveal
2. ระบบสุ่มจำนวนกองที่จะเปิดล่วงหน้า: 1 / 2 / 3 กอง
3. ถ้าเปิด 1 กอง ให้สุ่มเท่า ๆ กันระหว่าง G1 / G2 / G3
4. ถ้าเปิด 2 กอง ให้สุ่มระหว่าง G1+G2 / G1+G3 / G2+G3
5. ถ้าเปิด 3 กอง ให้เปิด G1+G2+G3 ทั้งหมด
6. ไพ่ AI ที่เปิดแล้วเป็นข้อมูลจริงจาก arrangement ที่ Lock ไว้และห้าม AI เปลี่ยนภายหลัง

### Open Challenge Clear Condition

Open Challenge เปลี่ยนเงื่อนไขการผ่าน Lv. เป็น:

`PLAYER MUST WIN G1 + G2 + G3`

- ต้องชนะ AI ทั้ง 3 กองจึงผ่าน Lv.
- ชนะเพียง 2/3, 1/3 หรือ 0/3 = ไม่ผ่าน Lv. แม้ Final Score รวมจะสูงที่สุด
- Player tie กับ AI ในกองใด ยังคงถือว่า Player ชนะกองนั้นตามกฎหลัก
- Mission, Mission Bonus, Negative Mission, Combo และ Super Combo ยังทำงานและคิดคะแนนตามปกติ แต่ไม่สามารถแทนเงื่อนไข Win All 3 Piles ได้
- Open Challenge สามารถเกิดร่วมกับ 1/2/3 Shared Missions และกติกาอื่นของ League นั้นได้
- หากไม่ผ่าน ให้ Retry Lv. เดิมตามกฎปกติ และ Retry จะสุ่ม state ใหม่ทั้งหมด

Open Challenge มีเจตนาให้ข้อมูล AI มากขึ้นแลกกับ clear condition ที่เข้มขึ้น ทำให้แต่ละ Lv. เปลี่ยนจากการแข่งขันคะแนนเป็นโจทย์จัดไพ่แบบ perfect sweep ได้เป็นครั้งคราว

## 3. Pile Rules & Base Score

การจัดต้องรักษากติกาหลักเสมอ:

`G1 < G2 < G3`

ถ้าจัดผิด ให้เด้งข้อความเตือนทันทีและไม่อนุญาต Confirm/Ready จนกว่าจะจัดถูก ไม่ถือว่าแพ้และไม่หักคะแนนเพราะการกดผิด

คะแนนพื้นฐานเมื่อชนะกอง:
- G1 = 2
- G2 = 3
- G3 = 6

การชนะกองใช้ Winner Takes the Pile: ต้องมี Hand แข็งที่สุดเมื่อเทียบกับ AI ทุกตัวในโต๊ะ

- Player เสมอกับ AI → Player ชนะ
- AI เสมอกับ AI → ปล่อยเสมอได้

## 4. Hand Multiplier

เริ่มตั้งแต่ Silver:
- Straight หรือต่ำกว่า = ×1
- Flush = ×1.5
- Full House = ×1.5
- Four of a Kind หรือสูงกว่า = ×2

Multiplier ใช้เฉพาะ Pile Win Score และไม่คูณ Mission/Combo/Super Combo

ถ้าเกิดเศษ ให้ปัดขึ้นเสมอทั้ง Player และ AI

ตัวอย่าง G2: `3 × 1.5 = 4.5 → 5`

ถ้าแพ้กอง Pile Win Score = 0 แต่ Mission Bonus ยังคงได้รับหากทำ Mission สำเร็จ

## 5. Mission System

### 5.1 Shared Mission
Mission เปิดพร้อมการแจกไพ่ และ Player/AI ทุกตัวใช้ Mission ชุดเดียวกันทั้งโต๊ะ

Mission และไพ่สุ่มเป็นอิสระจากกัน ระบบไม่ดูไพ่ก่อนเลือก Mission

Mission Lock ตลอด Lv. ไม่เปลี่ยนจาก Undo/Shuffle/Swap

### 5.2 Mission Count
Bronze ไม่มี Mission

ตั้งแต่ Silver ทุก League มีโอกาสสุ่มได้ 1/2/3 Missions โดย League สูงมีน้ำหนักไปทางจำนวน Mission มากขึ้น

Baseline ที่ล็อกไว้:

| League | 1 Mission | 2 Missions | 3 Missions |
|---|---:|---:|---:|
| Silver | 80% | 15% | 5% |
| Gold | 65% | 25% | 10% |
| Platinum | 50% | 35% | 15% |
| Diamond | 40% | 40% | 20% |
| Elite | 30% | 45% | 25% |
| Master | 20% | 45% | 35% |
| Grandmaster | 15% | 40% | 45% |
| Legend | 10% | 30% | 60% |
| Mythic | 5% | 20% | 75% |

ตำแหน่ง Mission:
- 1 Mission → สุ่ม G1/G2/G3
- 2 Missions → สุ่ม G1+G2 / G1+G3 / G2+G3
- 3 Missions → G1+G2+G3

กองที่ไม่มี Mission ให้แสดง G1/G2/G3 ตามปกติ

### 5.3 Mission Pool
Mission ทั้งชุดต้องเรียงตามกติกาหลัก `G1 < G2 < G3`

- G1: High Card → One Pair (สูงสุด Pair)
- G2: One Pair → Two Pair → Three of a Kind (สูงสุด Trips)
- G3: Two Pair → Three of a Kind → Straight → Flush (ต่ำสุด Two Pair, สูงสุด Flush)

### 5.4 Mission Bonus
เมื่อ Hand ตรง Mission ได้เต็ม:
- High Card +1
- One Pair +2
- Two Pair +3
- Three of a Kind +4
- Straight +6
- Flush +8

ถ้า Hand สูงกว่า Mission:
- Mission ถือว่าสำเร็จ
- ได้ 50% ของ Mission Bonus
- ปัดขึ้นเสมอ

ดังนั้น:
- High Card +1 → สูงกว่าได้ +1
- Pair +2 → +1
- Two Pair +3 → +2
- Trips +4 → +2
- Straight +6 → +3
- Flush +8 → +4

สูงกว่ากี่ Rank ก็ใช้ 50% เท่ากัน

Mission Bonus เป็นคะแนนอิสระจากผลแพ้ชนะกอง ดังนั้นทำ Mission สำเร็จแต่แพ้กองก็ยังได้ Mission Bonus

## 6. Mandatory Negative Mission

Negative Mission เกิดได้เฉพาะ Lv. ที่สุ่มได้ Mission ครบทั้ง 3 กองเท่านั้น

- League ยิ่งสูง โอกาสพบยิ่งมาก
- Mythic สูงสุด 33.33% ของด่านที่มี 3 Missions
- ใน 1 Lv. มี Negative Mission สูงสุด 1 กอง
- เลือก G1/G2/G3 ด้วยโอกาสเท่ากัน
- Negative Mission เป็น `Mission+` เสมอ: Hand ตามเกณฑ์หรือสูงกว่าถือว่าผ่าน
- Penalty สุ่ม −5 ถึง −10 และแสดงตั้งแต่เริ่ม Lv.
- ผ่าน → +0, ไม่ถูกหัก และนับว่า Mission สำเร็จ
- ไม่ผ่าน → หักคะแนนตามค่าที่สุ่ม
- คะแนนรวมสามารถติดลบได้
- Negative Mission ไม่มี Mission Bonus บวก

## 7. Combo / Super Combo

Combo เกิดเมื่อทำ Mission ครบทั้งชุดเท่านั้น และไม่สนผลแพ้ชนะของกอง

- Lv. มี 1 Mission → ไม่มี Combo
- Lv. มี 2 Missions → ต้องสำเร็จ 2/2 → `COMBO!` → สุ่ม +5 ถึง +7
- Lv. มี 3 Missions → ต้องสำเร็จ 3/3 → `SUPER COMBO!` → สุ่ม +10 ถึง +15
- ทำ 2/3 ในด่าน 3 Missions → ไม่มี Combo
- Negative Mission ที่ผ่านนับเป็น Mission สำเร็จสำหรับ Super Combo
- Super Combo ที่มี Negative Mission ยังคง +10 ถึง +15 เท่าเดิม
- Player และ AI ทุกตัวมีสิทธิ์ได้ Combo/Super Combo เหมือนกัน
- Shared Mission แต่รางวัลเป็น Individual Achievement

Combo/Super Combo สุ่มโบนัสเมื่อ Mission ตัวสุดท้ายที่เกี่ยวข้องถูก Commit แล้วเท่านั้น เพื่อป้องกัน Undo เพื่อ reroll

## 8. Score Formula

Final Score ของแต่ละคน:

`Pile Win Scores + Mission Bonuses + Combo/Super Combo − Mandatory Penalties`

Pile Win Score:

`ceil(Base Pile Score × Hand Multiplier × Item Multiplier)`

เฉพาะเมื่อชนะกอง หากแพ้กอง Pile Win Score = 0

Mission/Combo/Penalty คิดแยกจากผลชนะกอง

ผู้ที่ Final Score สูงสุดชนะ Lv.

Player เสมอ AI ใน Final Score → Player ชนะ Lv.

## 9. Reveal Flow

1. Deal cards + Reveal Mission พร้อมกัน
2. Timer เริ่ม
3. Player/AI arrange; AI ต้อง Lock G1/G2/G3 ทั้งหมดก่อน Reveal
4. Player กด Reveal G1
5. AI Reveal G1 ทีละตัวแบบเร็ว (~0.2–0.3s stagger)
6. แสดงผลกอง + Mission เป็น Provisional Score
7. Player เลือก Undo หรือกด Reveal G2
8. Reveal G2 → ตัดสินใจ Undo → Reveal G3
9. Commit G3 → Combo/Super Combo หากเข้าเงื่อนไข → Final Score

การกด Reveal กองถัดไป = Commit กองก่อนหน้าและหมดสิทธิ์ Undo กองนั้น

System animation ที่ผู้เล่นควบคุมไม่ได้ Pause Timer อัตโนมัติ เมื่อคืน control ให้ผู้เล่น Timer เดินต่อ

คะแนน Provisional ที่ถูก Undo ให้ยกเลิกเงียบ ๆ แล้วคำนวณใหม่ ไม่ต้องเล่น VFX คะแนนย้อนกลับ

ถ้า Timer หมดหลัง Reveal แต่ก่อนตัดสินใจ Undo → Commit กองปัจจุบันอัตโนมัติและ Auto Reveal กองที่เหลือจนจบ

## 10. Timer

- Bronze: Unlimited
- Silver: 5:00
- Gold: 3:00
- Platinum: 2:30
- Diamond: 2:00
- Elite: 1:45
- Master: 1:30
- Grandmaster: 1:15
- Legend: 1:00
- Mythic: 0:45

Timer เดินตลอดเมื่อ Player มี control ยกเว้น Freeze

ถ้า Timer หมดระหว่าง Arrange → Auto Arrange ไพ่ที่เหลือให้ Valid ตาม `G1 < G2 < G3` เท่านั้น ไม่ Optimize เพื่อ Win/Mission/Combo/Multiplier โดยเจตนา

Freeze register ก่อน Timer = 0 → Freeze สำเร็จ
Timer = 0 และ Auto Arrange trigger แล้ว → Freeze ย้อนกลับไม่ได้

## 11. Items

Item bar วางเป็นแถวตรึงด้านล่างหน้าจอ โดย Item ตัวที่ 3 อยู่ตรงกึ่งกลางหน้าจอ

ลำดับ:
1. Shuffle
2. Swap
3. ×2 (center anchor)
4. Freeze
5. Undo

จำนวน Stock ไม่ฝังใน artwork icon ให้ UI/code render จำนวนแยกต่างหาก

Stock = 0 → icon สีจางและกดไม่ได้

ใช้ Item แล้วหัก Stock ทันที ไม่คืนเมื่อแพ้หรือ Retry

### Shuffle
- ใช้ได้ก่อน Reveal G1 เท่านั้น
- Shuffle/Deal ใหม่ทั้งโต๊ะจากสำรับใหม่เพื่อรักษา 52-card deck
- Mission เดิม
- AI arrange และ Lock ใหม่

### Swap
- Player แตะเลือกไพ่ 1 ใบก่อน แล้วกด Swap
- เปลี่ยนไพ่ได้ครั้งละ 1 ใบเหมือนจั่วใบใหม่มาแทน
- ใช้ได้ก่อน Reveal G1 เท่านั้น

### ×2
- เลือกใช้กับกองใดกองหนึ่งก่อน Reveal กองนั้น
- คูณเฉพาะ Base Pile Reward ของกองที่ชนะ
- ไม่คูณ Mission Bonus, Combo, Super Combo หรือ Penalty
- แพ้กอง → 0 และ Item ถูกใช้ไปแล้ว
- Stack กับ Hand Multiplier ได้

ตัวอย่าง G3 Four of a Kind+ และใช้ ×2 Item:
`6 × 2 × 2 = 24`

### Freeze
- Pause ทุกอย่างจริง ๆ เพราะใช้กรณีติดธุระ
- หยุด Timer, input, Reveal, animation และ game progression
- ไม่มีเวลาสูงสุด
- แตะหน้าจออีกครั้งเพื่อ Resume
- ใช้ได้หลายครั้งต่อ Lv. ตราบใดที่มี Stock

### Undo
- ใช้หลังเห็นไพ่ AI ของกองที่ Reveal แล้ว
- AI cards ทั้งหมดถูก Lock ตั้งแต่ต้นและห้ามเปลี่ยน
- ไพ่ AI ที่ Reveal แล้วค้างให้เห็นขณะ Player แก้
- 1 Undo = แก้ 1 กอง
- กองเดิม Undo ซ้ำไม่ได้
- สูงสุด 3 Undo/Lv. (G1/G2/G3 อย่างละ 1)
- Undo G1 → ปลด G1+G2+G3 ของ Player
- Undo G2 → G1 Lock; ปลด G2+G3
- Undo G3 → G1+G2 Lock; แก้ G3
- Timer เดินต่อระหว่าง Undo เว้นแต่ใช้ Freeze
- Mission ไม่เปลี่ยน

## 12. Item / Score VFX

ทุกคะแนน `+` และ `−` ให้แสดง animation บริเวณกรอบ Avatar ของเจ้าของคะแนนประมาณ 1 วินาที:
- Float
- Slight rotation
- Scale up
- Fade out

Player และ AI ใช้ feedback แบบเดียวกัน

เมื่อทำครบ 2 Missions → VFX `COMBO!`
เมื่อทำครบ 3 Missions → VFX `SUPER COMBO!`
พร้อมแสดงโบนัสที่สุ่มได้

## 13. AI Difficulty

AI ห้ามโกงหรือรู้ Hidden Information ของ Player

ความฉลาดเพิ่มตาม League:
- Bronze: Arrange ให้ Valid และเลือก Hand แบบพื้นฐาน
- Silver: เริ่มสน Mission แต่เน้น Win
- Gold: เปรียบเทียบ Win กับ Mission ง่าย ๆ
- Platinum: เริ่มวางแผน Combo 2/2
- Diamond: ยอมเสียโอกาสชนะบางกองเมื่อ Combo คุ้มกว่า
- Elite: ประเมินทั้ง 3 กองร่วมกัน
- Master: ประเมิน Win + Mission + Combo + Super Combo
- Grandmaster: ประเมิน Expected Score ของหลาย arrangement
- Legend: ประเมิน Mandatory Penalty Risk และ sacrifice เพื่อรักษา Super Combo
- Mythic: เลือก arrangement ที่ Expected Final Score สูงสุดจากตัวเลือกจำนวนมาก

แนวคิด scoring objective ของ AI ระดับสูง:

`Expected Final Score = Expected Pile Score + Mission Score + Combo EV + Super Combo EV − Mandatory Penalty Risk`

AI ทุกตัวใช้กฎคะแนน Mission, 50% เมื่อสูงกว่า Mission, การปัดขึ้น, Multiplier, Negative Mission และ Combo/Super Combo เหมือน Player ทุกประการ

## 14. Endless

หลัง Lv.1500:
- อยู่ Mythic ต่อ
- Lv.1501 → 1502 → 1503 → ... ไม่มีเพดาน
- ไม่ลด Timer ต่ำกว่า 45 วินาที
- ไม่เพิ่มการบีบคั้นด้านเวลาอีก
- ใช้ Mythic rules เป็น difficulty ceiling
- Level number ทำหน้าที่เป็น long-term progression / prestige

---

## Canon Principle

League Mode ต้องคงความง่ายในการพัฒนา: ไม่มี Auction แต่สร้างความหลากหลายจาก Shared Mission, AI strategy, Item decisions, progressive Timer, Guided/Open Reveal และ Reveal/Undo loop

ผู้เล่นสามารถชนะด้วยหลายแนวทาง: ชนะกองโดยตรง, ไล่ Mission, เสี่ยง Combo/Super Combo, ใช้ ×2 กับกองที่มั่นใจ หรือบริหาร Item เพื่อพลิกสถานการณ์ โดย AI ระดับสูงต้องสามารถประเมิน trade-off แบบเดียวกันได้โดยไม่โกงข้อมูล
