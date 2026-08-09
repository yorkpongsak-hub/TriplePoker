import { MINION_NAMES, pickRandomMinions } from '../../src/game/aiEngine'
import { createAdeptTable } from '../../src/game/tableRegistry'

describe('Adept Minion roster', () => {
  it('contains exactly 25 unique display names', () => {
    expect(MINION_NAMES).toHaveLength(25)
    expect(new Set(MINION_NAMES).size).toBe(25)
  })

  it('picks unique names and honors names already seated at the table', () => {
    const picked = pickRandomMinions(24, [MINION_NAMES[0]])
    expect(picked).toHaveLength(24)
    expect(new Set(picked).size).toBe(24)
    expect(picked).not.toContain(MINION_NAMES[0])
  })

  it('uses two distinct roster names in the legacy Adept table path', () => {
    const table = createAdeptTable('host-1', 'Player', false)
    const botNames = table.seats.filter(seat => seat.type === 'bot' || seat.type === 'ai').map(seat => seat.name)
    expect(botNames).toHaveLength(2)
    expect(new Set(botNames).size).toBe(2)
    expect(botNames.every(name => MINION_NAMES.includes(name))).toBe(true)
  })
})
