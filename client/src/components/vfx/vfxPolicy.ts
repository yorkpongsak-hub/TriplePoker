export type PileWinnerMap = Readonly<Partial<Record<1 | 2 | 3, string>>>

/** Pure trigger policy shared by multiplayer tiers and covered by server-side Jest. */
export function isLocalTripleSweep(winners: PileWinnerMap, localPlayerId: string): boolean {
  return Boolean(localPlayerId) && winners[1] === localPlayerId && winners[2] === localPlayerId && winners[3] === localPlayerId
}

export type VictoryOverlay = 'BOSS' | 'LEGENDARY' | null

/** Boss result is story-critical, so Legendary waits and renders on the following React pass. */
export function selectVictoryOverlay(hasBossVictory: boolean, hasLegendarySweep: boolean): VictoryOverlay {
  if (hasBossVictory) return 'BOSS'
  if (hasLegendarySweep) return 'LEGENDARY'
  return null
}
