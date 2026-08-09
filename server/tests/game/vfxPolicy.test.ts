import { isLocalTripleSweep, selectVictoryOverlay } from '../../../client/src/components/vfx/vfxPolicy'

describe('victory VFX policy', () => {
  test('Legendary triggers only when the local player owns all three piles', () => {
    expect(isLocalTripleSweep({ 1: 'me', 2: 'me', 3: 'me' }, 'me')).toBe(true)
    expect(isLocalTripleSweep({ 1: 'me', 2: 'opponent', 3: 'me' }, 'me')).toBe(false)
    expect(isLocalTripleSweep({ 1: 'me', 2: 'me' }, 'me')).toBe(false)
    expect(isLocalTripleSweep({ 1: 'me', 2: 'me', 3: 'me' }, '')).toBe(false)
  })

  test('Boss Victory has deterministic priority and Legendary remains next', () => {
    expect(selectVictoryOverlay(true, true)).toBe('BOSS')
    expect(selectVictoryOverlay(false, true)).toBe('LEGENDARY')
    expect(selectVictoryOverlay(false, false)).toBeNull()
  })
})
