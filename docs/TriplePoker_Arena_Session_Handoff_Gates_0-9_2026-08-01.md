# TriplePoker: Rise — Arena Session Handoff

**วันที่สรุป:** 2026-08-01

**ขอบเขต:** Tier S — Grandmaster และโครงรองรับ Tier S+ — Sovereign

**สถานะล่าสุด:** ปิด Gate 0–10 ใน local implementation แล้ว; migration 017–019 รันบน Supabase แล้ว และ production feature flags ยังปิดอยู่

**Post-Gate 10 integration (2026-08-01):** Client Sovereign Event Hub และ server runtime ชุดแรกเชื่อมใช้งานแล้ว ได้แก่ status, archive/Graveyard, confirmation deadline, 30 Crown check-in, FCFS standby, delayed public-feed replay/capacity, mandatory rename และ lifecycle ticker โดย `SOVEREIGN_ENABLED` ยังปิดตามค่าเริ่มต้น

**Gate 10.7 (2026-08-01):** ปิดสมบูรณ์แล้ว: Token >1,000,000 ปลด Grandmaster ถาวร, Token ลดไม่ล็อกกลับ, `arena_unlocked` ไม่ให้สิทธิ์ย้อนหลัง, Arena Pass 20 Crown เดิมถูกปิด; ลุงรัน migration 020 แล้วและตรวจ backfill ผ่านครบสามบัญชีทดสอบ

---

## 1. เป้าหมายและข้อตกลงหลัก

- Arena ถูกรวมไว้ในแอปหลัก `TriplePoker: Rise`
- Tier S ใช้ชื่อ **Grandmaster** และเป็น Tier ถาวรสูงสุด
- Tier S ปลดล็อกเมื่อ Token **มากกว่า 1,000,000** โดยไม่มีเงื่อนไขอื่น
- Tier S+ ใช้ชื่อ **Sovereign** และเป็นสิทธิ์ชั่วคราวรายเดือน ไม่ใช่ Tier ถาวร
- โต๊ะ Tier S/S+ ต้องสร้างไฟล์และโฟลเดอร์ใหม่ ห้ามนำไฟล์โต๊ะ Tier C–A+ มาแก้เป็นโต๊ะร่วมแบบ dynamic tier
- ทุกโต๊ะต้องมี AI อย่างน้อย 1 ที่นั่ง
- ตำแหน่ง P3 เป็น Boss เสมอ
- กรณีผู้เล่นไม่ครบ ใช้ AI จาก Four Gods ช่วยเป็น Boss/ตัวเติมโต๊ะ
- Client ส่งเพียง intent; Server เป็น authority ของกติกา ไพ่ เวลา และ Economy
- Crown Package ห้ามนำมาเดิมพัน ใช้เฉพาะ Earned Crown
- หน่วยคำนวณภายใน Arena คือ Crest แบบ integer: `12 Crest = 1 Crown`

เอกสาร Canon ที่สร้างไว้:

- `docs/TriplePoker_Arena_Gate0_Canon_v1_0.md`
- `docs/TriplePoker_Rise_Tier_S_SPlus_Development_Spec.md`
- `docs/TriplePoker_Arena_TierSPlus_Canon_Addendum_v1_0.md`

---

## 2. สถานะ Gate 0–9

### Gate 0 — Canon Freeze

- ล็อกชื่อ Tier, unlock rule, economy unit และข้อห้ามสำคัญ
- กำหนดให้ Arena อยู่ในแอปหลัก
- กำหนดโครงสร้างไฟล์แยกจาก Tier เดิม

### Gate 1 — Foundation และ Configuration

- เพิ่ม config ของ Tier S และ phase timeout
- เพิ่ม contract ของ Arena tier, phase, seat, boss composition และ Joker
- เพิ่ม eligibility check แบบ server-side
- เพิ่ม room snapshot เริ่มต้น

### Gate 2 — Crown/Crest Ledger

- เพิ่มการแปลง Crown/Crest แบบ integer
- เพิ่ม Arena ledger gateway และ idempotent Crown mutation
- เพิ่ม migration `015_arena_crest_ledger.sql`
- **ลุงรัน migration 015 แล้ว**

### Gate 3 — Core Rules

- Deck 52 ใบ + Joker 1 ใบ
- Deal, Auction, Joker mode, Wild evaluation, GF และ Fog of War
- Natural hand ชนะ Wild hand เมื่อค่าเท่ากัน
- ห้าม Five of a Kind

### Gate 4 — Matchmaking และ Boss Composition

- ใช้ตัวเลือก A ตามที่ลุงเลือก: Human สูงสุด 3 คน และ P3 เป็น AI/Boss
- 3 Human ภายในหน้าต่างเวลา → roll Boss Encounter
- 2 Human เมื่อ timeout → เติม AI และอนุญาต Dual Boss
- ถ้าไม่ติด Monarch/Soren ใช้ Four Gods เป็น Boss
- Dual Boss มีเฉพาะกรณี 2 Human เพื่อรักษากฎว่าทุกโต๊ะต้องมี AI
- รองรับ Human Boss composition แบบ 1v1 + AI เติม 2 ที่นั่ง

### Gate 5 — Match State Machine

- เพิ่ม state machine 3 Games ต่อ Match
- รองรับ idempotent action ID
- รองรับ phase deadline และ default action
- ครอบคลุม Arrange, Auction, Joker, Discard, Final Lock และ GF

### Gate 6 — Settlement

- เพิ่ม settlement engine สำหรับ Ante, Auction, Call, Boss Fee, Pot, Battle Rewards, Sweep Jackpot และ Crown Sink
- เพิ่ม persistence layer และ match log
- เพิ่ม migration `016_arena_settlement_and_match_log.sql`
- **ลุงรัน migration 016 แล้ว**

### Gate 7 — Disconnect และ Bot Takeover

- 0–3 วินาทีแสดง Reconnecting
- 8 วินาที Bot เข้าควบคุม โดยใช้เวลาที่เหลือของ phase เดิม
- กลับภายใน 30 วินาที รับช่วงคืนเมื่อปลอดภัย
- เกิน 30 วินาที Bot เล่นจนจบ Game ปัจจุบัน
- ไม่กลับก่อน Game ถัดไป Bot เล่นจนจบ Match
- Bot action ที่ commit แล้วห้าม Human ย้อนแก้

### Gate 8 — Tier S Client และ Boss Experience

โฟลเดอร์แยก:

- `client/app/game/grandmaster/`

สิ่งที่ทำแล้ว:

- ใช้ UI/UX ต้นแบบจาก Tier A/A+
- ใช้สกินโต๊ะ Boss Monarch
- ไพ่ทุกที่นั่งแสดงรูปพัด
- ไพ่ผู้เล่นเองเปิดหน้า ฝ่ายตรงข้ามแสดงหลังไพ่
- Crown Ledger แสดง Pot ทั้ง 3, Battle Rewards, Balance และ Table Total
- UI ของ Auction, Joker, GF, reconnect และ result breakdown
- Boss presentation รองรับ `MONARCH` และ `SOREN` แบบ data-driven
- Zustand store รับเฉพาะ server snapshot version ที่ใหม่กว่า
- มี development preview สำหรับ visual QA

### Gate 9 — Main App และ Realtime Integration

Server:

- เพิ่ม Arena runtime แยกใน `server/src/arena/realtime/`
- เพิ่ม Socket.IO namespace `/arena` แยกจาก `gameSocket.ts`
- ตรวจ Supabase access token ก่อนเชื่อมต่อ
- Server อ่าน `token_balance` จากฐานข้อมูลเอง
- เชื่อม queue → composition → match runtime
- มี server ticker สำหรับ queue timeout, match phase และ connection observation
- ป้องกัน actor spoofing และ action ID conflict
- reconnect กลับเข้า match เดิมได้
- Production ต้องตั้ง `ARENA_ENABLED=true` จึงจะเปิด namespace

Client:

- เพิ่ม Grandmaster ใน Tier config, Lobby และ Profile
- เข้า `/game/grandmaster` จาก Main Lobby
- เชื่อม `/arena` ด้วย access token
- ส่ง Arena intent พร้อม unique action ID
- รับ versioned server snapshot
- reconnect แล้ว request snapshot และ composition เดิม

หมายเหตุสำหรับ Gate ถัดไป:

- Realtime transport และ authoritative phase snapshot ต่อแล้ว
- การประกอบ full gameplay projection ที่รวม private hand, Crown Panel mutation ทุกจังหวะ และ settlement breakdown จาก runtime เดียวกัน ควรถูกตรวจ end-to-end อีกครั้งในช่วง integration hardening ก่อน release
- Production feature flag ยังปิดโดยปริยาย

---

## 3. ไฟล์หลักที่เพิ่ม

### Server Arena

- `server/src/arena/config/tierSConfig.ts`
- `server/src/arena/contracts/arenaContracts.ts`
- `server/src/arena/eligibility/tierSEligibility.ts`
- `server/src/arena/economy/crest.ts`
- `server/src/arena/economy/arenaCrestLedger.ts`
- `server/src/arena/cards/arenaDeck.ts`
- `server/src/arena/auction/arenaAuction.ts`
- `server/src/arena/joker/jokerRules.ts`
- `server/src/arena/joker/wildHandEvaluator.ts`
- `server/src/arena/gf/arenaGFRules.ts`
- `server/src/arena/fog/arenaFogOfWar.ts`
- `server/src/arena/matchmaking/arenaMatchmaking.ts`
- `server/src/arena/match/arenaMatchEngine.ts`
- `server/src/arena/settlement/arenaSettlementEngine.ts`
- `server/src/arena/settlement/arenaSettlementPersistence.ts`
- `server/src/arena/connection/arenaConnectionManager.ts`
- `server/src/arena/connection/arenaBotTakeover.ts`
- `server/src/arena/realtime/arenaRuntime.ts`
- `server/src/arena/realtime/arenaSocket.ts`

### Client Tier S

- `client/app/game/grandmaster/index.tsx`
- `client/app/game/grandmaster/GrandmasterTableView.tsx`
- `client/app/game/grandmaster/FanHand.tsx`
- `client/app/game/grandmaster/CrownPanel.tsx`
- `client/app/game/grandmaster/ArenaOverlays.tsx`
- `client/app/game/grandmaster/arenaClientTypes.ts`
- `client/app/game/grandmaster/useArenaTableStore.ts`
- `client/app/game/grandmaster/useArenaTransport.ts`
- `client/app/game/grandmaster/tableContract.ts`
- `client/app/game/grandmaster/README.md`

### Database

- `supabase/migrations/015_arena_crest_ledger.sql`
- `supabase/migrations/016_arena_settlement_and_match_log.sql`

### Tests

- `server/tests/arena/arenaFoundation.test.ts`
- `server/tests/arena/arenaCoreRules.test.ts`
- `server/tests/arena/arenaMatchmaking.test.ts`
- `server/tests/arena/arenaMatchEngine.test.ts`
- `server/tests/arena/arenaSettlementEngine.test.ts`
- `server/tests/arena/arenaSettlementPersistence.test.ts`
- `server/tests/arena/arenaConnectionManager.test.ts`
- `server/tests/arena/arenaRuntime.test.ts`

---

## 4. ผลตรวจล่าสุด

- Client TypeScript: ผ่าน
- Server TypeScript build: ผ่าน
- Arena tests: **58/58 ผ่าน**
- Legacy regression ปกติ: **366/366 ผ่าน**
- High Noble grace tests: **14/14 ผ่าน**
- Regression รวม: **380/380 ผ่าน**
- Expo Web visual QA ของ Tier S: ผ่าน
- Browser console ระหว่าง visual QA: ไม่มี error

---

## 5. ประเด็นที่ต้องออกแบบ Tier S+ ก่อน Gate 10

### มติที่ล็อกเพิ่มแล้ว — The Last Boss Succession

- Tier S+ มีบอสเดียวคือ The Last Boss AI; ชื่อบัลลังก์ยุคแรกคือ **CAELUM**
- Monarch และ Soren เล่นเฉพาะ Tier S
- ผู้ชนะอันดับหนึ่งเพียงคนเดียวเป็นผู้พิชิต The Last Boss
- ชื่อเดิมของผู้พิชิตกลายเป็นชื่อบัลลังก์ยุคถัดไป และผู้พิชิตต้องเปลี่ยนชื่อผู้เล่นใหม่ทันที
- ชื่อที่เคยเป็นชื่อ The Last Boss ถูกสงวนถาวรและห้ามผู้เล่นตั้งซ้ำ
- AI core, personality และ difficulty ไม่เปลี่ยนตามชื่อผู้พิชิต
- ประวัติแต่ละรัชสมัยถูกจารึกแบบ append-only ใน The Last Boss Graveyard
- รายละเอียด authoritative อยู่ใน `docs/TriplePoker_Arena_TierSPlus_Canon_Addendum_v1_0.md`

หัวข้อต่อไปนี้จาก Consolidated Specification ถูกปิดใน `TriplePoker_Arena_TierSPlus_Canon_Addendum_v1_0.md` แล้ว:

1. จำนวนผู้ได้รับสิทธิ์ Sovereign จริงต่อเดือน โดยมีเพดานไม่เกิน 10 คน
2. สูตร Monthly Performance Score
3. Tie-break เมื่อคะแนนเท่ากัน
4. ช่วงเวลาตัดรอบและ timezone ที่ใช้เป็น authority
5. กฎ minimum 10 Matches และการนับ match ที่ disconnect/ถูก Bot takeover
6. รูปแบบ Match พิเศษในสัปดาห์สุดท้าย
7. จำนวนผู้เล่นและองค์ประกอบ Human/AI/Boss ของ S+ Match
8. Stake, Fee, Reward, Crown Sink และเพดานความเสี่ยงของ S+
9. สิทธิ์ Sovereign เริ่มและหมดอายุเวลาใด
10. กรณีผู้เล่นถูกแบน, ถอนตัว, ไม่ออนไลน์ หรือมีที่นั่งว่าง
11. Reward แบบถาวรหรือ Cosmetic ที่ไม่ทำลาย Economy
12. Boss composition และบทบาท Monarch/Soren ใน S+
13. Dialogue/Lore scenes ที่ต้องเปิดเผยใน Sovereign Match
14. Spectator, replay, leaderboard visibility และ Fog of War
15. การ audit, dispute และการ rerun monthly selection

รายละเอียด Dialogue script รายบรรทัด, final art asset, AI numeric tuning หลัง playtest และ production capacity/load tuning ยังทำภายหลังได้โดยไม่ขวาง Gate 10 foundation

---

## 6. Acceptance ที่ควรล็อกก่อนเริ่ม Gate 10

ควรได้เอกสาร Tier S+ ฉบับใหม่ที่ตอบอย่างน้อย:

- Eligibility input และสูตรคะแนน
- Ranking/tie-break แบบ deterministic
- Selection count
- Monthly lifecycle และ timezone
- Special-match rules
- S+ economy table
- Reward table
- Disconnect/replacement policy
- Boss/Lore composition
- Match log และ admin operation ที่จำเป็น

เมื่อได้คำตอบแล้ว ให้บันทึกเป็น Canon Addendum หรือแก้ Consolidated Development Specification ก่อนเขียน migration/code ของ Gate 10

**ดำเนินการแล้ว:** สร้าง Canon Addendum และร่าง `docs/TriplePoker_Arena_Gate10_Implementation_Plan_v1_0.md` แล้ว ยังไม่ได้เริ่ม code หรือ migration ของ Gate 10

**อัปเดตหลังอนุมัติ:** Gate 10.0–10.1 เพิ่ม typed config/contracts และสร้าง `supabase/migrations/017_sovereign_foundation.sql` แล้ว ลุงอนุมัติให้รัน SQL และ migration 017 รันสำเร็จเมื่อ 2026-08-01; verification ยืนยันตารางหลัก, Purchased Crest column, CAELUM reservation และ RLS เป็น `true` ทั้งหมด ผลตรวจล่าสุด Arena 67/67 และ server regression 389/389 ผ่านทั้งหมด

**Gate 10.2:** เพิ่ม `sovereignSchedule.ts`, `monthlySovereignScore.ts`, `sovereignSelection.ts` และ `sovereignSelectionJob.ts` ครบ calendar/MSS Best-10/tie-break/แยก Pool/เลือก 3+3+3/fallback/idempotent cutoff boundary พร้อม guard Ascendant active-at-completion และ eligible-at-cutoff ผลตรวจ Arena 84/84 และ server regression 406/406 ผ่านทั้งหมด

**Gate 10.3:** เพิ่ม `sovereignAttendance.ts`, `sovereignWalletReservation.ts`, `sovereignStandby.ts` และ migration `018_sovereign_wallet_and_standby_rpc.sql` ครบ confirmation/reserve offer/check-in/no-show/mixed-source Crown/FCFS grace/atomic promotion ผลตรวจ Arena 96/96 และ server regression 418/418 ผ่านทั้งหมด; ลุงยืนยันว่ารัน migration 018 บน Supabase เรียบร้อยแล้ว

**Gate 10.4:** เพิ่ม `discardShowdown.ts`, `lastBossConquest.ts`, `lastBossIdentity.ts` และ migration `019_last_boss_atomic_succession.sql` ครบ Pok Deng tie-break/overall conquest/Bot restriction/dark silhouette/CAELUM activation/atomic succession/permanent reserved name/mandatory rename/cosmetic entitlement ผลตรวจ Arena 105/105 และ server regression 427/427 ผ่านทั้งหมด; ลุงยืนยันว่ารัน migration 019 บน Supabaseเรียบร้อยแล้ว

---

## 7. จุดเริ่มงานครั้งถัดไป

คำสั่งแนะนำสำหรับ Session ถัดไป:

> อ่าน `docs/TriplePoker_Arena_Session_Handoff_Gates_0-9_2026-08-01.md` และเอกสารออกแบบ Tier S+ ฉบับใหม่ จากนั้นตรวจ conflict กับ Arena Canon เดิม แล้วร่างแผน Gate 10 แบบย่อยให้อนุมัติก่อนแก้ code หรือสร้าง migration

ห้ามเริ่ม Gate 10 จาก Pending placeholder เดิมโดยเดาค่าที่ลุงยังไม่ได้ล็อก
