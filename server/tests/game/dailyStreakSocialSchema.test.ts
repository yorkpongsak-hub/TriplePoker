import { readFileSync } from 'fs'
import { resolve } from 'path'

const sql=readFileSync(resolve(__dirname,'../../../supabase/migrations/072_unified_ads_daily_streak_social_items.sql'),'utf8')

test('Daily Streak migration persists social inventory and makes the claim receipt unique per Bangkok day',()=>{
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.social_item_inventory')
  expect(sql).toContain("item_key IN ('heart','rose')")
  expect(sql).toContain('PRIMARY KEY(user_id,claim_day)')
  expect(sql).toContain("IF u.vip_status='vip_pro' THEN")
  expect(sql).toContain("social := CASE WHEN random() < .5 THEN 'heart' ELSE 'rose' END")
})

test('normal Daily Streak pool excludes Heart/Rose and uses independent weighted normal draws',()=>{
  expect(sql).toContain("WHEN roll < 5 THEN 'undo'")
  expect(sql).toContain("WHEN roll < 13 THEN 'shuffle'")
  expect(sql).toContain("WHEN roll < 25 THEN 'double_pile'")
  expect(sql).toContain("WHEN roll < 43 THEN 'swap'")
  expect(sql).toContain("WHEN roll < 70 THEN 'auto_sort' ELSE 'freeze'")
  expect(sql).toContain('FOR slot IN 1..draw_count LOOP')
})
