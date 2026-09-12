import fs from 'fs'; import path from 'path'
describe('Tier D Lv.500 milestone',()=>{test('migration permanently records the unlock and private history',()=>{const sql=fs.readFileSync(path.resolve(__dirname,'../../../supabase/migrations/053_tier_d_level_500_unlock.sql'),'utf8');expect(sql).toContain('tier_d_table_play_unlocked_at');expect(sql).toContain('PRIMARY KEY(user_id,milestone_key)')})})
