import fs from 'fs'
import path from 'path'
import { tierDRewardQuantity } from '../../src/game/tierDRewards'
describe('Tier D rewards', () => {
  test('free claim is x1; successful ad and No-Ads are x2; failed ad never doubles', () => {
    expect(tierDRewardQuantity('claim', false)).toBe(1); expect(tierDRewardQuantity('ad', true)).toBe(2)
    expect(tierDRewardQuantity('ad', false)).toBe(1); expect(tierDRewardQuantity('no_ads', false)).toBe(2)
  })
  test('migration makes duplicate grants and achievements idempotent and keeps achievement out of item multiplier', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/051_tier_d_awards_rewards.sql'), 'utf8')
    expect(sql).toContain("PRIMARY KEY (user_id, league_id, award_type)"); expect(sql).toContain('ON CONFLICT DO NOTHING')
    expect(sql).toContain("award_type IN ('medal','trophy')"); expect(sql).toContain('final_row.trophy_eligible')
    expect(sql).toContain("item_key IN ('single_card_swap','full_redraw','bomb_defuser')")
  })
})
