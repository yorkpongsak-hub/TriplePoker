// ─────────────────────────────────────────────────────────────────────────────
// socketStore.ts — Socket Connection State (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';

type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface SocketStore {
  status: SocketStatus;
  socketId: string | null;
  roomId: string | null;
  setStatus:  (status: SocketStatus) => void;
  setSocketId:(id: string | null) => void;
  setRoomId:  (id: string | null) => void;
  reset:      () => void;
}

export const useSocketStore = create<SocketStore>((set) => ({
  status: 'idle',
  socketId: null,
  roomId: null,

  setStatus:   (status) => set({ status }),
  setSocketId: (socketId) => set({ socketId }),
  setRoomId:   (roomId) => set({ roomId }),
  reset:       () => set({ status: 'idle', socketId: null, roomId: null }),
}));
