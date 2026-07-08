# TriplePoker — Foul Checker Spec
> Version 1.0 | The Sage Unicorn Studio Co., Ltd. | Updated: May 2026
 
---
 
## 1. หลักการประเมิน Hand Strength
 
ทุก Pile ต้องนำไพ่ในมือรวมกับ Community Cards ก่อนเปรียบ Hand Strength เสมอ:
 
| Pile | ไพ่ในมือ | Community Cards | รวม | วิธีประเมิน |
|------|---------|----------------|-----|------------|
| Pile 1 | 3 ใบ | 2 ใบ (Community Row 1) | 5 ใบ | Hand Rank โป๊กเกอร์ปกติ |
| Pile 2 | 3 ใบ | 2 ใบ (Community Row 2) | 5 ใบ | Hand Rank โป๊กเกอร์ปกติ |
| Pile 3 | 3 ใบ (หลัง Discard) | 2 ใบ (Community Row 3) | 5 ใบ | Hand Rank โป๊กเกอร์ปกติ |
 
> **หมายเหตุ:** Pile 3 ในมือเริ่มต้นมี 5 ใบ แต่หลัง Discard Phase เหลือ 3 ใบ จึงนำไปรวม Community ได้ 5 ใบเสมอ
 
---
 
## 2. Hand Rank Reference (โป๊กเกอร์มาตรฐาน)
 
| อันดับ | ชื่อ | ตัวอย่าง |
|--------|------|---------|
| 1 (สูงสุด) | Royal Flush | A K Q J 10 ดอกเดียวกัน |
| 2 | Straight Flush | 5 ใบเรียงดอกเดียวกัน |
| 3 | Four of a Kind | ไพ่ 4 ใบเหมือนกัน |
| 4 | Full House | Three of a Kind + Pair |
| 5 | Flush | 5 ใบดอกเดียวกัน |
| 6 | Straight | 5 ใบเรียงต่างดอก |
| 7 | Three of a Kind | ไพ่ 3 ใบเหมือนกัน |
| 8 | Two Pair | 2 คู่ |
| 9 | One Pair | 1 คู่ |
| 10 (ต่ำสุด) | High Card | ไพ่สูงสุดในมือ |
 
---
 
## 3. กฎการตรวจสอบ (Validation Rules)
 
### 3.1 กฎจำนวนใบ
```
Pile 1 = 3 ใบ
Pile 2 = 3 ใบ
Pile 3 = 5 ใบ (ก่อน Discard) / 3 ใบ (หลัง Discard)
รวมทั้งหมด = 11 ใบ (ไม่ขาด ไม่เกิน)
```
 
### 3.2 กฎ Pile Ranking
```
(Pile 1 + Community 1) ≤ (Pile 2 + Community 2) ≤ (Pile 3 + Community 3)
```
- **Pile เสมอกัน → ผ่าน** ไม่ถือเป็น Foul
- เปรียบ Hand Strength ตาม Hand Rank โป๊กเกอร์มาตรฐาน
### 3.3 กรณีที่ถือเป็น Foul
- จำนวนใบใน Pile ไม่ตรง 3-3-5
- Hand Strength ของ Pile ล่างสูงกว่า Pile บน (เช่น Pile 1 > Pile 2)
---
 
## 4. Timing การตรวจสอบ
 
```
ผู้เล่นกด Ready
    │
    ├─► Client ตรวจเบื้องต้น (จำนวนใบ + Pile Ranking)
    │       ├─► ผ่าน → ส่งข้อมูลไปยัง Server
    │       └─► ไม่ผ่าน → บังคับจัดใหม่ (ห้าม Submit)
    │
    └─► Server ตรวจยืนยันอีกครั้ง (ป้องกัน Tamper)
            ├─► ผ่าน → เกมดำเนินต่อ
            └─► ไม่ผ่าน → Foul ทันที
 
Server ตรวจซ้ำที่ Showdown (หงายใบที่ 3)
    └─► ตรวจ Pile 3 รวม Community + ไพ่ประมูล (ถ้าชนะ Auction)
```
 
---
 
## 5. ผลเมื่อ Foul
 
| กรณี | ผลลัพธ์ |
|------|---------|
| Foul ตรวจพบตอนกด Ready (Client) | ห้าม Submit — Highlight Pile ที่ผิด + บังคับจัดใหม่ |
| Foul ตรวจพบที่ Showdown (Server) | เสีย **ทุก Pot** รวมถึง Pot ที่เคยชนะ Pile 1/2 ไปแล้ว → คืนให้ AI ทั้งหมด |
| ผู้เล่นหลายคน Foul พร้อมกัน | AI รับ **ทุก Pot จากทุกคนที่ Foul** — Token ออกจากระบบทั้งหมด |
 
> **Foul Burn:** Token ที่ AI รับจาก Foul ถือเป็น Token Burn ออกจากระบบ — สอดคล้องกับ Tokenomics (Ch.6)
 
---
 
## 6. UX เมื่อเกิด Foul
 
| จังหวะ | Visual | Haptic |
|--------|--------|--------|
| Client ตรวจพบ | Pile ที่ผิด Highlight สีแดง + Toast แจ้ง | Haptic error สั้น |
| Showdown Foul | Animation ไพ่ถูกดูดกลับจาก Pot ไปยัง AI | Haptic error ยาว |
| หลาย Foul | แต่ละคนเห็น Animation ของตัวเองพร้อมกัน | — |
 
---
 
## 7. ความสัมพันธ์กับระบบอื่น
 
| ระบบ | เชื่อมโยง |
|------|----------|
| DDE Last Boss (Ch.20) | DDE ตรวจ FoulChecker ทุก iteration ก่อน Accept arrangement |
| Auto-sort | Output ของ Auto-sort ต้องผ่าน FoulChecker เสมอ |
| Onboarding | Tutorial อธิบาย Foul = เสีย Token ทุก Pot ใน Slideshow หน้าที่ 5 |
 
---
 
*TriplePoker Foul Checker Spec v1.0 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
 