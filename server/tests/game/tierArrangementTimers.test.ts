import { arenaPhaseTimeoutMs } from '../../src/arena/config/tierSConfig'
import { gameConfig } from '../../src/config/gameConfig'

test('tier arrangement windows follow the approved M:SS schedule', () => {
  expect(gameConfig.arrangementTimer).toMatchObject({
    initiate: 165,
    adept: 150,
    mastermind: 135,
    highNoble: 120,
    lastBoss: 100,
  })
  expect(gameConfig.monarchConfig.arrangementDeadlineMs).toBe(120_000)
  expect(arenaPhaseTimeoutMs.ARRANGE_1).toBe(110_000)
  expect(arenaPhaseTimeoutMs.FINAL_ARRANGE).toBe(110_000)
})
