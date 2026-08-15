import fs from 'fs'
import path from 'path'

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/046_atomic_progression_purchases.sql'),
  'utf8',
)

describe('046 atomic progression purchases migration', () => {
  test('Badge purchase writes ownership and Ledger burn in one RPC', () => {
    expect(sql).toContain('FUNCTION purchase_badge_atomic')
    expect(sql).toContain('INSERT INTO user_badges')
    expect(sql).toContain("p_reason := 'SHOP_PURCHASE'")
    expect(sql).toContain("'currency', 'TOKEN', 'amount', -p_price")
  })

  test('Ascendant Pass burns earned CREST and writes status in one RPC', () => {
    expect(sql).toContain('FUNCTION purchase_ascendant_pass_atomic')
    expect(sql).toContain("'currency', 'CREST', 'wallet', 'EARNED'")
    expect(sql).toContain('UPDATE users SET ascendant_status = p_new_status')
  })

  test('RPCs are service-role only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION purchase_badge_atomic')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION purchase_ascendant_pass_atomic')
  })
})
