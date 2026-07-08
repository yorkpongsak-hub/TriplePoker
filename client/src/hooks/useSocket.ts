// ─────────────────────────────────────────────────────────────────────────────
// useSocket.ts — Socket.IO Hook
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useCallback } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socketService';
import { useSocketStore } from '../store/socketStore';
import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import type { ServerToClientEvents } from '../types/socket.types';

export function useSocket() {
  const { setStatus, setSocketId, setRoomId } = useSocketStore();
  const { authToken } = useUserStore();
  const {
    initGame, setPhase, setMyCards, addPileResult,
    setAuctionResult, addBettingRound, setMatchSummary,
    applyTokenDelta, updatePlayerReady,
  } = useGameStore();

  // ── Connect เมื่อมี authToken ──────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) return;

    setStatus('connecting');
    const socket = connectSocket(authToken);

    socket.on('connect', () => {
      setStatus('connected');
      setSocketId(socket.id ?? null);
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      setSocketId(null);
    });

    // ── Server Events → Store ────────────────────────────────────────────────

    socket.on('room_joined', (payload) => {
      setRoomId(payload.roomId);
      initGame({
        roomId: payload.roomId,
        season: payload.season,
        tier: payload.tier,
        players: payload.players,
        myPlayerId: payload.myPlayerId,
        phase: 'waiting',
      });
    });

    socket.on('arrangement_start', (payload) => {
      setMyCards(payload.myCards);
      setPhase('arrangement');
    });

    socket.on('player_ready', ({ playerId }) => {
      updatePlayerReady(playerId);
    });

    // Beginner: Simultaneous Showdown
    socket.on('simultaneous_showdown', (payload) => {
      payload.pileResults.forEach(addPileResult);
      applyTokenDelta(payload.tokenDeltas);
      setPhase('end_of_match');
    });

    // Pro+: Sequential
    socket.on('pile_resolved', ({ result, tokenDeltas }) => {
      addPileResult(result);
      applyTokenDelta(tokenDeltas);
    });

    socket.on('fog_of_war', () => setPhase('fog_of_war'));

    socket.on('pre_auction_score', () => setPhase('pre_auction'));

    socket.on('auction_bidding_start', () => setPhase('auction'));

    socket.on('auction_resolved', (result) => {
      setAuctionResult(result);
      setPhase('discard');
    });

    socket.on('discard_phase_start', () => setPhase('discard'));

    socket.on('grand_finale_round_start', (payload) => {
      addBettingRound({
        roundNumber: payload.roundNumber,
        actions: Object.fromEntries(payload.activePlayers.map(id => [id, 'pending'])),
        showCard: payload.showCard,
        potAdded: 0,
      });
      setPhase('grand_finale');
    });

    socket.on('grand_finale_auto_win', (payload) => {
      addPileResult(payload.pile3Result);
      applyTokenDelta(payload.tokenDeltas);
      setPhase('end_of_match');
    });

    socket.on('grand_finale_showdown', (payload) => {
      addPileResult(payload.pile3Result);
      applyTokenDelta(payload.tokenDeltas);
      setPhase('end_of_match');
    });

    socket.on('match_summary', (summary) => {
      setMatchSummary(summary);
    });

    return () => {
      disconnectSocket();
      setStatus('idle');
    };
  }, [authToken]);

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const emit = useCallback(<K extends keyof ServerToClientEvents>(
    event: string,
    payload?: any
  ) => {
    getSocket()?.emit(event as any, payload);
  }, []);

  return { emit, socket: getSocket() };
}
