import { AI_CONFIGS, FOUR_GODS } from '../../src/game/aiEngine'
import { comboBonus, generateMissions, missionResult } from '../../src/game/leagueGameplay'
import { createTierDLevel, resetTierDForNextDuel } from '../../src/game/tierDSolo'
import { TIER_D_RISE_DIFFICULTY_WEIGHTS, TIER_D_RISE_SUPER_COMBO_POOLS, selectTierDRiseSuperCombo, tierDRiseDifficultyWeights } from '../../src/game/tierDRiseSuperCombo'

const ids = (difficulty: keyof typeof TIER_D_RISE_SUPER_COMBO_POOLS) => TIER_D_RISE_SUPER_COMBO_POOLS[difficulty].map(item => item.id)
const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000)

describe('Rise Lv.1000+ Super Combo attempt selection', () => {
  test('Lv.999 stays on the legacy generator and has no Rise selection metadata', () => {
    const legacy = createTierDLevel(999, 'human', seeded(999))
    expect(legacy.riseSuperCombo).toBeUndefined()
    expect(generateMissions(999, () => 0)).toEqual([
      { pile: 1, rank: 'three_of_a_kind', superComboChallenge: true },
      { pile: 2, rank: 'straight', superComboChallenge: true },
      { pile: 3, rank: 'four_of_a_kind', superComboChallenge: true },
    ])
  })

  test('Lv.1000 selects from the configured random pool instead of forcing Ultimate', () => {
    expect(selectTierDRiseSuperCombo(1000, () => 0)).toMatchObject({ id: 'SC-05', difficulty: 'MEDIUM' })
    expect(selectTierDRiseSuperCombo(1000, (() => { const values=[.31,0];let i=0;return()=>values[i++] })())).toMatchObject({ id: 'SC-03', difficulty: 'HARD' })
    expect(selectTierDRiseSuperCombo(1000, () => .99)).toMatchObject({ id: 'ULTIMATE', difficulty: 'VERY_HARD' })
  })

  test('configured pools contain exactly the approved definitions', () => {
    expect(ids('MEDIUM')).toEqual(['SC-05','SC-06','SC-10','SC-11'])
    expect(ids('HARD')).toEqual(['SC-03','SC-07','SC-08','SC-09','SC-12'])
    expect(ids('VERY_HARD')).toEqual(['SC-14','VH-01','VH-02','VH-03','ULTIMATE'])
  })

  test.each([
    [1000,.30,.50,.20],[1199,.30,.50,.20],[1200,.28,.50,.22],[1400,.26,.50,.24],
    [1600,.24,.50,.26],[1800,.22,.50,.28],[2000,.20,.50,.30],[9999,.20,.50,.30],
  ])('difficulty weights at Lv.%i are exact', (level, medium, hard, veryHard) => {
    expect(tierDRiseDifficultyWeights(level)).toMatchObject({medium,hard,veryHard})
  })

  test('threshold config is centralized and complete', () => {
    expect(TIER_D_RISE_DIFFICULTY_WEIGHTS.map(row=>row.fromLevel)).toEqual([1000,1200,1400,1600,1800,2000])
    for (const row of TIER_D_RISE_DIFFICULTY_WEIGHTS) expect(row.medium+row.hard+row.veryHard).toBeCloseTo(1)
  })

  test.each(['MEDIUM','HARD','VERY_HARD'] as const)('%s entries have equal-width deterministic selection intervals', difficulty => {
    const pool=TIER_D_RISE_SUPER_COMBO_POOLS[difficulty]
    const difficultyRoll=difficulty==='MEDIUM'?0:difficulty==='HARD'?.4:.99
    pool.forEach((entry,index)=>{
      const values=[difficultyRoll,(index+.5)/pool.length];let cursor=0
      expect(selectTierDRiseSuperCombo(1000,()=>values[cursor++]).id).toBe(entry.id)
    })
  })

  test('one selection remains unchanged through Duel 1, 2 and 3', () => {
    const state=createTierDLevel(1000,'human',seeded(42))
    const selected=JSON.stringify({missions:state.missions,meta:state.riseSuperCombo})
    resetTierDForNextDuel(state,seeded(1));expect(JSON.stringify({missions:state.missions,meta:state.riseSuperCombo})).toBe(selected)
    resetTierDForNextDuel(state,seeded(2));expect(JSON.stringify({missions:state.missions,meta:state.riseSuperCombo})).toBe(selected)
  })

  test('retrying the same Level creates a fresh deterministic attempt selection', () => {
    const first=createTierDLevel(1000,'human',seeded(1))
    const retry=createTierDLevel(1000,'human',seeded(2))
    expect({missions:first.missions,meta:first.riseSuperCombo}).not.toEqual({missions:retry.missions,meta:retry.riseSuperCombo})
  })

  test.each([
    ['VH-01',23],['VH-02',25],['VH-03',32],
  ] as const)('%s reuses constituent mission scoring and ordinary Super Combo bonus', (id, expected) => {
    const definition=TIER_D_RISE_SUPER_COMBO_POOLS.VERY_HARD.find(item=>item.id===id)!
    const missions=definition.ranks.map((rank,index)=>({pile:(index+1) as 1|2|3,rank}))
    const outcomes=missions.map(mission=>missionResult(mission,mission.rank))
    expect(outcomes.every(outcome=>outcome.complete)).toBe(true)
    expect(outcomes.reduce((sum,outcome)=>sum+outcome.score,0)+comboBonus(missions,[true,true,true],()=>0)).toBe(expected)
  })

  test('all configured definitions preserve increasing G1 < G2 < G3 rank order', () => {
    const rank=['high_card','one_pair','two_pair','three_of_a_kind','straight','flush','full_house','four_of_a_kind','straight_flush','royal_flush']
    for(const definition of Object.values(TIER_D_RISE_SUPER_COMBO_POOLS).flat()){
      const values=definition.ranks.map(value=>rank.indexOf(value))
      expect(values[0]).toBeLessThan(values[1]);expect(values[1]).toBeLessThan(values[2])
    }
  })

  test('existing scoring and multiplayer AI rosters are unchanged', () => {
    expect(missionResult({pile:1,rank:'high_card'},'high_card').score).toBe(1)
    expect(missionResult({pile:2,rank:'one_pair'},'one_pair').score).toBe(2)
    expect(missionResult({pile:2,rank:'two_pair'},'two_pair').score).toBe(3)
    expect(missionResult({pile:2,rank:'three_of_a_kind'},'three_of_a_kind').score).toBe(4)
    expect(missionResult({pile:3,rank:'straight'},'straight').score).toBe(6)
    expect(missionResult({pile:3,rank:'flush'},'flush').score).toBe(8)
    expect(missionResult({pile:3,rank:'four_of_a_kind'},'four_of_a_kind').score).toBe(14)
    expect(comboBonus([{pile:1,rank:'high_card'},{pile:2,rank:'two_pair'},{pile:3,rank:'straight'}],[true,true,true],()=>0)).toBe(10)
    expect(AI_CONFIGS.map(ai=>ai.id)).toEqual(['AI_SAGE','AI_RECKLESS','AI_GHOST'])
    expect(FOUR_GODS.map(ai=>ai.id)).toEqual(['AI_REAPER','AI_CRAG','AI_CORTEX','AI_CIPHER'])
  })
})
