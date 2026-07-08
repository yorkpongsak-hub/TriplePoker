// ─────────────────────────────────────────────────────────────────────────────
// api.types.ts — API Request / Response Types
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tier } from './game.types';

// ─── User API ─────────────────────────────────────────────────────────────────

export interface UserProfileResponse {
  id: string;
  displayName: string;
  avatarUrl?: string;
  tokenBalance: number;
  tier: Tier;
  debt: { hasDebt: boolean; amount: number };
  isVIP: boolean;
  vipExpiresAt?: string;
  stats: { pile3WinsTotal: number };
  createdAt: string;
  lastLoginAt: string;
}

export interface PublicProfileResponse {
  id: string;
  displayName: string;
  avatarUrl?: string;
  tier: Tier;
  isVIP: boolean;
  stats: { pile3WinsTotal: number };
  createdAt: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  avatarUrl?: string;
}

export interface TokenBalanceResponse {
  tokenBalance: number;
  tier: Tier;
  debt: {
    hasDebt: boolean;
    amount: number;
    installmentRate: number;
  };
  isVIP: boolean;
}

export interface DebtPayAdResponse {
  success: boolean;
  debtCleared: number;
  debtRemaining: number;
  newBalance: number;
}

export interface ApiError {
  error: string;
  statusCode?: number;
}
