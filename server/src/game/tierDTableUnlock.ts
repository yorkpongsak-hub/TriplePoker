import type { TierOrderKey } from './progressionGate'

/** The next Solo level is persisted after a clear. Tier C begins after Lv. 250. */
export function tierDTableCeiling(soloLevel: number): TierOrderKey {
  if (soloLevel >= 1001) return 'highNoble'
  if (soloLevel >= 701) return 'mastermind'
  if (soloLevel >= 501) return 'adept'
  if (soloLevel >= 251) return 'initiate'
  return 'D'
}

