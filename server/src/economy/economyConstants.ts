import { gameConfig } from '../config/gameConfig'
import { CREST_PER_CROWN } from '../arena/economy/crest'
import type { NpcPoolKey, PoolKey } from './economyTypes'

export const NPC_POOL_KEYS: NpcPoolKey[] = [
  'BOT_POOL',
  'MINION_POOL',
  'NINE_SENTINELS_POOL',
  'FOUR_GODS_POOL',
  'MONARCH_POOL',
  'SOREN_VEYL_POOL',
  'CAELUM_POOL',
]

export const SYSTEM_RESERVE_POOL_KEY: PoolKey = 'SYSTEM_RESERVE'
export const ALL_POOL_KEYS: PoolKey[] = [SYSTEM_RESERVE_POOL_KEY, ...NPC_POOL_KEYS]

// Genesis amounts — locked per spec (§11), do not change without re-confirming with ลุงเยาะ.
export const TOKEN_GENESIS = 100_000_000
export const CROWN_GENESIS = 20_000
export const CREST_GENESIS = CROWN_GENESIS * CREST_PER_CROWN // 240,000

export const GENESIS_IDEMPOTENCY_KEY = 'ECONOMY:GENESIS:V1'

// Reused from existing config, not re-declared — matches CLAUDE.md canon (1 Crown = 5,000 Token, one-directional).
export const TOKEN_TO_CROWN_RATE = gameConfig.crownVaultConfig.tokenToCrownRate
