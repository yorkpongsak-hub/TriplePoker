// ─────────────────────────────────────────────────────────────────────────────
// userStore.ts — User Profile + Token Balance (Zustand)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import type { Tier } from '../types/game.types';
import { getTierByToken } from '../constants/gameConstants';

interface UserState {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  tokenBalance: number;
  tier: Tier;
  isVIP: boolean;
  vipExpiresAt?: string;
  hasDebt: boolean;
  debtAmount: number;
  authToken: string | null;
  isLoggedIn: boolean;
  unlockedSkins: number[];
  activeSkin: number;
}

interface UserStore extends UserState {
  setUser:          (user: Partial<UserState>) => void;
  setAuthToken:     (token: string | null) => void;
  updateBalance:    (delta: number) => void;
  setDebt:          (amount: number) => void;
  clearDebt:        () => void;
  logout:           () => void;
  setSkins:         (unlocked: number[], active: number) => void;
  setActiveSkin:    (skinId: number) => void;
}

const initialUser: UserState = {
  userId: '',
  displayName: '',
  avatarUrl: undefined,
  tokenBalance: 0,
  tier: 'beginner',
  isVIP: false,
  vipExpiresAt: undefined,
  hasDebt: false,
  debtAmount: 0,
  authToken: null,
  isLoggedIn: false,
  unlockedSkins: [1],
  activeSkin: 1,
};

export const useUserStore = create<UserStore>((set) => ({
  ...initialUser,

  setUser: (user) =>
    set((state) => {
      const newBalance = user.tokenBalance ?? state.tokenBalance;
      return {
        ...state,
        ...user,
        tier: getTierByToken(newBalance),
        isLoggedIn: true,
      };
    }),

  setAuthToken: (token) =>
    set({ authToken: token, isLoggedIn: !!token }),

  updateBalance: (delta) =>
    set((state) => {
      const newBalance = state.tokenBalance + delta;
      return {
        tokenBalance: newBalance,
        tier: getTierByToken(newBalance),
      };
    }),

  setDebt: (amount) =>
    set({ hasDebt: amount > 0, debtAmount: Math.max(0, amount) }),

  clearDebt: () =>
    set({ hasDebt: false, debtAmount: 0 }),

  logout: () => set({ ...initialUser }),

  setSkins: (unlocked, active) =>
    set({ unlockedSkins: unlocked, activeSkin: active }),

  setActiveSkin: (skinId) =>
    set({ activeSkin: skinId }),
}));
