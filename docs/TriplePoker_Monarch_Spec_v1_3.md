# TriplePoker — Monarch Spec v1.3
**Identity · Spawn System · Reward · Dual-Track Performance Score · Ascendant Gate**

- **สถานะ:** ✅ Canon Locked
- **วันที่:** 2026-07-11
- **ผู้อนุมัติ:** ลุงเยาะ (Founder & Chief Architect)
- **ขอบเขต:** Tier A+ (High Noble) + Ascendant Tier — Main App
- **เอกสารอ้างอิง:** TriplePoker_Universe_MasterPlan_v1_1 (§4.5.1, §5, §6.9, §11), TriplePoker_SeasonTournament_Plan_v1_0
- **⚠️ Override Notice:** Spec นี้**ทับ canon MasterPlan §5** ในส่วนเงื่อนไขเข้า Ascendant Tier (ดู §5 ของเอกสารนี้) — ต้องจด note ใน CLAUDE.md ตอน sync repo

**Changelog:**
- v1.3 (2026-07-11): PS เป็น Dual-Track — `ps_lifetime` (Career, ไม่รีเซ็ต) + `ps_season` (Seasonal, รีเซ็ตตาม tournament) · เกณฑ์แข่งขันอิง ps_season · Pre-Season เริ่มตั้งแต่ launch
- v1.2 (2026-07-11): เพิ่ม Identity — ชื่อไทย "ราชันไร้พักตร์" (The Faceless King) + Hook line + Storyline (ปิด TODO เดิม)
- v1.1 (2026-07-11): เพิ่ม §5 Ascendant Gate — Monarch Slayer badge เป็นเงื่อนไขเข้า Ascendant, เพิ่ม Monarch's Trial ใน Future, อัปเดต checklist
- v1.0 (2026-07-11): Spawn + Pity + Reward + PS Activation

---

## 1. Monarch Identity (Canon เดิม — ไม่เปลี่ยน)

| หัวข้อ | รายละเอียด |
|---|---|
| ตำแหน่ง | บอสลับตัวที่ 5 ของ Tier A+ (High Noble) |
| Base Spawn Rate | 3% |
| บุคลิก | Adaptive — ล็อคตาม hand strength ทันทีที่แจกไพ่เสร็จ ไม่สลับกลางเกม |
| Personality Mapping | ไพ่แข็งมาก→Cortex · แข็งปานกลาง→Reaper · ปานกลางค่อนอ่อน→Crag · อ่อน→Cipher |
| สิ่งที่ผู้เล่นเห็น | Avatar + ชื่อ Monarch เท่านั้น ไม่รู้ว่าสวมบุคลิกใด |
| Asset | `boss_monarch.png` 512×640 + avatar 256×256 |
| **ชื่อไทย** | **ราชันไร้พักตร์** |
| **Title (EN)** | **The Faceless King** |
| **Hook Line** | *"My mask is the hand I am dealt."* / "หน้ากากของข้า คือไพ่ที่ข้าได้รับ" |

### 1.1 Storyline ✅ (Canon Locked v1.2)

> จตุรเทพทั้งสี่มิใช่คู่แข่งกัน — พวกเขาคือเศษเสี้ยวแห่งจิตของราชันองค์เดียว ตำนานเล่าว่า Monarch คือผู้สร้างจตุรเทพขึ้นจากด้านทั้งสี่ในใจตน: ความดุดันของ Reaper, ความมั่นคงของ Crag, ความเยือกเย็นของ Cortex, และความบ้าคลั่งของ Cipher เมื่อไพ่ถูกแจก เขาจะสวมหน้ากากที่เหมาะกับชะตานั้นโดยไม่มีผู้ใดล่วงรู้ ผู้ที่เอาชนะเขาได้เท่านั้นจึงจะได้เห็น "ใบหน้าที่แท้จริง" — และนั่นคือบทพิสูจน์สุดท้ายก่อนก้าวสู่ The Arena
>
> *The Four Gods were never rivals — they are fragments of a single sovereign's mind. Legend holds that the Monarch forged the Four Gods from the four facets of his own heart: Reaper's fury, Crag's resolve, Cortex's cold precision, and Cipher's madness. When the cards are dealt, he dons whichever mask fate demands — and no one ever knows which. Only those who defeat him may glimpse his true face — the final trial before ascending to The Arena.*

**หมายเหตุการใช้งาน:**
- In-game UI แสดงภาษาอังกฤษเท่านั้น: `Monarch — The Faceless King` + hook line EN (ตามกฎ Global users)
- ภาษาไทยใช้สำหรับ docs / marketing ตลาดไทย
- Lore นี้อธิบายเชิงเหตุผลว่าทำไม Monarch ใช้ AI personality ของจตุรเทพทั้งสี่ (delegate pattern) และเชื่อมตรงกับ Ascendant Gate (§5)

---

## 2. Spawn System — RNG + Pity Counter ✅

### 2.1 กลไก

1. Boss selection ตอนสร้างโต๊ะ High Noble ใช้ weighted random ตามตาราง canon: Reaper 28 / Crag 25 / Cortex 25 / Cipher 19 / **Monarch 3**
2. **Pity counter (per-player):** ทุกเกม High Noble ที่ผู้เล่น**ไม่เจอ** Monarch → spawn rate ส่วนตัวเพิ่ม **+0.5% ต่อเกม**
3. **การันตี:** เกมที่ 30 นับจาก reset ล่าสุด ยังไม่เจอ → **บังคับ spawn Monarch**
4. **โต๊ะ 3 คน:** ใช้ค่า **max** ของ pity counter ในโต๊ะเป็นตัวคำนวณ (ผู้เล่นคนอื่นในโต๊ะได้อานิสงส์)
5. **Reset:** counter กลับเป็น 0 **ทันทีที่เจอ Monarch** ไม่ว่าผลแพ้หรือชนะ (ความหายากอยู่ที่การเจอ ไม่ใช่การชนะ)

### 2.2 ตัวเลขอ้างอิง

| เกมที่ (นับจาก reset) | Effective Spawn Rate |
|---|---|
| 1 | 3.0% |
| 10 | 7.5% |
| 20 | 12.5% |
| 29 | 17.0% |
| 30 | 100% (การันตี) |

---

## 3. Monarch Reward (เมื่อชนะ) ✅

| รางวัล | รายละเอียด |
|---|---|
| **Pot ×2.0** | ส่วนต่างที่เพิ่ม **House จ่าย (system mint)** — ไม่หักจากผู้เล่นอื่น |
| **PS ×2** | ได้ Performance Score เป็น 2 เท่าของค่าชนะปกติในระดับตน (ดู §4) |
| **Badge "Monarch Slayer"** | แสดงใน Profile screen — naming family เดียวกับ "AI Slayer" ของ Arena · **เป็นเงื่อนไขบังคับสำหรับเข้า Ascendant Tier (ดู §5)** |

> หมายเหตุ inflation: ด้วย spawn rate เฉลี่ย ~3-5% ปริมาณ token ที่ mint เพิ่มถือว่าน้อยมาก ยอมรับได้เพื่อให้การเจอ Monarch รู้สึกคุ้มค่า

---

## 4. Dual-Track Performance Score ✅ (ปรับ Canon)

> **การเปลี่ยนแปลงสำคัญ:** (1) PS active ตั้งแต่ **Tier A+ เป็นต้นไป** (จากเดิม dormant รอ Arena) (2) แยกเป็น 2 track: **Career PS** สะสมตลอดชีพ + **Season PS** รีเซ็ตตาม tournament

### 4.1 สูตร PS (Flat — MVP)

| เหตุการณ์ | Tier A+ | Ascendant |
|---|---|---|
| อันดับ 1 ในโต๊ะ (ชนะ Four Gods) | **+5** | **+7** |
| ชนะ Monarch (×2 ของค่าชนะปกติ **เสมอ**) | **+10** | **+14** |
| ไม่ชนะ แต่ token สุทธิไม่ติดลบ | **+2** | **+2** |
| Token สุทธิติดลบ | +0 | +0 |

**หลักการล็อค:**
- Monarch = **×2 ของค่าชนะปกติในระดับตนเสมอ** (A+: 5→10, Ascendant: 7→14)
- ค่า "ไม่ชนะแต่ไม่ติดลบ" = **+2 เท่ากันทุกระดับ** (ความต่างของ Ascendant อยู่ที่ค่าชนะ)
- **ไม่มี PS ติดลบใน Main App** — ระบบ +/- เต็มรูปแบบเริ่มที่ Arena ตาม canon เดิม

### 4.2 Dual-Track System ✅ (Canon Locked v1.3)

| Track | Field | พฤติกรรม | บทบาท |
|---|---|---|---|
| **Career PS** | `performance_score` (มีอยู่แล้ว — ใช้เป็น lifetime) | สะสมตลอดชีพ **ไม่รีเซ็ตทุกกรณี** | สถิติเกียรติประวัติตั้งแต่เริ่มเล่น (แสดงโชว์ ไม่ใช้แข่งขัน) |
| **Season PS** | `ps_season` (column ใหม่) | รีเซ็ตเป็น 0 ตามรอบ tournament/season | **เกณฑ์แข่งขันทั้งหมด** — Ascendant Star, leaderboard, tournament seeding |

**กติกา:**
- ทุกครั้งที่ award PS → บวกค่าเดียวกันเข้า**ทั้งสอง fields พร้อมกัน**
- เกณฑ์แข่งขันอิง `ps_season` เสมอ — เหตุผล: ถ้าใช้ lifetime ผู้เล่นเก่าได้เปรียบถาวร ผู้เล่นใหม่ไล่ไม่ทัน
- **Pre-Season:** `ps_season` เริ่มนับตั้งแต่ launch (ต.ค. 2026) — **รีเซ็ตครั้งแรกตอนเปิด S1 Classic (ม.ค. 2027)** ตาม SeasonTournament Plan
- Reset ช่วงแรกใช้ **manual SQL script** (season infrastructure เต็มระบบยังไม่จำเป็น — tournament แรกปลายปี 2027)
- ⚠️ **กฎเหล็กก่อน reset:** ต้อง archive ค่า `ps_season` ของทุกคนก่อนเสมอ (dump ลงตาราง archive หรือ export) — ห้ามรัน reset โดยไม่ archive

### 4.3 การแสดงผล

- PS แสดงใน **Profile screen เฉพาะผู้เล่นที่ถึง Tier A+ แล้ว**
- ผู้เล่นต่ำกว่า A+ ไม่เห็น field นี้เลย → เป็น "ของใหม่" ที่ปลดล็อคเมื่อไต่ถึง A+
- แสดง 2 ค่า: **"Season PS"** (ตัวใหญ่ เด่น) + **"Career PS"** (ตัวเล็ก ใต้กัน) — font JetBrains Mono
- เกณฑ์คัดเลือก Ascendant Star ใช้ Season PS → โปร่งใสต่อผู้เล่น

---

## 5. Ascendant Gate — Monarch Slayer Prerequisite ✅ (ปรับ Canon — ทับ MasterPlan §5)

> **การเปลี่ยนแปลงสำคัญ:** เพิ่ม "เคยชนะ Monarch อย่างน้อย 1 ครั้งตลอดชีพ" เป็นเงื่อนไข**เข้า** Ascendant Tier

### 5.1 เงื่อนไขเข้า Ascendant (ฉบับใหม่)

| เงื่อนไข | เดิม (MasterPlan §5) | ใหม่ (Spec v1.1) |
|---|---|---|
| Token สะสม | 600,000–999,999 | 600,000–999,999 (คงเดิม) |
| ผ่าน Tier A+ | ✅ | ✅ (คงเดิม) |
| **Monarch Slayer badge** | — | **ต้องมี (`monarch_victories ≥ 1`) ก่อนเริ่มนับหน้าต่าง 30 วัน** |
| ความถี่ | ครั้งเดียวต่อ account | ครั้งเดียวต่อ account (คงเดิม) |
| เลื่อน Tier S | Token ≥ 1M ใน 30 วัน | Token ≥ 1M ใน 30 วัน (คงเดิม) |

### 5.2 เหตุผลเชิง Design

- **วัดฝีมือ ไม่ใช่แค่ความขยัน:** เกณฑ์ token ล้วนวัดเวลา+ความขยัน การเพิ่ม Monarch ทำให้ทุกคนที่ขึ้น Tier S ผ่านบททดสอบฝีมือมาแล้วจริง → คุณภาพผู้เล่นใน Arena สูงขึ้น
- **ไม่มี RNG ในหน้าต่าง 30 วัน:** badge ต้องได้**ก่อน**เข้า Ascendant → ไม่มีเคสหลุด Ascendant เพราะสุ่มไม่เจอ/ไม่ชนะ Monarch ในเวลาจำกัด ภายในหน้าต่างเหลือแต่การสะสม token ล้วนๆ ตาม canon เดิม
- **Player Journey สมบูรณ์:** พิชิต Four Gods → พิชิต Monarch → Ascendant → Arena — ทุกก้าวมีบททดสอบชัดเจน ล้อกับโครงสร้าง Arena (ชนะ Last Boss AI → AI Slayer)
- **ปกป้อง funnel ของ App 2:** ผู้เล่นที่ถึงระดับนี้คือลูกค้ามูลค่าสูงสุดของ Arena — ระบบนี้ไม่สร้างเคสถูกล็อคออกจาก Arena ถาวรด้วยเหตุผลเชิงโชค

### 5.3 UX Requirement

- ผู้เล่นที่ token ถึง 600k แต่**ยังไม่มี** badge ต้องเห็นข้อความบอกชัดเจน (UI ภาษาอังกฤษ):
  > *"Defeat the Monarch to unlock Ascendant"*
- แสดงในจุดที่ผู้เล่นคาดหวังการเลื่อนระดับ เช่น Profile / Tier progression screen

---

## 6. Database Changes (SQL — รัน Supabase Dashboard เอง)

```sql
-- Monarch Spawn & Reward System + Dual-Track PS v1.3
-- ตาราง public.users (query ด้วย user_id เสมอ)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS monarch_pity_counter integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_encounters   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_victories    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ps_season            integer NOT NULL DEFAULT 0;

-- performance_score (int, default 0) มีอยู่แล้วตาม MasterPlan §10 → ใช้เป็น Career PS (lifetime)
-- ไม่ rename เพื่อลด migration risk — ความหมายกำกับด้วย COMMENT แทน

COMMENT ON COLUMN public.users.monarch_pity_counter IS 'จำนวนเกม High Noble ต่อเนื่องที่ไม่เจอ Monarch — reset เป็น 0 ทันทีที่เจอ';
COMMENT ON COLUMN public.users.monarch_encounters   IS 'จำนวนครั้งที่เจอ Monarch ทั้งหมด (แพ้+ชนะ)';
COMMENT ON COLUMN public.users.monarch_victories    IS 'จำนวนครั้งที่ชนะ Monarch — ใช้แสดง Badge Monarch Slayer (>=1) และเป็นเงื่อนไขเข้า Ascendant';
COMMENT ON COLUMN public.users.performance_score    IS 'Career PS (lifetime) — สะสมตลอดชีพ ห้ามรีเซ็ตทุกกรณี';
COMMENT ON COLUMN public.users.ps_season            IS 'Season PS — เกณฑ์แข่งขันทั้งหมด รีเซ็ตตามรอบ tournament (ต้อง archive ก่อน reset เสมอ)';
```

---

## 7. Implementation Checklist (Server-side)

| # | งาน | ไฟล์/จุด |
|---|---|---|
| 1 | Boss selection: weighted random + pity logic (max ของโต๊ะ) | boss selection function ใน socket handler High Noble |
| 2 | Increment `monarch_pity_counter` ทุกเกมที่ไม่เจอ / reset เมื่อเจอ + `monarch_encounters +1` | จบ boss selection |
| 3 | Payout: ตรวจ boss=Monarch และผู้ชนะ → Pot ×2 (house mint) + `monarch_victories +1` | settlement logic |
| 4 | PS award ตามตาราง §4.1 ทุกเกม A+/Ascendant — **บวกทั้ง `performance_score` (Career) + `ps_season` พร้อมกัน** | settlement logic |
| 5 | Profile screen: แสดง **Season PS (เด่น) + Career PS (รอง)** (เฉพาะ tier ≥ A+) + Badge "Monarch Slayer" | `profile` screen (client) |
| 6 | **Ascendant entry check: token 600k-999k + ผ่าน A+ + `monarch_victories ≥ 1`** | tier promotion logic (server) |
| 7 | **UX: ข้อความ "Defeat the Monarch to unlock Ascendant" เมื่อขาดเงื่อนไข badge** | Profile / Tier progression screen (client) |
| 8 | UI labels ภาษาอังกฤษทั้งหมด / code comments ภาษาไทย | ทุกไฟล์ |

---

## 8. Future (ไม่อยู่ใน MVP — content update หลัง launch)

- **Omen System:** สัญญาณลึกลับก่อน Monarch spawn 1-2 เกม (*"A shadow watches this table..."*)
- **Grand Entrance:** intro sequence พิเศษ (screen dim, sound sting, slow avatar reveal)
- **Monarch Hour:** event รายสัปดาห์ spawn rate 3%→10% (config ใน `gameConfig.ts`) — retention hook ล้อกับ Last Boss AI พุธ/เสาร์ของ Arena
- **Monarch's Trial (Summon):** ปุ่ม Summon Monarch สำหรับผู้เล่นช่วง Ascendant ที่ยังไม่มี badge — การันตีเจอทันที (จำกัดจำนวนครั้ง + ค่าธรรมเนียม token, ระวังช่องทาง farm Pot ×2) — *หมายเหตุ: ด้วย Ascendant Gate ใน §5 ที่บังคับ badge ก่อนเข้า เคสนี้จะไม่เกิดใน flow ปกติ เก็บไว้เผื่อปรับ gate ในอนาคต*
- **Season Infrastructure (เพิ่มก่อน tournament แรก 1-2 เดือน):** ตาราง `seasons` + `ps_season_records` (archive อัตโนมัติ), scheduled reset job, Season Leaderboard screen, ประวัติ Best Season ใน Profile — ตาม timeline หลัก SeasonTournament Plan (Supabase เพิ่ม table ใหม่ไม่กระทบของเดิม)
- โครงสร้าง v1.3 รองรับการต่อยอดทั้งหมดโดยไม่ต้องรื้อ

---

*End of Spec — TriplePoker_Monarch_Spec_v1_3*
