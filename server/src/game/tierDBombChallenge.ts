export type TierDBombStatus = 'inactive' | 'countdown' | 'warning' | 'defused' | 'failed' | 'completed'
export type TierDBombFailure = 'lose_current_level' | 'forfeit_current_game' | 'none'
export const tierDBombConfig = { enabled: true, minimumLevel: 10, frequencyEveryLevels: 5, durationMs: 20_000, warningAtMs: 5_000, failure: 'lose_current_level' as TierDBombFailure }
export type TierDBombState = { status: TierDBombStatus; remainingMs: number; interactionStartedAt: number | null; defuserConsumed: boolean; failure: TierDBombFailure }

export function isTierDBombEligible(level: number, config = tierDBombConfig): boolean { return config.enabled && level >= config.minimumLevel && level % config.frequencyEveryLevels === 0 }
export function createTierDBomb(level: number, config = tierDBombConfig): TierDBombState { return isTierDBombEligible(level, config) ? { status: 'countdown', remainingMs: config.durationMs, interactionStartedAt: null, defuserConsumed: false, failure: config.failure } : { status: 'inactive', remainingMs: 0, interactionStartedAt: null, defuserConsumed: false, failure: config.failure } }
/** Call only while the human can act; bot thinking/animations/background pass false and consume no time. */
export function setTierDBombInteraction(state: TierDBombState, interactive: boolean, now: number): TierDBombState {
  if (state.status !== 'countdown' && state.status !== 'warning') return state
  if (interactive && state.interactionStartedAt === null) return { ...state, interactionStartedAt: now }
  if (!interactive && state.interactionStartedAt !== null) return advanceTierDBomb(state, now, false)
  return state
}
export function advanceTierDBomb(state: TierDBombState, now: number, keepRunning = true): TierDBombState {
  if ((state.status !== 'countdown' && state.status !== 'warning') || state.interactionStartedAt === null) return state
  const remainingMs = Math.max(0, state.remainingMs - Math.max(0, now - state.interactionStartedAt))
  if (remainingMs === 0) return { ...state, remainingMs, interactionStartedAt: null, status: state.failure === 'none' ? 'completed' : 'failed' }
  return { ...state, remainingMs, interactionStartedAt: keepRunning ? now : null, status: remainingMs <= tierDBombConfig.warningAtMs ? 'warning' : 'countdown' }
}
export function defuseTierDBomb(state: TierDBombState, consumed: boolean): TierDBombState {
  if (state.status !== 'countdown' && state.status !== 'warning') return state
  if (!consumed) return state
  return { ...state, status: 'defused', interactionStartedAt: null, defuserConsumed: true }
}
export function completeTierDBomb(state: TierDBombState): TierDBombState { return (state.status === 'countdown' || state.status === 'warning') ? { ...state, status: 'completed', interactionStartedAt: null } : state }
