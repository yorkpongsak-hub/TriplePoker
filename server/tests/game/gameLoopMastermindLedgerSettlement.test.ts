// gameLoopMastermindLedgerSettlement.test.ts — Central Economy Ledger Phase 7 Round 3 (Mastermind)
// Covers resolveMatchStateNpcRouting() in isolation — the helper that decides which NPC pool each
// AI seat's winnings route to, shared by both settleAndEndSoloMatch() and finalizeGrandFinale()'s
// settle call. Those two call sites themselves are internal to gameLoop.ts's in-memory matchStates
// map with no exported seam to drive end-to-end, so per this round's plan we verify the shared
// routing helper directly (same pure-function-testing style as npcPoolResolver.test.ts).

import { resolveMatchStateNpcRouting, usesLedgerSettlement, buildSoloLedgerArg, type MatchState } from '../../src/game/gameLoop'
import { AI_CONFIGS, NINE_SENTINELS } from '../../src/game/aiEngine'

describe('usesLedgerSettlement — the allowlist gate itself (regression guard)', () => {
  // Caught live 2026-08-13: Round 3 widened the TYPE (LedgerSettlementTier) to include 'mastermind'
  // but the function BODY was left as `return tier === 'initiate'` — tsc/jest both stayed green
  // (the type predicate doesn't force the runtime check to match) and it silently routed every
  // real Mastermind match through the legacy RPC path, never touching the ledger at all, until
  // caught via live economy_reconciliation() drift. This test exists so that gap can never be
  // silent again — it must fail if 'mastermind' (or 'initiate') ever falls off the allowlist.
  test('returns true for every tier Round 1-3 have wired (initiate, mastermind)', () => {
    expect(usesLedgerSettlement('initiate')).toBe(true)
    expect(usesLedgerSettlement('mastermind')).toBe(true)
  })

  test('returns false for tiers not yet integrated (highNoble, lastBoss, adept, arena)', () => {
    expect(usesLedgerSettlement('highNoble')).toBe(false)
    expect(usesLedgerSettlement('lastBoss')).toBe(false)
    expect(usesLedgerSettlement('adept')).toBe(false)
    expect(usesLedgerSettlement('arena')).toBe(false)
  })
})

function baseMastermindState(overrides: Record<string, unknown> = {}): MatchState {
  return {
    roomId: 'room-1',
    tier: 'mastermind',
    humanPlayerId: 'human-1',
    humanName: 'Human One',
    roundNumber: 3,
    totalRounds: 3,
    humanWinStreak: 0,
    tokenBalance: {},
    results: [],
    phase: 'match_end',
    buyInAmount: 15000,
    pot: [0, 0, 0],
    feeRake: 0,
    extraPaid: {},
    autoSortUsed: false,
    ...overrides,
  } as MatchState
}

describe('resolveMatchStateNpcRouting — Central Economy Ledger path (Mastermind, Phase 7 Round 3)', () => {
  const sentinel = NINE_SENTINELS.find(s => s.id === 'AI_ORACLE')!

  test('boss seat (AI_CONFIGS[0]) with a Nine Sentinel override routes to the Sentinel\'s own real id, no minion context', () => {
    const state = baseMastermindState({ _bossOverride: sentinel })
    const result = resolveMatchStateNpcRouting(state, AI_CONFIGS[0])
    expect(result).toEqual({ npcId: 'AI_ORACLE', npcContext: undefined })
  })

  test('the two minion seats (AI_CONFIGS[1]/[2]) keep their stable AI_CONFIGS id but route via isMinionDisplay context', () => {
    const state = baseMastermindState({
      _bossOverride: sentinel,
      _minionOverrides: {
        [AI_CONFIGS[1].id]: { name: 'Some Minion', personality: 'reckless' },
        [AI_CONFIGS[2].id]: { name: 'Another Minion', personality: 'ghost' },
      },
    })
    expect(resolveMatchStateNpcRouting(state, AI_CONFIGS[1])).toEqual({
      npcId: AI_CONFIGS[1].id, npcContext: { isMinionDisplay: true },
    })
    expect(resolveMatchStateNpcRouting(state, AI_CONFIGS[2])).toEqual({
      npcId: AI_CONFIGS[2].id, npcContext: { isMinionDisplay: true },
    })
  })

  test('a seat with no matching override entry (defensive case) falls back to its own stable id with no context', () => {
    const state = baseMastermindState({ _bossOverride: sentinel, _minionOverrides: {} })
    expect(resolveMatchStateNpcRouting(state, AI_CONFIGS[1])).toEqual({
      npcId: AI_CONFIGS[1].id, npcContext: undefined,
    })
  })

  test('Initiate tier (never sets _bossOverride/_minionOverrides) is a proven no-op — identical to the pre-Round-3 flat mapping', () => {
    const state = baseMastermindState({ tier: 'initiate', _bossOverride: undefined, _minionOverrides: undefined })
    for (const ai of AI_CONFIGS) {
      expect(resolveMatchStateNpcRouting(state, ai)).toEqual({ npcId: ai.id, npcContext: undefined })
    }
  })
})

describe('buildSoloLedgerArg — single source of truth shared by every solo-match settle call site', () => {
  // Added 2026-08-13 alongside the player_leave fix in gameSocket.ts — this is the same expression
  // that used to be duplicated inline at 3 call sites (finalizeGrandFinale, settleAndEndSoloMatch,
  // and now player_leave). Extracted specifically so a future edit can never update one call site
  // and silently miss another the way usesLedgerSettlement's runtime body was missed in Round 3.
  const sentinel = NINE_SENTINELS.find(s => s.id === 'AI_ORACLE')!

  test('returns undefined for a tier not on the ledger allowlist (e.g. highNoble) — legacy RPC path untouched', () => {
    const state = baseMastermindState({ tier: 'highNoble' })
    expect(buildSoloLedgerArg(state)).toBeUndefined()
  })

  test('mastermind: builds tier/burnAmount/npcNets routed through the Sentinel + Minion overrides', () => {
    const state = baseMastermindState({
      tier: 'mastermind',
      buyInAmount: 15000,
      feeRake: 2367,
      tokenBalance: { 'human-1': 11940, [AI_CONFIGS[0].id]: 15400, [AI_CONFIGS[1].id]: 14200, [AI_CONFIGS[2].id]: 18460 },
      _bossOverride: sentinel,
      _minionOverrides: {
        [AI_CONFIGS[1].id]: { name: 'Some Minion', personality: 'reckless' },
        [AI_CONFIGS[2].id]: { name: 'Another Minion', personality: 'ghost' },
      },
    })
    expect(buildSoloLedgerArg(state)).toEqual({
      tier: 'mastermind',
      burnAmount: 2367,
      npcNets: [
        { npcId: 'AI_ORACLE', npcContext: undefined, amount: 400 },
        { npcId: AI_CONFIGS[1].id, npcContext: { isMinionDisplay: true }, amount: -800 },
        { npcId: AI_CONFIGS[2].id, npcContext: { isMinionDisplay: true }, amount: 3460 },
      ],
    })
  })

  test('residual pot (Ante collected mid-round, round never resolved) gets burned alongside feeRake — the actual bug caught live 2026-08-13 via a mid-round player_leave/disconnect', () => {
    const state = baseMastermindState({
      tier: 'mastermind',
      buyInAmount: 15000,
      feeRake: 300,
      pot: [800, 1200, 0], // G1/G2 antes collected, round never resolved to redistribute them
      tokenBalance: { 'human-1': 12700, [AI_CONFIGS[0].id]: 15000, [AI_CONFIGS[1].id]: 15000, [AI_CONFIGS[2].id]: 15000 },
    })
    expect(buildSoloLedgerArg(state)?.burnAmount).toBe(300 + 800 + 1200)
  })

  test('initiate: builds the flat mapping (no overrides ever set) using the same shape', () => {
    const state = baseMastermindState({
      tier: 'initiate',
      buyInAmount: 500,
      feeRake: 8,
      tokenBalance: { 'human-1': 600, [AI_CONFIGS[0].id]: 450, [AI_CONFIGS[1].id]: 500, [AI_CONFIGS[2].id]: 450 },
    })
    expect(buildSoloLedgerArg(state)).toEqual({
      tier: 'initiate',
      burnAmount: 8,
      npcNets: [
        { npcId: AI_CONFIGS[0].id, npcContext: undefined, amount: -50 },
        { npcId: AI_CONFIGS[1].id, npcContext: undefined, amount: 0 },
        { npcId: AI_CONFIGS[2].id, npcContext: undefined, amount: -50 },
      ],
    })
  })
})
