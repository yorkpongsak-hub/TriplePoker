import fs from 'fs'
import path from 'path'

describe('migration 020 permanent Grandmaster unlock', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/020_unified_grandmaster_unlock.sql'), 'utf8')

  test('uses exclusive Token threshold and never grants access from arena_unlocked', () => {
    expect(sql).toContain('NEW.token_balance > 1000000')
    expect(sql).toContain('WHERE token_balance > 1000000')
    expect(sql).not.toMatch(/WHERE\s+arena_unlocked\s*=\s*TRUE/i)
  })

  test('records a permanent ceiling and unlock timestamp', () => {
    expect(sql).toContain("NEW.tier_unlocked_max := 'grandmaster'")
    expect(sql).toContain('grandmaster_unlocked_at')
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF token_balance')
  })
})
