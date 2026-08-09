import { FOUR_GODS, MINION_NAMES, NINE_SENTINELS } from '../../src/game/aiEngine'

describe('character bark roster', () => {
  test('contains 25 unique fantasy minions with names no longer than 10 characters', () => {
    expect(MINION_NAMES).toHaveLength(25)
    expect(new Set(MINION_NAMES).size).toBe(25)
    expect(MINION_NAMES.every(name => name.length <= 10)).toBe(true)
  })

  test('covers the Nine Sentinels and Four Gods character groups', () => {
    expect(NINE_SENTINELS).toHaveLength(9)
    expect(FOUR_GODS).toHaveLength(4)
  })
})
