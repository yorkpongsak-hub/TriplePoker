# TriplePoker — P0 Supabase Migration Runbook v1.0

**วันที่:** 31 กรกฎาคม 2026  
**ขอบเขต:** Test/Staging ก่อนเท่านั้น — SQL ทุกไฟล์รันด้วยมือใน Supabase Dashboard  
**ห้าม:** รันบน Production ก่อนผ่าน verification ทุกข้อ

## 1. Backup และ Preflight

1. Export schema และสำรองตาราง `users`, `match_escrow`, `match_wins`
2. ตรวจ active escrow ซ้ำ:

```sql
SELECT user_id, COUNT(*)
FROM public.match_escrow
WHERE status = 'in_match'
GROUP BY user_id
HAVING COUNT(*) > 1;
```

ผลต้องเป็น 0 แถวก่อนรัน migration 011 หากพบข้อมูล ห้ามลบเอง ให้ตรวจแต่ละ `room_id`
แล้ว refund/settle ตามสถานะจริงก่อน

## 2. ลำดับ Migration

รันตามลำดับ ห้ามสลับ:

1. `005_nine_sentinels.sql`
2. `009_match_wins.sql`
3. `010_ascendant_crown_vault.sql`
4. `011_atomic_match_escrow.sql`

ทุกไฟล์มี `NOTIFY pgrst, 'reload schema';` แล้ว

## 3. Schema Verification

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'conquered_sentinels',
    'ascendant_status',
    'crown_balance',
    'crown_package_balance',
    'arena_unlocked'
  )
ORDER BY column_name;

SELECT to_regclass('public.match_wins') AS match_wins;
SELECT to_regclass('public.match_escrow') AS match_escrow;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'begin_match_escrow',
    'settle_match_escrow',
    'refund_match_escrow',
    'exchange_token_to_crown'
  )
ORDER BY routine_name;
```

คาดหวัง: users ครบ 5 columns, ตารางครบ 2 ตาราง และ RPC ครบ 4 รายการ

## 4. Atomic Escrow Smoke Test

ใช้ test account เท่านั้น จด `token_balance` ก่อนเริ่ม แล้วทดสอบผ่าน server endpoint/socket:

1. เข้า Initiate — wallet ลด 500 และมี escrow `in_match` หนึ่งแถว
2. กดเข้าโต๊ะซ้ำจากอีก client — ต้องได้ `ACTIVE_MATCH_EXISTS` และ wallet ห้ามลดซ้ำ
3. จบแมตช์ — escrow เป็น `settled`, `final_stack` มีค่า และ wallet เท่ากับ
   `balance_before - buyin + final_stack`
4. ยิง settle ซ้ำ — ต้องได้ `ESCROW_NOT_ACTIVE` และ wallet ห้ามเพิ่ม
5. ทำซ้ำกับ Adept 2,000, Mastermind 15,000 และ High Noble 30,000

## 5. Rollback

หาก RPC มีปัญหา ให้หยุด server ก่อน ห้ามย้อนกลับไปใช้ settlement แบบสองคำสั่ง
เก็บข้อมูล `match_escrow` ไว้ทั้งหมด แล้วแก้ RPC ด้วย `CREATE OR REPLACE FUNCTION`
เพราะการ drop ตารางหรือคืนเงินแบบเหมาอาจทำให้เครดิตซ้ำ

## 6. Verification Log

**31 กรกฎาคม 2026 — Test Supabase**

- Migrations 005, 009, 010, 011 รันสำเร็จ
- users columns / `match_wins` / `match_escrow` / atomic RPC ตรวจพบครบ
- Active escrow ค้าง 0 รายการ และไม่มีผู้ใช้ที่มี active escrow ซ้ำ
- Smoke test ผ่านครบ Initiate 500, Adept 2,000, Mastermind 15,000, High Noble 30,000
- แต่ละ Tier ผ่าน begin → duplicate guard → refund
- แต่ละ Tierผ่าน begin → settle → double-settle guard
- ยอดบัญชีทดสอบก่อนและหลังเท่ากัน: 153,561 Token
