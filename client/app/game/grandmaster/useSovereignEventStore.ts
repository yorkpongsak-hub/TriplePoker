import { create } from 'zustand'
import { SovereignPublicFeedState } from './sovereignClientTypes'

interface SovereignEventStore extends SovereignPublicFeedState {
  applyPublicEvent: (event: SovereignPublicFeedState['events'][number]) => 'APPLIED' | 'DUPLICATE' | 'GAP'
  promoteToPlayer: () => void
  reset: () => void
}

const initialState: SovereignPublicFeedState = {
  matchId: null,
  label: 'LIVE — 30s DELAY',
  lastSequence: 0,
  capacityReached: false,
  events: [],
}

export const useSovereignEventStore = create<SovereignEventStore>((set, get) => ({
  ...initialState,
  applyPublicEvent: event => {
    const current = get()
    if (event.sequence <= current.lastSequence || current.events.some(item => item.eventId === event.eventId)) return 'DUPLICATE'
    if (event.sequence !== current.lastSequence + 1) return 'GAP'
    set({ events: [...current.events, event], lastSequence: event.sequence })
    return 'APPLIED'
  },
  // Security boundary during standby promotion: delayed public state must be discarded before private snapshot.
  promoteToPlayer: () => set({ ...initialState }),
  reset: () => set({ ...initialState }),
}))
