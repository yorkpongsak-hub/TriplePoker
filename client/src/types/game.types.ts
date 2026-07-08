// ─────────────────────────────────────────────────────────────────────────────
// game.types.ts — Core Game Type Definitions
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Card ─────────────────────────────────────────────────────────────────────

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface Card {
  suit: Suit;
  value: number; // 2–14 (11=J, 12=Q, 13=K, 14=A)
  id: string;    // unique id สำหรับ animation key (e.g. "spades_14")
}

// ─── Tier ─────────────────────────────────────────────────────────────────────

export type Tier = 'beginner' | 'pro' | 'boss' | 'lastBoss';

export type Season = 'S1' | 'S2' | 'S3';

// ─── Player ───────────────────────────────────────────────────────────────────

export type SeatPosition = 'bottom' | 'left' | 'right' | 'top';

export interface Player {
  id: string;
  displayName: string;
  avatarUrl?: string;
  isAI: boolean;
  isVIP: boolean;
  tokenBalance: number;
  tier: Tier;
  seat: SeatPosition;
  isReady: boolean;
  hasFoul: boolean;
  debtBadge: boolean;
  teamId?: string; // S3 Clan เท่านั้น
  isLeader?: boolean; // S3 Clan เท่านั้น
}

// ─── Arrangement ──────────────────────────────────────────────────────────────

export interface PlayerArrangement {
  playerId: string;
  pile1: Card[];  // 3 ใบ (S1/S2) / 2 ใบ (S3)
  pile2: Card[];
  pile3: Card[];  // 5 ใบ (Beginner เต็ม) / 5 ใบก่อน Discard (Pro+)
}

// ─── Community Cards ──────────────────────────────────────────────────────────

export interface CommunityCards {
  pile1: Card[];
  pile2: Card[];
  pile3: Card[];
}

// ─── Hand Evaluation ──────────────────────────────────────────────────────────

export type HandRank =
  | 1  // Royal Flush
  | 2  // Straight Flush
  | 3  // Four of a Kind
  | 4  // Full House
  | 5  // Flush
  | 6  // Straight
  | 7  // Three of a Kind
  | 8  // Two Pair
  | 9  // One Pair
  | 10 // High Card
  | 99; // Foul

export const HAND_RANK_NAMES: Record<number, string> = {
  1:  'Royal Flush',
  2:  'Straight Flush',
  3:  'Four of a Kind',
  4:  'Full House',
  5:  'Flush',
  6:  'Straight',
  7:  'Three of a Kind',
  8:  'Two Pair',
  9:  'One Pair',
  10: 'High Card',
  99: 'FOUL',
};

export interface HandEvalResult {
  rank: HandRank;
  name: string;
  bestFive: Card[];
}

// ─── Pile Result ──────────────────────────────────────────────────────────────

export interface PileResult {
  pileNumber: 1 | 2 | 3;
  winnerId: string;
  winnerIsAI: boolean;
  pot: number;
  rake: number;
  payout: number;
  burned: boolean;
  isTie: boolean;
  rankings: Array<{
    playerId: string;
    handRank: HandRank;
    handName: string;
    cards: Card[];
    hasFoul: boolean;
  }>;
}

// ─── Auction ──────────────────────────────────────────────────────────────────

export interface AuctionCardResult {
  cardIndex: 0 | 1;
  card: Card;
  winnerId: string;
  winnerTeamId?: string;
  bidAmount: number;
  burned: number;
  isTieBreak: boolean;
  tieBreakMessage?: string;
}

export interface BlindAuctionResult {
  auctionCards: Card[];
  cardResults: AuctionCardResult[];
  totalBurned: number;
  tokenDeltas: Record<string, number>;
  winners: { cardIndex: number; winnerId: string }[];
}

// ─── Grand Finale ─────────────────────────────────────────────────────────────

export type GrandFinaleAction = 'call' | 'fold';

export interface BettingRound {
  roundNumber: 1 | 2;
  actions: Record<string, GrandFinaleAction | 'pending'>;
  showCard?: Card;
  potAdded: number;
}

// ─── Match Summary ────────────────────────────────────────────────────────────

export interface PlayerMatchSummary {
  playerId: string;
  tokenDelta: number;
  newBalance: number;
  pile3Wins: number;
  hasDebt: boolean;
  debtAmount: number;
  debtAction: 'none' | 'auto_forgive' | 'popup_small' | 'popup_medium' | 'popup_large';
}

export interface MatchSummary {
  roomId: string;
  season: Season;
  tier: Tier;
  winnerId: string | null;
  isMatchOver: boolean;
  playerSummaries: PlayerMatchSummary[];
  showAd: boolean;
  handNumber: number;
}

// ─── Game Phase ───────────────────────────────────────────────────────────────

export type GamePhase =
  | 'waiting'          // รอผู้เล่น
  | 'arrangement'      // จัดไพ่
  | 'pile1_reveal'     // เปิด Pile 1
  | 'pile2_reveal'     // เปิด Pile 2
  | 'fog_of_war'       // Fog of War
  | 'pre_auction'      // Score overlay ก่อน Auction
  | 'auction'          // Blind Auction
  | 'discard'          // Discard Phase
  | 'grand_finale'     // Grand Finale Betting
  | 'showdown'         // Final Showdown
  | 'end_of_match'     // สรุปผล + Rematch
  | 'simultaneous';    // Beginner: หงายพร้อมกัน

// ─── Full Game State ──────────────────────────────────────────────────────────

export interface GameState {
  roomId: string;
  season: Season;
  tier: Tier;
  phase: GamePhase;
  handNumber: number;
  players: Player[];
  myPlayerId: string;
  myCards: Card[];        // ไพ่ 11 ใบของตัวเอง
  myArrangement: PlayerArrangement | null;
  communityCards: CommunityCards;
  pileResults: PileResult[];
  auctionResult: BlindAuctionResult | null;
  bettingRounds: BettingRound[];
  matchSummary: MatchSummary | null;
  tokenDeltas: Record<string, number>; // สะสมรวมทั้ง Match
  // S3 Clan
  pile3WinsPerTeam?: Record<string, number>;
  clanDomination?: boolean;
}
