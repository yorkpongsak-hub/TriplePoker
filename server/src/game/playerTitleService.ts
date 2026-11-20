export interface PlayerTitle {
  key: string
  label: string
}

export interface PlayerTitleSignals {
  tierUnlockedMax: string | null
  monarchVictories: number
  streak7DaysBadge: boolean
  crownBalance: number
  performanceScore: number
  gamesPlayed: number
  gamesWon: number
  wins: Array<{
    tier?: string | null
    is_triple_sweep?: boolean | null
    best_hand?: { rank?: string } | null
    rank_after?: number | null
    tokens_won?: number | null
  }>
}

type TitleRule = PlayerTitle & { matches: (signals: PlayerTitleSignals) => boolean }

const tierAtLeast = (actual: string | null, required: string): boolean => {
  const order = ['D', 'initiate', 'adept', 'mastermind', 'highNoble', 'grandmaster']
  return order.indexOf(actual ?? 'D') >= order.indexOf(required)
}

/** First matching rule wins. Keep this catalog at 20 titles or fewer for the initial release. */
export const PLAYER_TITLE_RULES: readonly TitleRule[] = [
  { key: 'royal_ace', label: 'Royal Ace', matches: s => s.wins.some(w => w.best_hand?.rank === 'ROYAL_FLUSH') },
  { key: 'arena_champion', label: 'Arena Champion', matches: s => s.wins.some(w => w.tier === 'grandmaster') },
  { key: 'monarch_slayer', label: 'Monarch Slayer', matches: s => s.monarchVictories >= 1 },
  { key: 'triple_sweep_ace', label: 'Triple Sweep Ace', matches: s => s.wins.some(w => w.is_triple_sweep === true) },
  { key: 'high_roller', label: 'High Roller', matches: s => s.wins.reduce((sum, w) => sum + (w.tokens_won ?? 0), 0) >= 500_000 },
  { key: 'elite_contender', label: 'Elite Contender', matches: s => s.wins.some(w => w.rank_after != null && w.rank_after <= 10) },
  { key: 'precision_player', label: 'Precision Player', matches: s => s.gamesPlayed >= 20 && s.gamesWon / s.gamesPlayed >= .7 },
  { key: 'century_winner', label: 'Century Winner', matches: s => s.gamesWon >= 100 },
  { key: 'seven_day_flame', label: 'Seven-Day Flame', matches: s => s.streak7DaysBadge },
  { key: 'crown_keeper', label: 'Crown Keeper', matches: s => s.crownBalance >= 50 },
  { key: 'grandmaster', label: 'Grandmaster', matches: s => tierAtLeast(s.tierUnlockedMax, 'grandmaster') },
  { key: 'high_noble', label: 'High Noble', matches: s => tierAtLeast(s.tierUnlockedMax, 'highNoble') },
  { key: 'mastermind', label: 'Mastermind', matches: s => tierAtLeast(s.tierUnlockedMax, 'mastermind') },
  { key: 'adept_tactician', label: 'Adept Tactician', matches: s => tierAtLeast(s.tierUnlockedMax, 'adept') },
  { key: 'veteran', label: 'Table Veteran', matches: s => s.gamesPlayed >= 250 },
  { key: 'seasoned_strategist', label: 'Seasoned Strategist', matches: s => s.gamesPlayed >= 100 },
  { key: 'battle_tested', label: 'Battle-Tested', matches: s => s.gamesPlayed >= 25 },
  { key: 'rising_star', label: 'Rising Star', matches: s => s.performanceScore >= 25 },
  { key: 'golden_rookie', label: 'Golden Rookie', matches: s => s.gamesWon >= 1 },
  { key: 'new_challenger', label: 'New Challenger', matches: () => true },
] as const

export function selectPlayerTitle(signals: PlayerTitleSignals): PlayerTitle {
  const selected = PLAYER_TITLE_RULES.find(rule => rule.matches(signals)) ?? PLAYER_TITLE_RULES[PLAYER_TITLE_RULES.length - 1]
  return { key: selected.key, label: selected.label }
}
