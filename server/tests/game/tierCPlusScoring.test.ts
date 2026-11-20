import { TIER_C_PLUS_RULES,TIER_MISSION_DIFFICULTY_WEIGHTS,allocatePotByScore,buildTierCPlusPileTelemetry,calculateGameProfitAndRake,calculatePileScore,detectTripleSweep,distributePilePot,generateTierCPlusMissions,getGamePilePots,getMissionDifficulty,getTierBuyIn,getTierMatchCount,getTierMissionAward,scoreTierCPlusRound } from '../../src/game/tierCPlusScoring'

describe('Tier C+ canonical economy',()=>{
 test.each([['C',600,3,[40,60,100]],['B',1800,3,[120,180,300]],['A',7500,5,[300,450,750]],['A+',25000,5,[1000,1500,2500]],['S',50000,5,[2000,3000,5000]]] as const)('%s buy-in covers its configured Match count',(tier,buyIn,matches,pots)=>{expect(getTierBuyIn(tier)).toBe(buyIn);expect(getTierMatchCount(tier)).toBe(matches);expect(getGamePilePots(tier)).toEqual(pots);expect(pots.reduce((a,b)=>a+b,0)*matches).toBe(buyIn)})
 test('win scores are 10/15/25',()=>{expect(([1,2,3] as const).map(p=>calculatePileScore({pile:p,won:true}).winScore)).toEqual([10,15,25])})
 test.each([[1,[2,4,6,8]],[2,[3,6,9,12]],[3,[4,8,12,15]]] as const)('pile %s mission T1-T4',(pile,values)=>{expect(([1,2,3,4] as const).map(d=>calculatePileScore({pile,won:false,missionCompleted:true,missionDifficulty:d}).missionScore)).toEqual(values)})
 test('losing a pile still earns mission score',()=>expect(calculatePileScore({pile:3,won:false,missionCompleted:true,missionDifficulty:4}).finalPileScore).toBe(15))
 test.each([['COMBO',5],['SUPER_COMBO',12]] as const)('%s is G3-only',(comboType,value)=>{expect(calculatePileScore({pile:2,won:true,comboType}).comboScore).toBe(0);expect(calculatePileScore({pile:3,won:true,comboType}).comboScore).toBe(value)})
 test('sweep is Match-local and G3-only',()=>{expect(detectTripleSweep(['p','p','p'])).toBe('p');expect(detectTripleSweep(['p','p','q'])).toBeNull();expect(calculatePileScore({pile:2,won:true,tripleSweep:true}).tripleSweepScore).toBe(0);expect(calculatePileScore({pile:3,won:true,tripleSweep:true}).tripleSweepScore).toBe(12)})
 test('G3 win + T4 + Super + Sweep = 64',()=>expect(calculatePileScore({pile:3,won:true,missionCompleted:true,missionDifficulty:4,comboType:'SUPER_COMBO',tripleSweep:true}).finalPileScore).toBe(64))
 test('negative score floors to zero',()=>expect(calculatePileScore({pile:1,won:false,penalties:-99}).finalPileScore).toBe(0))
 test('proportional largest remainder is exact and stable',()=>{expect(allocatePotByScore(101,{a:44,b:8,c:-4},['a','b','c'])).toEqual({a:85,b:16,c:0});expect(allocatePotByScore(2,{a:1,b:1,c:1},['a','b','c'])).toEqual({a:1,b:1,c:0})})
 test('zero-total fallback distributes the full pot by stable seat order',()=>expect(distributePilePot(5,{a:0,b:-2,c:0},['a','b','c']).rewards).toEqual({a:2,b:2,c:1}))
 test('every Tier distributes its full Buy-in over 3 or 5 Matches',()=>{expect(TIER_C_PLUS_RULES.matchCount).toEqual({C:3,B:3,A:5,'A+':5,S:5});for(const tier of ['C','B','A','A+','S'] as const)expect(getGamePilePots(tier).reduce((a,b)=>a+b,0)*getTierMatchCount(tier)).toBe(getTierBuyIn(tier))})
 test.each([[45000,30000,{profit:15000,rake:750,finalReturn:44250}],[32000,30000,{profit:2000,rake:100,finalReturn:31900}],[20000,30000,{profit:0,rake:0,finalReturn:20000}]])('profit-only rake %#',(gross,buyIn,expected)=>expect(calculateGameProfitAndRake(gross,buyIn)).toMatchObject(expected))
 test('fractional rake floors deterministically',()=>expect(calculateGameProfitAndRake(601,600).rake).toBe(0))
 test('telemetry is complete and export-ready through Match 5',()=>{const score=calculatePileScore({pile:3,won:true,missionCompleted:true,missionDifficulty:4,comboType:'SUPER_COMBO',tripleSweep:true});expect(buildTierCPlusPileTelemetry({tier:'S',matchIndex:5,player:'p1',score,pilePot:5000,totalPileScore:100,share:.69,grossPileReward:3450,missionTier:4,missionType:'four_of_a_kind',gameReturn:calculateGameProfitAndRake(65000,50000)})).toMatchObject({tier:'S',buyIn:50000,matchIndex:5,pile:'G3',winScore:25,missionScore:15,comboScore:12,tripleSweepScore:12,finalPileScore:64,sharePercent:69,grossPileReward:3450,profit:15000,rake:750,finalReturn:64250})})
})

describe('live engine adapter',()=>{
 const missions=[{pile:1 as const,rank:'high_card' as const},{pile:2 as const,rank:'one_pair' as const},{pile:3 as const,rank:'four_of_a_kind' as const,superComboChallenge:true}]
 test('uses canonical scoring and never legacy 4/6/8 +10',()=>{const scores=scoreTierCPlusRound({playerIds:['p','ai'],winners:['p','p','p'],missions,hands:{p:['high_card','one_pair','four_of_a_kind'],ai:['high_card','one_pair','high_card']}});expect(scores.p).toMatchObject({pile:50,combo:12,sweep:12});expect(scores.p.piles.map(x=>x.winScore)).toEqual([10,15,25])})
 test.each(['initiate','adept','mastermind','highNoble','lastBoss'] as const)('%s gives full mission score only for an exact hand and floors stronger hands to one quarter',(tier)=>{const mission={pile:3 as const,rank:'straight' as const};expect(getTierMissionAward(tier,3,mission,'straight')).toMatchObject({complete:true,score:12});expect(getTierMissionAward(tier,3,mission,'flush')).toMatchObject({complete:true,score:3});expect(getTierMissionAward(tier,3,mission,'three_of_a_kind')).toMatchObject({complete:false,score:0})})
 test('Full House is a difficulty-3 Mission while Four of a Kind remains difficulty 4',()=>{expect(getMissionDifficulty({pile:3,rank:'full_house'})).toBe(3);expect(getMissionDifficulty({pile:3,rank:'four_of_a_kind'})).toBe(4);expect(getTierMissionAward('highNoble',3,{pile:3,rank:'full_house'},'full_house').score).toBe(12)})
 test('Tier S Hard pool can produce a difficulty-3 negative Mission with pile-scaled penalty',()=>{const rolls=[.2,0,.1,.2,.5,.9,.8,0];let index=0;const missions=generateTierCPlusMissions('lastBoss',()=>rolls[index++]??.9);expect(missions).toEqual([{pile:1,rank:'straight',negative:true,penalty:-6},{pile:2,rank:'flush'},{pile:3,rank:'four_of_a_kind'}]);expect(getMissionDifficulty(missions[0])).toBe(3);expect(getTierMissionAward('lastBoss',1,missions[0],'three_of_a_kind')).toMatchObject({complete:false,score:0,penalty:-6})})
 test.each(['adept','mastermind','highNoble'] as const)('%s never draws Tier S negative Missions',(tier)=>{for(let sample=0;sample<500;sample++)expect(generateTierCPlusMissions(tier).some(m=>m.negative)).toBe(false)})
 test('Tier C deals one easy mission to every pile',()=>{for(const roll of [0,.2,.4,.6,.8,.999])expect(generateTierCPlusMissions('initiate',()=>roll).map(m=>m.pile)).toEqual([1,2,3])})
 test('higher tiers use the approved easy/medium/hard/very-hard percentages',()=>{
  expect(TIER_MISSION_DIFFICULTY_WEIGHTS).toEqual({adept:{1:30,2:60,3:10,4:0},mastermind:{1:10,2:50,3:40,4:0},highNoble:{1:5,2:35,3:30,4:30},lastBoss:{1:0,2:20,3:40,4:40}})
 })
 test.each(['initiate','adept','mastermind','highNoble','lastBoss'] as const)('%s missions never descend against G1 < G2 < G3',(tier)=>{
  const order={high_card:0,one_pair:1,two_pair:2,three_of_a_kind:3,straight:4,flush:5,full_house:6,four_of_a_kind:7,straight_flush:8,royal_flush:9}
  for(let sample=0;sample<2_000;sample++){
   const missions=generateTierCPlusMissions(tier)
   expect(missions.map(m=>m.pile)).toEqual([1,2,3])
   expect(order[missions[0].rank]).toBeLessThanOrEqual(order[missions[1].rank])
   expect(order[missions[1].rank]).toBeLessThanOrEqual(order[missions[2].rank])
  }
 })
 test.each([
  ['adept',[[.299,1],[.30,2],[.899,2],[.90,3]]],
  ['mastermind',[[.099,1],[.10,2],[.599,2],[.60,3]]],
  ['highNoble',[[.049,1],[.05,2],[.399,2],[.40,3],[.699,3],[.70,4]]],
  ['lastBoss',[[0,2],[.199,2],[.20,3],[.599,3],[.60,4]]],
 ] as const)('%s mission rolls respect exact boundaries',(tier,cases)=>{for(const [roll,difficulty] of cases){const missions=generateTierCPlusMissions(tier,()=>roll);expect(missions).toHaveLength(3);expect(missions.map(getMissionDifficulty)).toEqual([difficulty,difficulty,difficulty])}})
})
