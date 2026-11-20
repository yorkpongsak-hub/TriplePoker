# TriplePoker — Adept (Tier B) Device QA Checklist v1.0

> สร้าง: 2026-11-20 · Branch: `release/android-1.0-qa` · ลำดับใน launch sequence: **ขั้นที่ 1** (Adept → Mastermind → High Noble → multiplayer → reconnect/escrow → signed RC)
> อุปกรณ์: มือถือ Android จริง 2 เครื่อง (เรียกว่า **เครื่อง A** / **เครื่อง B**) · Server: dev server ในเครื่อง MSI · บัญชี: 2 บัญชีที่ลุงเตรียมไว้แล้ว

## 0. กติกาของ Adept ที่ใช้ตัดสิน PASS/FAIL (อ้างอิงโค้ด ณ `6ecc104`)

| เรื่อง | ค่าที่ถูกต้อง | แหล่งอ้างอิง |
|---|---|---|
| โครงโต๊ะ public | **2 Human + 2 AI ตายตัว** (ไม่มีคนที่ 3) · Human เติม seat 0→1, AI เติม seat 3→2 | `roomRegistry.ts` (LobbyMatchmaking v1.2) |
| รอคนที่ 2 | **120 วินาที** ไม่ครบ → ปิดโต๊ะ | `gameConfig.matchmakingTimeouts.adept.secondHumanWaitMs` |
| โต๊ะ private (PIN) | 2H+2AI, Sage bot เข้ารอทันที, รอ **3 นาที** | `adeptPrivateWaitTimeoutMs` |
| จำนวน Match ต่อเกม | **3 Match** (ตัวนับแสดง `/3`) — ⚠️ ไม่ใช่ 5 | RELAUNCH log 2026-09-27 |
| Buy-in | **1,800 Token** (Ante ต่อ Match: G1 120 / G2 180 / G3 300 = 600 × 3) | `gameConfig.buyIn.adept`, `antes.adept` |
| เวลาจัดไพ่ | **150 วินาที (2:30)** | `arrangementTimer.adept` |
| Showdown | หงายพร้อมกัน (simultaneous) · ไม่มี Fog of War / Blind Auction / Grand Finale / Discard | `progressiveMechanics.adept` |
| Auto Sort | **ต้องไม่มีปุ่ม** (อนุญาตเฉพาะ Initiate เกมแรก) · server ตอบ `AUTO_SORT_DISABLED` เสมอ | `gameLoop.ts` `requestAutoSort()` |
| Rake | 5% ทุก Pot รวม Triple Sweep | `antes.rake` |
| Missions | เลือก `Play with Missions` ได้ก่อนเข้าคิว · คิว On/Off แยกกันเด็ดขาด | RELAUNCH log 2026-09-28 |
| Disconnect | AI เล่นแทนทันที · reconnect ภายใน **60 วินาที** ได้ที่นั่งคืน · เกิน 60 วิ → ถูกแทนด้วย AI ถาวร + settle escrow | `gameLoop.ts` `markPlayerAFK` |
| Rematch | ไม่มีปุ่ม Rematch | Token Flow Spec §5.1 |

## 1. เตรียมก่อนเทส (Pre-flight)

- [ ] **Supabase keys:** เปลี่ยน `anon`/`service_role` แบบ legacy ใน `.env` ของ client/server เป็น publishable/secret key ใหม่แล้ว (ถ้ายังไม่เปลี่ยน login/ledger จะพัง — blocker)
- [ ] `ipconfig` บนเครื่อง MSI → ยืนยัน LAN IP ปัจจุบัน แล้วตั้ง `EXPO_PUBLIC_SERVER_URL=http://<LAN IP>:3001` ใน `client/.env`
- [ ] เปิด server (WSL2, `server/`) แล้วเช็ค `http://localhost:3001/health` บนเครื่อง MSI
- [ ] มือถือ **ทั้ง 2 เครื่อง** ต่อ Wi-Fi เดียวกัน แล้วเปิด `http://<LAN IP>:3001/health` ได้ response
- [ ] รัน Expo จาก `client/` ด้วย `npx expo start --clear` (หลังแก้ `.env` ต้อง restart Expo เสมอ)
- [ ] ⚠️ **dev client ต้อง build ใหม่** เพราะเพิ่ม native module `expo-crypto` (telemetry) — dev client เก่าอาจ crash/ขึ้น warning ตอนเปิด ให้ลบแอปเก่าแล้วติดตั้ง build ใหม่ทั้ง 2 เครื่อง
- [ ] บัญชี A และ B: Token ≥ 6,000, อายุบัญชี ≥ 3 วัน, จด **Token ก่อนเริ่ม** ของทั้ง 2 บัญชีไว้ในตาราง §7
- [ ] เปิดเสียงเครื่อง A, ปิดเสียง (mute ในเกม) เครื่อง B — เพื่อเช็คทั้ง 2 โหมดในรอบเดียว
- [ ] ตั้งเวลาเครื่องให้ไม่ล็อคจอระหว่างเทส (ยกเว้นตอนเทส background ใน §5)

## 2. Lobby → Matchmaking

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 2.1 | เข้า Lobby → แตะ Adept | เข้าได้ ไม่ติด gate · เห็น Buy-in 1,800 | | |
| 2.2 | เครื่อง A เลือก **Missions ON** แล้วเข้าคิวก่อน | ขึ้น "Waiting for players..." + เพลง waiting · Sage bot นั่ง seat ท้าย | | |
| 2.3 | เครื่อง B เลือก **Missions OFF** เข้าคิว | **ต้องไม่** เข้าโต๊ะเดียวกับ A (คนละ lane) | | |
| 2.4 | เครื่อง B ออกคิว → เลือก **Missions ON** เข้าใหม่ | เข้าโต๊ะเดียวกับ A ทันที · AI ตัวที่ 2 เติม · เกมเริ่ม | | |
| 2.5 | (แยกรอบ) เครื่อง A เข้าคิวคนเดียว รอครบ 2 นาที | โต๊ะปิด มีข้อความแจ้ง (ภาษาอังกฤษ) · Token ไม่ถูกหัก | | |
| 2.6 | ระหว่างรอ แตะออกจากคิว | กลับ Lobby ได้ เพลงกลับเป็น Lobby BGM · Token ไม่ถูกหัก | | |

## 3. ในโต๊ะ — Match 1

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 3.1 | เข้าโต๊ะครั้งแรกของบัญชี | Tier Welcome character โผล่ **หลัง** แจกไพ่เสร็จ (ไม่บังไพ่) · เครื่อง A ได้ยินเสียงพูด เครื่อง B ไม่มีเสียงแต่เห็น animation ครบ | | |
| 3.2 | ดู layout | ปุ่ม `i` + Timer อยู่ซ้ายบน (มีปุ่ม `i` **อันเดียว**) · Token Flow Panel ชิดขวาบน · กรอบไพ่ Boss ชนขอบ Panel พอดี · ไพ่ P1 ไม่เล็กกว่า Initiate | | |
| 3.3 | Timer | เริ่มที่ **2:30** และนับถอยหลังตรงกันทั้ง 2 เครื่อง | | |
| 3.4 | ปุ่ม Auto Sort | **ต้องไม่มี** ปุ่ม Auto Sort | | |
| 3.5 | แตะสลับไพ่ (tap-to-swap) | สลับได้ ไฮไลต์สีเขียวตอนเลือก | | |
| 3.6 | **ลากไพ่** ไปทับอีกใบ | สลับที่ได้ · ใบเป้าหมายมีขอบ cyan · ปล่อยนอกไพ่ = กลับที่เดิม · ลากแล้ว tap ยังใช้ได้ | | |
| 3.7 | จัดไพ่ให้ foul (กองล่างแรงกว่ากองบน) แล้วกด Ready | มีการแจ้งเตือน foul ตามกติกา | | |
| 3.8 | เครื่อง A กด Ready ก่อน | เครื่อง B เห็นสถานะว่า A พร้อมแล้ว · ลากไพ่ไม่ได้หลังกด Ready | | |
| 3.9 | ทั้งคู่ Ready | หงายพร้อมกันทั้ง 3 กอง · โชว์ไพ่ผู้ชนะ G1/G2/**G3** ครบ (ตรวจว่า G3 ไม่หาย) | | |
| 3.10 | Round Summary | คะแนน/Token ของแต่ละคนตรงกันทั้ง 2 เครื่อง · Missions ON มีคะแนน Mission/Combo | | |
| 3.11 | Token Flow Panel | แถว G1/G2/G3/F&R/4P/Total อัปเดตหลังแต่ละ Match · **Total คงที่ตลอดเกม** (จดค่า Total ไว้ใน §7) | | |

## 4. Match 2–3 และจบเกม

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 4.1 | เล่นต่อ Match 2, 3 | ตัวนับ Match แสดง `2/3`, `3/3` · Timer reset เป็น 2:30 ทุก Match · ไม่มี Tier Welcome ซ้ำ | | |
| 4.2 | ปล่อยให้ Timer หมดโดยไม่กด Ready (1 Match, เครื่อง B) | ระบบ submit ให้เอง เกมเดินต่อ ไม่ค้าง | | |
| 4.3 | จบ Match 3 | หน้าผลสรุปเกม · **ไม่มีปุ่ม Rematch** · มี burn toast ตอนจบ | | |
| 4.4 | ผู้ชนะ (ถ้าเป็น P1) | ได้ยินเสียง `sfx_match_win` (เครื่องที่เปิดเสียง) · ถ้าชนะ 3 กอง → Triple Sweep celebration + `sfx_congratulation` | | |
| 4.5 | กลับ Lobby | Token ใน Lobby = Token ก่อนเริ่ม − 1,800 + ยอดที่ได้คืนตามผล (ตรงกับหน้าผลสรุป) | | |
| 4.6 | Kill แอปแล้วเปิดใหม่ → ดู Token | ยอดเท่ากับข้อ 4.5 (ไม่มี settlement ซ้ำ ไม่หาย) | | |

## 5. Edge cases (เล่นอีก 1–2 เกมเพื่อเทสข้อเหล่านี้)

| # | ขั้นตอน | ผลที่ต้องได้ | A | B |
|---|---|---|---|---|
| 5.1 | ระหว่างจัดไพ่ เครื่อง B **ปิด Wi-Fi 20 วิ** แล้วเปิดคืน | เครื่อง A เล่นต่อได้ไม่ค้าง · B กลับมาได้ที่นั่งเดิม ไพ่/Timer ถูกต้อง | | |
| 5.2 | เครื่อง B **ปิด Wi-Fi เกิน 60 วิ** | ที่นั่ง B ถูกแทนด้วย AI ถาวร · A เล่นจนจบได้ · Token ของ B ถูก settle ครั้งเดียว (เช็คใน Lobby เมื่อกลับมา) | | |
| 5.3 | เครื่อง A กดปุ่ม **Home** (background) 30 วิ แล้วกลับเข้า | เกมยังอยู่ · BGM กลับมาเล่น · เสียง SFX ไม่หาย | | |
| 5.4 | กดปุ่ม **Back (hardware)** ระหว่างเกม | มี dialog ยืนยันก่อนออก · กด Cancel = อยู่ต่อ | | |
| 5.5 | Back → ยืนยันออกกลางเกม | ออกได้ · อีกเครื่องเล่นต่อกับ AI · settle escrow ให้ทุกคนถูกต้อง ไม่หักซ้ำ | | |
| 5.6 | Server online/offline light | ปิด server ชั่วคราว → ไฟสถานะเปลี่ยนเป็น offline · เปิดคืน → online | | |
| 5.7 | โต๊ะ private (PIN) — A สร้าง, B ใส่ PIN | B เข้าได้ · ได้กติกา Missions ตามที่ A ตั้ง (B เปลี่ยนไม่ได้) | | |
| 5.8 | หมุนจอ / จอแคบ (ถ้า 2 เครื่องขนาดต่างกัน) | ไม่มีข้อความ/ไพ่ทับกันหรือโดนตัด | | |

## 6. Regression ที่ต้องไม่เกิด

- [ ] ไม่มีข้อความภาษาไทยในหน้าจอเกม (UI ต้องเป็นอังกฤษทั้งหมด)
- [ ] ไม่มี error สีแดง / Metro redbox / แอป crash
- [ ] ไพ่ไม่ซ้ำกันบนโต๊ะ (52 ใบ ไม่มีใบซ้ำระหว่างผู้เล่น/AI)
- [ ] AI ไม่เคยจัดกองผิดลำดับ (G1 ≤ G2 ≤ G3) ตอนหงายไพ่
- [ ] Token ไม่ติดลบ (ถ้าติดลบต้องขึ้น `GAME OVER` / `TRY AGAIN` แล้วออกอัตโนมัติ)
- [ ] เสียงไม่หายกลางเกม และไม่เล่นซ้อนกันผิดปกติ

## 7. บันทึกผล

| รายการ | บัญชี A | บัญชี B |
|---|---|---|
| Token ก่อนเริ่มเกมที่ 1 | | |
| Token Flow Total (ทุก Match ต้องเท่ากัน) | | |
| Token หลังจบเกมที่ 1 (Lobby) | | |
| Token หลัง kill/เปิดแอปใหม่ | | |
| รุ่นมือถือ / Android version | | |

**สรุป:** ☐ PASS ทั้งหมด → ไปต่อ Mastermind QA · ☐ มี FAIL → จดเลขข้อ + อาการ + screenshot/วิดีโอ แล้วส่งให้ Claude ไล่แก้รวดเดียว (ตามกติกา QA รวม ไม่แก้ minor ระหว่างทาง)

| ข้อที่ FAIL | เครื่อง | อาการ | มีรูป/วิดีโอ |
|---|---|---|---|
| | | | |
