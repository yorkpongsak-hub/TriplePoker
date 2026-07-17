# TriplePoker — Core Rules v1.2
> ⚠️ DEPRECATED — ตัวเลข Ante/Pot/Triple Sweep ใช้ v1.3 แทน (docs/TriplePoker_CoreRules_v1_3.md)
> ไฟล์นี้คงไว้เพื่ออ้างอิงประวัติเท่านั้น ตัวเลขในหมวด 1.10, 2.1, 2.2, 2.3 และ Section 5 ไม่ตรงกับ gameConfig.ts จริงอีกต่อไป
> กติกาหลักที่ใช้ร่วมกันในทุก Season และทุก Tournament
> The Sage Unicorn Studio Co., Ltd.
> Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
> Updated: June 2026
 
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
**Tie-Break: Random Roll**
- Server สุ่ม 50/50 ทันที — ยุติธรรมที่สุด ไม่ขึ้นกับ connection หรือ skill
- Toast message เมื่อ Tie-break ถูกใช้:
| สถานการณ์ | Toast |
|-----------|-------|
| S1/S2 ผู้ชนะ | "Lucky Star! Fortune favors the bold." |
| S3 Clan ผู้ชนะ | "Clan Destiny! Your team's luck is unbreakable." |
| S3 Clan ผู้แพ้ | "The stars weren't aligned this time..." |
 
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
- **Rake 5%** หักจากทุก Pot ที่มีการจ่ายออก (ปกติ)
- **Rake 10%** หักเฉพาะ Triple Sweep Jackpot round (ดู Section 1.10)
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
| Adept | 60 วินาที |
| Mastermind | 45 วินาที |
| High Noble | 40 วินาที |
| The Last Boss | 40 วินาที |
 
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
 
### 1.10 Triple Sweep Jackpot ⭐ NEW v1.2
 
> ผู้เล่นที่ชนะทั้ง 3 กองในรอบเดียว — ใช้ทุก Tier
 
**กฎ:**
- Pot รวม 3 กอง × 2
- ผู้แพ้ 3 คนจ่าย Penalty หาร 3 เท่ากัน
- Rake เพิ่มจาก 5% → **10%** เฉพาะ Jackpot round
- 10% คำนวณจาก **ยอดรวมที่ได้รับ (หลัง ×2)** แล้ว burn ทิ้ง
**ตาราง Triple Sweep Payout:**
 
| Tier | Pot ปกติรวม | ×2 | หัก Rake 10% | ผู้ชนะได้จริง | Penalty/คน |
|------|------------|-----|--------------|--------------|-----------|
| Initiate | 280 | 560 | −56 | **504** | **90** |
| Adept | 680 | 1,360 | −136 | **1,224** | **450** |
| Mastermind | 2,120 | 4,240 | −424 | **3,816** | **1,400** |
| High Noble | 7,000 | 14,000 | −1,400 | **12,600** | **4,650** |
| The Last Boss | 14,000 | 28,000 | −2,800 | **25,200** | **9,300** |
 
> Penalty/คน = (Pot ปกติรวม ÷ 3) ปัดลงให้ลงตัว
 
---
 
## 2. Token Pot System
 
### 2.1 Ante Structure
 
**จ่ายทีเดียวต้น Hand อัตโนมัติ (Pile 1 + Pile 2 + Pile 3 Ante รวมกัน)**
 
| Tier | Token Range | Pile 1 | Pile 2 | Pile 3 | Call/Round | Ante รวม/คน |
|------|-------------|--------|--------|--------|------------|-------------|
| Initiate | 100–9,999 | 10 | 20 | 40 | — | 70 |
| Adept | 10,000–39,999 | 20 | 50 | 100 | 200 | 170 |
| Mastermind | 40,000–99,999 | 80 | 150 | 300 | 600 | 530 |
| High Noble | 100,000+ | 250 | 500 | 1,000 | 2,000 | 1,750 |
| The Last Boss | ตามเงื่อนไข | 500 | 1,000 | 2,000 | 4,000 | 3,500 |
 
> Initiate / Adept ไม่มี Call/Round เพราะไม่มี Grand Finale Betting
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
| Adept | 80 token | 200 token | 400 token |
| Mastermind | 320 token | 600 token | 1,200 token |
| High Noble | 1,000 token | 2,000 token | 4,000 token |
| The Last Boss | 2,000 token | 4,000 token | 8,000 token |
 
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
| Adept | 120 token | 300 token | 600 token |
| Mastermind | 480 token | 900 token | 1,800 token |
| High Noble | 1,500 token | 3,000 token | 6,000 token |
| The Last Boss | 3,000 token | 6,000 token | 12,000 token |
 
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
 
## 5. gameConfig.ts — Core Rules Draft
 
```typescript
// TriplePoker — gameConfig.ts (Core Rules Section)
// ปรับค่าได้ทั้งหมดโดยไม่ต้อง redeploy
 
export const gameConfig = {
 
  // ─── Token Pot ───────────────────────────────────────────────
  tokenPot: {
    tiers: {
      initiate:    { pile1: 10,  pile2: 20,   pile3: 40,   call: null  }, // ไม่มี Call
      adept:       { pile1: 20,  pile2: 50,   pile3: 100,  call: null  }, // ไม่มี Call
      mastermind:  { pile1: 80,  pile2: 150,  pile3: 300,  call: 600   },
      highNoble:   { pile1: 250, pile2: 500,  pile3: 1000, call: 2000  },
      lastBoss:    { pile1: 500, pile2: 1000, pile3: 2000, call: 4000  },
    },
    rake: 0.05,                     // 5% หักจากทุก Pot (ปกติ)
    rakeJackpot: 0.10,              // 10% หักเฉพาะ Triple Sweep round
 
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
    cards: 2,
    tieBreak: "random",             // Random roll 50/50
    auctionBurn: 1.0,               // 100% Burn ทันที
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
    callAmount: {
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
 
  // ─── Triple Sweep Jackpot ────────────────────────────────────
  tripleSweet: {
    multiplier: 2,                  // Pot รวม × 2
    rakeJackpot: 0.10,              // Rake 10% เฉพาะ Jackpot round
    penaltyDivisor: 3,              // หาร 3 เท่ากัน
    enabledAllTiers: true,          // ใช้ทุก Tier
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
 
---
 
## 6. Season Comparison — Core Differences
 
| Feature | S1 | S2 | S3 Clan |
|---------|----|----|---------|
| ผู้เล่น | 3H + 1AI | 3H + 1AI | 6H (3+3) ไม่มี AI Seat |
| Pot มาจาก | 4 คน (3H+AI) | 4 คน (3H+AI) | 6H ทั้งหมด |
| AI ชนะ Pile | Burn | Burn | ไม่มี AI Seat |
| Auction Phase | ไม่มี | 6 rounds ก่อน Arrangement | ไม่มี |
| Blind Auction | 2 ใบ | 2 ใบ | 2 ใบ + Team Signal 5 วิ |
| Tie-Break | Random | Random | Random |
| Call Amount | ต่อ Round (Pro+) | ต่อ Round (Pro+) | ต่อ Round — Leader แทนทีม (Pro+) |
| Debt Recovery | Hybrid E | Hybrid E | Hybrid E |
 
---
 
*TriplePoker Core Rules v1.2 — The Sage Unicorn Studio Co., Ltd.*
*Founder & Chief Architect: Assistant Professor Pongnathee Maneekul*
*ทุกค่าในเอกสารนี้ปรับได้ผ่าน gameConfig.ts โดยไม่ต้อง redeploy*