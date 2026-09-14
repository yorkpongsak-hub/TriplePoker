import { comboBonus, generateMissions, generateOpenChallenge, handMultiplier, missionResult, pileWinScore } from '../../src/game/leagueGameplay'

describe('League gameplay canon rules', () => {
  test('base 4/6/8 and hand multipliers affect only pile points', () => {
    expect(([1,2,3] as const).map(pile=>pileWinScore(1,pile,'flush'))).toEqual([4,6,8])
    expect(([1,2,3] as const).map(pile=>pileWinScore(51,pile,'flush'))).toEqual([6,9,12])
    expect(pileWinScore(51,3,'high_card',true)).toBe(16)
    expect(pileWinScore(51,3,'four_of_a_kind')).toBe(16)
  })
  test('base 4/6/8 and hand multipliers affect only pile points', () => {
    expect(([1,2,3] as const).map(pile=>pileWinScore(1,pile,'flush'))).toEqual([4,6,8])
    expect(([1,2,3] as const).map(pile=>pileWinScore(51,pile,'flush'))).toEqual([6,9,12])
    expect(pileWinScore(51,3,'high_card',true)).toBe(16)
    expect(pileWinScore(51,3,'four_of_a_kind')).toBe(16)
  })
  test('Bronze has no missions and Silver mission count uses approved weights', () => {
    expect(generateMissions(1, () => 0)).toEqual([])
    expect(generateMissions(51, () => .79)).toHaveLength(1)
    expect(generateMissions(51, () => .80)).toHaveLength(2)
    expect(generateMissions(51, () => .96)).toHaveLength(3)
  })
  test('missions selected for multiple piles remain strictly ordered', () => {
    for (let i = 0; i < 30; i++) { const missions = generateMissions(1001, Math.random); for (let j = 1; j < missions.length; j++) expect(missions[j].rank).not.toBe(missions[j - 1].rank) }
  })
  test('negative mission is only possible in a three-mission level and has -5 through -10 penalty', () => {
    let calls = 0
    const missions = generateMissions(1001, () => ++calls <= 6 ? .99 : 0)
    expect(missions).toHaveLength(3); const negative = missions.find(mission => mission.negative)!; expect(negative.penalty).toBeGreaterThanOrEqual(-10); expect(negative.penalty).toBeLessThanOrEqual(-5)
  })
  test('mission bonuses, penalties, multiplier and x2 score follow Canon', () => {
    expect(missionResult({ pile: 2, rank: 'two_pair' }, 'three_of_a_kind')).toMatchObject({ complete: true, score: 2, penalty: 0 })
    expect(missionResult({ pile: 3, rank: 'flush', negative: true, penalty: -7 }, 'straight')).toMatchObject({ complete: false, score: 0, penalty: -7 })
    expect(handMultiplier(51, 'flush')).toBe(1.5); expect(handMultiplier(1, 'flush')).toBe(1)
    expect(pileWinScore(51, 3, 'flush', true)).toBe(24); expect(pileWinScore(51, 3, 'four_of_a_kind', true)).toBe(32)
  })
  test('combo rolls only for full mission completion', () => { expect(comboBonus([{ pile: 1, rank: 'high_card' }, { pile: 2, rank: 'one_pair' }], [true, false], () => 0)).toBe(0); expect(comboBonus([{ pile: 1, rank: 'high_card' }, { pile: 2, rank: 'one_pair' }], [true, true], () => 0)).toBe(5) })
  test('Open Challenge uses approved reveal counts only above level 1000', () => { expect(generateOpenChallenge(1, () => 0)).toBeUndefined(); expect(generateOpenChallenge(51, () => 0)).toBeUndefined(); expect(generateOpenChallenge(1000, () => 0)).toBeUndefined(); expect(generateOpenChallenge(1001, (() => { const v = [0, .1, .4]; let i = 0; return () => v[i++] })())).toEqual({ revealedPiles: [2] }) })
})
