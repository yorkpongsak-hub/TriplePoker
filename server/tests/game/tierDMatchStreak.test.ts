import { wonTierDStreakMatch } from '../../src/game/tierDMatchStreak'

test('G1 plus G2 base ten beats G3 base eight regardless of actual match score',()=>{
  const results=[{game:1 as const,winnerId:'ai',points:100},{game:2 as const,winnerId:'ai',points:100},{game:3 as const,winnerId:'player',points:6}]
  expect(wonTierDStreakMatch('player',['ai'],results)).toBe(false)
  expect(wonTierDStreakMatch('ai',['player'],results)).toBe(true)
})
test('compares individual AI totals, not combined opponents',()=>{
  expect(wonTierDStreakMatch('player',['ai1','ai2'],[{game:1,winnerId:'ai1'},{game:2,winnerId:'player'},{game:3,winnerId:'ai2'}])).toBe(false)
  expect(wonTierDStreakMatch('player',['ai1','ai2'],[{game:1,winnerId:'ai1'},{game:2,winnerId:'ai2'},{game:3,winnerId:'player'}])).toBe(true)
})
test('ties favor player; unfinished matches cannot increase streak',()=>{
  expect(wonTierDStreakMatch('player',['ai'],[{game:1,winnerId:null},{game:2,winnerId:null},{game:3,winnerId:null}])).toBe(true)
  expect(wonTierDStreakMatch('player',['ai'],[{game:1,winnerId:'player'}])).toBe(false)
})
