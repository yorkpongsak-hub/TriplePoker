/** Canonical, player-facing English copy. Keys—not English sentences—are the API. */
const en = {
  common: { continue: 'Continue', back: 'Back', close: 'Close', cancel: 'Cancel', confirm: 'Confirm', done: 'Done', loading: 'Loading…', error: 'Something went wrong. Please try again.', language: 'Language', settings: 'Settings', play: 'Play', enter: 'Enter', exit: 'Exit', retry: 'Try again', comingSoon: 'Coming soon' },
  entry: { enter: 'ENTER', howToPlay: 'HOW TO PLAY', openDoor: 'OPEN THE DOOR', level: 'Level {level}' },
  lobby: { title: 'TriplePoker: Rise Lobby', tierDSolo: 'Tier D Solo', continueSolo: 'Continue your Solo level journey', buyIn: 'Buy-in: {amount}', notEnoughTokens: 'NOT ENOUGH TOKENS', backToLobby: 'Back to Lobby', liveTables: 'LIVE & ACTIVE TABLES', noLiveTables: 'No Live Tables in this tier.' },
  game: { arrange: 'ARRANGE', reveal: 'REVEAL', autoReveal: 'AUTO-REVEAL', pile: 'Pile {pile}', foul: 'FOULED', winner: 'WINNER', youWin: 'YOU WIN!', youLose: 'YOU LOSE', greatJob: 'GREAT JOB!', combo: 'COMBO!', superCombo: 'SUPER COMBO!', matchComplete: 'MATCH COMPLETE', matchEnd: 'MATCH END', finalTokenBalance: 'Final Token Balance', level: 'LEVEL {level}', league: 'LEAGUE', countdown: '{seconds}s', hand: 'HAND {current} / {total}' },
  poker: { handRank: { royal_flush: 'Royal Flush', straight_flush: 'Straight Flush', four_of_a_kind: 'Four of a Kind', full_house: 'Full House', flush: 'Flush', straight: 'Straight', three_of_a_kind: 'Three of a Kind', two_pair: 'Two Pair', one_pair: 'One Pair', high_card: 'High Card' }, bestFive: 'Best 5' },
  ranking: { top20: 'TOP 20', rank: 'Rank #{rank}', player: 'PLAYER', points: 'POINTS', streak: 'STREAK', tournamentStarted: 'TOP 20 COMPETITION STARTED', timeRemaining: 'TIME REMAINING', tournamentEnded: 'TOURNAMENT ENDED', finalRank: 'FINAL RANK', reward: 'REWARD', champion: 'CHAMPION' },
  actions: { auction: 'Auction', call: 'Call', fold: 'Fold', reveal: 'Reveal', autoReveal: 'Auto-Reveal', matchmaking: 'Matchmaking' },
  economy: { token: 'Token', tokens: 'Tokens', crown: 'Crown', insufficientTokens: 'Not enough Tokens.', tokensReturned: '{amount} Tokens returned to your wallet.' },
  errors: { unauthorized: 'Your session could not be verified. Please sign in again.', invalidPin: 'PIN must contain exactly 4 digits.', tierLocked: 'This tier is locked. Keep playing to unlock it.', adUnavailable: 'Ad service is unavailable. You can continue playing.', matchNotFound: 'Match not found. Please try again.' },
  tutorial: { title: 'HOW TO PLAY', close: 'Close tutorial', pileOrder: 'Keep Pile 1 ≤ Pile 2 ≤ Pile 3.' },
  vip: { vip: 'VIP', pro: 'VIP Pro', proPlus: 'VIP Pro Plus' },
} as const
export default en
