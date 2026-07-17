# TriplePoker — Core Rules v1.3
> กติกาหลักที่ใช้ร่วมกันในทุก Season และทุก Tournament
> The Sage Unicorn Studio Co., Ltd.
> Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
> Updated: July 16, 2026

**Changelog v1.3 (2026-07-16):** Sync Ante/Pot/Triple Sweep กับ `gameConfig.ts` (code = canon), แก้ความคลาดเคลื่อนจาก v1.2
- ตาราง Ante Structure (2.1), Pot Formation S1/S2 (2.2), Pot Formation S3 Clan (2.3), Triple Sweep Payout (1.10) — อัปเดตทุกตัวเลขให้ตรง `tokenPot.tiers` จริง
- แก้บั๊กเดิม: แถว Adept ใน 2.1 เคยมี Call/Round=200 ทั้งที่ Adept ไม่มี Grand Finale Betting เลย (ตรงกับ `adept.call: null` ในโค้ด) — แก้เป็น "—"
- ปรับสูตร Penalty/คน ของ Triple Sweep ให้สอดคล้องกับกติกาที่เขียนไว้จริง (`Penalty/คน = floor(Pot ปกติรวม ÷ 3)` เพราะ 3×Penalty ต้องเท่ากับส่วนต่างที่ทำให้ Pot กลายเป็น ×2 พอดี) — ตัวเลขเดิมใน v1.2 คำนวณผิดจากกติกาที่ตัวเองเขียนไว้
- Section 5 (embedded `gameConfig.ts` draft): sync `tokenPot.tiers`, แก้ `blindAuction.tieBreak` เป็น `"human_first_then_random"` ตรงกับโค้ดจริง, เพิ่ม `bidLevels`, ลบ section `tripleSweet` ที่พิมพ์ผิดชื่อและซ้ำกับ `tokenPot.rakeJackpot` ออก (โค้ดจริงไม่มี section แยก)
- Call/Round ของ Mastermind/High Noble/The Last Boss (600/2,000/4,000) **ไม่เปลี่ยน** — ยืนยันแล้วว่าตรงกับ `gameConfig.grandFinale.callAmount` ที่ game engine ใช้จริง (แยกจาก `tokenPot.tiers.call` ซึ่งเป็นค่าที่ไม่มีโค้ดจุดไหนอ่านจริง — ไม่ใช้ค่านั้น)

**Addendum (2026-07-16):** Sync Arrangement Timer (Section 1.9) กับ `gameConfig.ts` จริง — เดิม doc เขียน Adept=60/Mastermind=45/High Noble=40/Last Boss=40 วินาที ไม่ตรงโค้ด (`arrangementTimer`: adept=75/mastermind=60/highNoble=35/lastBoss=75) — แก้ให้ตรงแล้ว

**Addendum (2026-07-17):** ยกเลิก Triple Sweep Rake 10% → ใช้ Rake อัตราเดียว 5% ทั้งระบบ (ทุก Tier ทุกกรณี ไม่แยก Triple Sweep อีกต่อไป) — อัปเดตตาราง Triple Sweep Payout (Section 1.10) และ embedded `gameConfig.ts` draft (Section 5) ให้ตรง `rakeJackpot` ถูกลบออกจากโค้ดจริงแล้ว (`gameConfig.tokenPot.rakeJackpot`)

**Changelog v1.2:**
- ปรับ Tier Structure ใหม่ 5 ระดับ (Initiate / Adept / Mastermind / High Noble / The Last Boss)
- อัปเดต Token Range, Ante, Pot ทุก Tier
- เพิ่ม Section 1.10 — Triple Sweep Jackpot Rule
- อัปเดต Section 1.9 — Progressive Game Mechanics ให้ตรงกับ Tier ใหม่
**Changelog v1.1:** เพิ่ม Section 1.9 — Progressive Game Mechanics by Tier (Beginner Simplified Mode)

---

## 1. Universal Core — ใช้ทุก Season ทุก Tournament

### 1.1 Hand Rank (Standard Poker)

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

> ทุก Pile ต้องนำไพ่ในมือรวมกับ Community Cards ก่อนเปรียบ Hand Strength เสมอ (5 ใบรวมกัน)

### 1.2 FoulChecker

```
กฎจำนวนใบ:
  S1/S2: Pile 1 = 3 ใบ | Pile 2 = 3 ใบ | Pile 3 = 5 ใบ (ก่อน Discard) / 3 ใบ (หลัง Discard)
  S3:    Pile 1 = 2 ใบ | Pile 2 = 2 ใบ | Pile 3 = 3 ใบ (หลัง Discard)

กฎ Pile Ranking:
  (Pile 1 + Community 1) ≤ (Pile 2 + Community 2) ≤ (Pile 3 + Community 3)
  Pile เสมอกัน → ผ่าน (ไม่ถือเป็น Foul)
```

| กรณี | ผลลัพธ์ |
|------|---------|
| Client ตรวจพบตอนกด Ready | ห้าม Submit — Highlight Pile ผิด + บังคับจัดใหม่ |
| Server ตรวจพบที่ Showdown | เสียทุก Pot → AI รับ (Token Burn) |
| หลายคน Foul พร้อมกัน | AI รับทุก Pot จากทุกคนที่ Foul |

### 1.3 Fog of War
- ไพ่ทุกใบ + Community Cards ของ Pile 1 & 2 ถูกคว่ำพร้อมกันหลัง Resolution
- ใช้ card flip animation — ไม่หายทันที
- **ใช้เฉพาะ Tier Mastermind ขึ้นไป** — Initiate / Adept ไม่มี Fog of War (ดู Section 1.9)
### 1.4 Blind Auction (ก่อน Pile 3 — ทุก Season)
- ประมูล 2 ใบ Blind (คว่ำ) พร้อมกันทุกคน
- อันดับ 1 ได้ใบแรก / อันดับ 2 ได้ใบที่สอง (ไม่เกิน 1 ใบ/คน/Hand)
- Token ที่ใช้ประมูล → Burn 100% ออกจากระบบทันที
- **ใช้เฉพาะ Tier Mastermind ขึ้นไป** — Initiate / Adept ไม่มีระบบประมูล (ดู Section 1.9)
**Tie-Break: Human ชนะก่อนเสมอ / Human-vs-Human สุ่ม 50/50**
- Human ชนะ AI เสมอเมื่อเสนอราคาเท่ากัน — Human-vs-Human ถึงจะสุ่ม 50/50
- Toast message เมื่อ Tie-break ถูกใช้:
| สถานการณ์ | Toast |
|-----------|-------|
| S1/S2 ผู้ชนะ | "Lucky Star! Fortune favors the bold." |
| S3 Clan ผู้ชนะ | "Clan Destiny! Your team's luck is unbreakable." |
| S3 Clan ผู้แพ้ | "The stars weren't aligned this time..." |

**Bid Levels (4 ระดับ ต่อ Tier):**
| Tier | ระดับราคา |
|------|-----------|
| Mastermind | 25 / 50 / 100 / 150 |
| High Noble | 100 / 200 / 300 / 500 |
| The Last Boss | 200 / 400 / 600 / 1,000 |

### 1.5 Grand Finale — Pile 3

**Betting Rules:**
- Call หรือ Fold เท่านั้น (ไม่มี Raise)
- Call จ่ายต่อ Round อิสระ — สูงสุด 2 Rounds
- หมดเวลา → Auto-Fold + Toast แจ้ง
- เหลือผู้เล่นคนเดียวไม่ Fold → Auto-win ไม่ต้อง Showdown
- **ใช้เฉพาะ Tier Mastermind ขึ้นไป** — Initiate / Adept หงาย Pile 3 พร้อมกันทันที ไม่มี Betting (ดู Section 1.9)
**Betting Order:**
```
S1/S2: AI → Player 1 → Player 2 → Player 3
S3:    Leader_A vs Leader_B (Leader = ตัวแทนทีม)
```

**เวลาตัดสินใจต่อ Turn:**
| Tier | เวลา |
|------|------|
| Initiate | — (ไม่มี Betting) |
| Adept | — (ไม่มี Betting) |
| Mastermind | 10 วินาที |
| High Noble | 8 วินาที |
| The Last Boss | 8 วินาที |

### 1.6 Token Debt
- Token ติดลบได้ระหว่างเกม — ไม่มีเพดานขั้นต่ำ
- จัดการเมื่อ Match จบ → ดู Debt Recovery Flow (หมวด 4)
### 1.7 Tokenomics Core
- **Rake 5%** หักจากทุก Pot ที่มีการจ่ายออก ทุกกรณี รวม Triple Sweep Jackpot round ด้วย (ดู Section 1.10 — ยกเลิก Rake 10% แยกของ Triple Sweep แล้วตั้งแต่ 2026-07-17)
- **Auction Burn 100%** — Token ที่ใช้ประมูลออกจากระบบทันที
- **Foul Burn** — Token จาก Foul Penalty ออกจากระบบทันที
### 1.8 End of Match
| สถานการณ์ | ผลลัพธ์ |
|-----------|---------|
| ทุกคนกด Rematch | เริ่มเกมใหม่ทันที |
| มีคนกด Lobby | ทุกคนกลับ Lobby |
| มีคนหมดเวลา / หลุด | ถือว่ากด Lobby ทุกคนกลับ Lobby |

**Ad Logic:**
- ผู้เล่นทั้งหมดเป็น Free → แสดงโฆษณาก่อน
- มีผู้เล่น VIP อย่างน้อย 1 คน → ข้าม Ad
---

### 1.9 Progressive Game Mechanics by Tier ⭐ Updated v1.2

> ความซับซ้อนของเกมเพิ่มขึ้นตาม Tier เพื่อให้ผู้เล่นใหม่เรียนรู้กติกาหลักผ่านการเล่นจริง
> โดยไม่ถูกท่วมด้วยระบบทั้งหมดพร้อมกันตั้งแต่ต้น

#### ภาพรวม Tier Structure (5 ระดับ)

| Tier | ชื่อ | Tagline | Token Range | ผู้เล่น |
|------|------|---------|-------------|---------|
| 1 | **Initiate** | "The First Step" | 100–9,999 | Bot 3 ตัว |
| 2 | **Adept** | "The Rising Player" | 10,000–39,999 | คนจริง 1 + Bot 2 |
| 3 | **Mastermind** | "The Auction Begins" | 40,000–99,999 | คนจริง 2 + Minion AI 1 |
| 4 | **High Noble** | "Audience with the Four Gods" | 100,000+ | คนจริง 2 + จตุรเทพ AI |
| 5 | **The Last Boss** | "Beyond the Four Gods" | ตามเงื่อนไข Master Plan | ตามเงื่อนไข Master Plan |

#### ภาพรวม Progressive Mechanics

| กลไก | Initiate | Adept | Mastermind | High Noble | The Last Boss |
|------|----------|-------|------------|------------|---------------|
| Showdown Style | **หงาย 3 Pile พร้อมกัน** | **หงาย 3 Pile พร้อมกัน** | Sequential (1→2→3) | Sequential (1→2→3) | Sequential (1→2→3) |
| Fog of War | ❌ | ❌ | ✅ | ✅ | ✅ |
| Blind Auction | ❌ | ❌ | ✅ | ✅ | ✅ |
| Grand Finale Betting | ❌ | ❌ | ✅ | ✅ | ✅ |
| Discard Phase | ❌ | ❌ | ✅ | ✅ | ✅ |
| AI Intelligence | First-valid | First-valid | Minion (First-valid) | จตุรเทพ (DDE) | The Last Boss (DDE/MCTS) |
| เป้าหมายหลัก | เรียนกฎ 3-3-5 | เริ่มเจอคนจริง | ปลดล็อก Auction | Full competitive | Final Challenge |

---

#### Initiate & Adept Mode — Simplified Showdown

**Game Flow:**
```
Deal 11 ใบ → Arrangement Phase → กด Ready → หงาย 3 Pile พร้อมกัน → Compare → Win/Lose
```

- ไม่มี Sequential Resolution ทีละ Pile
- ไม่มี Fog of War หลัง Pile 1 / Pile 2
- ไม่มี Blind Auction
- ไม่มี Discard Phase
- ไม่มี Grand Finale Betting
- **Pile 3 มี 5 ใบเต็ม** — ไม่ต้อง Discard เหลือ 3
- เกมจบเร็ว → XP มาเร็ว → Level up เร็ว → แรงจูงใจขึ้น Tier
**Arrangement Timer:**
| Tier | เวลา |
|------|------|
| Initiate | 90 วินาที |
| Adept | 75 วินาที |
| Mastermind | 60 วินาที |
| High Noble | 35 วินาที |
| The Last Boss | 75 วินาที |

> v1.3: sync กับ `gameConfig.ts` จริงแล้ว (เดิม doc เขียน adept=60/mastermind=45/highNoble=40/lastBoss=40 ซึ่งไม่ตรงโค้ด) — High Noble สั้นสุดเพราะ R1+R2 ใช้เวลานี้ทั้งคู่ / Last Boss แยกจาก High Noble ให้เวลาคิดมากขึ้นเพราะ AI เก่งระดับ DDE/MCTS

---

#### Initiate / Adept AI — First-Valid Arrangement

```
วิธีทำงาน:
  1. สุ่มจัดไพ่ 11 ใบลง 3 Pile
  2. ตรวจ FoulChecker
  3. ผ่าน → ใช้ arrangement นี้เลย (หยุดทันที)
  4. ไม่ผ่าน → สุ่มใหม่ วนซ้ำจนผ่าน
```

- ไม่มีการเปรียบ Hand Strength ระหว่าง arrangement
- ผลคือ AI มักได้ arrangement แบบสุ่ม ไม่ได้ optimize
---

#### Mastermind AI — Minion (First-Valid)

> ใช้ First-Valid เหมือน Initiate/Adept แต่เจอบรรยากาศ Auction และ Full mechanics แล้ว

---

#### High Noble AI — จตุรเทพ (DDE)

4 จตุรเทพ: Reaper / The Crag / Cortex / Cipher — Weighted Score แยก personality
ดู Master Plan Ch.20

---

#### The Last Boss AI — DDE + MCTS

Dual Algorithm: DDE (วันคู่) + MCTS (วันคี่) — ดู Master Plan Ch.20

---

#### Design Intent

```
Initiate    → เรียนกฎ 3-3-5, Hand Rank, Community Cards (Bot ล้วน)
                ↓
Adept       → เริ่มเจอคนจริง, เรียนรู้จังหวะ, ยังไม่มี Auction
                ↓
Mastermind  → ปลดล็อก Auction + Full mechanics (Fog of War, Betting)
                ↓
High Noble  → Full competitive + จตุรเทพ pressure สูงสุด
                ↓
Last Boss   → Final Challenge — ตามเงื่อนไขพิเศษ
```

### 1.10 Triple Sweep Jackpot ⭐ Payout Table Synced v1.3 (Rake 5% ตั้งแต่ 2026-07-17)

> ผู้เล่นที่ชนะทั้ง 3 กองในรอบเดียว — ใช้ทุก Tier

**กฎ:**
- Pot รวม 3 กอง × 2
- ผู้แพ้ 3 คนจ่าย Penalty หาร 3 เท่ากัน — **Penalty/คน = floor(Pot ปกติรวม ÷ 3)** (3×Penalty คือส่วนต่างที่ทำให้ Pot กลายเป็น ×2 พอดี)
- Rake **5%** อัตราเดียวกับ Pot ปกติทุกกรณี (ยกเลิก Rake 10% แยกของ Jackpot round แล้ว — 2026-07-17)
- 5% คำนวณจาก **ยอดรวมที่ได้รับ (หลัง ×2)** แล้ว burn ทิ้ง
**ตาราง Triple Sweep Payout (v1.3, sync กับ `gameConfig.ts` — Rake 5% ตั้งแต่ 2026-07-17):**

| Tier | Pot ปกติรวม | ×2 | หัก Rake 5% | ผู้ชนะได้จริง | Penalty/คน |
|------|------------|-----|--------------|--------------|-----------|
| Initiate | 280 | 560 | −28 | **532** | **93** |
| Adept | 1,200 | 2,400 | −120 | **2,280** | **400** |
| Mastermind | 4,000 | 8,000 | −400 | **7,600** | **1,333** |
| High Noble | 12,000 | 24,000 | −1,200 | **22,800** | **4,000** |
| The Last Boss | 24,000 | 48,000 | −2,400 | **45,600** | **8,000** |

> Penalty/คน = floor(Pot ปกติรวม ÷ 3) — Mastermind ปัดลงจากเศษ (4,000÷3 = 1,333.33) — สูตรนี้ไม่เปลี่ยนตามการยกเลิก Rake 10%

---

## 2. Token Pot System

### 2.1 Ante Structure

**จ่ายทีเดียวต้น Hand อัตโนมัติ (Pile 1 + Pile 2 + Pile 3 Ante รวมกัน)**

| Tier | Token Range | Pile 1 | Pile 2 | Pile 3 | Call/Round | Ante รวม/คน |
|------|-------------|--------|--------|--------|------------|-------------|
| Initiate | 100–9,999 | 10 | 20 | 40 | — | 70 |
| Adept | 10,000–39,999 | 60 | 100 | 140 | — | 300 |
| Mastermind | 40,000–99,999 | 200 | 300 | 500 | 600 | 1,000 |
| High Noble | 100,000+ | 500 | 1,000 | 1,500 | 2,000 | 3,000 |
| The Last Boss | ตามเงื่อนไข | 1,000 | 2,000 | 3,000 | 4,000 | 6,000 |

> Initiate / Adept ไม่มี Call/Round เพราะไม่มี Grand Finale Betting (v1.3: แก้บั๊กเดิมที่ Adept เคยแสดง Call/Round=200 ผิดพลาด)
> Call/Round อ้างอิงจาก `gameConfig.grandFinale.callAmount` (ค่าที่ game engine ใช้จริง — ไม่ใช่ `tokenPot.tiers.call` ซึ่งเป็นค่าที่ไม่มีจุดใดในโค้ดอ่านจริง)
> ปรับได้ทั้งหมดผ่าน `gameConfig.ts` โดยไม่ต้อง redeploy

### 2.2 Pot Formation — S1 / S2

```
ผู้เล่นในโต๊ะ: 3 Human + 1 AI
Pot มาจาก: ทั้ง 4 คน (AI ใส่ Virtual Token จริง)

Human ชนะ Pile → รับ Pot (หัก Rake 5%)
AI ชนะ Pile   → Pot Burn ออกจากระบบทันที
```

| Tier | Pot ต่อ Pile 1 | Pot ต่อ Pile 2 | Pot ต่อ Pile 3 |
|------|--------------|--------------|--------------|
| Initiate | 40 token | 80 token | 160 token |
| Adept | 240 token | 400 token | 560 token |
| Mastermind | 800 token | 1,200 token | 2,000 token |
| High Noble | 2,000 token | 4,000 token | 6,000 token |
| The Last Boss | 4,000 token | 8,000 token | 12,000 token |

**AI Entry Token:** Server สุ่ม Virtual Token ให้ AI = 1.5–3.0 × ขั้นต่ำของ Tier นั้น

### 2.3 Pot Formation — S3 Clan

```
ผู้เล่นในโต๊ะ: 6 Human (3 คน/ทีม × 2 ทีม) — ไม่มี AI Seat
Pot มาจาก: ทั้ง 6 คน เพราะ "ได้หรือเสีย ทุกคนมีส่วนร่วม"
AI = Tool ของ Leader เท่านั้น — ไม่มี Ante ไม่มี Token

Human ชนะ Pile → รับ Pot (หัก Rake 5%)
```

| Tier | Pot ต่อ Pile 1 | Pot ต่อ Pile 2 | Pot ต่อ Pile 3 |
|------|--------------|--------------|--------------|
| Initiate | 60 token | 120 token | 240 token |
| Adept | 360 token | 600 token | 840 token |
| Mastermind | 1,200 token | 1,800 token | 3,000 token |
| High Noble | 3,000 token | 6,000 token | 9,000 token |
| The Last Boss | 6,000 token | 12,000 token | 18,000 token |

> Pot S3 ใหญ่กว่า S1/S2 เสมอ — เพราะ 6 คนร่วมกัน

### 2.4 S3 Clan — Table Layout

```
┌──────────────────────────────────────────────┐
│  Player Left B   [Leader B + AI]   Player Right B  │  ← Team B
│  (Pile 1)         (Pile 3)          (Pile 2)        │
├──────────────────────────────────────────────┤
│                Community Zone                │
│            Show Cards 3-3-2 + Blind Auction  │
├──────────────────────────────────────────────┤
│  Player Left A   [Leader A + AI]   Player Right A  │  ← Team A
│  (Pile 1)         (Pile 3)          (Pile 2)        │
└──────────────────────────────────────────────┘
```

**Mobile Screen Layout:**
- ไพ่ของ Left/Right players อยู่ "ด้านหน้า" — เห็นชัดว่าเป็นไพ่รอง (Pile 1, Pile 2)
- ไพ่ของ Leader อยู่ตรงกลาง "ด้านหลัง" — Pile 3 สูงสุด
- ไพ่ของตัวเองมี visual effect แยกให้เห็นเด่นชัดในหน้าจอ
---

## 3. Grand Finale Call Amount

**Call จ่ายต่อ Round อิสระ** — ใช้เฉพาะ Tier Mastermind ขึ้นไป

| Tier | Call/Round | จ่ายสูงสุด (2 Rounds) |
|------|------------|----------------------|
| Initiate | — (ไม่มี Betting) | — |
| Adept | — (ไม่มี Betting) | — |
| Mastermind | 600 | 1,200 |
| High Noble | 2,000 | 4,000 |
| The Last Boss | 4,000 | 8,000 |

> v1.3: ตัวเลขชุดนี้ไม่เปลี่ยน — ยืนยันแล้วว่าตรงกับ `gameConfig.grandFinale.callAmount` ที่ game engine ใช้จริงอยู่แล้ว

---

## 4. Debt Recovery Flow

**ใช้เมื่อ:** Token < 0 เมื่อ Match จบ

### 4.1 กฎ Auto-Forgive อัตโนมัติ
- Tier High Noble / The Last Boss → Auto-forgive เสมอ (เคสนี้แทบไม่เกิดในทางปฏิบัติ)
- VIP Subscriber ทุก Tier → Auto-forgive เสมอ
### 4.2 Threshold ตาม Tier (Free Player)

**Initiate:**
| ขนาดหนี้ | การจัดการ |
|----------|-----------|
| < 200 Token | Auto-forgive ทันที |
| 200–1,000 Token | Popup → ดู Ad หรือ Pay Later (ผ่อน 20%) |
| > 1,000 Token | Popup → ดู Ad หลายรอบ หรือซื้อ Token หรือ Pay Later |

**Adept / Mastermind:**
| ขนาดหนี้ | การจัดการ |
|----------|-----------|
| < 1,000 Token | Auto-forgive ทันที |
| 1,000–5,000 Token | Popup → ดู Ad หรือ Pay Later (ผ่อน 20%) |
| > 5,000 Token | Popup → ดู Ad หลายรอบ หรือซื้อ Token หรือ Pay Later |

### 4.3 Flow

```
Match จบ → Token < 0?
    │
    ├─► Tier High Noble / Last Boss → Auto-forgive ทันที
    │
    ├─► VIP → Auto-forgive ทันที
    │
    └─► Free / Initiate / Adept / Mastermind
            │
            ├─► หนี้น้อย → Auto-forgive ทันที
            │
            ├─► หนี้กลาง → Popup
            │       ├─► "Watch Ad" → ล้างหนี้ทันที (500 Token/ad)
            │       └─► "Pay Later" → Debt Badge
            │               └─► หัก 20% จาก Pot ทุก Hand จนหมด
            │
            └─► หนี้มาก → Popup
                    ├─► "Watch Ads" (หลายรอบ — 500 Token/ad)
                    ├─► "Buy Token" → ไป Shop
                    └─► "Pay Later" → Debt Badge (หัก 20%)
```

### 4.4 Debt Badge
- แสดงที่ Profile ของผู้เล่นตลอดช่วงที่มีหนี้
- หัก 20% จาก Pot ที่ได้รับทุกครั้ง → ชำระหนี้อัตโนมัติ
- หายไปเมื่อหนี้เป็น 0
---

## 5. gameConfig.ts — Core Rules Draft (v1.3 — synced with live code)

```typescript
// TriplePoker — gameConfig.ts (Core Rules Section)
// ปรับค่าได้ทั้งหมดโดยไม่ต้อง redeploy

export const gameConfig = {

  // ─── Token Pot ───────────────────────────────────────────────
  tokenPot: {
    tiers: {
      initiate:    { pile1: 10,   pile2: 20,    pile3: 40,   call: null  }, // ไม่มี Call
      adept:       { pile1: 60,   pile2: 100,   pile3: 140,  call: null  }, // ไม่มี Call
      mastermind:  { pile1: 200,  pile2: 300,   pile3: 500,  call: 1000  }, // call นี้ไม่ถูกอ่านจริง — ดูหมายเหตุด้านล่าง
      highNoble:   { pile1: 500,  pile2: 1000,  pile3: 1500, call: 3000  }, // call นี้ไม่ถูกอ่านจริง — ดูหมายเหตุด้านล่าง
      lastBoss:    { pile1: 1000, pile2: 2000,  pile3: 3000, call: 6000  }, // call นี้ไม่ถูกอ่านจริง — ดูหมายเหตุด้านล่าง
    },
    // หมายเหตุ v1.3: field "call" ข้างบนนี้ไม่มีจุดไหนในโค้ด (gameLoop.ts/highNobleMultiEngine.ts)
    // อ่านจริง — Call Amount ตัวจริงที่ game engine ใช้คือ grandFinale.callAmount ด้านล่าง (600/2000/4000)
    // Addendum 2026-07-17: ลบ field rakeJackpot ออกแล้ว — ใช้ rake (5%) ตัวเดียวกับ pot ปกติทุกกรณี
    // รวม Triple Sweep round ด้วย (โค้ดจริงไม่มี rakeJackpot อีกต่อไป)
    rake: 0.05,                     // 5% หักจากทุก Pot ทุกกรณี รวม Triple Sweep

    s1s2: {
      potPlayers: 4,                // 3H + AI
      aiContributesToPot: true,     // AI ใส่ Virtual Token จริง
      aiWinBehavior: "burn",        // AI ชนะ → Burn ทันที
      aiEntryTokenRange: {
        min: 1.5,                   // × table minimum
        max: 3.0,
      },
    },

    s3clan: {
      potPlayers: 6,                // 6H ทั้งหมด ไม่มี AI Seat
      aiRole: "leader_tool",        // AI = Tool ของ Leader เท่านั้น
      aiContributesToPot: false,    // AI ไม่มี Ante
      clanSpirit: true,             // ได้หรือเสีย ทุกคนมีส่วนร่วม
    },
  },

  // ─── Progressive Game Mechanics ─────────────────────────────
  progressiveMechanics: {
    initiate: {
      showdownStyle:       "simultaneous",
      fogOfWar:            false,
      blindAuction:        false,
      grandFinaleBetting:  false,
      discardPhase:        false,
      aiMode:              "first_valid",
    },
    adept: {
      showdownStyle:       "simultaneous",
      fogOfWar:            false,
      blindAuction:        false,
      grandFinaleBetting:  false,
      discardPhase:        false,
      aiMode:              "first_valid",
    },
    mastermind: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "first_valid",   // Minion AI
    },
    highNoble: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "dde",           // 4 จตุรเทพ
    },
    lastBoss: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "dde_mcts",      // Dual Algorithm
    },
  },

  // ─── Blind Auction ───────────────────────────────────────────
  blindAuction: {
    communityCards: 2,
    decisionTimeMs: 12000,           // เวลาตัดสินใจกดราคาต่อใบ
    tieBreak: "human_first_then_random", // Human ชนะก่อน AI เสมอ / Human-vs-Human สุ่ม 50/50
    auctionBurn: 1.0,                // 100% Burn ทันที
    bidLevels: {                     // ราคาประมูล 4 ระดับ ต่อ Tier
      mastermind: [25, 50, 100, 150],
      highNoble:  [100, 200, 300, 500],
      lastBoss:   [200, 400, 600, 1000],
    },
    tieBreakToast: {
      winner: {
        s1s2:   "Lucky Star! Fortune favors the bold.",
        s3clan: "Clan Destiny! Your team's luck is unbreakable.",
      },
      loser: {
        s3clan: "The stars weren't aligned this time...",
      },
    },
  },

  // ─── Grand Finale ────────────────────────────────────────────
  grandFinale: {
    callPerRound: true,             // จ่ายต่อ Round ไม่ใช่รวม
    bettingRounds: 2,
    callAmount: {                   // ← ค่าจริงที่ game engine ใช้ (ไม่ใช่ tokenPot.tiers.call)
      initiate:   null,               // ไม่มี Betting
      adept:      null,               // ไม่มี Betting
      mastermind: 600,
      highNoble:  2000,
      lastBoss:   4000,
    },
    autoFoldOnTimeout: true,
    betTimer: {
      initiate:   null,
      adept:      null,
      mastermind: 10,
      highNoble:  8,
      lastBoss:   8,
    },
  },

  // ─── Debt Recovery ───────────────────────────────────────────
  debtRecovery: {
    autoForgive: {
      tiers: ["highNoble", "lastBoss"],  // Auto-forgive เสมอ
      vip: true,                         // VIP Auto-forgive ทุก Tier
    },
    thresholds: {
      initiate:   { small: 200,  medium: 1000 },
      adept:      { small: 1000, medium: 5000 },
      mastermind: { small: 1000, medium: 5000 },
    },
    installment: {
      deductPercent: 0.20,          // หัก 20% จาก Pot ทุกครั้ง
      showDebtBadge: true,
    },
    adReward: {
      tokenPerAd: 500,              // Token ที่ได้ต่อ 1 Ad
    },
  },

  // ─── FoulChecker ─────────────────────────────────────────────
  foulChecker: {
    checkOnReady: true,             // Client ตรวจก่อน Submit
    checkOnShowdown: true,          // Server ตรวจซ้ำที่ Showdown
    penalty: "burn_all_pots",       // เสียทุก Pot → AI Burn
  },

  // ─── Tokenomics ──────────────────────────────────────────────
  tokenomics: {
    rake: 0.05,
    auctionBurn: 1.0,
    foulBurn: true,
    aiWinBurn: true,
    burnRatioTarget: { min: 0.8, max: 1.0 },
    velocityTarget:  { min: 0.3 },
    inflationTarget: { max: 0.05 },
  },

} as const;
```

> v1.3: ลบ section `tripleSweet` (พิมพ์ผิดชื่อจาก "tripleSweep" และซ้ำกับ `tokenPot.rakeJackpot`) ออก — โค้ดจริงไม่มี section แยกต่างหาก, `multiplier`/`penaltyDivisor` เป็นแค่ตัวเลขคงที่ในกติกา (×2, ÷3) ไม่ได้เป็น config field จริงในโค้ด

---

## 6. Season Comparison — Core Differences

| Feature | S1 | S2 | S3 Clan |
|---------|----|----|---------|
| ผู้เล่น | 3H + 1AI | 3H + 1AI | 6H (3+3) ไม่มี AI Seat |
| Pot มาจาก | 4 คน (3H+AI) | 4 คน (3H+AI) | 6H ทั้งหมด |
| AI ชนะ Pile | Burn | Burn | ไม่มี AI Seat |
| Auction Phase | ไม่มี | 6 rounds ก่อน Arrangement | ไม่มี |
| Blind Auction | 2 ใบ | 2 ใบ | 2 ใบ + Team Signal 5 วิ |
| Tie-Break | Human first, then random | Human first, then random | Human first, then random |
| Call Amount | ต่อ Round (Pro+) | ต่อ Round (Pro+) | ต่อ Round — Leader แทนทีม (Pro+) |
| Debt Recovery | Hybrid E | Hybrid E | Hybrid E |

---

*TriplePoker Core Rules v1.3 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
*ทุกค่าในเอกสารนี้ปรับได้ผ่าน gameConfig.ts โดยไม่ต้อง redeploy — gameConfig.ts คือ canon เสมอ*
