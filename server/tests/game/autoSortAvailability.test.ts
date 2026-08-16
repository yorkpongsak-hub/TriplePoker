import { requestAutoSort } from '../../src/game/gameLoop'
import { requestHNAutoSort } from '../../src/game/highNobleMultiEngine'

describe('manual Auto Sort availability', () => {
  const io = {} as any

  it('rejects manual Auto Sort on standard competitive tables', () => {
    expect(requestAutoSort(io, 'room-1', 'player-1')).toEqual({
      ok: false,
      reason: 'AUTO_SORT_DISABLED',
    })
  })

  it('rejects manual Auto Sort on High Noble tables', () => {
    expect(requestHNAutoSort(io, 'room-1', 'player-1')).toEqual({
      ok: false,
      reason: 'AUTO_SORT_DISABLED',
    })
  })
})
