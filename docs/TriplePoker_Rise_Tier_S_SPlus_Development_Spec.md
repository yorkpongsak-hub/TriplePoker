# TriplePoker: Rise
## Tier S — Grandmaster & Tier S+ — Sovereign
### Consolidated Development Specification for Codex
> สถานะเอกสาร: Consolidated Working Specification
>
> เอกสารนี้รวบรวมข้อตกลงจากการหารือเกี่ยวกับการนำระบบเดิมของ **TriplePoker: The Arena** กลับมารวมไว้ในแอปหลัก **TriplePoker: Rise** เพื่อให้ง่ายต่อการพัฒนา ดูแลระบบ และบริหาร Economy ร่วมกัน
>
> หมายเหตุ: หัวข้อที่ระบุว่า **Locked** ให้ถือเป็นข้อกำหนดหลักสำหรับการพัฒนา ส่วนหัวข้อที่ระบุว่า **Pending** ให้เตรียมโครงสร้างรองรับ แต่ยังไม่ล็อกค่ารายละเอียดสุดท้าย

---

# 1. Tier Structure

## 1.1 ชื่อลำดับ Tier

- C — Initiate
- B — Adept
- A — Mastermind
- A+ — High Noble
- S — Grandmaster
- S+ — Sovereign

## 1.2 Tier S — Grandmaster

**สถานะ: Locked**

- ปลดล็อกเมื่อผู้เล่นมี Token มากกว่า **1,000,000 Token**
- ไม่มีเงื่อนไขอื่น
- เป็น Tier สูงสุดแบบถาวร
- ไม่มี Tier ถาวรที่สูงกว่า S

## 1.3 Tier S+ — Sovereign

**สถานะ: Locked บางส่วน**

- ไม่ใช่ Tier ถาวร
- เป็นสิทธิ์เข้าเล่น Match พิเศษในช่วงเวลาที่กำหนด
- ใช้ระบบคัดเลือกแบบเดือนต่อเดือน
- สิทธิ์มีอายุเฉพาะรอบเดือนนั้น
- เดือนถัดไปต้องคัดเลือกใหม่

### รอบคัดเลือก S+

- ใช้ Performance Score ของเดือนนั้น
- ต้องเล่นจบอย่างน้อย **10 Matches**
- สัปดาห์ที่ 1–3 ใช้เก็บคะแนนและจัด Ranking
- ประกาศผลในวันอาทิตย์ของสัปดาห์ที่ 3
- สัปดาห์สุดท้ายใช้จัด Match พิเศษของ S+
- ผู้ได้รับสิทธิ์ S+ ต่อเดือนไม่เกิน **10 คน**

### Pending

- จำนวนผู้ได้รับสิทธิ์จริงต่อเดือน
- รูปแบบ Match พิเศษในสัปดาห์สุดท้าย
- Tie-break ของ Ranking รายเดือน

---

# 2. Economy Baseline

## 2.1 Token, Crown และ Crest

**สถานะ: Locked**

- 1 Crown = 5,000 Token
- แลกได้ทางเดียว: Token → Crown
- ไม่มี Crown → Token
- 1 Crest = 1/12 Crown
- 12 Crest = 1 Crown

ระบบภายในควรเก็บค่าเป็นจำนวนเต็มของ Crest เพื่อหลีกเลี่ยง floating-point error

ตัวอย่าง:

- 3 Crest = 0.25 Crown
- 6 Crest = 0.50 Crown
- 9 Crest = 0.75 Crown
- 12 Crest = 1 Crown

## 2.2 Regular Tier S Economy

### Ante ต่อ Game

- Pile 1 = 0.25 Crown = 3 Crest
- Pile 2 = 0.25 Crown = 3 Crest
- Pile 3 = 0.50 Crown = 6 Crest
- รวม Ante ต่อ Game = 1 Crown = 12 Crest

### Auction

- มี 2 รอบ
- ราคาประมูล: 0 / 0.25 / 0.50 / 0.75 / 1.00 Crown
- เทียบเป็น Crest: 0 / 3 / 6 / 9 / 12 Crest
- ผู้เล่นยื่นราคาได้เพียงรอบเดียว
- ผู้แพ้ประมูลไม่เสีย Crown
- ผู้ชนะประมูลถูกหัก Crown ทันทีหลังทราบผล
- Crown Panel ต้องอัปเดตทันที
- เงินประมูลเข้า Battle Rewards

### Call

- Call ได้ใน Pile 2 และ Pile 3
- ราคา Call ทุกครั้ง = 0.25 Crown = 3 Crest
- ไม่มี Raise

### ค่าใช้ต่อ Game

- ต่ำสุด = 1 Crown
- สูงสุด = 3 Crown

### ค่าใช้ต่อ Match

- 1 Match = 3 Games
- ต่ำสุด = 3 Crown
- สูงสุด = 9 Crown

## 2.3 AI Boss

- ใช้ค่าเดิมพัน x2 จาก Regular ทุกค่า
- ค่าใช้ก่อนค่าธรรมเนียม = 6–18 Crown ต่อ Match
- ค่าธรรมเนียม = 2 Crown
- ค่าธรรมเนียมเป็น Crown Sink
- ค่าธรรมเนียมไม่เข้า Pot
- ค่าใช้รวม = 8–20 Crown

## 2.4 Human Boss

- ใช้ค่าเดิมพัน x2 จาก Regular ทุกค่า
- ค่าใช้ก่อนค่าธรรมเนียม = 6–18 Crown ต่อ Match
- ค่าธรรมเนียม = 4 Crown
- ค่าธรรมเนียมเป็น Crown Sink
- ค่าธรรมเนียมไม่เข้า Pot
- ค่าใช้รวม = 10–22 Crown

## 2.5 Battle Rewards

**สถานะ: Locked**

- เงินประมูลของผู้ชนะเข้า Battle Rewards
- Battle Rewards สะสมตลอดทั้ง Match 3 Games
- หากไม่มีผู้ทำ Sweep Jackpot เมื่อจบ Match เงินที่เหลือถูกหักเป็น Crown Sink

## 2.6 Sweep Jackpot

**สถานะ: Locked**

- ผู้เล่นที่ชนะครบทั้ง 3 Piles ใน Game เดียว ได้รับ Battle Rewards ทั้งหมดที่สะสมอยู่ ณ ขณะนั้น
- หลังจ่าย Sweep Jackpot แล้ว Battle Rewards เริ่มสะสมใหม่
- ปริมาณรางวัลขึ้นอยู่กับยอดที่สะสมจริง
- Joker x2 ไม่คูณ Battle Rewards หรือ Jackpot

---

# 3. Table Composition และ Boss Encounter

## 3.1 จำนวนผู้เล่น

- โต๊ะมาตรฐานมี 4 ที่นั่ง
- Human ขั้นต่ำ = 2 คน
- AI เติมโต๊ะได้เฉพาะกรณีผู้เล่นหลุดจากโต๊ะ
- Boss อยู่ตำแหน่ง P3 เสมอ

## 3.2 Tier S Regular Match

- หาก Human ครบ 3 คนภายใน 1 นาที ให้ Server สุ่ม Boss Encounter ทันที
- Boss Encounter Rate = 60%

### ถ้าสุ่มติด Boss Encounter

- Boss เข้ามาเป็นผู้เล่นคนที่ 4
- เริ่ม Match ทันที

### ถ้าสุ่มไม่ติด

- โต๊ะรอ Human คนที่ 4
- เริ่ม Match เมื่อ Human ครบ 4 คน

## 3.3 รูปแบบ Boss Encounter

มี 3 รูปแบบ:

1. Boss Monarch
2. Boss Soren
3. Boss Monarch + Boss Soren อยู่โต๊ะเดียวกัน

### Dual Boss Encounter

- อัตราการเกิดต้องต่ำ
- ไม่เกิน 10% ของ Boss Encounter ทั้งหมด
- ใช้เปิดเผย Lore ผ่านบทสนทนาระหว่างเล่น
- บทสนทนาไม่ควรหยุด Timer หรือรบกวน Decision Phase

### Pending

- สัดส่วน Monarch / Soren / Dual Boss ที่แน่นอน

## 3.4 AI Boss Match

- Human 3 คน
- AI Boss 1 คน
- Boss อยู่ P3

## 3.5 Human Boss Match

- เป็น 1v1 แบบเดียวกับ Boss Monarch
- ใช้ AI อีก 2 ที่นั่งเพื่อเติมโต๊ะ
- Human Boss อยู่ P3

---

# 4. Deck และ Joker

## 4.1 Deck

- ใช้ไพ่ปกติ 52 ใบ + Joker 1 ใบ
- รวม 53 ใบ

## 4.2 Joker Modes

Joker มี 2 คุณสมบัติเท่านั้น:

1. Fully Wild แบบมีข้อจำกัด
2. Ante Multiplier x2

เมื่อผู้เล่นได้รับ Joker เข้ามือ ต้องประกาศต่อ Server ว่า:

- ใช้โหมดใด
- ใช้กับ Pile ใด

เมื่อ Server รับแล้วให้ล็อกการเลือก

## 4.3 Timing การประกาศ Joker

**สถานะ: Locked**

- เลือกได้จนถึงก่อน Final Lock
- ถ้าหมดเวลาโดยยังไม่เลือก ให้ Auto-lock เป็น Wild ใน Pile 3

## 4.4 การเปิดเผย Joker Mode

- ถ้าเลือก Ante x2 ต้องประกาศให้ทุกคนเห็นทันที
- ถ้าเลือก Wild ให้ซ่อน Pile เป้าหมายไว้จนเปิด Pile นั้น

## 4.5 Joker จาก Community Card ของ Pile 3

ถ้า Joker ปรากฏเป็นไพ่ใบที่ 2 ของ Community Card ใน Pile 3:

- ระบบบังคับเป็น Wild เท่านั้น
- ล็อกที่ Pile 3 ทันที
- ห้ามเลือก Ante x2

## 4.6 Fully Wild Rules

**สถานะ: Locked**

- แทนได้ทั้ง Rank และ Suit
- ใช้สร้างชุดมาตรฐานได้ทุกประเภท
- ใช้สร้าง Pair, Three of a Kind, Straight, Flush, Full House, Four of a Kind และ Straight Flush ได้
- ห้าม Five of a Kind
- ต้องใช้เฉพาะ Pile ที่ประกาศไว้
- Server ประเมิน Joker ให้เป็นค่าที่ทำให้ Hand Rank สูงสุดใน Pile นั้น
- หาก Natural Hand และ Wild Hand มีอันดับและค่าเท่ากัน ให้ Natural Hand ชนะ

## 4.7 Ante Multiplier x2

**สถานะ: Locked**

- ผู้เล่นต้องมี Buy-in Crown เพียงพอ
- Server ตรวจยอดก่อนอนุญาต
- คูณเฉพาะ Ante ของ Pile เป้าหมาย
- ไม่คูณ Call
- ไม่คูณ Auction
- ไม่คูณ Fee
- ไม่คูณ Jackpot
- เมื่อใช้ x2 คู่แข่งทุกคนต้อง Match Ante ให้เป็นสองเท่าใน Pile นั้น
- Crown ถูกเพิ่มเข้า Pot ของ Pile นั้น
- Joker ที่ใช้เป็นตัวคูณแล้วต้องถูกบังคับทิ้ง

ตัวอย่าง:

Pile 3 ปกติ Ante = 6 Crest

- ผู้ใช้ Joker x2 วาง 12 Crest
- คู่แข่งทุกคนต้องวาง 12 Crest
- Call ยังคง 3 Crest ต่อครั้ง

---

# 5. Auction Flow

## 5.1 Arrange รอบแรก

- ผู้เล่นจัดไพ่ในมือรอบแรก
- ใช้ประเมินว่ากองใดยังขาดอะไร

## 5.2 Auction รอบที่ 1 — Face-up Auction

- เปิดไพ่ประมูลใบที่ 1 ให้เห็นหน้า
- ผู้เล่นตัดสินใจว่าคุ้มค่าหรือไม่
- ผู้ชนะรอบแรกหมดสิทธิ์ Auction รอบสอง
- เหตุผลเชิงกลยุทธ์: ไพ่ที่ยังไม่เปิดอีก 2 ใบอาจมี Joker

## 5.3 Auction รอบที่ 2 — Blind Auction

- ใช้รูปแบบเดียวกับ Tier A/A+
- ผู้เล่นที่ยังมีสิทธิ์ยื่นราคาได้เพียงครั้งเดียว
- เลือกประมูลได้เพียง 1 ใบ
- ไพ่ยังคว่ำหน้า

## 5.4 Tie-break

- ถ้าราคาสูงสุดเท่ากันและเป็น Human ตั้งแต่ 2 คนขึ้นไป ให้ Server สุ่มเฉพาะผู้ที่เสมอกัน
- ประกาศผลว่า Lucky Draw
- ผู้ชนะ Lucky Draw ได้ไพ่ประมูล
- Match Log ต้องบันทึก tie-break method และผลสุ่ม

## 5.5 Bid 0

- ถ้าทุกคน Bid 0 แสดงว่าไม่มีผู้สนใจ
- ไพ่ประมูลถูกทิ้ง
- ไม่มี Lucky Draw

## 5.6 Settlement

- ผู้ชนะถูกหัก Crown ทันทีหลังทราบผล
- Crown Panel อัปเดตทันที
- เงินเข้า Battle Rewards
- ผู้แพ้ไม่เสีย Crown

## 5.7 เปิด Community Card สุดท้าย

เมื่อ Auction รอบสองจบ:

- เปิดไพ่ใบที่ 2 ของ Community Card ใน Pile 3
- ผู้เล่นเห็นทันทีว่าเป็นไพ่ธรรมดาหรือ Joker
- จากนั้นเข้าสู่ Final Arrange

---

# 6. Core Game Flow

ลำดับหลักต่อ Game:

1. Deal
2. Arrange รอบแรก
3. Face-up Auction
4. Blind Auction
5. Reveal Community Card ใบที่ 2 ของ Pile 3
6. Final Arrange
7. Joker Declaration / Auto-lock ถ้าหมดเวลา
8. Discard
9. Final Lock
10. Resolve Pile 1
11. GF Pile 2
12. GF Pile 3 รอบแรก
13. GF Pile 3 รอบสอง
14. Game Settlement
15. Game Result

1 Match = 3 Games ทุก Mode

---

# 7. GF Rules

## 7.1 General

- ไม่มี Raise
- มีเฉพาะ Call / Fold
- Call ทุกครั้ง = 0.25 Crown = 3 Crest
- Fold มีผลเฉพาะ Pile ปัจจุบัน

## 7.2 Pile 1

- ไม่มี GF
- เปิดไพ่และตัดสินผลโดยตรง

## 7.3 Pile 2

- มี GF 1 รอบ
- Boss AI เป็นผู้เริ่ม Action เสมอ
- ถ้าเป็นโต๊ะ Human ล้วน ผู้เล่นที่เข้า Server เป็นคนแรกของโต๊ะเริ่ม Action
- หมุนทวนเข็มนาฬิกา
- ผู้เล่นที่ Fold เสียสิทธิ์เฉพาะ Pile 2

## 7.4 Pile 3 — GF รอบแรก

- เริ่มจากผู้เล่นคนสุดท้ายที่ Call ใน Pile 2
- หมุนตามเข็มนาฬิกา

## 7.5 Pile 3 — GF รอบสอง

- เริ่มจากผู้เล่นคนสุดท้ายที่ Call ใน GF รอบแรก
- หมุนกลับทวนเข็มนาฬิกา
- เฉพาะผู้เล่นที่ยัง Call จากรอบแรกเท่านั้นที่มีสิทธิ์เล่นต่อ
- ผู้ที่ Fold รอบแรกไม่มีสิทธิ์กลับเข้ารอบสอง

## 7.6 กรณีเหลือผู้เล่นคนเดียว

- ถ้าทุกคน Fold จนเหลือผู้เล่นคนเดียว ผู้เล่นคนนั้นชนะ Pot ทันที
- ไม่ต้องเปิดไพ่
- รักษา Fog of War
- ถ้ามี Joker Wild ในกองนั้น ไม่ต้องเปิดเผยค่าที่ Joker แทน

---

# 8. Fog of War

- ไพ่ของผู้แพ้ไม่เปิดเผย
- ถ้าเหลือผู้ชนะจากการ Fold ไม่ต้องเปิดไพ่
- Wild target Pile ซ่อนไว้จนเปิดกองนั้น
- Result และ Spectator View ต้องไม่เปิดข้อมูลไพ่ที่ผู้เล่นไม่มีสิทธิ์เห็น

---

# 9. Disconnect, Reconnect และ Bot Takeover

## 9.1 Detection

- 0–3 วินาที: แสดง Reconnecting…
- Timer ของ Phase ยังเดินต่อ
- ไม่รีเซ็ตเวลา

## 9.2 Bot Takeover

- ครบ 8 วินาทีแล้วยังไม่กลับ ให้ Bot รับช่วงทันที
- Bot ใช้เวลาที่เหลือของ Phase เดิม
- ไม่เพิ่มเวลาให้ใหม่

## 9.3 Reconnect ภายใน 30 วินาที

- ผู้เล่นกลับเข้า Match ได้
- ไม่แทรก Action ที่ Bot ส่งไปแล้ว
- รับช่วงคืนที่ Decision Point หรือ Phase ถัดไป

## 9.4 Reconnect เกิน 30 วินาที

- Bot เล่นต่อจนจบ Game ปัจจุบัน
- ถ้าผู้เล่นกลับมาก่อน Game ถัดไป สามารถรับช่วงคืนได้

## 9.5 ไม่กลับก่อน Game ถัดไป

- Bot เล่นจนจบ Match ทั้ง 3 Games
- Crown ที่ชนะหรือเสียเป็นของบัญชีผู้เล่นเดิม
- Buy-in ไม่คืนเพราะ Match เริ่มแล้ว

## 9.6 Default Actions

### Arrange
- Bot ใช้สถานะการจัดล่าสุด
- ไม่รีเซ็ตมือ

### Joker Declaration
- ถ้าหมดเวลาและยังไม่ประกาศ ให้ Wild ใน Pile 3
- ถ้าประกาศแล้วเปลี่ยนไม่ได้

### Auction
- Bid ที่ Server รับแล้วคงอยู่
- ถ้าหลุดก่อนส่ง Bid สำเร็จ ถือเป็น Bid 0

### GF
- Bot ตัดสินใจ Call/Fold
- ถ้าหมดเวลาก่อน Bot ส่ง Action ให้ Default เป็น Fold

### Final Lock
- Bot ต้องส่ง Hand Arrangement ที่ถูกกติกา

---

# 10. Boss Lore และ AI Personality

## 10.1 Monarch

- สุขุม มีอำนาจ ยึดถือระเบียบ
- ไม่ใช่ตัวร้ายตรง ๆ
- เป็นผู้รักษาสมดุลที่เคยตัดสินใจผิดพลาดในอดีต
- มองผู้เล่นเป็นผู้ท้าชิง
- เรียก Soren ด้วยชื่อจริง

### AI Style

- ปรับบุคลิกตามความแข็งของไพ่ช่วงต้น Game
- ล็อก Style ตลอด Game
- รองรับ Profile เช่น Cortex / Reaper / Crag / Cipher
- ผู้เล่นไม่รู้ว่า Game นั้นใช้ Profile ใด

## 10.2 Soren

- อิสระ ต่อต้านอำนาจ ตั้งคำถามกับกฎ
- พูดมีปริศนาและประชดประชัน
- ไม่ไว้ใจผู้มีอำนาจ
- ยังมีความผูกพันกับ Monarch
- ถูกเนรเทศหรือถูกลบชื่อเพราะพยายามเปิดเผยความจริง

### AI Style

- อ่านยากกว่า Monarch
- มี Bluff
- ปรับจังหวะตามพฤติกรรมผู้เล่น
- ใช้ข้อมูลจาก Game ก่อนหน้าใน Match มาปรับน้ำหนักได้

## 10.3 Dual Boss Lore

- Monarch = ระเบียบและความรับผิดชอบ
- Soren = เสรีภาพและความจริงที่ถูกซ่อน
- ทั้งสองเคยอยู่ฝ่ายเดียวกัน
- แตกแยกเพราะเลือกวิธีรับมือกับความจริงต่างกัน
- ใช้บทสนทนาระหว่างเล่นเพื่อเปิดเผย Lore

### Dialogue Trigger ที่เหมาะสม

- Match Start
- Game Start
- Auction Reveal
- Joker Reveal
- Pile Result
- Game End
- Match End

### Technical Requirement

- Dialogue และ Lore ต้อง Data-driven
- แยกออกจาก Gameplay Logic
- Server เลือก Scene และตรวจประวัติ Lore ที่ผู้เล่นเคยเห็น
- Client แสดงผลเท่านั้น

---

# 11. Crown Panel และ UI Requirements

## 11.1 Crown Panel

ต้องแสดงอย่างน้อย:

- Pile 1 Pot
- Pile 2 Pot
- Pile 3 Pot
- Battle Rewards
- Crown/Crest ของผู้เล่น
- Crown รวมทั้งโต๊ะ

## 11.2 Real-time Update

- Auction settlement อัปเดตทันที
- Ante x2 อัปเดตทันที
- Call settlement อัปเดตทันที
- Sweep Jackpot อัปเดตทันที
- Crown รวมใช้ตรวจสอบว่าไม่มี Crown สูญหายหรือถูกสร้างเพิ่มโดยผิดพลาด

## 11.3 Joker UI

- เลือก Wild หรือ Ante x2
- เลือก Pile เป้าหมาย
- แสดง Buy-in ก่อนและหลังเลือก x2
- ปิดตัวเลือก x2 ถ้า Buy-in ไม่พอ
- Wild target ซ่อนจากคู่แข่ง
- x2 ต้องแสดงต่อทุกคนทันที

## 11.4 Auction UI

- รอบแรกแสดงไพ่หงาย
- รอบสอง Blind Auction
- ราคา 0 / 3 / 6 / 9 / 12 Crest
- Lucky Draw Animation
- Bid 0 ทุกคนแล้วแสดงว่าไพ่ถูกทิ้ง

## 11.5 Result Breakdown

ควรแสดง:

- Ante
- Joker Extra Ante
- Auction
- Call
- Boss Fee
- Battle Rewards
- Sweep Jackpot
- Win/Loss
- Net Crown

---

# 12. Server Authority และ Match Log

Server ต้องเป็นผู้มีอำนาจตัดสินทั้งหมดในเรื่อง:

- Deck shuffle
- Card dealing
- Joker source
- Joker mode
- Joker target Pile
- Forced Wild จาก Community Pile 3
- Auction bid
- Lucky Draw
- Ante และ Ante x2
- Call/Fold
- Battle Rewards
- Boss fee
- Crown Sink
- Crown settlement
- Disconnect / Bot takeover

## Match Log ขั้นต่ำ

- matchId
- gameNumber
- playerId / seat
- boss composition
- boss AI profile
- Joker source
- Joker declaration
- Joker target Pile
- forced Wild flag
- Auction bid ของทุกคน
- Auction winner
- Lucky Draw result
- Ante ทุก Pile
- Extra Ante จาก Joker x2
- Call/Fold ทุก Action
- Battle Rewards movement
- Sweep Jackpot result
- Boss Fee
- Crown/Crest ก่อนและหลัง Match
- Disconnect timestamps
- Bot takeover timestamps
- Reconnect timestamps

---

# 13. Suggested State Machine

```text
WAITING_FOR_PLAYERS
→ CHECK_FAST_THREE_HUMANS
→ ROLL_BOSS_ENCOUNTER_OR_WAIT_FOURTH_HUMAN
→ MATCH_BUY_IN_RESERVE
→ GAME_START
→ DEAL
→ ARRANGE_1
→ AUCTION_FACE_UP
→ AUCTION_BLIND
→ REVEAL_PILE3_COMMUNITY_CARD_2
→ FINAL_ARRANGE
→ JOKER_DECLARE
→ DISCARD
→ FINAL_LOCK
→ RESOLVE_PILE_1
→ GF_PILE_2
→ RESOLVE_PILE_2
→ GF_PILE_3_ROUND_1
→ GF_PILE_3_ROUND_2
→ RESOLVE_PILE_3
→ CHECK_SWEEP_JACKPOT
→ GAME_SETTLEMENT
→ NEXT_GAME_OR_MATCH_END
→ MATCH_SETTLEMENT
→ BATTLE_REWARDS_SINK_IF_REMAINING
→ MATCH_RESULT
```

---

# 14. Recommended Configuration Objects

```ts
export const tierSConfig = {
  unlockTokenExclusive: 1_000_000,
  matchGames: 3,
  minimumHumans: 2,
  fastBossRollHumanCount: 3,
  fastBossRollWindowSeconds: 60,
  bossEncounterRate: 0.6,
  dualBossRateWithinEncounterMax: 0.1,
  reconnectGraceSeconds: 8,
  quickReconnectWindowSeconds: 30,
  crestPerCrown: 12,
  tokenPerCrown: 5000,
};
```

```ts
export const regularEconomy = {
  anteCrest: {
    pile1: 3,
    pile2: 3,
    pile3: 6,
  },
  auctionBidOptionsCrest: [0, 3, 6, 9, 12],
  callCostCrest: 3,
  bossFeeCrest: {
    aiBoss: 24,
    humanBoss: 48,
  },
};
```

```ts
export type JokerMode = 'WILD' | 'ANTE_X2';

export type JokerDeclaration = {
  mode: JokerMode;
  targetPile: 1 | 2 | 3;
  forcedWild: boolean;
  declaredAt: string;
};
```

---

# 15. Pending Before Full S+ Development

หัวข้อต่อไปนี้ยังไม่ล็อกสุดท้าย:

1. จำนวนผู้ได้สิทธิ์ S+ จริงต่อเดือน
2. Tie-break ของ Monthly Performance Score Ranking
3. รูปแบบ Match พิเศษ S+ ในสัปดาห์สุดท้าย
4. Reward ของ S+ Match
5. สัดส่วน Monarch / Soren / Dual Boss ที่แน่นอน
6. Dialogue Script และ Lore Scene รายละเอียด
7. ค่า Difficulty และ AI tuning เชิงตัวเลขของแต่ละ Boss

Codex สามารถพัฒนา Core Engine, Tier S, Joker, Auction, GF, Economy, Crown Panel, Boss Encounter Framework, Dialogue Framework และ S+ Eligibility Framework ได้ก่อน โดยให้หัวข้อ Pending เป็น config/placeholder

---

# 16. Source Documents

เอกสารนี้รวบรวมจาก:

- `TriplePoker_TheArena_MVP_Economy_Baseline_Locked.md`
- `รายละเอียด Tier S และ S+ เพิ่มเติม.docx`
- ข้อตกลงเพิ่มเติมจาก Session การออกแบบ Tier S/S+

---

# 17. Final Development Priority

ลำดับแนะนำสำหรับ Codex:

1. Economy primitives: Crown/Crest ledger
2. Server-authoritative match state machine
3. Tier S matchmaking และ Boss Encounter roll
4. Auction 2 รอบ
5. Joker declaration และ settlement
6. GF Pile 2 / Pile 3
7. Battle Rewards และ Sweep Jackpot
8. Disconnect / Bot takeover
9. Crown Panel แบบ real-time
10. Boss personality framework
11. Dialogue/Lore framework
12. S+ monthly eligibility framework
13. S+ special match placeholder
