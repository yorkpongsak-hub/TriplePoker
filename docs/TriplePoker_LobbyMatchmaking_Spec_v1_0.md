# TriplePoker — Lobby & Matchmaking Spec
> Version 1.0 | The Sage Unicorn Studio Co., Ltd. | Updated: July 11, 2026
> Canon Decisions confirmed by Founder — สอดคล้องกับ MasterPlan v1.1 / CoreRules v1.2 / SoundDesign Spec v1.0

---

## 1. User Flow ภาพรวม

```
เข้าเกม → Profile Screen (Entry Point)
    │
    └─► กดปุ่ม Play (icon: Royal Straight Flush)
            │
            └─► Lobby Hub
                    ├─► Tier C : Initiate    → เข้าเกมทันที (Solo + 3 Bots)
                    ├─► Tier B : Adept       → Matchmaking Flow (Section 4)
                    ├─► Tier A : Mastermind  → เข้า Conquest Mode ทันที (Solo)
                    └─► Tier A+: High Noble  → Matchmaking Flow (Section 5)
```

### 1.1 Profile Screen
- ปุ่ม **Play** ดีไซน์ใหม่ — ใช้ภาพไพ่ **Royal Straight Flush** เป็นไอคอน
- Asset ใหม่: `btn_play_royal_flush.png` (ดู Section 8)

### 1.2 Lobby Hub
- แสดง Tier ทั้งหมด — ปลดล็อคแล้วเลือกเล่นได้ตลอดเวลา / ยังไม่ปลดล็อคแสดงสถานะ Locked
- สิทธิ์เข้าเล่น: **ระดับสูงลงต่ำได้ / ต่ำขึ้นสูงไม่ได้** (ตาม GameFlow Reference v1.2)

### 1.3 Tier Unlock Celebration (ครั้งเดียวต่อ Tier)
- ปลดล็อค Tier ใหม่ครั้งแรก → แอนิเมชันแสดงความยินดี + เสียงปรบมือ
- VFX: ใช้ `sprite_tier_up.png` (มีอยู่แล้วใน VFX ArtSpec v1.0 — #9)
- SFX: `sfx_applause.mp3` (asset ใหม่ — Section 8)
- Flag `tierUnlockCelebrated[tier]` เก็บใน Supabase (ไม่ใช้ AsyncStorage — กัน replay เมื่อเปลี่ยนเครื่อง)

---

## 2. BGM System ⭐ NEW

> ข้อยกเว้นจากหลักการ "ไม่มี BGM ระหว่างเล่น" ใน SoundDesign Spec v1.0
> **BGM เล่นเฉพาะ 4 หน้า — ในโต๊ะเกมยังคงไม่มี BGM เด็ดขาด**

| หน้า | BGM |
|------|-----|
| Profile | ✅ |
| Shop | ✅ |
| Lobby | ✅ |
| Hall of Fame (ทำเนียบเกียรติยศ) | ✅ |
| ในโต๊ะเกมทุก Tier | ❌ (SFX เท่านั้น) |

**Implementation:**
- MVP: ใช้ **1 track เดียว** (`bgm_main_menu.mp3`) loop ต่อเนื่องทั้ง 4 หน้า
- เปลี่ยนหน้าระหว่าง 4 หน้านี้ → **ไม่ restart track** (เล่นต่อเนื่อง)
- ออกจาก 4 หน้านี้ (เข้าโต๊ะ / เข้าเกม) → fade out ~1 วิ
- Volume Settings: เพิ่มแถว **BGM | Default 50% | ปรับได้ 0–100%** ใน Settings

---

## 3. Tier C — Initiate (Solo)

- เข้าเล่นได้ทันที ไม่มีการรอ
- ผู้เล่น 1 คน + **Bot AI 3 ตัว ชื่อ fixed ทุกครั้ง:**

| Bot | Arrangement | Personality |
|-----|-------------|-------------|
| The Sage | first_valid | สุ่ม 1 ใน 3 |
| The Ghost | first_valid | สุ่ม 1 ใน 3 |
| The Rokket | first_valid | สุ่ม 1 ใน 3 |

---

## 4. Tier B — Adept (Matchmaking: Dynamic 2-3H + 1-2B)

> **Patch (2026-07-17):** เปลี่ยนจาก "2H+2B ตายตัว เต็มทันทีที่ user คนที่ 2 join" เป็น dynamic
> capacity — รอ user คนที่ 3 สั้นๆ ก่อนยอมเติม Bot ตัวที่ 2 เพื่อให้คนจริงเล่นด้วยกันได้มากขึ้นต่อโต๊ะ
> ช่วงคนเล่นเยอะ ไม่ต้องเปิดโต๊ะแยกหลายโต๊ะ พฤติกรรมนี้ใช้เฉพาะโต๊ะ public (Auto-Match) เท่านั้น —
> โต๊ะ private (PIN) ยังคงพฤติกรรมเดิม (2H+2B ตายตัว)

### 4.1 Auto-Join (Priority 1)
- มีโต๊ะรออยู่ → จับ user ใหม่เข้า**โต๊ะที่รอนานที่สุด**โดยอัตโนมัติเสมอ
- Lobby แสดงชื่อ user ผู้สร้างโต๊ะให้เห็น

### 4.2 Create Room (Priority 2 — ไม่มีโต๊ะรอ)
- แสดงปุ่ม **"Start New Table"** → กดแล้วสร้างโต๊ะ + ผู้เล่นเข้าไปรอ
- ระบบเติม Bot **The Sage** เข้ารอทันที 1 ตัว
- เริ่มนับ Grace Period รอบแรก (~40 วินาที) รอ user คนที่ 2

### 4.3 Table Complete (Dynamic 2-3H)
- **Grace Period รอบแรก (~40 วิ) หมดแล้วยังไม่มี user คนที่ 2** → **ยกเลิกโต๊ะทันที** (ไม่เติม Bot)
  ส่ง user คนแรกกลับ Lobby ต้องกด Auto-Match ใหม่เอง (การันตีอย่างน้อย 2 Human เสมอ ไม่ยอมเริ่มด้วย
  Human คนเดียว)
- **User คนที่ 2 join ทัน** → **ยังไม่เติม Bot ตัวที่ 2** เริ่ม Grace Period รอบสอง (~40 วิ) รอ user
  คนที่ 3 แทน
  - **User คนที่ 3 join ทัน** → ครบ 3 Human + 1 Bot (Sage) → เริ่มเกมทันที
  - **Grace Period รอบสองหมดแล้วยังมีแค่ 2 Human** → สุ่ม Bot อีก 1 ตัว (The Ghost หรือ The Rokket)
    เติมที่นั่งสุดท้าย → ครบ 4 ขา (2H+2B) → เริ่มเกมทันที (ผลลัพธ์สุดท้ายเหมือนพฤติกรรมเดิม แค่ช้ากว่า
    เดิมด้วย grace period แทนที่จะเติมทันที)
- Bot Tier B: `greedyArrangement` + personality สุ่ม 1 ใน 3

### 4.4 Waiting Timeout — Adept ไม่มี Dialog อีกต่อไป
Adept **ไม่ใช้** ระบบ Dialog "Wait 2 More Minutes"/"Delete Table" แบบเดิมแล้ว (ตัดสินใจอัตโนมัติล้วน
ผ่าน Grace Period ~40 วิ 2 รอบตามข้อ 4.3 ด้านบน ไม่มี popup ให้ผู้เล่นเลือกเลย) — ระบบ Dialog 3+2 นาที
เดิมยังใช้อยู่กับ **High Noble เท่านั้น** (ดู Section 6)
```
สร้างโต๊ะ (Sage เข้ารอ) → Grace #1 (~40 วิ)
    ├─► user คนที่ 2 join → Grace #2 (~40 วิ)
    │       ├─► user คนที่ 3 join → เริ่มเกม (3H+1B)
    │       └─► หมดเวลา (ยังมีแค่ 2H) → เติม Bot ตัวที่ 2 → เริ่มเกม (2H+2B)
    └─► หมดเวลา (ยังมีแค่ 1H) → ยกเลิกโต๊ะ → กลับ Lobby (ไม่มี dialog ให้เลือก)
```

---

## 5. Tier A — Mastermind (Conquest Mode, Solo)

- เข้าเล่นได้ทันที ไม่มีการรอ
- ผู้เล่น 1 คน + **Boss: 1 ใน Nine Sentinels** + **Minions สุ่ม 2 ใน 25**

| AI | Arrangement | Personality |
|----|-------------|-------------|
| Nine Sentinels (Boss) | bestArrangement | ตาม Sentinel spec |
| Minions ×2 | greedyArrangement | สุ่ม 1 ใน 3 (แบบ Tier C) |

> **Canon:** Minion Avatars 25 ตัว (`bot_minion_[nn]_[name].png`) ใช้ใน Tier นี้
> ผ่าน `pickRandomMinions()` — ตาม MasterPlan v1.1

---

## 6. Tier A+ — High Noble (Matchmaking: 3H + 1 Boss)

- หลักการ Auto-Join / Create Room **เหมือน Tier B**
- **Timeout ต่างจาก Tier B แล้ว** (ตั้งแต่ Patch 2026-07-17 ที่ Adept เปลี่ยนไปใช้ Grace Period สั้นๆ):
  High Noble ยังคงใช้ระบบ Dialog Timeout 3+2 นาทีเดิมอยู่ (ข้อ 6.1 ด้านล่าง) — ไม่เปลี่ยนตาม Adept
- **แตกต่างจาก Tier B เรื่อง capacity:** ระหว่างรอไม่เติม Bot — รอ Human ให้ครบ 3 คน + Boss AI
  (Four Gods / Monarch), ไม่มี dynamic-capacity แบบ Adept (High Noble ตายตัว 3H+1Boss เสมอ)

### 6.1 Deadlock Prevention ⭐ Canon Decision (แนวทาง 🅰️ MVP)
```
ครบเวลารอ 5 นาที (3+2):
    ├─► Human ≥ 2 คน → Dialog 2 ตัวเลือก:
    │       ├─► "Start Now (Fill 1 Minion AI)" → เติม Minion 1 ตัว → เริ่มเกม
    │       └─► "Delete Table" → ลบโต๊ะ → ทุกคนกลับ Lobby
    └─► Human = 1 คน (ผู้สร้างคนเดียว) → ลบโต๊ะ → กลับ Lobby
```
- สอดคล้อง `aiFillSystem.ts`: Human ≥ 2, AI ≤ 2
- Minion ที่เติม: สุ่ม 1 ใน 25, ใช้ greedyArrangement
- สิทธิ์กดเลือก: **ผู้สร้างโต๊ะ (Host)** — ผู้รอคนอื่นเห็น "Waiting for host decision…"

---

## 7. Pre-Game & In-Game Sound Sequence

### 7.1 Pre-Game Countdown ⭐ NEW
- เล่น**ครั้งเดียวตอนเริ่มแมตช์**เท่านั้น (ไม่เล่นซ้ำทุก Round / ไม่เล่นตอน Rematch loop ภายใน)
- Sequence: **5-4-3-2-1** + SFX ประกอบทุกจังหวะ
- Visual: ตัวเลข scale ขยายใหญ่ + เปลี่ยนสีตามจังหวะ (Gold `#FFD76A` → Red `#FF6B6B` ที่เลข 1)
- **ไม่แทนที่** 3-2-1 dramatic pause ของ Simultaneous Showdown (GameFlow v1.2 Section 3) — คนละ event

### 7.2 In-Game SFX (ทุกรอบ)
| Event | SFX | สถานะ |
|-------|-----|-------|
| สับไพ่ (Shuffle) | `sfx_s0_shuffle_default.mp3` | ⭐ ใหม่ |
| แจกไพ่ (Deal) | `sfx_s1_deal_*.mp3` | มีแล้ว (S1) |
| เปิดไพ่ (Reveal) | `sfx_s2_flip_*.mp3` | มีแล้ว (S2) |
| ทิ้งไพ่ / คว่ำ (Discard) | `sfx_s3_slap_*.mp3` | มีแล้ว (S3) |

> S0 Shuffle จัดเป็น Default-only เช่นเดียวกับ S6–S9 (Sound Pack ไม่แทนที่) — หรือจะเปิดให้ Pack แทนได้เหมือน S1–S5 ให้ตัดสินใจตอนอัปเดต SoundDesign Spec v1.1

---

## 8. Asset ใหม่ที่ต้องเพิ่ม (อัปเดต AssetNaming Spec v1.1)

| # | ไฟล์ | ประเภท | ใช้ที่ | Priority |
|---|------|--------|--------|----------|
| 1 | `bgm_main_menu.mp3` | BGM (loop) | Profile / Shop / Lobby / Hall of Fame | 🔴 High |
| 2 | `sfx_applause.mp3` | SFX | Tier Unlock Celebration | 🟠 Medium |
| 3 | `sfx_countdown_tick.mp3` | SFX | Pre-game 5-4-3-2-1 (เล่นซ้ำ 5 ครั้ง หรือทำ 2 เสียง: tick ×4 + go ×1) | 🔴 High |
| 4 | `sfx_s0_shuffle_default.mp3` | SFX | สับไพ่ก่อนแจกทุกรอบ | 🔴 High |
| 5 | `btn_play_royal_flush.png` | UI | ปุ่ม Play หน้า Profile | 🔴 High |
| 6 | `bot_fixed_sage.png` | Avatar | Bot Tier C/B | 🔴 High |
| 7 | `bot_fixed_ghost.png` | Avatar | Bot Tier C/B | 🔴 High |
| 8 | `bot_fixed_rokket.png` | Avatar | Bot Tier C/B | 🔴 High |

---

## 9. ผลกระทบต่อ Codebase ปัจจุบัน (Implementation Notes)

| จุด | สถานะปัจจุบัน | ต้องแก้ |
|-----|----------------|---------|
| `adept/index.tsx` + Redis room registry | Dynamic 2-3H+1-2B ทำงานแล้ว (Patch 2026-07-17) | Sage เข้ารอก่อน, Grace Period ~40 วิ 2 รอบ (รอ user 2 แล้วรอ user 3), เติม Ghost/Rokket เฉพาะถ้าหมดเวลาแล้วยังมีแค่ 2H, auto-join โต๊ะรอนานสุด — ไม่มี dialog timeout อีกแล้ว |
| `mastermind/index.tsx` + Nine Sentinels | กำลัง implement | เพิ่ม Minion สุ่ม 2 ใน 25 (`pickRandomMinions()` มีแล้ว) — greedy arrangement |
| `highNoble/index.tsx` | เสร็จแบบ Solo | ⚠️ งานใหญ่: เพิ่ม multiplayer 3H ผ่าน socket + room registry แบบ Adept + Deadlock flow (Section 6.1) |
| Lobby screen | — | สร้างใหม่: Tier grid + unlock state + celebration + BGM |
| Profile screen | Supabase real data แล้ว | เปลี่ยนปุ่ม Play เป็น icon ใหม่ |

**ลำดับแนะนำ:** Lobby UI + BGM → Adept matchmaking upgrade → Mastermind minions → High Noble multiplayer (หนักสุด ทำท้าย)

---

*TriplePoker Lobby & Matchmaking Spec v1.0 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
