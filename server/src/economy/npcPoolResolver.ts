import type { NpcPoolKey } from './economyTypes'

/**
 * Canonical mapping from every real NPC/AI id used across the codebase to the NPC pool that
 * owns its match winnings (spec §7/§8 — "Shared NPC Pools" + "Three Boss — Separate Pools").
 * Built from a direct source read (server/src/game/aiEngine.ts, monarchEngine.ts,
 * server/src/arena/matchmaking/arenaMatchmaking.ts, server/src/arena/ai/arenaBotPersonality.ts,
 * server/src/config/gameConfig.ts's sovereignConfig) — not guessed.
 *
 * Deliberately excluded (never route to any pool — they are not independent economic actors):
 *   - 'MONARCH_MINION_1' / 'MONARCH_MINION_2' (monarchEngine.ts) — decorative seats in the 1v1
 *     Monarch table, hasRealStake: false, never touch tokenBalance/pot.
 *   - 'MONARCH_PROBE' (monarchAI.ts) — a reference AIConfig used only to gauge hand strength,
 *     never a real seat.
 *   - highNobleMultiEngine.ts's isMonarch path — confirmed dead/quarantined code (the comments at
 *     highNobleMultiEngine.ts:487-497 log a [QUARANTINE][ALERT] if it's ever hit in production);
 *     the only live Monarch encounter is monarchEngine.ts's dedicated 1v1 table (MONARCH_BOSS).
 *   - Arena bot-takeover seats (arenaBotTakeover.ts) — an AI stand-in for a disconnected human,
 *     explicitly settles against that human's own real wallet, not an NPC pool.
 */

// server/src/game/aiEngine.ts — base 3-personality pool, used directly (Initiate/Adept, and
// Mastermind's P2/P4 seats *without* a Minion name overlay applied).
const BASE_BOT_IDS = new Set(['AI_SAGE', 'AI_RECKLESS', 'AI_GHOST'])

// server/src/game/aiEngine.ts FOUR_GODS — High Noble / Mastermind Boss seat override.
const SERVER_FOUR_GODS_IDS = new Set(['AI_REAPER', 'AI_CRAG', 'AI_CORTEX', 'AI_CIPHER'])

// server/src/game/aiEngine.ts NINE_SENTINELS — Mastermind Conquest Boss seat override.
const SERVER_NINE_SENTINELS_IDS = new Set([
  'AI_IRON_WALL', 'AI_CHIVALRY', 'AI_WAR_LORD', 'AI_PHANTOM',
  'AI_DARK_SHARK', 'AI_ORACLE', 'AI_JESTER', 'AI_PHOENIX', 'AI_BLACK_MAGIC',
])

// server/src/game/monarchEngine.ts — the sole live Monarch encounter (1 Human vs Monarch, 1v1).
const SERVER_MONARCH_IDS = new Set(['MONARCH_BOSS'])

// server/src/arena/matchmaking/arenaMatchmaking.ts FourGodId — Arena Boss seat.
const ARENA_FOUR_GODS_IDS = new Set(['REAPER', 'CRAG', 'CORTEX', 'CIPHER'])

// server/src/arena/matchmaking/arenaMatchmaking.ts SentinelId — Arena FILL seat.
const ARENA_NINE_SENTINELS_IDS = new Set([
  'IRON_WALL', 'CHIVALRY', 'WAR_LORD', 'PHANTOM',
  'DARK_SHARK', 'ORACLE', 'JESTER', 'PHOENIX', 'BLACK_MAGIC',
])

// server/src/arena/matchmaking/arenaMatchmaking.ts — Arena Boss seats.
const ARENA_MONARCH_IDS = new Set(['MONARCH'])
const ARENA_SOREN_IDS = new Set(['SOREN'])

// server/src/arena/matchmaking/arenaMatchmaking.ts — Arena generic filler seat (2H timeout FILL).
const ARENA_MINION_IDS = new Set(['ARENA_MINION'])

// server/src/arena/config/sovereignConfig.ts's initialThroneName — Tier S+ Last Boss. Not yet
// live (sovereignConfig.featureEnabled === false, no playable table exists), included so the
// pool is ready ahead of that feature shipping.
const CAELUM_IDS = new Set(['CAELUM'])

export interface ResolveNpcPoolContext {
  /** true when aiEngine.ts's Minion name/personality overlay is active for this seat this round
   *  (state._minionOverrides[npcId] in gameLoop.ts, Mastermind P2/P4 only). Only meaningful for
   *  the base AI_SAGE/AI_RECKLESS/AI_GHOST ids — every other id is unambiguous on its own. */
  isMinionDisplay?: boolean
}

/** Thrown when an id has no known pool mapping — surfaces new/renamed AI ids immediately instead
 *  of silently mis-routing real money. */
export class UnknownNpcIdError extends Error {
  constructor(npcId: string) {
    super(`UNKNOWN_NPC_ID: ${npcId}`)
    this.name = 'UnknownNpcIdError'
  }
}

export function resolveNpcPoolKey(npcId: string, context: ResolveNpcPoolContext = {}): NpcPoolKey {
  if (BASE_BOT_IDS.has(npcId)) {
    return context.isMinionDisplay ? 'MINION_POOL' : 'BOT_POOL'
  }
  if (ARENA_MINION_IDS.has(npcId)) return 'MINION_POOL'
  if (SERVER_FOUR_GODS_IDS.has(npcId) || ARENA_FOUR_GODS_IDS.has(npcId)) return 'FOUR_GODS_POOL'
  if (SERVER_NINE_SENTINELS_IDS.has(npcId) || ARENA_NINE_SENTINELS_IDS.has(npcId)) return 'NINE_SENTINELS_POOL'
  if (SERVER_MONARCH_IDS.has(npcId) || ARENA_MONARCH_IDS.has(npcId)) return 'MONARCH_POOL'
  if (ARENA_SOREN_IDS.has(npcId)) return 'SOREN_VEYL_POOL'
  if (CAELUM_IDS.has(npcId)) return 'CAELUM_POOL'
  throw new UnknownNpcIdError(npcId)
}
