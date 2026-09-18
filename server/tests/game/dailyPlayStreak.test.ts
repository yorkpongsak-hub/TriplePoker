import { computeDailyPlayStreak } from '../../src/game/matchStatsService'

describe('eight-day Daily Streak eligibility', () => {
  test.each([1,2,3,4,5,6,7,8])('advances through Day %i without auto-minting a reward', day => {
    const prior=day-1, previousDate=day===1?null:`2026-09-${String(day).padStart(2,'0')}`, today=`2026-09-${String(day+1).padStart(2,'0')}`
    const result=computeDailyPlayStreak(prior,prior,previousDate,0,false,today,'FREE')
    expect(result).toMatchObject({cycleDay:day,tokenReward:0,xpReward:0,rewarded:true})
  })
  test('VIP Pro protects one missed day, Pro Plus protects two, Free protects none',()=>{
    expect(computeDailyPlayStreak(3,3,'2026-09-01',0,false,'2026-09-03','FREE')).toMatchObject({cycleDay:1,shields:0})
    expect(computeDailyPlayStreak(3,3,'2026-09-01',0,false,'2026-09-03','VIP_PRO')).toMatchObject({cycleDay:4,shields:0,shieldUsed:true})
    expect(computeDailyPlayStreak(3,3,'2026-09-01',0,false,'2026-09-04','VIP_PRO_PLUS')).toMatchObject({cycleDay:4,shields:0,shieldUsed:true})
  })
  test('second consecutive missed day breaks VIP Pro but not Pro Plus with two protections',()=>{
    expect(computeDailyPlayStreak(4,4,'2026-09-01',1,false,'2026-09-03','VIP_PRO')).toMatchObject({cycleDay:1})
    expect(computeDailyPlayStreak(4,4,'2026-09-01',1,false,'2026-09-03','VIP_PRO_PLUS')).toMatchObject({cycleDay:5,shields:0})
  })
  test('Day 8 stays available for claim; next unclaimed play starts a safe new cycle',()=>{
    expect(computeDailyPlayStreak(8,8,'2026-09-01',2,true,'2026-09-02','VIP_PRO_PLUS')).toMatchObject({cycleDay:1,shields:2})
  })
})
