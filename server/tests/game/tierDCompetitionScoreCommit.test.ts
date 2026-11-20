import fs from 'fs'
import path from 'path'

describe('Tier D competition score commit', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/083_tier_d_competition_score_idempotency.sql'), 'utf8')

  test('credits each completed level exactly once without resetting valid totals', () => {
    expect(sql).toContain('PRIMARY KEY (user_id, league_id, cycle_no, level)')
    expect(sql).toContain('ON CONFLICT(user_id,league_id,cycle_no,level) DO NOTHING')
    expect(sql).toContain('IF inserted_count=1 THEN')
    expect(sql).toContain('tier_d_competition_progress.league_points+EXCLUDED.league_points')
    expect(sql).not.toContain('DELETE FROM public.tier_d_competition_progress')
  })

  test('returns the auditable accumulated-score transition', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.add_tier_d_competition_points(uuid,text,integer,integer,integer)')
    expect(sql).toContain('RETURNS jsonb')
    expect(sql).toContain("'earnedScore'")
    expect(sql).toContain("'previousTotal'")
    expect(sql).toContain("'newTotal'")
    expect(sql).toContain("'credited'")
  })
})
