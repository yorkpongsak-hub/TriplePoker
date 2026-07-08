// ─────────────────────────────────────────────────────────────────────────────
// socketService.ts — Socket.IO Client Service
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่: จัดการ Socket connection เดียวสำหรับทั้ง App
//          emit / on / off events ผ่าน typed interface

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types/socket.types';

// ─── Socket Instance ──────────────────────────────────────────────────────────

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://localhost:3000';

// ─── Connect ──────────────────────────────────────────────────────────────────

export function connectSocket(authToken: string): AppSocket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token: authToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

// ─── Get Instance ────────────────────────────────────────────────────────────

export function getSocket(): AppSocket | null {
  return socket;
}

// ─── Emit Helpers ────────────────────────────────────────────────────────────

export function emitJoinRoom(tier: ClientToServerEvents['join_room'] extends (p: infer P) => void ? P : never): void {
  socket?.emit('join_room', tier);
}

export function emitArrangement(payload: Parameters<ClientToServerEvents['submit_arrangement']>[0]): void {
  socket?.emit('submit_arrangement', payload);
}

export function emitTeamSignal(signal: 'want' | 'pass'): void {
  socket?.emit('submit_team_signal', { signal });
}

export function emitBid(bidAmount: number): void {
  socket?.emit('submit_bid', { bidAmount });
}

export function emitDiscard(payload: Parameters<ClientToServerEvents['submit_discard']>[0]): void {
  socket?.emit('submit_discard', payload);
}

export function emitGrandFinaleAction(action: 'call' | 'fold'): void {
  socket?.emit('submit_grand_finale', { action });
}

export function emitEndDecision(decision: 'rematch' | 'lobby'): void {
  socket?.emit('submit_end_decision', { decision });
}
