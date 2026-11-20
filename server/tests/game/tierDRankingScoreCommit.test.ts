import fs from 'fs'
import path from 'path'

describe('Tier D lifetime Top 20 score commit', () => {
  const sql=fs.readFileSync(path.resolve(__dirname,'../../../supabase/migrations/084_tier_d_lifetime_ranking_score.sql'),'utf8')

  test('credits a completed level once and keeps the cumulative total separate from competition cycles',()=>{
    expect(sql).toContain('PRIMARY KEY (user_id, level)')
    expect(sql).toContain('ON CONFLICT(user_id,level) DO NOTHING')
    expect(sql).toContain('total_score=total_score+safe_score')
    expect(sql).not.toContain('DELETE FROM public.tier_d_competition_progress')
  })

  test('backfills a valid non-zero lower bound without overwriting a larger stored total',()=>{
    expect(sql).toContain('tier_d_best_match_score')
    expect(sql).toContain('SUM(league_points)')
    expect(sql).toContain('GREATEST(tier_d_ranking_score_totals.total_score,EXCLUDED.total_score)')
  })

  test('returns the auditable score transition used by the automatic Top 20 screen',()=>{
    expect(sql).toContain("'earnedScore'")
    expect(sql).toContain("'previousTotal'")
    expect(sql).toContain("'newTotal'")
    expect(sql).toContain("'credited'")
  })
})
