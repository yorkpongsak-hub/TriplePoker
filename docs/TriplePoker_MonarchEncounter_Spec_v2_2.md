# TriplePoker — Monarch Encounter Spec v2.2 (rev.2)

**The Sage Unicorn Studio Co., Ltd.**
**Founder & Chief Architect:** Assistant Professor Pongnathee Maneekul
**Updated:** July 30, 2026 (rev.3 — Batch 1→3A เสร็จ + แก้ 3 assumption ผิด, ดู Changelog ท้ายไฟล์)
**สถานะ:** ฉบับ canon — **แทนที่ `TriplePoker_Monarch_Spec_v2_1.md` และ `TriplePoker_CanonBridge_Monarch_v1_2.md` ทั้งฉบับ**
**อ้างอิงพื้นฐาน:** Phase 1 Audit (2026-07-30) · commit `088f645` · Narrative_MVP v1.0 §3 · CoreRules v1.3

> **เจตนาของเอกสารนี้:** ยกระดับแมตช์ Monarch จาก "บอสลับที่หายาก"
> ให้กลายเป็น **Special Event ระดับตำนาน** ที่ชุมชนพูดถึง โดยใช้
> Overlay + Sound + Timing เป็นหลัก **ไม่ทำ Cinematic** และ
> **ไม่แตะ state machine ที่ทำงานได้แล้ว**

---

## 1. Canon Locked — 2026-07-30 (ห้ามเปลี่ยนโดยไม่ออก v2.3)

| # | ประเด็น | มติ |
|---|---|---|
| 1 | โครงโต๊ะ | **1 Human + 2 Minion + Monarch** — คง `MonarchSeat` tuple 4 ช่อง **ห้ามรื้อ** |
| 2 | Flow | **Keep-Shape** — G1 auto-reveal → G2 → Grand Finale (Call/Fold ที่ G3) **ห้ามแตะ state machine** |
| 3 | Community Cards | **2-2-0** (G3 ไม่มีไพ่กองกลาง) — ทำสำเร็จแล้ว ไม่ต้องแก้ |
| 4 | จำนวนรอบ | **Sudden-death 1 รอบ** — ไม่มีรอบสองให้แก้ตัว |
| 5 | เกณฑ์ชนะ Monarch | **net token สุทธิ > 0** (ไม่ใช่ผู้ชนะ G3, ไม่ใช่จำนวนกองที่ชนะ) |
| 6 | Arrangement timer | **40 วินาที** (server-authoritative deadline) |
| 7 | ปุ่มช่วยจัดไพ่ | **ไม่มีทั้งสิ้น** — ลบ `Auto Arrange & Submit` ทิ้ง / ไม่มี Auto Sort |
| 8 | หมดเวลา | **Auto-seal ตามสภาพที่จัดค้างไว้** — ห้าม server ช่วยจัด |
| 9 | Foul | **Seal ได้ แต่แพ้ทันที** — **ไม่มีตัวช่วย/คำเตือน foul ใดๆ ใช้ฝีมือล้วน** (rev.2) |
| 10 | Royal Hour | **เสาร์ 20:00–20:59:59 Asia/Bangkok — spawn ×2** (hardcode ใน `gameConfig`) |
| 11 | การเปิดเผยอัตรา | **ห้ามส่ง rate / multiplier / สถานะ Royal Hour ไปที่ client เด็ดขาด** |
| 12 | ขอบเขต Dev | **Full System** (4 Batch ตาม §17) |

---

## 2. สถาปัตยกรรมปัจจุบัน (ยืนยันจาก Audit)

| ไฟล์ | บรรทัด | บทบาท |
|---|---|---|
| `server/src/game/monarchEngine.ts` | 793 | เอนจินหลักของแมตช์ Monarch (แยกจาก High Noble ทั้งก้อน) |
| `client/app/game/monarch/index.tsx` | 918 | หน้าจอโต๊ะ Monarch |
| `server/src/sockets/gameSocket.ts` | 589-608 | จุด roll + redirect เข้าโต๊ะ Monarch (**เส้นทางเดียวที่ถูกต้อง**) |
| `server/src/game/monarchSpawn.ts` | 38-81 | `rollHighNobleBoss()` — **ต้องถอด Monarch ออกจาก pool** |
| `client/app/game/highNoble/index.tsx` | 57-101, 773-785 | `BOSS_INTRO['Monarch']` — **ต้องลบ (เส้นทางเก่า)** |
| `client/src/components/game/MonarchConquestBanner.tsx` | — | reuse ได้สำหรับ Judgment banner |
| `server/src/game/highNobleMultiEngine.ts` | 138 | `computeHNHumanPayout()` — reuse สำหรับ Pot×2 อยู่แล้ว |

**สิ่งที่ทำเสร็จแล้วและห้ามแก้ซ้ำ:** Community 2-2-0 · `hasRealStake` pot filter · Pot×2 reuse · Adaptive personality lock (`monarchEngine.ts:245-266`) · กล่อง `No Community Card` เส้นประของ G3

---

## 3. Blockers — ต้องแก้ก่อนแตะ UI ทุกอย่าง (Batch 1)

### 3.1 🔴 `spawnRateBase: 0.97` (`gameConfig.ts:362`)
ค่าเทสที่ลืมรีเซ็ต — ถ้าขึ้น Production ตามนี้ **Monarch จะเจอแทบทุกโต๊ะ = ตำนานพังในวันเดียว**

**แก้:** `spawnRateBase: 0.03` + สร้าง `getMonarchSpawnRate()` อ่านลำดับ:
1. `NODE_ENV !== 'production'` **และ** มี `process.env.MONARCH_TEST_RATE` → ใช้ค่านั้น (clamp 0–1) + `console.warn`
2. ไม่งั้น → `gameConfig.monarch.spawnRateBase`

> Production ต้องไม่มีทางอ่าน env นี้ได้เด็ดขาด — กันบั๊กซ้ำถาวร

### 3.2 🔴 สอง spawn system คู่ขนาน
`rollMonarchEntry()` (flat 3%) กับ `rollHighNobleBoss()` (มี pity, ยังถูกเรียกจาก `roomRegistry.ts:391,639`) ทำให้ผู้เล่นเจอ "Monarch" ได้ **2 แบบ คนละกติกา คนละหน้าจอ**

**แก้:** ถอด `Monarch` ออกจาก pool ของ `rollHighNobleBoss` (normalize Four Gods เป็น 100%) + ลบ `BOSS_INTRO['Monarch']` → **เหลือเส้นทางเดียว: `gameSocket.ts:589-608`**

### 3.3 🔴 Pity counter หายไปพร้อมข้อ 3.2 — ร้ายที่สุด
`rollMonarchEntry` เป็น flat 3% ไม่มี pity แต่ **Monarch Slayer badge เป็น prerequisite ของ Ascendant** → ผู้เล่นดวงไม่ดีอาจไม่เจอเป็นร้อยแมตช์ = **ตันถาวร ขึ้น Ascendant ไม่ได้**

**แก้:**
- ย้าย pity มาที่ `rollMonarchEntry()` ผูกกับ `user_id` ของผู้เล่นเอง (ไม่ใช่ Seat 1 อีกต่อไป)
- guarantee spawn เมื่อเล่น High Noble ครบ **30 แมตช์** นับจากครั้งล่าสุดที่เจอ Monarch
- **Royal Hour คูณเฉพาะ base rate — ห้ามคูณหรือข้าม pity**

---

## 4. Spawn & Royal Hour

```ts
// server/src/config/gameConfig.ts
// ⚠️ namespace จริงในโค้ดคือ monarchConfig (ยืนยัน Batch 1) ห้าม rename
monarchConfig: {
  spawnRateBase: 0.03,
  pityThreshold: 30,          // แมตช์ High Noble นับจากครั้งล่าสุดที่เจอ
  potMultiplier: 2.0,         // มีอยู่แล้ว gameConfig.ts:365
  arrangementSeconds: 40,
  reconnectGraceSeconds: 20,
  royalHour: {
    enabled: true,
    dayOfWeek: 6,             // 0=Sun ... 6=Sat
    startHour: 20,            // 20:00:00
    endHour: 21,              // exclusive → จบ 20:59:59
    multiplier: 2.0,          // 3% → 6%
    timezone: 'Asia/Bangkok',
  },
}
```

**กฎบังคับ:**
- `isRoyalHour(now?: Date)` คำนวณ Asia/Bangkok เอง **ห้ามพึ่ง TZ ของเครื่อง server**
- **fail-open:** ถ้าคำนวณเวลา throw → ใช้ base rate ปกติ ห้าม crash ห้ามคูณ
- **ห้ามส่งสถานะ Royal Hour ไป client ในทุก payload**
- server log 1 บรรทัดเมื่อ spawn เกิดใน Royal Hour (สำหรับ tuning ภายหลัง)

**Lobby teaser (ช่วง Royal Hour เท่านั้น):** มงกุฎเรืองแสงบนปุ่ม High Noble + ข้อความ `The court is in session` — **ไม่มีตัวเลข ไม่มีคำว่า rate / chance / ×2**

> **Compliance:** Monarch encounter ไม่ใช่ paid random item จึงไม่เข้าข่ายกฎเปิดเผยอัตราของ Google Play
> ⚠️ **ถ้าอนาคตขาย "Royal Summon" ด้วย Crown Package จะเข้าข่ายทันที** — ต้องเปิดเผยอัตราตามกฎ

---

## 5. Match Structure (Keep-Shape)

```
Decoy Matchmaking (§12)
   ↓
Fake Four Gods Boss Intro → สะดุดค้าง → Monarch Arrival (§6)
   ↓
Arrangement 40s — 3-phase pressure (§7) → SEAL THE HAND (§8)
   ↓
G1 auto-reveal   → Crown เล็ก   (Community 2 ใบ)
   ↓
G2 reveal        → Crown กลาง   (Community 2 ใบ)
   ↓
[ จอมืด + เสียงเงียบ 0.8s ]
   ↓
G3 Grand Finale — Call/Fold → Crown ใหญ่ `THE DECIDING PILE`
   ↓
Net Token Settlement → Judgment (§9) → Royal Relic / Aftermath (§10)
```

**เหตุผลที่คง Grand Finale:** เป็น "อึ้งสุดท้าย" ที่ทรงพลังกว่าการตัดออก และทำให้ Crown Ledger สะสมความกดดันได้ตลอดแมตช์ แทนที่จะเฉลยทีเดียวตอนจบ

---

## 6. Monarch Arrival (ข้อ 1)

| Step | เวลา | รายละเอียด |
|---|---|---|
| 1. Fake-out | ~2.0s | Boss Intro ของ Four Gods กำลังจะขึ้นตามปกติ → **สะดุดค้าง** → ambient ตัดเงียบสนิท → จอมืดวูบ → haptic รัวเบา |
| 2. Arrival | ~2.5s | จอ wash ทองเข้ม (`#FFC857` 12% opacity) + vignette, มงกุฎประกอบขึ้นจากเส้นทอง |
| 3. Text (Cinzel) | ไล่บรรทัด | `A shadow falls over the table...` → `THE MONARCH HAS ARRIVED` (haptic หนัก 1 ครั้ง) → `One round. One chance.` → `Defeat the Monarch to claim a Royal Relic.` |
| 4. CTA | — | ปุ่ม `Face the Monarch` — ไม่มีปุ่มปฏิเสธ |
| 5. Dialogue | เจอครั้งแรกเท่านั้น | *"I have waited years for one stronger than me. What I fear... is the day that one truly arrives."* |

**Fake Memory (⚠️ เลื่อน — rev.3):** เดิม spec อ้างว่า `PlayerStoryState`/`lastMonarchResult`/`lastMonarchFoldCount` "มีอยู่แล้ว" — **audit Batch 3 ยืนยันว่าไม่มีในโค้ดเลย** (grep ว่าง) → **ตัดจาก MVP** Arrival ใช้ dialogue คงที่ก่อน เติม Fake Memory ทีหลังพร้อมสร้าง `PlayerStoryState` (DB column ใหม่ + เก็บผลทุกแมตช์) ซึ่งเป็นระบบที่ narrative ทั้งเกมจะใช้ร่วม ไม่ควรผูกกับ Monarch batch เดียว

**⚠️ ห้าม:** broadcast ให้ผู้เล่นอื่นเห็นว่ามีคนเจอ Monarch (กัน reverse-engineer pity) — ปล่อยข่าวลือทำงานเอง

---

## 7. Arrangement Pressure — 40s / 3 Phase (ข้อ 3, 4, 6, 9)

| Phase | ช่วงเวลา | ภาพ | เสียง |
|---|---|---|---|
| **Calm** | 40–21s | Timer ทอง `#FFD76A` ขนาดปกติ | ambient drone เบา |
| **Tension** | 20–11s | Timer scale ×1.1, ขอบจอค่อยมืด (vignette 0 → 0.35) | heartbeat loop เริ่ม |
| **Critical** | 10–0s | นับทีละวินาที, ไพ่ที่ยังไม่วาง**เรืองแสง** `#FFD76A`, vignette 0.35 → 0.55 | tick ชัดขึ้นทุกวินาที |
| **Final** | 3–0s | Timer เป็น `#FF6B6B` | Crown Strike (ระฆัง) 1 ครั้ง |

**ห้ามสั่นจอแรง** — รบกวนการจัดไพ่ ใช้เสียงและแสงกดดันแทน (haptic เบาได้เฉพาะ 3 วิสุดท้าย)

**Monarch นิ่งสนิท (ข้อ 3):** เมื่อ `isMonarch === true` ต้อง **ปิดทั้งหมด** — reaction animation, emotion indicator, thinking bubble, confidence tell, เสียงถอนหายใจ Portrait มองตรง แทบไม่ขยับ (idle breathing ≤ 2% scale)

> ความนิ่งกดดันกว่าท่าข่มขู่ เพราะผู้เล่นอ่านอะไรไม่ได้เลย

**Sealed Signal (ข้อ 6):** ที่ `t = 8–12s` (สุ่ม) แสดง `The Monarch has sealed his hand.` แล้ว Portrait นั่งรอเฉยๆ — ทั้งที่ AI คำนวณเสร็จตั้งแต่เสี้ยววินาทีแรก

**Royal Silence (ข้อ 9):** ช่วง Critical แสดงข้อความ **ครั้งเดียวเท่านั้น** สุ่ม 1 จาก:
- `"Do not rush."`
- `"Your weakest pile will betray you."`
- `"You have seen only part of the game."`
- `"Choose carefully. This moment will not return."`

> ทั้งหมดเป็น Psychological Attack ล้วน **ห้ามให้ข้อมูลจริงเกี่ยวกับมือ Monarch**

---

## 8. SEAL THE HAND (ข้อ 5)

### 8.1 พฤติกรรม
- จัดไพ่ครบ **ไม่ล็อกอัตโนมัติ** — ผู้เล่นต้องกด `SEAL THE HAND` เอง
- กดแล้ว: ไพ่ปิดผนึก · ห้ามแก้ไข · ตรา Monarch ประทับลงบนโต๊ะ · SFX ตราประทับ + haptic หนัก 1 ครั้ง
- **หมดเวลา → auto-seal ตามสภาพที่จัดค้างไว้** (ห้ามใช้ `monarchFirstValidArrangement` ช่วยจัด)

> เสี้ยววินาทีที่ต้องตัดสินใจกดเอง สร้างความลังเลมากกว่าปล่อยหมดเวลา

### 8.2 Foul = แพ้ทันที
แก้ `submitMonarchArrangement` (`monarchEngine.ts:376-393`) จาก "ตีกลับให้แก้" → **"รับ submit เสมอ แต่ mark `isFoul` และผู้เล่นแพ้ทั้งแมตช์"**

### 8.3 No Foul Assist — ใช้ฝีมือล้วน (rev.2 — canon เปลี่ยน 2026-07-30)
**มติเดิม (Visual Guard ขอบแดง + `SEAL (FOUL)`) ถูกยกเลิกทั้งหมด**
- ไม่มีการตรวจ foul realtime ฝั่ง client · ไม่มีขอบแดง · ไม่มี micro-text เตือน
- ปุ่มคงชื่อ `SEAL THE HAND` เดียวเสมอ ไม่มี variant
- ไม่พอร์ต `handEvaluator` มา client · ไม่แตะ `PlayerHandView`
- server ยังตัดสิน foul = แพ้ตามเดิม (Batch 1) — client ไม่รู้ล่วงหน้า

> **เหตุผล:** Monarch คือโหมดโหดสุด "ใช้ฝีมือล้วน" + audit ยืนยันว่าทุก Tier
> ไม่เคยมี realtime foul preview อยู่แล้ว การไม่ช่วยจึงคือสภาพเดิม ไม่ใช่การถอดของ
> **ชดเชยด้วย §9.3:** ตอนแพ้ต้องบอกเหตุผล foul ให้ชัด (อธิบายหลังจบ ≠ ช่วยตอนเล่น)

---

## 9. Judgment — Weighted Crown + Net Token (ข้อ 7, 8, 11, 12)

### 9.1 Crown Ledger (HUD ถาวร มุมบนกลาง)
| กอง | สัญลักษณ์ | ป้าย |
|---|---|---|
| G1 | มงกุฎเล็ก | — |
| G2 | มงกุฎกลาง | — |
| G3 | **มงกุฎใหญ่ + รัศมีทอง** | `THE DECIDING PILE` |

แสดงเพียง `You` / `Monarch` + Crown ต่อกองที่ชนะ — **ซ่อน net token จนจบแมตช์**

> **Crown เป็น visual weight เท่านั้น ไม่ใช่กติกา** — Weighted Crown แก้ปัญหาผู้เล่น "เห็น Crown 2-1 แต่ผลออกว่าแพ้" ให้รู้สึกยุติธรรมโดยไม่ต้องโชว์ตัวเลขระหว่างเกม

### 9.2 จังหวะ Reveal
```
G1 reveal → pause 1.0s → G2 reveal → pause 1.5s
   → จอมืด + เสียงเงียบ 0.8s → G3 Grand Finale (จังหวะตัดสิน)
```

### 9.3 ถ้าแพ้ (ข้อ 11)
- แสดงมือ Monarch **เฉพาะกองที่จำเป็นต่อการตัดสิน** ไพ่ส่วนที่เหลือกลับด้าน
- ข้อความ: `You were not ready to see the full hand.`
- **แต่ต้องแสดง net token breakdown ให้ครบ** (ได้/เสียต่อกอง + Rake) เพื่อยืนยันว่าตัดสินอย่างยุติธรรม — ความลึกลับอยู่ที่ *ไพ่* ไม่ใช่ที่ *ตัวเลข*
- **กรณีแพ้เพราะ Foul (rev.2 — บังคับ):** ต้องขึ้นเหตุผลชัดเจน `FOUL — piles out of order` แทน breakdown ปกติ
  เพราะ sudden-death 1 รอบ + ไม่มีตัวช่วย foul → ถ้าแพ้แบบไม่รู้สาเหตุ ผู้เล่นจะเข้าใจว่าโดนโกง
  (นี่คือการอธิบาย *หลังจบ* ไม่ใช่การช่วย *ตอนเล่น* — ไม่ขัด §8.3)

### 9.4 ถ้าชนะ (ข้อ 12)
```
คำนวณเสร็จ → เงียบ 1.5s (Monarch มองไพ่ ไม่มี Victory ขึ้น)
   → Monarch: "So... you are the one."
   → ระเบิดแสงทอง #FFD76A + haptic หนัก
   → Royal Relic reveal (§10)
   → MonarchConquestBanner
```
**ห้ามขึ้น Victory ทันที** — การหน่วงก่อนเฉลยคือหัวใจของโมเมนต์นี้

---

## 10. Reward — Royal Relic (ข้อ 10)

**ก่อนแมตช์แสดงเพียง:** `Defeat the Monarch to claim a Royal Relic.` — ไม่บอกว่าได้อะไร

| กรณี | รางวัล |
|---|---|
| ชนะครั้งแรกในชีวิต | **The Blank Crest** (`"A crest belonging to no rank."`) — canon lore, guaranteed + Monarch Slayer badge |
| ชนะครั้งถัดไป | สุ่มจาก Relic Pool 5 ชิ้น (ไม่ซ้ำก่อนวนใหม่) |
| เก็บครบทุกชิ้น (6) | **Token bonus 5,000** (recurring — ทุกครั้งที่ชนะหลังเก็บครบ, `monarchConfig.relicCompleteBonus` ปรับได้) |
| ชนะ (net > 0) | Pot ×2 (`computeHNHumanPayout()` เดิม) + `monarchEncounterCount` +1 |

**Relic Pool MVP (ยืนยัน 2026-07-30):**
| # | ชื่อ | ประเภท | ได้เมื่อ |
|---|---|---|---|
| 0 | The Blank Crest | avatar crest | guaranteed ครั้งแรก |
| 1 | Refused Crown | card frame | สุ่ม |
| 2 | The Zero Mark | card frame | สุ่ม |
| 3 | Monarch's Witness | title | สุ่ม |
| 4 | The Unbowed | title | สุ่ม |
| 5 | Faceless Joker | avatar crest | สุ่ม |

**⚠️ ความจริงของระบบ (audit Batch 3 — rev.3):** โปรเจค **ไม่มีระบบ earned-collection เลย** — `avatarPresets.ts` เป็น VIP-gate (ปลดตามสถานะ VIP) คนละโมเดล → Royal Relic ต้อง**สร้างระบบใหม่** ใน Batch 3D:
- relic = **id + label + lore text ล้วน** (ไม่ต้อง asset ภาพในเฟสแรก — cosmetic ยังไม่มีผลต่อเกมตาม MVP)
- ที่เก็บ: column ใหม่ `users.monarch_relics jsonb NOT NULL DEFAULT '[]'` (array ของ relic id) — เช็ค `.includes(id)` ก่อน drop กันซ้ำ
- reveal popup: สร้างใหม่ pattern เดียวกับ `TierUnlockOverlay.tsx` (Reanimated v4, ไม่มี Lottie)
- **lore_fragment เลื่อน** — reader (`NarrativeLite type:'fragment'`) ที่ spec เคยอ้างว่า "มีอยู่แล้ว" **ไม่มีในโค้ด** ต้องสร้างก่อนจึงเติม lore fragment ได้ (content ล็อตหลัง)
- type ออกแบบเผื่อ: `RelicType = 'card_frame' | 'avatar_crest' | 'title' | 'lore_fragment'`

**เกณฑ์ "ชนะ Monarch" — มาตรฐานเดียวในระบบ (rev.2 canon):**
`netDelta > 0` (คำนวณ **ก่อน** apply Pot×2) เกต **ทั้ง** badge และ Pot×2 — ห้ามมี 2 นิยาม
ลำดับบังคับใน settlement (Batch 1.5 ใส่ comment กำกับ):
1. คำนวณ net จากผล G1/G2/G3 ตามปกติ
2. `isHumanWinner = netDelta > 0`
3. ถ้าชนะ → apply Pot×2 (ครั้งเดียว ห้าม double-count)
4. ถ้าชนะ → Monarch Slayer badge + `monarchDefeatCount` +1

| ผล | badge | Pot×2 |
|---|---|---|
| `netDelta > 0` (แม้แพ้ G3) | ✅ | ✅ |
| `netDelta === 0` | ❌ | ❌ |
| `netDelta < 0` (แม้ชนะ G3) | ❌ | ❌ |
| Foul | ❌ | ❌ |

**Disconnect (rev.2 — กันฟาร์ม badge):**
- หลุด **ก่อน** Seal → auto-seal → `monarchEncounterCount` +1 เท่านั้น (**ไม่ได้ badge**)
- หลุด **หลัง** Seal (ไพ่ผนึกแล้ว ผลไม่เปลี่ยนจากการหลุด) และไม่ถูก auto-fold ที่ G3 → **ได้ badge ถ้า net > 0**
- แยก 2 กรณีด้วย flag `sealedByPlayer` (Batch 1.5)

---

## 11. Royal Challenge Lock (ข้อ 2)

| เหตุการณ์ | ผล |
|---|---|
| กดออก / ยอมแพ้ | **แพ้ทันที** — มี confirm dialog: `Leaving now counts as a defeat. The Monarch does not grant second chances.` |
| เน็ตหลุด | grace **20 วินาที** — HUD `Royal Challenge Locked · Reconnecting (Ns)` |
| กลับมาทัน | เล่นต่อจากจุดเดิม (timer เดินต่อ ไม่หยุด ไม่ต่อเวลา) |
| ไม่กลับมา (ก่อน Seal) | **auto-seal ตามสภาพ** → ถ้า foul = แพ้ · **ไม่ได้ badge** |
| หลุดหลัง Seal แล้ว | **resolve G3 ให้จบเสมอ ห้าม freeze** · settle ปกติ · **ได้ badge ถ้า net > 0** |

**เคสกลาง — หลุดระหว่าง Grand Finale (rev.2 canon — commit-based, ค้นพบ Batch 1.5):**
เดิม `settleAndEndMonarchMatch` หยิบ `tokenBalance` ดิบโดยไม่ resolve → **เงินที่ human กด Call ไปแล้วค้างกลางทาง ไม่มีใครได้ pot** (แก้แล้ว Batch 1.5)
- human **กด Call ไปแล้ว** → resolve G3 เต็ม (Boss AI ตัดสินใจแทนตามไพ่ผนึก)
- human **ยังไม่กด Call/Fold** → default = **Fold** (ไม่บังคับจ่ายเพิ่ม)
- ทั้ง 2 กรณี settle ผ่าน `computeHNHumanPayout` ปกติ → badge ถ้า net > 0
- ไพ่ผนึกแล้ว disconnect ไม่ช่วยหนีผล = กันโกงในตัว

**⚠️ ห้าม AI จัดไพ่แทนผู้เล่นเด็ดขาด** — ทำลายความรู้สึก "ต้องชนะด้วยตัวเอง"

**Grace scope (rev.3 canon — เคาะ 2026-07-30 หลัง audit 3E):**
audit ไล่ทุก phase พบว่า grace 20s ที่ต้องสร้างใหม่มี**เฉพาะ `grand_finale` turn=human** (จุดเดียวที่เกมรอผู้เล่นตัดสินใจจริง):
| Phase | grace? | พฤติกรรม |
|---|---|---|
| arrangement | ❌ คงเดิม | หลุด = **คืนเงินทันที** (ปลอดภัย ยังไม่มีเดิมพัน — มติลุงเยาะ ไม่เปลี่ยน risk profile) |
| g1/g2_reveal | ❌ | chain เดินเอง — หลุดไม่กระทบผล ต้องการแค่ **state hydration** ให้ reconnect เห็นภาพ |
| grand_finale turn=human | ✅ **20s** | จุดเดียวที่รอ human — เดิม Fold ทันที เปลี่ยนเป็น grace 20s กลับมาทัน=เล่นต่อ / ไม่ทัน=Fold |
| grand_finale turn=boss | ❌ | Boss คิดเอง (2.5s) ไม่รอ human |

> **หลักการสำคัญ:** ต้องแยก field **`disconnectedAt`/`graceTimer` ใหม่** ออกจาก `humanDisconnected` เดิม — ไม่ reuse ตัวเดิมสื่อความหมายคู่ (หลุดแล้วรอ vs หลุดแล้ว resolve) มิฉะนั้น commit-based logic §11 ที่ 1.5 วางไว้จะสับสน

**Snapshot reconnect:** `buildMonarchRoundSnapshot` ปัจจุบันส่งแค่ arrangement data → reconnect ระหว่าง reveal/GF **client ค้างจอ** ต้องเขียน snapshot เต็ม (reveal history + GF state) โดยใช้ §6.16/HN เป็นต้นแบบ (import ตรงไม่ได้ คนละ type)

> **สถานะ:** resolve logic (ไม่ freeze) + เคสกลาง commit-based เสร็จ Batch 1.5 —
> ใช้ in-memory flag `humanDisconnected` + reuse `state.phase`/`grandFinale.turn` (ไม่มี DB column, ไม่มี SQL)
> **ยังเหลือ Batch 3:** grace window 20s ฝั่ง client + HUD `Royal Challenge Locked`

---

## 12. Decoy Matchmaking (ใหม่ — แก้ Spoiler Leak)

**ปัญหา:** ปัจจุบัน `monarch_encounter` redirect ทันที (`lobby.tsx:226-230`) → ผู้เล่นรู้ตัวจาก **ความเร็วในการเข้าเกม** → พัง Fake-out ทั้งหมด และชุมชนจะจับ pattern ได้ใน 2 สัปดาห์

**แก้:** เมื่อ `rollMonarchEntry()` ติด → **ยังแสดง `Finding players... 1/3` ปลอมต่อไป** โดย:
- สุ่มเวลารอ **8–20 วินาที** (ต้องอยู่ในช่วงเดียวกับ matchmaking จริงเฉลี่ย)
- fake avatar ทยอยเข้า 1/3 → 2/3 → 3/3
- **ชื่อ fake avatar ต้องมาจาก bot name pool** ตาม BotNaming Spec v1.0 + ผ่าน `nameValidator` (ห้ามใช้ชื่อผู้เล่นจริง — privacy, ห้ามชนชื่อ graveyard/reserved)
- ครบ 3/3 → Four Gods Boss Intro กำลังจะขึ้น → **สะดุดค้าง** → §6 Arrival

> ต้นทุน Dev แค่ overlay ปลอม + timer สุ่ม แต่ได้ Fake-out เต็มร้อย

**สถานะ (rev.3):** ✅ เสร็จ Batch 3A — decoy สุ่ม**ฝั่ง client ล้วน** (ไม่แตะ server payload), state แยกจาก queue จริงสนิท (`monarchDecoyActive`), fake names จาก `MINION_NAMES`, เวลา 8-20s, cleanup ครบ (cancel + unmount กัน timer leak)

---

## 13. Audio Layer

**Canon conflict:** `bgmService.ts:4` ระบุ "ในโต๊ะเกมทุก Tier ไม่มี BGM เด็ดขาด (SFX เท่านั้น)"

**มติ v2.2:** ใช้ **SFX layer** ทั้งหมด ไม่ผิด canon เดิม
| Layer | ชนิด | ใช้ที่ |
|---|---|---|
| ambient drone | SFX loop | Calm phase |
| heartbeat | SFX loop | Tension → Critical (เร่งขึ้นตาม phase) |
| tick | SFX one-shot | Critical ทุกวินาที |
| crown strike | SFX one-shot | 3 วิสุดท้าย |
| seal stamp | SFX one-shot | กด SEAL |
| silence cut | volume duck → 0 | Fake-out + ก่อน G3 |

ใช้ `bgmService.ts` เป็นต้นแบบโครงสร้าง fade/volume แต่**สร้าง `sfxLayerService` แยก** ห้ามยัดเข้า BGM manager

> ถ้าอนุมัติให้ Monarch เป็นข้อยกเว้นมี BGM จริง → ต้องออก v2.3 และแก้ comment ใน `bgmService.ts`

---

## 14. UI Text (English เท่านั้น — Beta canon)

| จุด | ข้อความ |
|---|---|
| Arrival 1 | `A shadow falls over the table...` |
| Arrival 2 | `THE MONARCH HAS ARRIVED` |
| Arrival 3 | `One round. One chance.` |
| Arrival 4 | `Defeat the Monarch to claim a Royal Relic.` |
| CTA | `Face the Monarch` |
| Sealed signal | `The Monarch has sealed his hand.` |
| ปุ่ม seal | `SEAL THE HAND` (ชื่อเดียวเสมอ — rev.2) |
| แพ้เพราะ foul | `FOUL — piles out of order` |
| Foul hint | `Foul hand — sealing will end the match.` |
| Lock HUD | `Royal Challenge Locked` |
| Reconnect | `Reconnecting (Ns)` |
| Leave confirm | `Leaving now counts as a defeat. The Monarch does not grant second chances.` |
| G3 label | `THE DECIDING PILE` |
| แพ้ | `You were not ready to see the full hand.` |
| ชนะ | `So... you are the one.` |
| Badge | `You are among the few who have slain the Monarch.` |
| Lobby teaser | `The court is in session` |

**Color:** BG `#0F2418`/`#163A25` · Gold `#FFD76A`/`#FFC857` · Red `#FF6B6B` · Text `#F5F2E8`/`#C8C4B0` · Border `#2A4A34`
**Fonts:** Cinzel (Arrival/Judgment) · Inter (UI) · JetBrains Mono (ตัวเลข timer/token)

---

## 15. เอกสารที่ต้องอัพเดตให้ตรง Spec นี้

| เอกสาร | จุดที่ขัด | แก้เป็น |
|---|---|---|
| `Monarch_Spec_v2_1.md` | ทั้งฉบับ | **แทนที่ด้วย v2.2 นี้** |
| `CanonBridge_Monarch_v1_2.md` | ทั้งฉบับ | **ยุบรวมเข้า v2.2 นี้** |
| `Narrative_MVP_v1_0` §3.0 | "3H + Monarch", Seat 1 trigger, reward per-player | 1H + 2 Minion + Monarch, pity ผูก user_id |
| `LobbyMatchmaking_Spec_v1_1` | ไม่มี Monarch private room | เพิ่ม §Monarch route + Decoy Matchmaking |
| `AutoSortFee_Spec_v2_0` | ไม่ระบุ Monarch | เพิ่ม: Monarch = **ไม่มีปุ่มช่วยจัดไพ่ทุกชนิด** |
| `Universe_MasterPlan_v1_1` §4.5.1 | Monarch เป็น 1 ใน 5 บอสของโต๊ะ High Noble | Monarch = แมตช์แยก ไม่อยู่ใน pool จตุรเทพ |

---

## 16. QA Checklist (เทสรวมทีเดียวตาม QA Policy)

- [ ] `spawnRateBase` = 0.03 ใน Production build (ตรวจก่อน release ทุกครั้ง)
- [ ] `MONARCH_TEST_RATE` ไม่มีผลเมื่อ `NODE_ENV=production`
- [ ] `rollHighNobleBoss()` ไม่คืน `Monarch` ได้อีกเลย
- [ ] เข้าโต๊ะ High Noble ปกติ 20 ครั้ง ไม่เจอ Monarch overlay เก่า
- [ ] pity ครบ 30 แมตช์ → guarantee spawn
- [ ] เวลา 20:00–20:59 เสาร์ (Asia/Bangkok) rate ×2 · 21:00 ตรง กลับเป็น base
- [ ] client payload ไม่มีคำว่า rate / multiplier / royalHour ทุก event
- [ ] Decoy: เวลาเข้าเกมของ Monarch อยู่ในช่วงเดียวกับแมตช์ปกติ (จับเวลา 10 ครั้ง)
- [ ] Foul → seal ได้ + แพ้ · ไม่มีขอบแดง/คำเตือนระหว่างเล่น (ใช้ฝีมือล้วน)
- [ ] แพ้เพราะ foul → Judgment ขึ้น `FOUL — piles out of order`
- [ ] หมดเวลา 40s ระหว่างจัดไพ่ค้าง → auto-seal ตามสภาพ ไม่มีการช่วยจัด
- [ ] เน็ตหลุด 15s → กลับมาเล่นต่อได้ / หลุด 25s → auto-seal
- [ ] netDelta > 0 → badge + Pot×2 · netDelta = 0 → ไม่ได้ทั้งคู่ · Pot×2 ไม่ double-count
- [ ] หลุดก่อน seal → ไม่ได้ badge · หลุดหลัง seal + net>0 → ได้ badge
- [ ] Crown Ledger 2-1 แต่ net ติดลบ → ผู้เล่นเห็น breakdown ครบ
- [ ] ไม่มี BGM ในโต๊ะ Monarch (SFX layer เท่านั้น)
- [ ] ไม่มี UI text ภาษาไทยหลงเหลือในไฟล์ที่แตะ

---

## 17. Dev Batch Plan

**ลำดับรัน:** 1 ✅ → 2 ✅ → 1.5 ✅ → 3A ✅ → 3B ✅ → 3C-1 ✅ → 3C-2 ✅ → 3D-1 ✅ → 3D-2 ✅ → 3E ✅ → 4 ✅ · **🎉 MONARCH ENCOUNTER v2.2 COMPLETE — ทุก batch เสร็จครบ**

| **4** | ✅ เสร็จ | `sfxLayerService` (แยกจาก `bgmService`, expo-audio, null-placeholder graceful) เสียบ 8 cue + `stopAll` cleanup · asset list 5 ไฟล์รอ Sound Designer | `sfxLayerService.ts` (ใหม่) `monarch/index.tsx` |

| Batch | สถานะ | เนื้อหา | ไฟล์หลัก |
|---|---|---|---|
| **1** | ✅ เสร็จ (296/296) | Blockers §3 · badge net token · ลบปุ่มช่วย · auto-seal · Royal Hour | `gameConfig.ts` `monarchEngine.ts` `monarchSpawn.ts` `highNoble/index.tsx` |
| **2** | ⏳ เกือบเสร็จ | Timer 3-phase · Royal Stillness · sealed signal · Royal Silence · SEAL THE HAND · audio hook stub · **[ค้าง] แก้ vignette เป็น edge gradient** | `monarch/index.tsx` |
| **1.5** | ✅ เสร็จ (308/308) | Quarantine (`highNobleMultiEngine.ts` + `monarchAI.ts`, guard ที่ caller) · dead code · flaky fix (`--runInBand`) · netDelta comment · boundary+disconnect test (12 ใหม่) · disconnect mid-GF commit-based | `highNobleMultiEngine.ts` `monarchEngine.ts` `monarchAI.ts` + test |
| **3A** | ✅ เสร็จ | Decoy Matchmaking (client-side) + SEAL stamp rollback | `lobby.tsx` `monarch/index.tsx` |
| **3B** | ✅ เสร็จ (~7.8s) | Arrival: fake Four Gods → stumble → crown assembly (reuse `crown_tier4` asset) → Monarch reveal → dialogue — dialogue คงที่ (ไม่มี Fake Memory) | `monarch/index.tsx` |
| **3C-1** | ✅ เสร็จ | แก้บั๊ก desync (`g3Winner`→`finalStack>buyIn`) · Weighted Crown reveal+pause · Crown Ledger HUD · ซ่อน Balance 4 จุด · net breakdown (client-diff) | `monarch/index.tsx` |
| **3C-2** | ✅ เสร็จ | server `foulReasons` เข้า `match_end` (additive จุดเดียว) + client `FOUL — piles out of order` · แพ้ปิดไพ่ Monarch (`revealCount` UI-only) · ชนะหน่วง 1.5s → "So... you are the one." | `monarchEngine.ts` `monarch/index.tsx` |
| **3D-1** | ✅ เสร็จ (301/301) | migration 012 (`monarch_relics jsonb`) · `MONARCH_RELICS` 6 ชิ้น · `rollAndRecordMonarchRelic()` (read pattern b, claim-first, recurring bonus 5,000) · `relicResult` เข้า payload | `monarchSpawn.ts` `monarchEngine.ts` `gameConfig.ts` + SQL |
| **3D-2** | ✅ เสร็จ | client `RoyalRelicReveal` (inline, pattern `TierUnlockOverlay`) เกาะ `onFinish` · Blank Crest sub-text · เก็บครบ = collection complete + token bonus · undefined guard ครบ | `monarch/index.tsx` |
| **3E** | ✅ เสร็จ | Royal Challenge Lock — grace 20s เฉพาะ GF turn=human (`disconnectedAt` แยกจาก `humanDisconnected`) · arrangement คงเดิม · snapshot เต็ม (reveal+GF) · Leave confirm · Reconnecting HUD | `monarchEngine.ts` `gameSocket.ts` `monarch/index.tsx` |
| **4** | รอ | `sfxLayerService` (drone/heartbeat/tick/duck) เสียบผ่าน audio hook จาก Batch 2 | ใหม่ + ต้นแบบจาก `bgmService.ts` |

**กฎ Dev ทุก Batch:** Phase 1 audit ก่อน → stop → รอยืนยัน → Phase 2 implement · patch all-or-nothing · timer ใช้ `useRef` ห้าม `useState` ที่ parent หนัก (CLAUDE.md) · **Reanimated 4** (ตามที่ติดตั้งจริง ~4.1.1) ห้าม Lottie · SQL เขียนให้เท่านั้นห้าม execute

---

## 18. Open Items (ยังไม่ยืนยัน)

1. ~~**Relic Pool** รายชื่อชิ้น~~ ✅ ยืนยันแล้ว 2026-07-30 (1 guaranteed + 5 สุ่ม, เก็บครบ = Token bonus) — ดู §10
2. ~~ที่เก็บ pity counter~~ ✅ แก้แล้ว Batch 1 — ใช้ `users.monarch_pity_counter` เดิม (migration 006) ไม่มี SQL ใหม่
3. **BGM exception** — ถ้าต้องการเพลงจริงแทน SFX drone → ออก v2.3
4. **Royal Hour tuning** — เก็บ log 4 สัปดาห์แล้วประเมินว่า ×2 พอหรือไม่
5. **`test:watch` / `test:coverage` พัง** (bare jest resolve ไม่ได้) — ปัญหาเดิมก่อน Monarch work, backlog แยก ไม่บล็อก
6. **PlayerStoryState (ระบบใหม่)** — Fake Memory + lore fragment reader รอระบบนี้ (narrative ทั้งเกมใช้ร่วม) → วางแผนเป็นงานแยกหลัง Batch 3
7. **Relic `type` duplicate** — 3D-2 duplicate `relicId→type` ฝั่ง client (payload ไม่ส่ง type) — ยอมรับสำหรับ 6 relic MVP แต่ตอนเติม lore fragment ควรให้ server ส่ง `type` ใน `relicResult` กัน drift

---

## 🎉 Monarch Encounter v2.2 — COMPLETE (2026-07-30)

ทุก batch (1, 2, 1.5, 3A–3E, 4) เสร็จครบ · เทสอัตโนมัติ 301+ ผ่าน · ระบบครบ: spawn/pity · pressure/seal · decoy/arrival · judgment/relic · lock/reconnect · audio

### ⏳ ค้างก่อน "ใช้ได้จริงบน Production" (3 กลุ่ม)

**1. Sound Designer เติม asset (5 ไฟล์ — `client/assets/sounds/`)**
| ไฟล์ | ชนิด | เสียง |
|---|---|---|
| `sfx_monarch_ambient_drone.mp3` | loop seamless | โทนต่ำมืด สม่ำเสมอ ไม่มี beat — พื้นบรรยากาศตลอดแมตช์ |
| `sfx_monarch_heartbeat.mp3` | loop seamless | หัวใจเต้น/กลองต่ำ (โค้ดปรับเร็ว+ดังเอง 3 ระดับ) |
| `sfx_monarch_tick.mp3` | one-shot ~0.1-0.2s | ติ๊กคมชัด ทุกวินาที critical/final |
| `sfx_monarch_crown_strike.mp3` | one-shot ~0.3-0.5s | ระฆัง/โลหะหนัก 3 วิสุดท้าย |
| `sfx_monarch_seal_stamp.mp3` | one-shot ~0.3-0.4s | ตราประทับ/กระแทก ตอนกด SEAL |

> พอมีไฟล์จริงแค่ uncomment path ใน `sfxLayerService.ts` (ปัจจุบัน no-op graceful)

**2. Migration Supabase Dashboard**
- `012_monarch_relics.sql` (3D-1) ✅ ลุงรันแล้ว · Batch 1 ใช้ column เดิม migration 006 (ไม่มี SQL ใหม่)

**3. QA มือถือรวม (Expo รันใน sandbox ไม่ได้ — เทสทีเดียวตาม QA policy)**
- [ ] `spawnRateBase = 0.03` ใน Production build (ไม่ใช่ 0.97 test)
- [ ] Royal Hour เสาร์ 20:00–20:59 ×2 · client payload ไม่มี rate/multiplier
- [ ] Decoy: จับเวลาเข้าเกมเทียบ queue ปกติ 5 ครั้ง — แยกไม่ออก
- [ ] Arrival: fake→stumble→crown→reveal→dialogue ~7.8s · กด CTA 4.4s ไม่ค้าง
- [ ] Timer 3-phase สี/vignette ขอบมืดกลางสว่าง ไพ่ไม่ถูกบัง · Portrait นิ่ง · Sealed Signal+Royal Silence ไม่ซ้ำ
- [ ] SEAL + ตรา + haptic · foul→seal ได้+แพ้ · FOUL reason ตอนแพ้
- [ ] **บั๊ก desync (สำคัญ): ชนะ G1+G2 แพ้ G3 net บวก → VFX "ชนะ" (ไม่ใช่แพ้)**
- [ ] Crown Ledger weighted · Balance ซ่อนระหว่างเกม โชว์ตอนจบ · Pot/Call ยังโชว์
- [ ] Judgment pause 1.0/1.5/blackout · ชนะหน่วง 1.5s → "So... you are the one."
- [ ] Royal Relic: Blank Crest ครั้งแรก · สุ่มไม่ซ้ำ · เก็บครบ +5,000 · แพ้ไม่ popup
- [ ] **3E (เสี่ยงสุด): grace 20s GF turn=human กลับทัน/ไม่ทัน · reconnect reveal เห็นภาพ · arrangement หลุด=คืนเงิน · Leave→แพ้ · commit-based §11 ไม่พัง**
- [ ] Audio (พร้อม asset): ambient+heartbeat loop พร้อมกัน · duck silence_cut · ไม่มีเสียงค้างหลังออกโต๊ะ
- [ ] ไม่มี BGM ในโต๊ะ · ไม่มี UI text ไทยหลงเหลือ

---

## Changelog

**rev.3 (2026-07-30)** — หลัง Batch 3A→3C-1 + audit Batch 3 (แก้ 3 assumption ผิดจากโค้ดจริง):
- **§6 Fake Memory ตัดจาก MVP** — `PlayerStoryState` ที่ spec อ้างว่า "มีอยู่แล้ว" **ไม่มีในโค้ด** → เลื่อนเป็นงานแยก
- **§10 Royal Relic = ระบบใหม่** — โปรเจคไม่มี earned-collection (`avatarPresets` เป็น VIP-gate) → Batch 3D สร้างใหม่ (`monarch_relics jsonb`) + ยืนยัน Relic Pool MVP 6 ชิ้น
- **§10 lore_fragment reader ไม่มีจริง** — `NarrativeLite type:'fragment'` เป็นแค่แผนใน narrative spec → lore fragment เลื่อนเป็น content ล็อตหลัง
- **§12 Decoy ✅ เสร็จ 3A** — สุ่ม client-side, state แยก queue จริง
- **🔴 บั๊ก desync (แก้ 3C-1):** client ตัดสินแพ้ชนะจาก `g3Winner` แต่ server เปลี่ยนเป็น `netDelta > 0` ตั้งแต่ Batch 1 → ผู้เล่นชนะ G1+G2 แพ้ G3 (net บวก) เห็น "แพ้" ทั้งที่ได้ badge+Pot×2 → **บทเรียน: เปลี่ยน canon ที่ server ต้องไล่ grep client ที่ใช้เกณฑ์เดิมทุกจุด**
- **§17 แตก Batch 3 → 3A-3E** (3A/3B/3C-1 เสร็จ) — 4/7 งานเดิมต้องสร้างจากศูนย์ (Crown Ledger, Royal Relic, grace period, + Fake Memory ที่ตัดออก)

**rev.2 (2026-07-30)** — หลัง Batch 1 เสร็จ + audit Batch 2:
- **§8.3 ยกเลิก Foul Visual Guard ทั้งหมด** → No Foul Assist ใช้ฝีมือล้วน (มติลุงเยาะ)
- **§9.3 เพิ่ม** เหตุผล `FOUL — piles out of order` ตอนแพ้ (ชดเชยการไม่มี guard)
- **§10 Pot×2 = มาตรฐานเดียว** `netDelta > 0` เกตทั้ง badge + Pot×2 (เดิม Pot×2 ผูก g3Winner) + ลำดับ 4 ขั้นบังคับ
- **§10/§11 Disconnect badge rule** แยกก่อน/หลัง Seal (กันฟาร์ม badge — ข้อเสนอ Claude Code)
- **§11 Disconnect mid-GF (commit-based)** — resolve G3 เสมอ ห้าม freeze · Call แล้ว→resolve เต็ม / ยังไม่กด→Fold (ค้นพบ Batch 1.5)
- **§4 namespace** `monarch` → `monarchConfig` (ชื่อจริงในโค้ด)
- **§17 Reanimated 3 → 4** (ตามที่ติดตั้งจริง ~4.1.1)
- **§17 เพิ่ม Batch 1.5** Quarantine (`highNobleMultiEngine.ts` + `monarchAI.ts`) — เสร็จแล้ว 308/308
- **§18 pity counter** ปิดแล้ว (ใช้คอลัมน์เดิม migration 006)

**v2.2 (2026-07-30)** — ฉบับ canon แรก แทนที่ v2.1 + CanonBridge v1.2 (รวม 12 ข้อ UI/UX + Royal Hour + Decoy + Weighted Crown)

---

*TriplePoker Monarch Encounter Spec v2.2 (rev.2) — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
