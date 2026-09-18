/** Pure state machine: a recovery match is offered only once after a streak loss. */
export type SecondDealState = { priorStreak: number; recoveryActive: boolean }
export function canOfferSecondDeal(streak: number, ownsSecondDeal: boolean, rewardedAvailable: boolean) { return streak > 0 && (ownsSecondDeal || rewardedAvailable) }
export function startSecondDeal(priorStreak: number): SecondDealState { if (priorStreak < 1) throw new Error('NO_ACTIVE_STREAK'); return { priorStreak, recoveryActive: true } }
export function settleSecondDeal(state: SecondDealState, won: boolean) { if (!state.recoveryActive) throw new Error('NO_RECOVERY_MATCH'); return { matchWinStreak: won ? state.priorStreak : 0, recoveryActive: false, canChain: false } }
