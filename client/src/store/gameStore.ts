// ─────────────────────────────────────────────────────────────────────────────
// gameStore.ts — Game State (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type {
  GameState, GamePhase, Card, PlayerArrangement,
  PileResult, BlindAuctionResult, BettingRound,
  MatchSummary, GrandFinaleAction,
} from '../types/game.types';

interface GameStore extends GameState {
  // Actions
  setPhase:           (phase: GamePhase) => void;
  setMyCards:         (cards: Card[]) => void;
  setMyArrangement:   (arr: PlayerArrangement) => void;
  addPileResult:      (result: PileResult) => void;
  setAuctionResult:   (result: BlindAuctionResult) => void;
  addBettingRound:    (round: BettingRound) => void;
  setMatchSummary:    (summary: MatchSummary) => void;
  applyTokenDelta:    (deltas: Record<string, number>) => void;
  updatePlayerReady:  (playerId: string) => void;
  updatePlayerFolded: (playerId: string) => void;
  resetGame:          () => void;
  initGame:           (state: Partial<GameState>) => void;
}

const initialState: GameState = {
  roomId: '',
  season: 'S1',
  tier: 'beginner',
  phase: 'waiting',
  handNumber: 1,
  players: [],
  myPlayerId: '',
  myCards: [],
  myArrangement: null,
  communityCards: { pile1: [], pile2: [], pile3: [] },
  pileResults: [],
  auctionResult: null,
  bettingRounds: [],
  matchSummary: null,
  tokenDeltas: {},
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setMyCards: (cards) => set({ myCards: cards }),

  setMyArrangement: (arr) => set({ myArrangement: arr }),

  addPileResult: (result) =>
    set((state) => ({ pileResults: [...state.pileResults, result] })),

  setAuctionResult: (result) => set({ auctionResult: result }),

  addBettingRound: (round) =>
    set((state) => ({ bettingRounds: [...state.bettingRounds, round] })),

  setMatchSummary: (summary) => set({ matchSummary: summary }),

  applyTokenDelta: (deltas) =>
    set((state) => {
      const merged = { ...state.tokenDeltas };
      for (const [id, delta] of Object.entries(deltas)) {
        merged[id] = (merged[id] ?? 0) + delta;
      }
      return { tokenDeltas: merged };
    }),

  updatePlayerReady: (playerId) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, isReady: true } : p
      ),
    })),

  updatePlayerFolded: (playerId) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, hasFoul: false } : p
      ),
    })),

  resetGame: () => set({ ...initialState }),

  initGame: (partial) => set((state) => ({ ...state, ...partial })),
}));
