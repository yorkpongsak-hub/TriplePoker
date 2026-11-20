import { audio, AudioEvent } from '../audio'

/** Compatibility facade for existing tables; keeps filenames out of gameplay code. */
export function playCountdownWarning(): void { audio.play(AudioEvent.TIMER_WARNING, { isLocalPlayer: true }) }
/** Short one-shot for each 3-2-1 reveal count. */
export function playRevealCountdownTick(): void { audio.play(AudioEvent.TIMER_CRITICAL, { isLocalPlayer: true }) }
export function playCardArrange1(): void { audio.play(AudioEvent.CARD_SELECT) }
export function playCardArrange2(): void { audio.play(AudioEvent.CARD_MOVE) }
export function playAuctionBidTick(): void { audio.play(AudioEvent.AUCTION_BID) }
export function playJackpotFanfare(): void { audio.play(AudioEvent.TRIPLE_SWEEP_CELEBRATION) }
export function playMatchWin(): void { audio.play(AudioEvent.MATCH_WIN) }
// A normal pile reveal must never sound like a Boss entrance.
export function playBossPileWinThunder(): void { audio.play(AudioEvent.ACTION_COMPLETED) }
export function playCardShuffle(): void { audio.play(AudioEvent.CARD_SHUFFLE) }
export function playCardReveal(): void { audio.play(AudioEvent.CARD_REVEAL) }
export function playPokerChip(): void { audio.play(AudioEvent.TOKEN_REWARD) }
export function playAnte(): void { audio.play(AudioEvent.ANTE) }
export function playAutoSortButton(): void { audio.play(AudioEvent.AUTO_SORT) }
export function playReadyButton(): void { audio.play(AudioEvent.READY_CONFIRM) }
