export type GameMode = 'SOLO' | 'MULTIPLAYER'
export type PileIndex = 1 | 2 | 3
export type GameItem = 'auto_sort' | 'swap' | 'xX' | 'freeze' | 'shuffle' | 'undo'
export const GAME_ITEMS: readonly GameItem[] = ['auto_sort', 'swap', 'xX', 'freeze', 'shuffle', 'undo']
export type XXCommit = { effect: 'SCORE_MULTIPLIER'; pile: PileIndex; multiplier: 2 }
  | { effect: 'PILE_SIDE_BET'; pile: PileIndex; multiplier: 1.5 | 2.1 | 3 }

export interface UnifiedTierRules {
  tier: string; gameMode: GameMode; playerCount: number; matchesPerGame: number
  arrangementRules: { handSize: 11; pileSizes: readonly [3, 3, 5]; strictOrder: true }
  evaluationRules: { communitySizes: readonly [2, 2, 2]; g1: 'EXACT_FIVE'; g2: 'FIVE_OR_BEST_SIX'; g3: 'BEST_SEVEN' }
  auctionRules: { enabled: boolean; pile2Bonus: boolean }
  itemCapabilities: readonly GameItem[]
  itemUsagePolicies: Record<GameItem, { maxPerMatch: number | null; preG1: boolean }>
  revealRules: { sequential: true }
  callFoldRules: { enabled: boolean }
  tokenSettlementRules: { enabled: boolean; xXEffect: XXCommit['effect'] }
  bossModifiers: readonly string[]
}

const capabilities: Record<GameMode, readonly GameItem[]> = {
  SOLO: GAME_ITEMS, MULTIPLAYER: ['auto_sort', 'swap', 'xX'],
}
// Higher-Tier callers must explicitly supply their existing session/auction rules.
// Merely resolving this model never enables the new flow on a legacy table.
export function resolveGameRules(input: { tier: string; gameMode: GameMode; playerCount: number;
  configuration?: Pick<UnifiedTierRules, 'matchesPerGame' | 'auctionRules' | 'callFoldRules' | 'tokenSettlementRules' | 'bossModifiers'> }): UnifiedTierRules {
  if (!capabilities[input.gameMode] || !Number.isInteger(input.playerCount) || input.playerCount < 1 || input.playerCount > 4) throw new Error('Unsupported game configuration')
  const configuration = input.configuration ?? (input.tier === 'D' && input.gameMode === 'SOLO' ? {
    matchesPerGame: 3, auctionRules: { enabled: false, pile2Bonus: false }, callFoldRules: { enabled: false },
    tokenSettlementRules: { enabled: false, xXEffect: 'SCORE_MULTIPLIER' as const }, bossModifiers: [],
  } : undefined)
  if (!configuration) throw new Error('Explicit Tier configuration is required before migration')
  return { ...input, ...configuration,
    arrangementRules: { handSize: 11, pileSizes: [3, 3, 5], strictOrder: true },
    evaluationRules: { communitySizes: [2, 2, 2], g1: 'EXACT_FIVE', g2: 'FIVE_OR_BEST_SIX', g3: 'BEST_SEVEN' },
    itemCapabilities: capabilities[input.gameMode],
    itemUsagePolicies: Object.fromEntries(GAME_ITEMS.map(item => [item, { maxPerMatch: item === 'auto_sort' ? null : 1, preG1: true }])) as UnifiedTierRules['itemUsagePolicies'],
    revealRules: { sequential: true },
  }
}

export const domainItem = (item: string): GameItem | undefined => item === 'double_pile' ? 'xX' : GAME_ITEMS.includes(item as GameItem) ? item as GameItem : undefined
export interface MatchItemState {
  usage: Partial<Record<GameItem, number>>
  preG1LockedAt?: number
  xX?: XXCommit
  freezeExpiresAt?: number
  foulPendingRecovery?: boolean
  receipts: Record<string, string>
}
export const newMatchItemState = (): MatchItemState => ({ usage: {}, receipts: {} })
export interface ItemRequestScope { gameId: string; matchNumber: number; requestId: string; dealRevision: number }
export function itemPolicyError(rules: UnifiedTierRules, state: MatchItemState, item: GameItem): string | undefined {
  if (!rules.itemCapabilities.includes(item)) return 'Item is forbidden in this mode.'
  const policy = rules.itemUsagePolicies[item]
  if (policy.maxPerMatch !== null && (state.usage[item] ?? 0) >= policy.maxPerMatch) return 'Item already used this Match.'
  if (policy.preG1 && state.preG1LockedAt !== undefined) return 'Items are locked after G1 reveal begins.'
  if (item === 'undo' && !state.foulPendingRecovery) return 'Undo is available only for a foul arrangement.'
  if (item !== 'undo' && state.foulPendingRecovery) return 'Use Undo or reveal the foul arrangement.'
  return undefined
}
