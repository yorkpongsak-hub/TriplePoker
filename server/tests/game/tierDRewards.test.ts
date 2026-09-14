import fs from 'fs'
import path from 'path'
import { tierDLevelRewardPlan, tierDRewardQuantity } from '../../src/game/tierDRewards'
describe('Tier D rewards', () => {
  test('free claim is x1; successful ad and No-Ads are x2; failed ad never doubles', () => {
    expect(tierDRewardQuantity('claim', false)).toBe(1); expect(tierDRewardQuantity('ad', true)).toBe(2)
    expect(tierDRewardQuantity('ad', false)).toBe(1); expect(tierDRewardQuantity('no_ads', false)).toBe(2)
  })
  test('Level-clear item sets follow the four League reward bands', () => {
    expect(tierDLevelRewardPlan(1)).toEqual({ baseItemTypes: 1, baseQuantityPerType: 1, adBonusQuantity: 1 })
    expect(tierDLevelRewardPlan(150)).toEqual({ baseItemTypes: 1, baseQuantityPerType: 1, adBonusQuantity: 1 })
    expect(tierDLevelRewardPlan(151)).toEqual({ baseItemTypes: 2, baseQuantityPerType: 1, adBonusQuantity: 1 })
    expect(tierDLevelRewardPlan(350)).toEqual({ baseItemTypes: 2, baseQuantityPerType: 1, adBonusQuantity: 1 })
    expect(tierDLevelRewardPlan(351)).toEqual({ baseItemTypes: 2, baseQuantityPerType: '1-2', adBonusQuantity: 2 })
    expect(tierDLevelRewardPlan(1000)).toEqual({ baseItemTypes: 2, baseQuantityPerType: '1-2', adBonusQuantity: 2 })
    expect(tierDLevelRewardPlan(1001)).toEqual({ baseItemTypes: 3, baseQuantityPerType: 1, adBonusQuantity: 2 })
  })
  test('migration makes duplicate grants and achievements idempotent and keeps achievement out of item multiplier', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/051_tier_d_awards_rewards.sql'), 'utf8')
    expect(sql).toContain("PRIMARY KEY (user_id, league_id, award_type)"); expect(sql).toContain('ON CONFLICT DO NOTHING')
    expect(sql).toContain("award_type IN ('medal','trophy')"); expect(sql).toContain('final_row.trophy_eligible')
    expect(sql).toContain("item_key IN ('single_card_swap','full_redraw','bomb_defuser')")
  })
  test('Level reward-set migration stores independent reward slots and server-owned ad quantities', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/062_tier_d_league_level_reward_sets.sql'), 'utf8')
    expect(sql).toContain('PRIMARY KEY (user_id, level, reward_slot)')
    expect(sql).toContain('IF p_level <= 150 THEN base_slots := 1')
    expect(sql).toContain('ELSIF p_level <= 350 THEN base_slots := 2')
    expect(sql).toContain('ELSIF p_level <= 1000 THEN base_slots := 2; ad_quantity := 2')
    expect(sql).toContain('ELSE base_slots := 3; base_quantity := 1; ad_quantity := 2')
    expect(sql).toContain("'adBonusQuantity',ad_quantity")
  })
})
