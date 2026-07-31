# TriplePoker — Monarch Spec v2.1

> **สถานะ:** Canon (แทนที่ Monarch Spec v2.0 และ v1.3 ทั้งฉบับ)
> **ขอบเขต:** Technical spec สำหรับ implement โต๊ะ Monarch ใน Main App (TriplePoker: Rise)
> **คู่กับ:** `TriplePoker_CanonBridge_Monarch_v1_1.md` (narrative layer)
> **การเปลี่ยนแปลงหลักจาก v2.0:** เปลี่ยนจาก Multiplayer (Shared Monarch) → **1v1 model** (Human vs Monarch, 2 Minion เป็นพยาน) · reuse โครง Mastermind (1 Human + 2 Minion + Boss) · EV decision เหลือ 1v1 · reward ให้ผู้เล่นคนเดียว

---

## 1. Spawn Mechanic — Entry-Roll

- Monarch เป็น special encounter **ภายใน Tier A+ (High Noble)** ไม่ใช่ Tier แยก
- **ทับ pity counter เดิมทิ้งทั้งหมด** — ไม่มีการสะสมความซวยที่ Seat 1 อีกต่อไป
- Server สุ่ม (roll) **ตอนผู้เล่นคนแรกเข้าโต๊ะ A+** (จุด `finalizeBossSeat`) ว่าจะได้เจอบอสตัวใด
- ผลลัพธ์เป็น pure random — ผู้เล่นที่ซวยอาจไม่เจอ Monarch เลยหลายร้อยเกม (นี่คือ **เจตนา**: หายาก = ทรงคุณค่า = เรื่องเล่าน่าจดจำ)

**Entry-roll table (A+):**

| Boss | Rate |
|---|---|
| Monarch | 3% |
| Reaper | 28% |
| Crag | 25% |
| Cortex | 25% |
| Cipher | 19% |

> Reaper/Crag/Cortex/Cipher = Four Gods pool (เล่นโหมด High Noble ปกติ 3-3-5)
> Monarch = special encounter (เล่นโหมด 2-2-0, 1v1 ตาม spec นี้)

---

## 2. Matchmaking Flow

### 2.1 ถ้าสุ่มได้ Four Gods (ปกติ)
1. รอ Human เข้าครบ 3 คน (Seat 1 → 2 → 3)
2. เติม Boss เป็นผู้เล่นคนที่ 4 (Seat 4)
3. แสดง Boss Intro ให้ผู้เล่นอ่าน
4. เริ่มแจกไพ่ → เล่น High Noble ปกติ

### 2.2 ถ้าสุ่มได้ Monarch (special) — reuse โครง Mastermind
1. รอ Human เข้าแค่ **1 คน** (Seat 1 = challenger)
2. เติม **Minion Bot ×2** (Seat 2, 3) — ตัวประกอบเติมโต๊ะ
3. ปิดท้ายด้วย **Monarch** (Seat 4)
4. แสดง Monarch Intro + Lore (ดู CanonBridge)
5. เริ่มแจกไพ่ → เล่น 2-2-0 **เกมเดียวรู้ผล** (Single Encounter, 1v1)

> โครงโต๊ะ **1 Human + 2 Minion + 1 Boss** = เหมือน Mastermind (Nine Sentinels) → reuse seat setup + table layout ได้เกือบทั้งหมด
> เคารพกฎถาวร "4 seats fixed + ห้ามโต๊ะ Human ล้วน (Bot ≥1)"

---

## 3. Core Mechanic — กติกา 2-2-0

### 3.1 Card Distribution
- แจก 11 ใบ/คน จัด 3-3-5 (G1 / G2 / G3) เหมือนเดิม
- **Community Cards แจกแบบ 2-2-0:**
  - G1 (3 ส่วนตัว) + community 2 = **5 ใบ**
  - G2 (3 ส่วนตัว) + community 2 = **5 ใบ**
  - G3 (5 ส่วนตัว) + 0 = **5 ใบ**
- ผลคือทุกกองเป็น **5-5-5 เต็มมือ** — ไม่มีกอง 3 ใบให้ซ่อนอีก ทุกชั้นสู้ด้วยมือโป๊กเกอร์เต็ม

### 3.2 Community Visibility
- **community 2-2 เปิดให้เห็นก่อนจัดไพ่** (ทุกคนวางแผนมือ 5-5-5 ครบทุกใบ)
- ความมืดทั้งหมดโฟกัสที่จุดเดียว: **ไพ่ Monarch** โดยเฉพาะ G3 ที่เป็น black box สนิท
- G3 = กล่องดำ เพราะ community ไปเกาะ G1/G2 หมด ไม่เหลือจุดเกาะให้เดา

### 3.3 Ranking / Evaluator
- **ใช้ evaluator ตัวเดียว (5-card poker เต็ม) ทั้ง 3 กอง** — G1/G2/G3 ประเมิน scale เดียวกัน
- constraint **G1 < G2 < G3** ยังบังคับอยู่ (ตรวจจากมือสุดท้ายจริงได้ทันที เพราะเห็น community ก่อนจัด ไม่มีเคสพลิกลำดับหลังเปิด)

### 3.4 Card Count Check
- Human 11 + Monarch 11 + Minion×2 (22) + community 4 = **48 ใบ** (ใต้เพดาน 53 — deck 52+Joker) ✅

### 3.5 Pile 3 Visual
- ช่องกอง community ของ Pile 3 (ที่เป็น 0 ใบ) **แสดงเป็นช่องว่างพร้อมเงามงกุฎแตก**
- สื่อว่านี่คือกติกาที่ตั้งใจ ไม่ใช่ bug — เปลี่ยน "การไม่มีไพ่" เป็น intentional dread

---

## 4. Three-Phase Flow

| Phase | กอง | กลไก (Human vs Monarch) | Minion |
|---|---|---|---|
| 1 | **G1** | Auto-reveal (เปิดทันที ไม่มี betting) | ร่วมวัด (ชนะได้เชิงสัญลักษณ์) |
| 2 | **G2** | สู้เลย — **ไม่มี Call/Fold** | **หมอบตลอด** (auto-fold) |
| 3 | **G3** | **Call/Fold ด้วย EV** — จุดตัดสินใจเดียว | **หมอบตลอด** (auto-fold) |

> จุดตัดสินใจย้ายมาไว้ที่ G3 เพื่อให้ Monarch ใช้ **ข้อมูลจริงจากผล G2** มาประกอบการตัดสิน
> เวทีค่อยๆ clear จาก 4 ขา → เหลือคู่เอก Human vs Monarch ตัวต่อตัวที่ G2/G3

---

## 5. Monarch Battle Model — 1v1 + Phased Minion

โครงสร้าง **1v1 แท้** (Human = challenger คนเดียวที่มีเดิมพันจริงกับ Monarch):

- **Monarch มีมือเดียว** (G1/G2/G3) นั่งเป็นบอสกลางโต๊ะ
- **community 2-2 ชุดเดียว** ใช้ร่วมทั้งโต๊ะ (Texas Hold'em style board)
- **เดิมพันจริงมีแค่ Human vs Monarch** เท่านั้น
- **2 Minion = พยาน/บริวาร** — แจกไพ่ให้ (โต๊ะดูสมจริง) แต่**ไม่มีเดิมพันจริง**

### 5.1 Minion Role — Phased Behavior
- **แจกไพ่ให้** (จับ 11 ใบ จัด 5-5-5) เพื่อให้โต๊ะมีชีวิต
- **G1:** ร่วมวัดกับมือ G1 ของ Monarch (the-house model เฉพาะกองแรก) — **ชนะได้แต่เชิงสัญลักษณ์เท่านั้น** ไม่มีผลเงิน (เป็น bot)
- **G2:** **หมอบทันที** (auto-fold)
- **G3:** **หมอบทันที** (auto-fold)
- Minion fold ที่ G2/G3 = **ถอนตัวเงียบ ไม่กระทบ duel หลัก** (Human vs Monarch วัดกันตามปกติ)
- AI แบบ simplified: **greedy arrangement** (แค่ผ่าน foul G1<G2<G3) + G1 เล่นปกติ + G2/G3 return fold — **ไม่ต้องมี EV, ไม่ต้องฉลาด**

---

## 6. Monarch EV Decision (Phase G3) — 1v1

### 6.1 หลักการ
- Monarch สู้ **Human คนเดียว** (Minion หมอบหมดแล้วที่ G3) → **1v1 EV ตรงไปตรงมา**
- เป้าหมาย: maximize Token สุทธิ (ชนะ = Token เหลือมากสุด)
- Monarch AI ไม่ต้องมี special rule — optimize Token ก็ได้พฤติกรรมฉลาดโดยธรรมชาติ

### 6.2 สูตร (1v1)
```
EV(Call) = P(Monarch ชนะ G3 เหนือ Human) × +stake  −  P(แพ้) × stake

ถ้า EV(Call) > 0  →  Call (สู้ G3)
ไม่งั้น            →  Fold (ยอมยก G3 ให้ Human)
```

- Monarch รู้ผล G2 แล้ว + เห็น community + card counting
- **ตัวอย่าง:** ถ้า Monarch แพ้ G2 ให้ Human (Human มี G2 แรง) → ตามกฎ G2<G3, Human ต้องมี G3 แรงกว่านั้นอีก → ถ้า G3 ของ Monarch เล็ก → **Fold** (ไม่มีเหตุผลสู้เกมที่แพ้แน่)

### 6.3 ผลของ Fold
- ถ้า Monarch Fold G3 → **Human ได้ G3 ไป** (ชนะกองสุดท้าย)
- **บอส Fold = feature ไม่ใช่ bug** — "ฉันเก่งจน Monarch ยอมถอย" = เรื่องเล่าที่ทรงพลัง

---

## 7. Fairness — ไม่ Rig ไพ่ (สำคัญมาก)

> ⚠️ **Compliance canon:** ห้าม rig deck ให้ Monarch ได้เปรียบเชิงระบบเด็ดขาด

- Monarch **จับไพ่สุ่มยุติธรรมเท่าคนอื่น** (11 ใบ deck เดียวกัน)
- ความโหดมาจาก **Superior Skill ล้วน**:
  - **Optimal arrangement solver** — ลองทุก permutation หา 5-5-5 ที่ EV ดีที่สุดจากไพ่ที่มี
  - **Card counting เต็ม**
  - **EV decision** (section 6)
- เหตุผล: (1) Legal/gambling compliance — rig ไพ่เข้าข่าย unfair game mechanic ที่ Google Play + กฎหมายจับตา โดยเฉพาะเกมมี IAP เงินจริง (2) รักษา design philosophy — ผู้เล่นแพ้แล้ว "นับถือ" ไม่ใช่ "รู้สึกโกง"

---

## 8. Reward

- **System-sponsored bonus ×2** — เกมออก Token เอง (ไม่ริบจากใคร, clean เชิงบัญชี + compliance)
- จ่ายให้ **ผู้เล่น Human คนเดียว** ที่ชนะ Monarch (เดิมพันจริงมีแค่ Human vs Monarch)
- Minion ชนะ G1 = เชิงสัญลักษณ์ ไม่มี payout
- **ไม่มี cap** — จ่ายเต็มเสมอ (Monarch หายาก 3% + ต้องชนะบอส optimal → เคสจ่ายก้อนโตเกิดยากโดยธรรมชาติ)
- **Monitor note:** จับตา metric payout รวม/เดือน ตอน live — ถ้าฐานผู้เล่นโตจน payout มีนัยต่อ economy ค่อยพิจารณาใส่ cap ทีหลัง (เพิ่ม cap ทีหลังง่ายกว่าถอด)

---

## 9. Spawn Broadcast

### 9.1 Transport (reuse 100%)
- ใช้ระบบ Server Activity เดิม — `io.emit('server_activity', { kind: 'monarch_spawn', ... })`
- Server Activity เป็น **global (cross-table) by nature** อยู่แล้ว (ใช้ `io.emit` ไม่ใช่ `io.to(roomId)`) — ไม่ต้องสร้าง pub/sub ใหม่
- แค่เพิ่ม `kind: 'monarch_spawn'` ใน 3 ค่าเดิม (online_count / table_open / win)

### 9.2 Architecture (รักษา separation of concerns)
- `rollHighNobleBoss()` / `roomRegistry.ts` เป็น **pure function ไม่มี `io`** — ออกแบบแยกจาก socket layer โดยเจตนา **ห้ามแตะ signature**
- ให้ roll function **คืนผลลัพธ์กลับมา** แล้วให้ **`gameSocket.ts` (ที่มี `io` อยู่แล้ว)** เป็นคนยิง broadcast
- ไม่ส่ง `io` เข้า `roomRegistry` (คง pure function)

### 9.3 UI
- **Card เด่นแยก component** จาก activity bubble list เดิม (ไม่ใช่บรรทัดใน feed)
- ขนาด **~1/4 จอด้านบน** — เห็นชัดแต่ไม่บังพื้นที่เล่นเกม
- **Generic message** (ไม่ระบุผู้เล่น/โต๊ะ — ปลอด privacy + คงความลึกลับของ Herald)
- **Auto-dismiss 7 วินาที**
- Production string (EN): *"⚡ A Monarch has risen. Somewhere, a challenger faces the Herald."* (ปรับได้)

### 9.4 Timing & Scope
- ยิง **ตอนโต๊ะครบ 4 ที่นั่ง + เกมเริ่มจริง** (ไม่ใช่ตอน roll — กันความผิดหวังหมู่จากคนแห่มาแต่โต๊ะเต็ม)
- **Scope: global** (ทุกคนออนไลน์เห็น) — ตาม nature เดิมของ `io.emit`
- Tier filter (ถ้าต้องการจำกัดการเด้ง card เฉพาะ A+) → ตัดสินตอน implement

### 9.5 สิ่งที่ต้องเขียนใหม่ (จาก audit)
1. เพิ่ม `kind: 'monarch_spawn'` + จุดเรียก `io.emit` ที่ตำแหน่ง roll เสร็จ (ผ่าน gameSocket layer)
2. เพิ่ม branch ฝั่ง client — เฉพาะ `monarch/index.tsx` (Monarch มีแค่ context นี้)

---

## 10. File Separation

> **มติ:** แยกไฟล์โต๊ะ Monarch ออกต่างหาก ตาม Tier file separation policy

- **Path:** `app/game/monarch/index.tsx` (แยก route เต็ม)
- **ต้นแบบ:** copy จาก `app/game/mastermind/index.tsx` หรือ `highNoble/index.tsx` — **รอ Master Audit ยืนยันว่าไฟล์ไหนใกล้ Monarch มากกว่า** (Mastermind มี 1 Human + 2 Minion + Boss structure ที่ตรงกับ Monarch มากกว่า จึงน่าจะเป็นต้นแบบที่ดีกว่า)
- **เหตุผล:** กติกา 2-2-0 + 3-phase flow + 1v1 EV decision ต่างจาก Tier ปกติมากเกินกว่าจะใช้ conditional flag (เสี่ยงพัง Tier ที่เสร็จ 100% แล้ว)
- **Routing:** เมื่อ entry-roll ได้ Monarch, server สั่ง client navigate ไป `monarch` route

---

## 11. Scope — MVP vs Vision

| รายการ | MVP (Rise) | เลื่อนไป |
|---|---|---|
| Single Encounter (2-2-0 เกมเดียวจบ, 1v1) | ✅ | — |
| Monarch Slayer badge | ✅ (คงเดิม) | — |
| Two-Encounter (ครั้งสอง + Arena element) | ❌ | Arena |
| Special Joker / limited Fog of War | ❌ | Arena |
| คำเชิญเข้าภาคจบอย่างเป็นทางการ | ❌ | Arena |

> บทพูดตอนแพ้ ("เมื่อพร้อมจะเล่นโดยไม่มีสิ่งค้ำจุน จงกลับมาหาข้า") ทำหน้าที่เป็น hook ของ encounter ที่ 2 อยู่แล้ว — พอ Arena มาถึงรับกันพอดี ไม่ต้อง retcon

---

## Changelog
- **v2.1** — เปลี่ยนเป็น **1v1 model** (reuse โครง Mastermind 1H+2Minion+Boss) · Minion phased role (G1 วัด/G2-G3 fold) · EV decision 1v1 · reward ผู้เล่นคนเดียว · card count 48
- **v2.0** — (deprecated) Multiplayer Shared Monarch model
- **v1.3** — (deprecated) pity counter model
