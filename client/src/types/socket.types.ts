// ─────────────────────────────────────────────────────────────────────────────
// socket.types.ts — Socket.IO Event Payload Types
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Card, Player, CommunityCards, PileResult,
  BlindAuctionResult, BettingRound, GrandFinaleAction,
  MatchSummary, GamePhase, Tier, Season,
} from './game.types';

// ─── Server → Client Events ───────────────────────────────────────────────────

export interface ServerToClientEvents {
  // Room
  room_joined:          (payload: RoomJoinedPayload) => void;
  room_ready:           (payload: RoomReadyPayload) => void;
  player_disconnected:  (payload: { playerId: string }) => void;

  // Arrangement Phase
  arrangement_start:    (payload: ArrangementStartPayload) => void;
  player_ready:         (payload: { playerId: string }) => void;

  // Beginner: Simultaneous Showdown
  simultaneous_showdown:(payload: SimultaneousShowdownPayload) => void;

  // Pro+: Sequential Pile Resolution
  pile_resolved:        (payload: PileResolvedPayload) => void;
  fog_of_war:           (payload: { pileNumber: 1 | 2 }) => void;

  // Pre-Auction Score
  pre_auction_score:    (payload: PreAuctionScorePayload) => void;

  // Blind Auction
  auction_team_signal_start: (payload: { windowMs: number }) => void;
  auction_bidding_start:     (payload: AuctionBiddingStartPayload) => void;
  auction_resolved:          (payload: BlindAuctionResult) => void;

  // Discard Phase
  discard_phase_start:  (payload: DiscardPhaseStartPayload) => void;

  // Grand Finale
  grand_finale_round_start: (payload: GrandFinaleRoundStartPayload) => void;
  grand_finale_action:      (payload: { playerId: string; action: GrandFinaleAction }) => void;
  player_folded:            (payload: { playerId: string }) => void;
  auto_fold:                (payload: { playerId: string; reason: string }) => void;
  grand_finale_auto_win:    (payload: GrandFinaleResultPayload) => void;
  grand_finale_showdown:    (payload: GrandFinaleResultPayload) => void;

  // End of Match
  show_ad:              (payload: { source: string }) => void;
  match_summary:        (payload: MatchSummary) => void;
  debt_popup:           (payload: DebtPopupPayload) => void;
  end_of_match_decision_start: (payload: { timerSec: number; playerIds: string[] }) => void;
  player_decision:      (payload: { playerId: string; decision: 'rematch' | 'lobby' }) => void;
  rematch_start:        (payload: { roomId: string }) => void;
  return_to_lobby:      (payload: { roomId: string; reason?: string }) => void;

  // Toast / Notification
  toast:                (payload: ToastPayload) => void;
}

// ─── Client → Server Events ───────────────────────────────────────────────────

export interface ClientToServerEvents {
  join_room:            (payload: JoinRoomPayload) => void;
  submit_arrangement:   (payload: SubmitArrangementPayload) => void;
  submit_team_signal:   (payload: { signal: 'want' | 'pass' }) => void;
  submit_bid:           (payload: { bidAmount: number }) => void;
  submit_discard:       (payload: SubmitDiscardPayload) => void;
  submit_grand_finale:  (payload: { action: GrandFinaleAction }) => void;
  submit_end_decision:  (payload: { decision: 'rematch' | 'lobby' }) => void;
}

// ─── Payload Definitions ──────────────────────────────────────────────────────

export interface RoomJoinedPayload {
  roomId: string;
  players: Player[];
  season: Season;
  tier: Tier;
  myPlayerId: string;
}

export interface RoomReadyPayload {
  roomId: string;
  communityCards: CommunityCards;
}

export interface ArrangementStartPayload {
  myCards: Card[];
  timerSec: number;
  tier: Tier;
}

export interface SimultaneousShowdownPayload {
  pileResults: PileResult[];
  tokenDeltas: Record<string, number>;
  foulPlayers: string[];
}

export interface PileResolvedPayload {
  pileNumber: 1 | 2;
  result: PileResult;
  tokenDeltas: Record<string, number>;
}

export interface PreAuctionScorePayload {
  scores: Record<string, number>; // playerId → token ±
  displaySec: number;
}

export interface AuctionBiddingStartPayload {
  blindCardCount: number;
  deadlineMs: number;
}

export interface DiscardPhaseStartPayload {
  playerIds: string[];
  timerSec: number;
}

export interface GrandFinaleRoundStartPayload {
  roundNumber: 1 | 2;
  showCard?: Card;
  activePlayers: string[];
  timerSec: number;
  callAmount: number | null;
}

export interface GrandFinaleResultPayload {
  roomId: string;
  pile3Result: PileResult;
  bettingRounds: BettingRound[];
  autoWin: boolean;
  autoWinnerId?: string;
  tokenDeltas: Record<string, number>;
}

export interface DebtPopupPayload {
  debtAmount: number;
  action: 'popup_small' | 'popup_medium' | 'popup_large';
  adTokenReward: number;
  installmentRate: number;
}

export interface ToastPayload {
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
}

export interface JoinRoomPayload {
  tier: Tier;
  season: Season;
}

export interface SubmitArrangementPayload {
  pile1: Card[];
  pile2: Card[];
  pile3: Card[];
}

export interface SubmitDiscardPayload {
  keptCards: Card[];
  discardedCards: Card[];
}
