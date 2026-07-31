# TriplePoker — Ascendant Spec v1.2

**สถานะ:** Canon — แทนที่ Ascendant Spec v1.1 ทั้งหมด  
**วันที่:** 30 กรกฎาคม 2026  
**Changelog v1.2:**
- เพิ่ม Ascendant Pass + Arena Pass (กลไกใหม่ — ซื้อด้วย Earned Crown)
- เพิ่ม The Crown Vault UI spec (3 ส่วน)
- ชี้แจง Account Age 180 วัน = เงื่อนไข Tier S ปกติเท่านั้น ไม่ใช่ Ascendant
- เพิ่ม Crown demote policy (Crown คงอยู่หลัง demote)
- เพิ่ม เส้นทางสำรอง Tier S ปกติ
- ผูกกับ EconomyProgression Spec v2.0

---

## 1. ภาพรวม

Ascendant คือ Transitional Tier เชื่อม Main App กับ The Arena — เป็น "shortcut" ที่ข้าม Time Gate 180 วันได้ แลกกับความเสี่ยง "โอกาสครั้งเดียว + 30 วันจำกัด"

---

## 2. เส้นทางเข้า Arena (2 ทาง)

### 2.1 เส้นทาง Ascendant (shortcut — ครั้งเดียวต่อ account)

| ขั้นตอน | เงื่อนไข |
|---|---|
| 1. ปลดล็อก Crown Vault | tier_unlocked_max ≥ highNoble |
| 2. แลก Token→Crown | 1 Crown = 5,000 Token (ทางเดียว) |
| 3. ซื้อ Ascendant Pass | 20 Earned Crown + token ≥600,000 + Monarch Slayer (monarch_victories ≥ 1) |
| 4. Ascendant Window เปิด | 30 วัน นับจากซื้อ Pass |
| 5a. ผ่าน | token ถึง 1,000,000 ภายใน 30 วัน → status = 'passed' |
| 5b. ล้มเหลว | token < 1,000,000 เมื่อครบ 30 วัน → demote กลับ HighNoble, status = 'failed' |
| 6. ซื้อ Arena Pass | 20 Earned Crown → ปลดล็อก Tier S / The Arena |

### 2.2 เส้นทาง Tier S ปกติ (ไม่จำกัดครั้ง)

| เงื่อนไข | ค่า |
|---|---|
| Token | ≥ 1,000,000 |
| Account Age | ≥ 180 วัน (Time Gate) |
| Arena Pass | 20 Earned Crown |

ผู้เล่นที่พลาด Ascendant ยังเข้า Arena ได้ทาง Tier S ปกติ — ใช้เวลานานกว่าแต่ไม่มีข้อจำกัดครั้ง

---

## 3. กฎสำคัญ

| กฎ | รายละเอียด |
|---|---|
| One-time | Ascendant เป็นได้ครั้งเดียวต่อ account — status 'failed' = ไม่สามารถ opt-in ซ้ำ |
| Crown คงอยู่หลัง demote | Crown ที่แลกไว้ไม่ถูก reset เมื่อ demote กลับ HighNoble |
| opt-in = Buy Pass | ไม่มี auto-start — ผู้เล่นต้องกดซื้อ Ascendant Pass + confirm dialog |
| Auto-pass | ถ้า token ถึง 1M ระหว่าง window → status เปลี่ยนเป็น 'passed' ทันที (ไม่ต้องรอหมด 30 วัน) |
| Account Age | ไม่ใช่เงื่อนไข Ascendant — เฉพาะ Tier S ปกติเท่านั้น |
| Server-authoritative | Ascendant status, Crown balance, Window expiry คำนวณฝั่ง server เท่านั้น |

---

## 4. Crown — 2 ประเภทแยกเด็ดขาด

| ประเภท | ที่มา | ใช้ได้กับ | ห้าม |
|---|---|---|---|
| **Earned Crown** | แลกจาก Token (1:5,000) | Match Stake + Ascendant Pass + Arena Pass + Reward Pool | — |
| **Crown Package** | ซื้อด้วยเงินจริง (IAP) | Cosmetics ใน The Crown Vault เท่านั้น | Match Stake, ซื้อ Pass เด็ดขาด |

เหตุผล: ป้องกันไม่ให้เงินเดิมพันจริงในแมตช์มาจากการซื้อโดยตรง (gambling compliance)

---

## 5. The Crown Vault — UI Spec

อยู่ภายใน Shop (tab "CROWN VAULT") เปิดเมื่อ tier_unlocked_max ≥ highNoble

### 5.1 Token → Crown Exchange

- Input: จำนวน Crown ที่ต้องการ (ขั้นต่ำ 1)
- แสดง: Token cost = Crown × 5,000
- แสดง: Crown balance ปัจจุบัน (Earned + Package แยก)
- ปุ่ม: "Exchange" (disable ถ้า token ไม่พอ)
- ข้อความเตือน: "Token exchanged to Crown cannot be converted back."

### 5.2 Ascendant Pass Card

- ราคา: 20 Earned Crown
- สถานะแสดงตาม ascendant_status:

| status | แสดง |
|---|---|
| 'none' + eligible | "Buy Ascendant Pass" (active) |
| 'none' + ไม่ eligible | แสดงเงื่อนไขที่ขาด (token 600k / Monarch Slayer) |
| 'active' | "Window active — X days remaining" |
| 'passed' | "Ascended ✓" (greyed out) |
| 'failed' | "Opportunity passed — Reach Tier S to enter The Arena" |

- Confirm dialog: "Begin your Ascension? You have 30 days to reach 1,000,000 tokens. This is a one-time opportunity."

### 5.3 Arena Pass Card

- ราคา: 20 Earned Crown
- เงื่อนไข: ascendant status = 'passed' หรือ Tier S ปกติ (token ≥1M + age ≥180)
- MVP: แสดง "The Arena — Coming Soon" (Arena ยังไม่เปิด)

---

## 6. DB Schema

| Column | Type | Default | หมายเหตุ |
|---|---|---|---|
| ascendant_status | jsonb | `{"status":"none"}` | status: 'none' / 'active' / 'passed' / 'failed' + startedAt + expiresAt |
| crown_balance | int | 0 | Earned Crown (แลกจาก Token) |
| crown_package_balance | int | 0 | Crown Package (IAP — แยกเด็ดขาด) |
| arena_unlocked | boolean | false | ซื้อ Arena Pass แล้ว |
| monarch_victories | int | 0 | ใช้เป็น Monarch Slayer badge check |

---

## 7. Server Endpoints

| Endpoint | Method | หน้าที่ |
|---|---|---|
| /crown-vault/exchange | POST | Token→Crown exchange |
| /crown-vault/buy-pass | POST | ซื้อ Ascendant Pass / Arena Pass |
| /crown-vault/status | GET | ดึง ascendant status + crown balance + eligibility |

---

## 8. Ascendant Window Expiry

เช็ค on-demand (ไม่ใช่ cron job) ที่จุด:
- User login / connect socket
- เข้า lobby (lobby:subscribe)
- จบ match (settleEscrow)

Logic:
```
if status === 'active' && now() > expiresAt:
  if token >= 1,000,000: status = 'passed'
  else: status = 'failed' (demote, Crown คงอยู่)
```

---

## 9. gameConfig.ts

```ts
ascendantConfig: {
  tokenMin: 600_000,
  windowDays: 30,
  passTarget: 1_000_000,
  requireMonarchVictory: true,
},

crownVaultConfig: {
  tokenPerCrown: 5_000,
  ascendantPassCost: 20,
  arenaPassCost: 20,
  minExchangeAmount: 1,
},
```

---

## 10. Progression Gate Integration

ตาม EconomyProgression Spec v2.0 §6:

```ts
progressionGate: {
  ascendant: { minToken: 600_000, minDays: null, skill: "monarchSlayer" },
  arena:     { minToken: 1_000_000, minDays: 180, skill: "pass" },
}
```

- Ascendant ไม่มี minDays (ไม่มี account age requirement)
- Arena minDays 180 = เส้นทาง Tier S ปกติ (Ascendant shortcut ข้ามได้)

---

## 11. Spec ที่ถูกแทนที่

| Spec เดิม | สิ่งที่เปลี่ยน |
|---|---|
| Ascendant Spec v1.1 | ทั้งฉบับ — v1.2 แทนที่ |
| MasterPlan v1.1 §5 | เงื่อนไขเข้า Ascendant (เพิ่ม Pass + ลบ account age) |
| MasterPlan v1.1 §14 Q4 | เส้นทางสำรองชี้แจงเป็น Tier S ปกติ (ไม่ใช่ Ascendant Star อย่างเดียว) |

Spec อื่นที่ยังคงเดิม: EconomyProgression v2.0, Monarch v1.3, CoreRules v1.2, AutoSortFee v2.0
