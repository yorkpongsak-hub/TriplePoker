import { tierDTableCeiling } from '../../src/game/tierDTableUnlock'

describe('Tier D table progression',()=>{
  test('keeps new members in Solo through Bronze Lv. 250',()=>{
    expect(tierDTableCeiling(1)).toBe('D')
    expect(tierDTableCeiling(250)).toBe('D')
    expect(tierDTableCeiling(251)).toBe('initiate')
  })
  test('opens each legacy tier only after its Tier D milestone',()=>{
    expect(tierDTableCeiling(501)).toBe('adept')
    expect(tierDTableCeiling(701)).toBe('mastermind')
    expect(tierDTableCeiling(1001)).toBe('highNoble')
  })
})
