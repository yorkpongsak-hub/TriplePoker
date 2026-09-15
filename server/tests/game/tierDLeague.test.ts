import { getArrangeTimerSeconds, getCurrentLeague, hasHandMultiplier, hasMissions, isLeagueFinalLevel, tierDBotCountForLevel, tierUnlockForLevel } from '../../src/game/tierDLeague'

describe('League Mode canon progression', () => {
  test.each([
    [1, 'bronze', 1, 50, 1, null], [50, 'bronze', 1, 50, 1, null], [51, 'silver', 51, 100, 1, 330], [150, 'gold', 101, 150, 1, 270], [151, 'platinum', 151, 200, 2, 240], [201, 'diamond', 201, 250, 2, 210], [251, 'elite', 251, 350, 2, 195], [351, 'master', 351, 500, 3, 180], [501, 'grandmaster', 501, 700, 3, 170], [701, 'legend', 701, 1000, 3, 160], [1001, 'mythic', 1001, null, 3, 150], [1501, 'mythic', 1001, null, 3, 150],
  ] as const)('level %i maps to %s canon rules', (level, id, start, end, bots, seconds) => {
    expect(getCurrentLeague(level)).toMatchObject({ id, startLevel: start, endLevel: end, aiOpponents: bots, arrangeSeconds: seconds })
    expect(tierDBotCountForLevel(level)).toBe(bots); expect(getArrangeTimerSeconds(level)).toBe(seconds)
  })
  test('Bronze alone disables missions and hand multipliers', () => { expect(hasMissions(50)).toBe(false); expect(hasHandMultiplier(50)).toBe(false); expect(hasMissions(51)).toBe(true); expect(hasHandMultiplier(51)).toBe(true) })
  test('trophies and Tier unlocks occur at approved final levels', () => { expect(isLeagueFinalLevel(50)).toBe(true); expect(tierUnlockForLevel(350)).toBe('C'); expect(tierUnlockForLevel(500)).toBe('B'); expect(tierUnlockForLevel(700)).toBe('A'); expect(tierUnlockForLevel(1000)).toBe('A+'); expect(isLeagueFinalLevel(1500)).toBe(true); expect(isLeagueFinalLevel(1501)).toBe(false) })
})
