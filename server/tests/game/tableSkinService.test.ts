import { allowedTableSkins } from '../../src/game/tableSkinService'

describe('VIP table skin progression', () => {
  test('free members receive no custom table skin', () => {
    expect(allowedTableSkins('none', 'highNoble')).toEqual([])
  })

  test('VIP starts with skin 1', () => {
    expect(allowedTableSkins('vip', 'initiate')).toEqual([1])
  })

  test('the built-in skin remains separate from progression rewards', () => {
    expect(allowedTableSkins('vip', 'highNoble')).not.toContain(0)
  })

  test.each([
    ['adept', [1, 2]],
    ['mastermind', [1, 2, 3]],
    ['highNoble', [1, 2, 3, 4]],
  ])('VIP progression at %s grants the expected skins', (tier, expected) => {
    expect(allowedTableSkins('vip', tier)).toEqual(expected)
    expect(allowedTableSkins('vip_pro', tier)).toEqual(expected)
  })
})
