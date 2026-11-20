# TriplePoker — Mastermind (Tier A) Device QA Checklist v1.0

> สร้าง: 2026-11-20 · Branch: `release/android-1.0-qa` · ลำดับใน launch sequence: **ขั้นที่ 2** (Adept → **Mastermind** → High Noble → multiplayer → reconnect/escrow → signed RC)
> Mastermind เป็น **โต๊ะ solo** (ผู้เล่น 1 คน + Nine Sentinel Boss + Minion AI) — ใช้มือถือ **1 เครื่องก็พอ** ถ้ามี 2 เครื่องให้แบ่งเทสคนละ Sentinel พร้อมกันได้
> Pre-flight เหมือน Adept checklist §1 ทุกข้อ (Supabase keys, LAN IP, `/health`, `npx expo start --clear`, dev client build ใหม่) — ถ้าทำไปแล้วตอนเทส Adept ไม่ต้องทำซ้ำ

## 0. กติกาของ Mastermind ที่ใช้ตัดสิน PASS/FAIL (อ้างอิงโค้ด ณ `4d3dc5c`)

| เรื่อง | ค่าที่ถูกต้อง | แหล่งอ้างอิง |
|---|---|---|
| เงื่อนไขเข้า | Token ≥ 20,000 และอายุบัญชี ≥ 10 วัน | `progressionGate.mastermind` |
| เส้นทางเข้า | Classic Lobby → Buy-in gate → `select` (เลือก Sentinel) → `story` → โต๊ะ | `classic-lobby.tsx`, `mastermind/select.tsx`, `story.tsx` |
| จำนวน Match ต่อเกม | **5 Match** (ตัวนับแสดง `/5`) | RELAUNCH log 2026-09-27 |
| Buy-in | **7,500 Token** (Ante ต่อ Match: G1 300 / G2 450 / G3 750 = 1,500 × 5) | `buyIn.mastermind`, `antes.mastermind` |
| Missions | ตาม Sentinel ที่เลือก: **ไม่มี Mission** = Iron Wall, Chivalry, War Lord, Phantom, Dark Shark · **มี Mission** = Oracle, Jester, Phoenix, Black Magic (server เป็นคนตัดสิน) | RELAUNCH log 2026-09-28 |
| จัดไพ่รอบ 1 | **135 วินาที (2:15)** | `arrangementTimer.mastermind` |
| G1 | หงายก่อน แล้ว **หยุดรอ** จนกด `COMMIT G1 & REVEAL G2` (ไม่ไหลเอง) | RELAUNCH log 2026-09-27 |
| Blind Auction | ไพ่กองกลาง 2 ใบ · ราคา **25 / 50 / 100 / 150** · **12 วินาทีต่อใบ** · เงินประมูลเข้า Fee & Rake | `blindAuction` |
| จัดไพ่รอบ 2 (`arrangement_2`) | บังคับทุกรอบหลัง Auction · **68 วินาที** · layout 3 / 3-หรือ-4 / 5 (ชนะประมูล = G2 มี 4 ใบ) · หมดเวลา = ใช้ layout รอบแรก + ใส่ไพ่ที่ชนะไว้ G2 | RELAUNCH log 2026-09-27 |
| G2 | ผู้ชนะประมูลใช้ Best 5 จาก 6 · คนอื่น Best 5 จาก 5 · ไพ่ประมูลไม่เข้า G3 เด็ดขาด | RELAUNCH log 2026-09-27 |
| Fog of War | หลัง G2 หงายเสร็จ ~3 วินาที | RELAUNCH log 2026-09-27 |
| G3 / Grand Finale (Texas Hybrid) | ไพ่กองกลาง G3 2 ใบ **คว่ำตั้งแต่ต้น** · Street 1 เปิดใบแรก, Street 2 เปิดใบที่สอง · ยังไม่มีใครเดิมพัน = `CHECK / BET` · มีคนเดิมพันแล้ว = `CALL / FOLD` · ขนาด bet = **300** · **20 วินาที** ต่อตา · ไม่มี Raise/All-in | `grandFinale`, RELAUNCH log |
| Timeout ใน Grand Finale | ยังไม่มีคนเปิด bet = auto-check · มีคนเปิดแล้ว = auto-call (ถ้าเงินไม่พอ = auto-fold) | RELAUNCH log 2026-09-27 |
| เงินไม่พอ Call | ถูก Fold อัตโนมัติก่อนถึงตา · Token ต้อง **ไม่ติดลบ** | RELAUNCH log 2026-09-27 |
| Call side pot | BET/CALL ทั้งหมดได้เฉพาะผู้ชนะ G3 (หลังหัก rake) | RELAUNCH log 2026-09-27 |
| Round Summary | ตารางคะแนน G1/G2/G3 (`WIN` / `MISSION ✓` / `COMBO` / `SWEEP`) · มีปุ่ม `Continue` **ไม่มีนับถอยหลัง** · server รอจนกด | RELAUNCH log 2026-09-27 |
| Auto Sort | **ต้องไม่มีปุ่ม** · server ปฏิเสธเสมอ | `requestAutoSort()` |
| ชนะ G3 | VFX ไพ่ระเบิด + `YOU WIN!` (ปิดเอง ไม่บังปุ่ม) | RELAUNCH log 2026-09-27 |
| Disconnect | grace **60 วินาที** ก่อน settle | `markSoloPlayerDisconnected()` |
| Rematch | ไม่มีปุ่ม Rematch | Token Flow Spec |

## 1. Lobby → เลือก Sentinel

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 1.1 | Classic Lobby → แตะ Mastermind | ผ่าน Buy-in gate · เห็นยอด 7,500 · จด Token ก่อนเริ่มลง §6 | |
| 1.2 | หน้า `select` | เห็น Sentinel ครบ 9 ตัว ใช้รูป portrait เต็ม · ตัวที่เคยพิชิตแล้วมีเครื่องหมายต่างจากตัวอื่น | |
| 1.3 | กดกลับจาก `select` | กลับ Classic Lobby · ไม่ถูกหัก Token | |
| 1.4 | เลือก **Iron Wall** (ไม่มี Mission) → `story` | portrait → ชื่อ → motto ไล่ fade ครบ · กดเข้าโต๊ะได้ | |
| 1.5 | เข้าโต๊ะ | ที่นั่ง Boss ใช้รูป `_avatar` ของ Iron Wall · ครั้งแรกของบัญชีมี Tier Welcome หลังแจกไพ่เสร็จ | |

## 2. Match 1 — ทุก phase (เล่นกับ Iron Wall)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 2.1 | Layout | ปุ่ม `i` + Timer ซ้ายบน (ปุ่ม `i` **อันเดียว** — เคยพลาดซ้อน 2 อันที่ Mastermind) · Token Flow Panel ขวาบน · ไพ่ G3 กองกลาง 2 ใบ **คว่ำ** | |
| 2.2 | Timer จัดไพ่รอบ 1 | เริ่ม **2:15** | |
| 2.3 | ปุ่ม Auto Sort | **ต้องไม่มี** | |
| 2.4 | tap-to-swap + ลากไพ่สลับ | ใช้ได้ทั้งคู่ · ขอบ cyan ตอนลาก · ลากแล้ว tap ยังใช้ได้ | |
| 2.5 | ไม่มี Mission | ไม่มีแถบ/ข้อความ Mission บนโต๊ะ (เพราะเป็น Iron Wall) | |
| 2.6 | กด Ready → G1 หงาย | หลัง G1 **หยุดรอ** ปุ่ม `COMMIT G1 & REVEAL G2` · รอ 30 วินาทีแล้วต้องยังไม่ไหลไป G2 เอง | |
| 2.7 | Blind Auction | ไพ่ 2 ใบ · ปุ่ม 25/50/100/150 · นับ 12 วินาทีต่อใบ · ผลประมูลแสดงชัดเจน · Token ที่ใช้ประมูลไปโผล่ในแถว F&R ของ Panel | |
| 2.8 | ชนะประมูล 1 ใบ → `arrangement_2` | ได้ไพ่ครบทั้งมือ + ไพ่ที่ชนะ · timer **68 วินาที** · ใส่ไพ่ที่ชนะไว้ G2 ได้ (G2 = 4 ใบ) | |
| 2.9 | กด COMMIT → G2 หงาย | G2 ใช้ Best 5 จาก 6 ถูกต้อง · หลัง flip เสร็จค้างให้อ่าน ~3 วินาที แล้วถึงขึ้น Fog of War | |
| 2.10 | Grand Finale Street 1 | ไพ่กองกลาง G3 เปิด **ใบแรกใบเดียว** · ปุ่มเป็น `CHECK / BET` · แตะไพ่ = เลือกใบที่จะหงายเท่านั้น ไม่ยิง action | |
| 2.11 | กด CHECK ทุกตา (ทั้ง Street) | ไม่มี Token ไหลออก · ไปต่อ Street 2 | |
| 2.12 | Street 2 | เปิดไพ่กองกลาง G3 ใบที่ 2 · ถ้า AI เปิด bet → ปุ่มเราเปลี่ยนเป็น `CALL / FOLD` | |
| 2.13 | กด CALL | หัก **300** จาก stack · ไปอยู่ใน Pot 3 ของ Panel | |
| 2.14 | ผลการแข่ง (GF result) | ค้างให้ดู ~5 วินาที → Round Summary | |
| 2.15 | Round Summary | อยู่ต่ำจากขอบบนพอดี เห็นปุ่ม Continue · ตารางคะแนน G1/G2/G3 อ่านครบทุกแถว (4 ผู้เล่น) · ไม่มีนับถอยหลัง | |
| 2.16 | รอ 60 วินาทีโดยไม่กด Continue | เกม **ไม่เดินเอง** · กดแล้วไป Match 2 | |
| 2.17 | Token Flow Panel | **Total คงที่** ตลอด Match (จดลง §6) | |

## 3. Match 2–5 — เคสเฉพาะ (ใช้ Match ที่เหลือเทสทีละเคส)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 3.1 | Auction: ไม่กดเลยจนหมดเวลา | ไม่ได้ไพ่ · ไม่ถูกหัก Token · G2 เป็น Best 5 จาก 5 | |
| 3.2 | `arrangement_2`: ปล่อยให้หมดเวลา | ใช้ layout รอบแรก + ไพ่ที่ชนะไปอยู่ G2 อัตโนมัติ · ไม่ค้าง | |
| 3.3 | Grand Finale: เรากด **BET** ก่อน | AI ที่ CHECK ไปแล้วต้องตอบ bet ทีหลังครบทุกตัว · ไม่มีใคร Raise | |
| 3.4 | Grand Finale: **FOLD** | ไม่หัก Token เพิ่ม · ไพ่เราไม่ถูกเปิดให้เห็น | |
| 3.5 | Grand Finale: ปล่อยหมดเวลาตอนมีคน bet | auto-**call** (ถ้าเงินพอ) | |
| 3.6 | ชนะ G3 | VFX ไพ่ระเบิด + `YOU WIN!` ปิดเอง ไม่บังปุ่ม Continue | |
| 3.7 | ตัวนับ Match | `2/5` … `5/5` · Timer reset เป็น 2:15 ทุก Match | |
| 3.8 | กด Continue หลัง Match 5 | settle ครั้งเดียว → หน้าผลสรุปเกม · **ไม่มีปุ่ม Rematch** · มี burn toast | |
| 3.9 | ชนะทั้งเกม (ถ้าได้) | Conquest overlay ของ Iron Wall · กลับ `select` แล้ว Iron Wall ต้องโชว์ว่าพิชิตแล้ว | |
| 3.10 | กลับ Lobby → kill แอป → เปิดใหม่ | Token ตรงกับหน้าผลสรุป และไม่เปลี่ยนหลังเปิดใหม่ (ไม่ settle ซ้ำ ไม่หาย) | |
| 3.11 | ผลบวก Token + บัญชี Free | อาจมี Interstitial (test ad ของ Google) หลัง Round Summary / ก่อนรอบใหม่ · กดปิดแล้วเกมเดินต่อ · ห่างกันไม่ต่ำกว่า 5 นาที (ถ้าไม่มี ad = ปกติ เพราะ RC ปิด production ads) | |

## 4. เกมที่ 2 — Sentinel ที่มี Mission (เลือก **Oracle** หรือ **Jester**)

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 4.1 | เข้าโต๊ะ | มี Mission sheet บนโต๊ะ · ไม่มี Tier Welcome ซ้ำ | |
| 4.2 | ทำ Mission ตรงประเภทมือ | ได้คะแนนเต็มตามที่ระบุ | |
| 4.3 | ทำได้มือ **แรงกว่า** ที่ Mission ระบุ | Mission ✓ แต่ได้คะแนน `floor(คะแนน / 4)` | |
| 4.4 | Round Summary | แถว `MISSION ✓` / `COMBO` แสดงถูก · Combo (2/3) / Super Combo (3/3) ขึ้นเมื่อทำได้ | |
| 4.5 | (ถ้าเลือก Jester) | Jester สุ่มน้ำหนักใหม่ทุกเกม — ไม่ต้องเทสตรง แค่ดูว่าไม่ crash | |

## 5. Edge cases

| # | ขั้นตอน | ผลที่ต้องได้ | ผล |
|---|---|---|---|
| 5.1 | ปิด Wi-Fi 20 วินาทีระหว่าง **Blind Auction** แล้วเปิดคืน | กลับมาเห็นสถานะประมูล/ผลถูกต้อง · ไม่หักซ้ำ | |
| 5.2 | ปิด Wi-Fi 20 วินาทีระหว่าง **`arrangement_2`** | กลับมาเห็นไพ่ครบ (ไม่ว่าง) · timer ต่อจากเดิม | |
| 5.3 | ปิด Wi-Fi 20 วินาทีระหว่าง **Grand Finale** | กลับมาเห็นไพ่กองกลางเท่าที่ควรเห็นใน Street นั้น · ไม่หลุดไพ่ใบที่ยังคว่ำ | |
| 5.4 | ปิด Wi-Fi **เกิน 60 วินาที** | settle escrow ครั้งเดียว · เปิดแอปใหม่ Token ถูกต้อง | |
| 5.5 | กด Home 30 วินาทีระหว่าง Match แล้วกลับเข้า | เกมยังอยู่ · BGM/SFX กลับมา | |
| 5.6 | ปุ่ม Back (hardware) ระหว่างเกม | มี dialog ยืนยัน · Cancel = อยู่ต่อ · ยืนยัน = ออก + settle ครั้งเดียว | |
| 5.7 | Token น้อยจน Call ไม่ไหว (ใช้บัญชีที่เหลือ Token พอแค่ Buy-in หรือเล่นจน stack ต่ำ) | ปุ่ม Call/Bet ไม่โผล่ ถูก Fold อัตโนมัติ · stack ไม่ติดลบ | |
| 5.8 | Royal Straight Flush (ถ้าบังเอิญได้) | ไม่ขึ้นระหว่างเล่น · ขึ้นหลังออกจากโต๊ะ (global moment) | |

## 6. Regression ที่ต้องไม่เกิด

- [ ] ไม่มีข้อความภาษาไทยในหน้าจอเกม
- [ ] ไม่มี error สีแดง / redbox / crash / โต๊ะค้างตอนเริ่ม Match (เคยมีบั๊ก round_start ค้าง)
- [ ] ไพ่ไม่ซ้ำกันบนโต๊ะ · ไพ่ประมูลไม่ไปโผล่ใน G3
- [ ] ไพ่ที่เปิดใน Grand Finale ไม่ซ้ำกัน และไม่โชว์รูปไพ่หาย (ถ้ารูปหายต้องเห็นเป็นหลังไพ่)
- [ ] AI ไม่จัดกองผิดลำดับ (G1 ≤ G2 ≤ G3) ตอนหงาย
- [ ] Token ไม่ติดลบ
- [ ] เสียงไม่หายกลางเกม

## 7. บันทึกผล

| รายการ | เกมที่ 1 (Iron Wall) | เกมที่ 2 (Oracle/Jester) |
|---|---|---|
| Token ก่อนเริ่ม | | |
| Token Flow Total (ทุก Match ต้องเท่ากัน) | | |
| Token หลังจบเกม (Lobby) | | |
| Token หลัง kill/เปิดแอปใหม่ | | |
| ผลเกม (ชนะ/แพ้, Conquest?) | | |
| รุ่นมือถือ / Android version | | |

**สรุป:** ☐ PASS ทั้งหมด → ไปต่อ High Noble QA · ☐ มี FAIL → จดเลขข้อ + อาการ + screenshot/วิดีโอ แล้วส่งให้ Claude ไล่แก้รวดเดียวหลัง QA ครบ

| ข้อที่ FAIL | Sentinel / Match | อาการ | มีรูป/วิดีโอ |
|---|---|---|---|
| | | | |
