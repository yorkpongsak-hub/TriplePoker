import { LastBossPublicIdentity } from '../contracts/sovereignContracts'

export function createLastBossPublicIdentity(input: Omit<LastBossPublicIdentity, 'avatarKind' | 'auraKey'>): LastBossPublicIdentity {
  if (!Number.isInteger(input.reignNumber) || input.reignNumber < 1) throw new Error('INVALID_REIGN_NUMBER')
  return {
    ...input,
    avatarKind: 'DARK_SILHOUETTE',
    auraKey: `last-boss-aura-${((input.reignNumber - 1) % 12) + 1}`,
  }
}
