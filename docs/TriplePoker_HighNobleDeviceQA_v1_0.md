# TriplePoker — High Noble (Tier A+) Device QA Checklist v1.0

> สร้าง: 2026-11-20 · Branch: `release/android-1.0-qa` · ลำดับใน launch sequence: **ขั้นที่ 3** (Adept → Mastermind → **High Noble** → multiplayer → reconnect/escrow → signed RC)
> High Noble เป็น **multiplayer จริง**: Four Gods Boss 1 ตัว + Human 2–4 คน (**ไม่มี Minion**) · ใช้มือถือ 2 เครื่อง (**A** / **B**) → ได้โต๊ะ **3 ที่นั่ง** (Boss + 2 Human) · โต๊ะ 4–5 ที่นั่งต้องมี Human 3–4 คน (ดู §6 ทางเลือก)
> Pre-flight เหมือน Adept checklist §1 (Supabase keys, LAN IP, `/health` ทั้ง 2 เครื่อง, `npx expo start --clear`, dev client build ใหม่)

## 0. กติกาของ High Noble ที่ใช้ตัดสิน PASS/FAIL (อ้างอิงโค้ด ณ `3d6c34a`)

| เรื่อง | ค่าที่ถูกต้อง | แหล่งอ้างอิง |
|---|---|---|
| เงื่อนไขเข้า | Token ≥ **100,000** · อายุบัญชี ≥ **90 วัน** · พิชิต Nine Sentinels ครบ **9/9** | `progressionGate.highNoble` |
| Boss | Four Gods เท่านั้น: Reaper / Crag / Cortex / Cipher (สุ่มตามน้ำหนัก) · **Monarch ปิดใน 1.0** ต้องไม่เจอเลย | `rollHighNobleBoss()`, `MONARCH_ENABLED` |
| ขนาดโต๊ะ | 3–5 ที่นั่ง (Boss 1 + Human 2–4) · ไม่เติม Minion — ที่นั่งว่างถูกตัดออก | `resolveHighNobleWaitExpiry()` |
| รอคน | Human คนแรก → รอคนที่ 2 **120 วินาที** (ไม่มา = ปิดโต๊ะ ไม่หัก Token) · คนที่ 2 มาแล้ว → รอคนที่ 3 **15 วินาที** แล้วเริ่ม | `matchmakingTimeouts.highNoble` |
| โหมด | VIP เห็น dialog เลือก **Live / Standard** · Free เข้า auto-match เลย · `Play with Missions` On/Off แยกคิวกัน | `classic-lobby.tsx`, RELAUNCH 2026-09-28 |
| จำนวน Match | **5 Match** (`/5`) | RELAUNCH 2026-09-27 |
| Buy-in | **25,000** (Ante ต่อ Match: G1 1,000 / G2 1,500 / G3 2,500 = 5,000 × 5) | `buyIn.highNoble`, `antes.highNoble` |
| แจกไพ่ (Texas Hybrid) | ไพ่ส่วนตัว **G1 = 3 / G2 = 3 / G3 = 2** · ไพ่กองกลาง **G1 = 2 / G2 = 2 / G3 = 5** · G3 เห็น Flop 3 ใบตอนจัดไพ่ · Turn เปิดใน Grand Finale รอบ 2 · River เปิดตอน showdown · G3 = Best 5 จาก 7 | RELAUNCH 2026-09-27 |
| Foul | บังคับ `G1 < G2 < G3` แบบ strict | `checkHighNobleTexasFoul` |
| จัดไพ่รอบ 1 | **120 วินาที (2:00)** | `arrangementTimer.highNoble` |
| Blind Auction | ราคา **100 / 200 / 300 / 500** · 12 วินาทีต่อใบ · Human ชนะ AI เมื่อเสมอ / Human กับ Human สุ่ม | `blindAuction` |
| จัดไพ่รอบ 2 | หลัง Auction · **120 วินาที** · ผู้ชนะประมูลวางไพ่ที่ได้ใน G2 (3 / 4 / 2) → G2 = Best 5 จาก 6 · **ไม่มีขั้น Discard** ให้ผู้เล่นทำ | `startHNArrangementRound2()` |
| Grand Finale | `CHECK / BET` → `CALL / FOLD` · ขนาด bet **1,000** · **30 วินาที** ต่อตา · ไม่มี Raise/All-in · เงินไม่พอ = Fold อัตโนมัติ · คนที่หลุดอยู่ = Fold ทันที (ghost mode) | `grandFinale`, RELAUNCH |
| Round Summary | ปุ่ม `Continue (10)` · ทุกคนกดครบ = ไปต่อทันที · ไม่ครบ = ไปเองเมื่อครบ 10 วินาที | `waitForHNRoundContinue(…, 10000)` |
| Auto Sort | **ต้องไม่มีปุ่ม** · server ตอบ `AUTO_SORT_DISABLED` | `requestHNAutoSort()` |
| Disconnect | grace **60 วินาที** · reconnect ทันได้ที่นั่งคืน (snapshot ครบทุก phase) | `highNobleMultiEngine.ts` Step 2B |
| ชนะ G3 | VFX ไพ่ระเบิด + `YOU WIN!` | RELAUNCH 2026-09-27 |

## 1. เตรียมบัญชี (สำคัญ — เงื่อนไขเข้าสูงที่สุด)

- [ ] บัญชี A และ B: Token ≥ 100,000 · อายุบัญชี ≥ 90 วัน · `conquered_sentinels` ครบ 9 — ถ้าบัญชีไหนยังไม่ผ่าน ให้บอก Claude เขียน SQL ให้ลุงรันบน Supabase dashboard (ห้าม Claude รัน SQL เอง)
- [ ] ให้บัญชี A เป็น **VIP** (เพื่อเห็น dialog Live/Standard) และบัญชี B เป็น **Free** — ถ้าทำไม่ได้ ข้าม 2.2
- [ ] จด Token ก่อนเริ่มของทั้ง 2 บัญชีลง §7

## 2. Lobby → Matchmaking

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 2.1 | Classic Lobby → แตะ High Noble | ผ่าน Buy-in gate · เห็นยอด 25,000 | | |
| 2.2 | เครื่อง A (VIP) | ขึ้น dialog **Live / Standard** · เลือก **Standard** · เครื่อง B (Free) ไม่มี dialog | | |
| 2.3 | A เลือก Missions **ON**, B เลือก **OFF** | ต้อง**ไม่**ได้โต๊ะเดียวกัน | | |
| 2.4 | B ออกคิว → Missions **ON** เข้าใหม่ | ได้โต๊ะเดียวกับ A · ประมาณ 15 วินาทีหลัง B เข้า เกมเริ่มเป็นโต๊ะ 3 ที่นั่ง | | |
| 2.5 | ที่นั่งบนโต๊ะ | P2 / P3 อยู่ซ้ายบน / ขวาบน (layout 3 ที่นั่ง) · Boss เป็น Reaper/Crag/Cortex/Cipher ตัวใดตัวหนึ่ง · มี Boss intro | | |
| 2.6 | (แยกรอบ) A เข้าคิวคนเดียว รอครบ 2 นาที | โต๊ะปิด/มี dialog ให้เลือก (ภาษาอังกฤษ) · **Token ไม่ถูกหัก** | | |
| 2.7 | ระหว่างรอ ออกจากคิว | กลับ Lobby · Token ไม่ถูกหัก | | |

## 3. Match 1 — ทุก phase

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 3.1 | แจกไพ่ | ไพ่ส่วนตัว 3/3/2 · ไพ่กองกลาง G3 Flop 3 ใบ**หงาย** + Turn/River **คว่ำ** · ไพ่ทั้ง 2 เครื่องเห็นกองกลางเหมือนกัน · ครั้งแรกมี Tier Welcome หลังแจกเสร็จ | | |
| 3.2 | Layout | ปุ่ม `i` + Timer ซ้ายบน (ปุ่ม `i` อันเดียว) · Token Flow Panel ขวาบน · ไพ่ P1 ไม่เล็กกว่า Initiate | | |
| 3.3 | Timer | **2:00** ตรงกันทั้ง 2 เครื่อง | | |
| 3.4 | ปุ่ม Auto Sort | **ต้องไม่มี** | | |
| 3.5 | tap-to-swap | สลับได้ · (High Noble **ยังไม่เปิด drag** — ลากแล้วไม่สลับ = ถูกต้อง) | | |
| 3.6 | จัดให้ foul (เช่น G1 ≥ G2) | แจ้งเตือน foul | | |
| 3.7 | A Ready ก่อน | B เห็นว่า A พร้อม | | |
| 3.8 | Blind Auction | ปุ่ม 100/200/300/500 · 12 วินาทีต่อใบ · A กับ B บิดราคาเท่ากัน → มีผู้ชนะ 1 คน (สุ่ม) + toast tie-break · เงินประมูลไปอยู่ F&R | | |
| 3.9 | จัดไพ่รอบ 2 | Timer **2:00** · ผู้ชนะประมูลวางไพ่ใหม่ใน G2 ได้ (G2 = 4 ใบ) · **ไม่มีหน้า Discard** | | |
| 3.10 | G1 → G2 หงายตามลำดับ | ไพ่ของ**ผู้แพ้ไม่ถูกเปิด** · G2 ผู้ชนะประมูลคิด Best 5 จาก 6 · ตามด้วย Fog of War | | |
| 3.11 | Grand Finale รอบ 1 | `CHECK / BET` · แตะไพ่ = เลือกใบที่จะหงายเท่านั้น · Timer 30 วินาที | | |
| 3.12 | A กด **BET** | หัก 1,000 จาก A · B เปลี่ยนเป็น `CALL / FOLD` · Boss ตอบตามลำดับ | | |
| 3.13 | Grand Finale รอบ 2 | Turn (ไพ่กองกลาง G3 ใบที่ 4) **หงาย** · River ยังคว่ำ | | |
| 3.14 | Showdown G3 | River หงาย · ผู้ชนะ G3 ได้ Call side pot ทั้งหมด (หลัง rake) | | |
| 3.15 | Round Summary | ตารางคะแนน G1/G2/G3 อ่านได้ครบ 3 แถวผู้เล่น · `Continue (10)` นับถอยหลังตรงกันทั้ง 2 เครื่อง | | |
| 3.16 | **A กด Continue, B ไม่กด** | A ต้องรอ · ไปต่อเองเมื่อครบ 10 วินาที ทั้ง 2 เครื่องพร้อมกัน | | |
| 3.17 | Token Flow Panel | **Total คงที่** ตลอดเกม (จดลง §7) | | |

## 4. Match 2–5 และจบเกม

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 4.1 | ทั้งคู่กด Continue ทันที | ไปต่อทันทีไม่รอครบ 10 วินาที | | |
| 4.2 | Grand Finale: ทุกคน CHECK ทั้ง 2 รอบ | ไม่มี Token ไหลออก | | |
| 4.3 | Grand Finale: ปล่อยหมดเวลาตอนยังไม่มีคน bet | auto-**check** | | |
| 4.4 | Grand Finale: ปล่อยหมดเวลาตอนมีคน bet แล้ว | auto-**call** (ถ้าเงินพอ) | | |
| 4.5 | Auction: ไม่บิดเลย | ไม่ได้ไพ่ ไม่ถูกหัก | | |
| 4.6 | ตัวนับ Match | `2/5` … `5/5` · Timer reset ทุก Match | | |
| 4.7 | จบ Match 5 | หน้าผลสรุป · **ไม่มีปุ่ม Rematch** · มี burn toast · ผู้ชนะ G3 ที่เป็น P1 เห็น VFX `YOU WIN!` | | |
| 4.8 | กลับ Lobby → kill แอป → เปิดใหม่ | Token ตรงกับหน้าผลสรุปทั้ง 2 บัญชี · ไม่ settle ซ้ำ | | |
| 4.9 | ตลอดเกม | ไม่เคยเจอ Monarch / ไม่ถูกพาไปโต๊ะ Monarch | | |

## 5. Edge cases (เกมที่ 2)

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 5.1 | B ปิด Wi-Fi 20 วินาที ระหว่าง **จัดไพ่รอบ 1** | A เล่นต่อไม่ค้าง · B กลับมาได้ไพ่/Timer เดิม | | |
| 5.2 | B ปิด Wi-Fi 20 วินาที ระหว่าง **Auction** หรือ **จัดไพ่รอบ 2** | กลับมาเห็นสถานะถูก · ไพ่ที่ชนะประมูลไม่หาย ไม่ซ้ำ | | |
| 5.3 | B ปิด Wi-Fi ระหว่าง **Grand Finale** (ตาของ B) | B ถูก **Fold** ทันที (ghost mode) · A เล่นต่อได้ | | |
| 5.4 | B ปิด Wi-Fi **เกิน 60 วินาที** | ที่นั่ง B ถูกแทนถาวร · A เล่นจนจบ · B settle ครั้งเดียว | | |
| 5.5 | Reconnect แล้วตรวจข้อมูล | B **ต้องไม่เห็น** ไพ่ลับของ A หรือ Boss ที่ยังไม่ควรเปิด | | |
| 5.6 | กด Home 30 วินาที แล้วกลับ | เกมยังอยู่ · BGM/SFX กลับมา | | |
| 5.7 | ปุ่ม Back (hardware) | มี dialog ยืนยัน · Cancel = อยู่ต่อ · ออกจริง = อีกเครื่องเล่นต่อ + settle ถูก | | |
| 5.8 | Token ไม่พอ BET/CALL | ปุ่มไม่โผล่ ถูก Fold อัตโนมัติ · stack ไม่ติดลบ | | |
| 5.9 | โต๊ะ private (PIN) — A สร้าง, B ใส่ PIN | B ได้กติกา Missions ตาม A · Host มีปุ่ม Start Now (ถ้าขึ้น) แล้วเริ่มโต๊ะ 3 ที่นั่งได้ | | |
| 5.10 | VIP เลือก **Live** (ถ้ามีเวลา) | เข้าคิวคนละ lane กับ Standard · ไม่ crash | | |

## 6. ทางเลือก — โต๊ะ 4–5 ที่นั่ง (ต้องมี Human เพิ่ม)

ถ้าหาเครื่องที่ 3 ได้ (มือถือคนในบ้าน หรือ Expo web บนคอม MSI ผ่าน `localhost`) ให้เทสเพิ่ม:

- [ ] 3 Human → โต๊ะ 4 ที่นั่ง · layout เดิม 4 ที่นั่ง
- [ ] 4 Human → โต๊ะ 5 ที่นั่ง · P2/P5 อยู่ซ้าย/ขวากลาง · P3/P4 แนวทแยงบน · Grand Finale วางที่นั่งตรงกัน
- ถ้าไม่มีเครื่องที่ 3 → จด "ไม่ได้เทส" ไว้ใน §7 (โต๊ะ 3 ที่นั่งคือกรณีหลักของ launch)

## 7. Regression + บันทึกผล

- [ ] ไม่มีข้อความภาษาไทยในหน้าจอเกม
- [ ] ไม่มี redbox / crash / โต๊ะค้างตอนเริ่ม Match หรือตอน Boss ชนะประมูล (เคยมีบั๊ก AI จัดไพ่ 12 ใบนานจน server ค้าง)
- [ ] ไพ่ไม่ซ้ำกันทั้งโต๊ะ (ไพ่ส่วนตัว + กองกลาง + ประมูล)
- [ ] ไพ่ผู้แพ้ไม่ถูกเปิดเผย
- [ ] Token ไม่ติดลบ · เสียงไม่หายกลางเกม

| รายการ | บัญชี A | บัญชี B |
|---|---|---|
| Token ก่อนเริ่ม | | |
| Token Flow Total (ทุก Match ต้องเท่ากัน) | | |
| Token หลังจบเกม (Lobby) | | |
| Token หลัง kill/เปิดแอปใหม่ | | |
| Boss ที่เจอ (เกม 1 / เกม 2) | | |
| ขนาดโต๊ะที่ได้เทส (3 / 4 / 5) | | |
| รุ่นมือถือ / Android version | | |

**สรุป:** ☐ PASS ทั้งหมด → ไปต่อ multiplayer/reconnect รวม แล้ว signed RC · ☐ มี FAIL → จดเลขข้อ + อาการ + รูป/วิดีโอ แล้วส่งให้ Claude ไล่แก้รวดเดียวหลัง QA ครบทุก Tier

| ข้อที่ FAIL | เครื่อง | อาการ | มีรูป/วิดีโอ |
|---|---|---|---|
| | | | |
