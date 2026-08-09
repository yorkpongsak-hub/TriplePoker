import { create } from 'zustand'
import { DelayedSpectatorEvent, SpectatorConnectionStatus, SpectatorSnapshot } from '../types/spectator.types'

type State = {
  broadcastId?: string; snapshot?: SpectatorSnapshot; events: DelayedSpectatorEvent[]
  viewerCount: number; viewerLimit: number; connectionStatus: SpectatorConnectionStatus; error?: string
  connect: (broadcastId: string) => void; hydrate: (snapshot: SpectatorSnapshot) => void
  append: (event: DelayedSpectatorEvent) => void; setViewers: (count: number, limit?: number) => void
  end: () => void; fail: (error: string) => void; reset: () => void
}

export const useSpectatorStore = create<State>(set => ({
  events: [], viewerCount: 0, viewerLimit: 10, connectionStatus: 'IDLE',
  connect: broadcastId => set({ broadcastId, connectionStatus: 'CONNECTING', error: undefined }),
  hydrate: snapshot => set({ snapshot, viewerCount: snapshot.viewerCount, viewerLimit: snapshot.viewerLimit, connectionStatus: 'CONNECTED' }),
  append: event => set(state => ({ events: [...state.events, event], connectionStatus: 'CONNECTED' })),
  setViewers: (viewerCount, viewerLimit) => set(state => ({ viewerCount, viewerLimit: viewerLimit ?? state.viewerLimit })),
  end: () => set({ connectionStatus: 'ENDED' }), fail: error => set({ error, connectionStatus: 'ENDED' }),
  reset: () => set({ broadcastId: undefined, snapshot: undefined, events: [], viewerCount: 0, viewerLimit: 10, connectionStatus: 'IDLE', error: undefined }),
}))
