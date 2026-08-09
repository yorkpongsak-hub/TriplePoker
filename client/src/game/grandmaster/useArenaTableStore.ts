import { create } from 'zustand'
import { ArenaClientSnapshot } from './arenaClientTypes'

interface ArenaTableState {
  snapshot: ArenaClientSnapshot | null
  lastVersion: number
  applyServerSnapshot: (snapshot: ArenaClientSnapshot) => boolean
  reset: () => void
}

export const useArenaTableStore = create<ArenaTableState>((set, get) => ({
  snapshot: null,
  lastVersion: 0,
  applyServerSnapshot: (snapshot) => {
    if (snapshot.version <= get().lastVersion) return false
    set({ snapshot, lastVersion: snapshot.version })
    return true
  },
  reset: () => set({ snapshot: null, lastVersion: 0 }),
}))
