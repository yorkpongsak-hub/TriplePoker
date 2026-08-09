# TriplePoker: Rise — Tier Economy & 6-Month Progression

**สถานะ:** ข้อสรุปสำหรับนำไปปรับ `gameConfig.ts` และระบบฝั่ง Server  
**วันที่:** 28 กรกฎาคม 2026  
**เป้าหมายหลัก:** ออกแบบเส้นทางจาก Tier C ถึง Tier A+ ให้ใช้เวลาไม่น้อยกว่า 6 เดือน โดยยังรู้สึกว่าผู้เล่นก้าวหน้าอย่างต่อเนื่อง และมีเวลาเพียงพอสำหรับพัฒนา **TriplePoker: The Arena**

---

## 1. หลักการตัดสินใจ

ไม่ควรใช้ Ante/Pot เพียงอย่างเดียวเพื่อควบคุมความเร็วในการไต่ Tier เพราะผู้เล่นที่ฝีมือดี ชนะต่อเนื่อง ซื้อ Token หรือได้รับรางวัลจากระบบ อาจสะสม Token ถึงเป้าหมายเร็วกว่าที่คาด

ระบบเลื่อน Tier จึงต้องตรวจสอบพร้อมกัน 3 แกน:

1. **Economy Gate** — ยอด Token ขั้นต่ำ
2. **Skill Gate** — ภารกิจหรือชัยชนะที่พิสูจน์ฝีมือ
3. **Time Gate** — อายุบัญชีหรือจำนวนวันที่มีความคืบหน้า

> การปลดล็อกเกิดขึ้นต่อเมื่อผ่านครบทุกเงื่อนไข ไม่ใช่ผ่านเงื่อนไขใดเงื่อนไขหนึ่ง

---

## 2. Ante และ Pot ชุดใหม่

Pot ในตารางเป็น **Gross Pot จากผู้เล่น 4 ที่นั่ง ก่อนหัก Rake 5%**

| Tier | Pile 1 Ante | Pile 2 Ante | Pile 3 Ante | Ante รวม/รอบ | Pot 1 | Pot 2 | Pot 3 |
|---|---:|---:|---:|---:|---:|---:|---:|
| C — Initiate | 10 | 20 | 40 | 70 | 40 | 80 | 160 |
| B — Adept | 20 | 50 | 100 | 170 | 80 | 200 | 400 |
| A — Mastermind | 80 | 150 | 300 | 530 | 320 | 600 | 1,200 |
| A+ — High Noble | 250 | 500 | 1,000 | 1,750 | 1,000 | 2,000 | 4,000 |

### เหตุผลที่ปรับ Tier A และ A+

- ค่าเดิมของ Tier A (`200/300/500`) เปิดโอกาสให้ผู้เล่นเก่งปั๊ม Token เร็วเกินไป
- ค่าเดิมของ Tier A+ (`500/1,000/1,500`) มีความผันผวนสูง และเสี่ยงทำให้ผู้เล่นล้มละลายทันทีหลังเลื่อน Tier
- ชุดใหม่ยังทำให้เดิมพันสูงขึ้นชัดเจนตามระดับ แต่ลด “กำแพงเดิมพัน” ระหว่าง Tier
- Pile 3 ยังคงเป็นกองที่มีเดิมพันและความตึงเครียดสูงที่สุด
- Tier A/A+ จะเน้นการพิสูจน์ฝีมือและความสม่ำเสมอ มากกว่าการเร่ง Token ด้วยเดิมพันขนาดใหญ่

---

## 3. Token Range ของแต่ละ Tier

```ts
tierRanges: {
  initiate:   { min: 100,       max: 14_999 },
  adept:      { min: 15_000,    max: 59_999 },
  mastermind: { min: 60_000,    max: 249_999 },
  highNoble:  { min: 250_000,   max: Infinity },
  lastBoss:   { min: 1_000_000, max: Infinity },
}
```

Token Range ใช้กำหนดระดับเศรษฐกิจและสิทธิ์เข้าสู่ขั้นทดสอบ แต่ **ยอด Token เพียงอย่างเดียวต้องไม่ปลดล็อก Tier**

---

## 4. Minimum Progression Gate

| ปลดล็อก | Token ขั้นต่ำ | Time Gate | Skill Gate |
|---|---:|---:|---|
| Tier B — Adept | 15,000 | 14 วัน | ผ่าน Tutorial และบททดสอบ Tier C |
| Tier A — Mastermind | 60,000 | 60 วัน | ผ่านบททดสอบ Tier B |
| Tier A+ — High Noble | 250,000 | 180 วัน | ชนะ Nine Sentinels ครบทั้ง 9 |
| Ascendant Star | 600,000 | หลังปลดล็อก A+ | ชนะ Monarch อย่างน้อย 1 ครั้ง |
| Tier S / Arena Gate | 1,000,000 | ตามหน้าต่าง Ascendant | ผ่านเงื่อนไขเข้าสู่ The Arena |

### กติกาสำคัญของ Day-180 Gate

- ผู้เล่นที่มี 250,000 Token ก่อนวันที่ 180 ยังไม่สามารถเปิด Tier A+ ได้
- Token ที่เกิน Threshold ยังคงสะสมตามปกติ ไม่สูญหาย
- UI ต้องแสดงความคืบหน้าทั้ง 3 แกนแยกกัน เพื่อไม่ให้ผู้เล่นเข้าใจว่าถูกล็อกโดยไม่มีเหตุผล
- Countdown ไม่ควรเป็นเพียงข้อความ “รออีกกี่วัน” แต่ควรมีภารกิจรายสัปดาห์ การพบ Boss และ Lore คอยเติมความก้าวหน้า
- Time Gate ควรอ้างอิงเวลาจาก Server เท่านั้น

---

## 5. Auto Sort

กำหนดค่าบริการจาก Ante ของ Pile 3 เพื่อให้ปรับตาม Tier ได้ง่ายและมีแหล่งอ้างอิงเดียว

| Tier | อัตรา | ค่ากดต่อครั้ง |
|---|---:|---:|
| C — Initiate | 0% | ฟรี |
| B — Adept | 25% ของ Pile 3 | 25 Token |
| A — Mastermind | 33% ของ Pile 3 | 99 Token |
| A+ — High Noble | 50% ของ Pile 3 | 500 Token |

ข้อกำหนดเพิ่มเติม:

- คำนวณและหักค่าบริการฝั่ง Server
- แสดงราคาจริงบนปุ่มก่อนยืนยัน
- สร้าง helper กลางสำหรับคำนวณราคา ห้ามกำหนดตัวเลขซ้ำหลายไฟล์
- The Arena ไม่มี Auto Sort

---

## 6. Call Amount

ในโครงสร้างเดิมมีค่า Call ซ้ำกันระหว่าง `tokenPot.tiers` และ `grandFinale.callAmount` ทำให้ Client และ Server มีโอกาสใช้คนละราคา

ให้เหลือแหล่งข้อมูลเดียว:

```ts
grandFinale: {
  callAmount: {
    initiate: null,
    adept: null,
    mastermind: 300,
    highNoble: 1_000,
    lastBoss: 2_000,
  }
}
```

แนวทาง Implement:

- ลบ `call` ออกจาก `tokenPot.tiers` หรือหยุดอ่านค่าจากตำแหน่งนั้น
- Client, Server, Bot และ UI ต้องเรียก helper เดียวกัน
- เพิ่ม validation ตอนเริ่มระบบ เพื่อแจ้ง error หาก Tier ใดมีค่า Call ซ้ำหรือขัดกัน

---

## 7. Buy-in เบื้องต้น

```ts
buyIn: {
  initiate: 500,
  adept: 1_500,
  mastermind: 8_000,
  highNoble: 20_000,
  lastBoss: 40_000,
}
```

ตัวเลขนี้เป็นค่าเริ่มต้นสำหรับทดสอบ ต้องตรวจสอบอีกครั้งด้วยสูตร **Worst-Case Match Cost**:

```text
จำนวนรอบ × (
  Ante ทั้ง 3 กอง
  + Auto Sort สูงสุด
  + Auction สูงสุด
  + Call สูงสุดทุกครั้ง
  + ค่าใช้จ่ายพิเศษอื่น
)
```

Buy-in ต้องเพียงพอให้ผู้เล่นจบแมตช์ในกรณีเลวร้าย โดยไม่เกิดสถานการณ์เงินหมดกลาง Phase

---

## 8. Rake และการแสดง Pot

- ค่า Pot ในเอกสารนี้เป็นยอดก่อนหัก Rake 5%
- Server ต้องเป็นผู้คำนวณ Rake และยอดจ่ายจริง
- UI ควรระบุให้ชัดว่า Pot ที่เห็นเป็น Gross Pot หรือ Net Payout
- ห้ามให้ Client คำนวณยอด Token สุดท้ายเอง
- ควรมี Economy Ledger บันทึก `ante`, `auction`, `call`, `autoSort`, `rake`, `reward` และ `balanceAfter`

---

## 9. ข้อกำหนด UI/UX สำหรับ Progression

หน้า Tier Progress ควรแสดง:

- Token: ปัจจุบัน / เป้าหมาย
- Time Gate: จำนวนวันที่ผ่าน / วันที่กำหนด
- Skill Gate: รายชื่อ Boss หรือภารกิจที่ผ่านแล้ว
- เป้าหมายถัดไปที่ผู้เล่นทำได้ทันที
- สถานะ “พร้อมเข้าบททดสอบเลื่อน Tier” เมื่อครบทุกเงื่อนไข

การออกแบบต้องทำให้ผู้เล่นรู้สึกว่า “กำลังก้าวหน้า” ไม่ใช่ “ถูกบังคับให้รอ 180 วัน”

---

## 10. Server Authority และการป้องกันการข้าม Gate

Server ต้องเป็นผู้ตัดสิน:

- Tier ปัจจุบัน
- อายุบัญชีและ Time Gate
- Token Balance
- Boss/Skill Progress
- สิทธิ์เข้า Queue ของแต่ละ Tier
- การหัก Ante, Call, Auction, Auto Sort และ Rake
- การจ่าย Pot และรางวัล

Client มีหน้าที่แสดงผลและส่งคำขอเท่านั้น ห้ามเชื่อถือค่า Tier, Token หรือวันที่จาก Client

---

## 11. ลำดับการนำไป Implement

1. รวมค่าทางเศรษฐกิจไว้ใน Config กลาง
2. ปรับ Ante/Pot ของ Tier C–A+
3. ทำ Call Amount ให้เหลือแหล่งข้อมูลเดียว
4. ปรับสูตร Auto Sort และ Buy-in
5. เพิ่ม Economy Ledger และ Server Validation
6. เพิ่ม Progression Gate แบบ Token + Skill + Time
7. ทำหน้า Tier Progress
8. เขียน Unit Test และ Economy Simulation
9. ทดลอง Balance ด้วยข้อมูลจำลองหลายรูปแบบผู้เล่น
10. ปรับค่าหลัง Closed Beta โดยไม่เปลี่ยนหลัก Day-180 Gate

---

## 12. Test Cases ขั้นต่ำ

- มี Token ถึงเป้าหมาย แต่วันไม่ครบ → ห้ามปลดล็อก
- วันครบ แต่ Token ไม่ถึง → ห้ามปลดล็อก
- Token และวันครบ แต่ยังชนะ Boss ไม่ครบ → ห้ามปลดล็อก
- ผ่านครบทั้ง 3 Gate → เปิดบททดสอบหรือ Tier ได้
- Client แก้วันที่เครื่อง → ไม่มีผลต่อ Time Gate
- Client แสดง Call ไม่ตรง Server → ปฏิเสธคำขอและ Sync ค่าใหม่
- Token ไม่พอสำหรับ Worst-Case Match Cost → ห้ามเข้า Queue
- Disconnect แล้ว Bot เล่นแทน → Ledger และยอด Token ต้องต่อเนื่อง
- จบรอบแล้วผลรวม Token ก่อนและหลังต้องตรงตาม Ledger

---

## 13. ข้อสรุปที่ล็อกสำหรับเฟสนี้

- ใช้ Ante/Pot ชุด `10/20/40 → 20/50/100 → 80/150/300 → 250/500/1,000`
- Tier A+ ใช้ Token ขั้นต่ำ 250,000 และ Day-180 Gate
- การเลื่อน Tier ตรวจครบทั้ง Token, Skill และ Time
- ลดความผันผวนของ Tier A/A+ เพื่อรักษาผู้เล่นให้อยู่กับเกมระยะยาว
- รวม Call Amount ให้เหลือ Single Source of Truth
- The Arena ไม่มี Auto Sort
- Buy-in ยังเป็นค่าทดลองจนกว่าจะผ่าน Worst-Case Simulation และ Closed Beta

เอกสารนี้ใช้เป็นฐานสำหรับแก้ `gameConfig.ts`, ระบบ Server Economy, Progression UI และชุดทดสอบของ **TriplePoker: Rise**
