// ─────────────────────────────────────────────────────────────────────────────
// gameConstants.ts — Game Constants สำหรับ Frontend
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import type { Tier } from '../types/game.types';

// ─── Tier Brackets ────────────────────────────────────────────────────────────

export const TIER_BRACKETS: Record<Tier, { min: number; max: number | null; label: string; color: string }> = {
  beginner: { min: 0,      max: 19999,  label: 'Beginner', color: '#6B7280' },
  pro:      { min: 20000,  max: 59999,  label: 'Pro',      color: '#3B82F6' },
  boss:     { min: 60000,  max: null,   label: 'Boss',     color: '#EF4444' },
  lastBoss: { min: 60000,  max: null,   label: 'The Last Boss', color: '#7C3AED' },
};

export function getTierByToken(token: number): Tier {
  if (token < 20000) return 'beginner';
  if (token < 60000) return 'pro';
  return 'boss';
}

// ─── Token Pot ────────────────────────────────────────────────────────────────

export const TOKEN_POT = {
  beginner: { pile1: 10,  pile2: 20,  pile3: 50,  call: null  },
  pro:      { pile1: 50,  pile2: 100, pile3: 250, call: 500   },
  boss:     { pile1: 200, pile2: 300, pile3: 500, call: 1000  },
  lastBoss: { pile1: 300, pile2: 500, pile3: 1000,call: 2000  },
} as const;

export const RAKE = 0.05; // 5%

// ─── Arrangement Timer ────────────────────────────────────────────────────────

export const ARRANGEMENT_TIMER: Record<Tier, number> = {
  beginner: 60,
  pro:      45,
  boss:     30,
  lastBoss: 30,
};

// ─── Grand Finale Timer ───────────────────────────────────────────────────────

export const GRAND_FINALE_TIMER: Record<Tier, number | null> = {
  beginner: null,
  pro:      10,
  boss:     8,
  lastBoss: 8,
};

// ─── Pile Reveal Timer ────────────────────────────────────────────────────────

export const PILE_REVEAL_DURATION: Record<Tier, number> = {
  beginner: 0,
  pro:      6000,
  boss:     5000,
  lastBoss: 5000,
};

// ─── Bid Levels ───────────────────────────────────────────────────────────────
// Dropdown 6 ระดับสำหรับ Blind Auction

export function getBidLevels(tier: Tier): number[] {
  const base: Record<Tier, number[]> = {
    beginner: [],
    pro:      [50,  100, 200, 500,  1000, 2000],
    boss:     [200, 400, 800, 1500, 3000, 5000],
    lastBoss: [300, 600, 1200,2500, 5000, 10000],
  };
  return base[tier];
}

// ─── Max Rounds ───────────────────────────────────────────────────────────────

export const MAX_ROUNDS: Record<Tier, number> = {
  beginner: 3,
  pro:      5,
  boss:     6,
  lastBoss: 5,
};

// ─── Progressive Mechanics ────────────────────────────────────────────────────

export const PROGRESSIVE_MECHANICS: Record<Tier, {
  showdownStyle: 'simultaneous' | 'sequential';
  fogOfWar: boolean;
  blindAuction: boolean;
  grandFinaleBetting: boolean;
  discardPhase: boolean;
}> = {
  beginner: {
    showdownStyle:      'simultaneous',
    fogOfWar:           false,
    blindAuction:       false,
    grandFinaleBetting: false,
    discardPhase:       false,
  },
  pro: {
    showdownStyle:      'sequential',
    fogOfWar:           true,
    blindAuction:       true,
    grandFinaleBetting: true,
    discardPhase:       true,
  },
  boss: {
    showdownStyle:      'sequential',
    fogOfWar:           true,
    blindAuction:       true,
    grandFinaleBetting: true,
    discardPhase:       true,
  },
  lastBoss: {
    showdownStyle:      'sequential',
    fogOfWar:           true,
    blindAuction:       true,
    grandFinaleBetting: true,
    discardPhase:       true,
  },
};

// ─── Card Constants ───────────────────────────────────────────────────────────

export const SUIT_SYMBOLS: Record<string, string> = {
  spades:   '♠',
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
};

export const SUIT_COLORS: Record<string, string> = {
  spades:   '#1F2937',
  hearts:   '#EF4444',
  diamonds: '#EF4444',
  clubs:    '#1F2937',
};

export const VALUE_LABELS: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

// ─── Colors ───────────────────────────────────────────────────────────────────

export const COLORS = {
  gold:      '#F59E0B',
  goldGlow:  '#FCD34D',
  winGreen:  '#10B981',
  loseRed:   '#EF4444',
  burnGray:  '#6B7280',
  auctionPink: '#EC4899',
  communityGreen: '#059669',
  bgDark:    '#0F172A',
  bgCard:    '#1E293B',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
} as const;

// ─── Animation Durations (ms) ─────────────────────────────────────────────────

export const ANIMATION = {
  cardFlip:       400,
  tokenFlow:      600,
  winnerGlow:     800,
  countdown321:   3000,
  fogOfWar:       500,
  pileSlideIn:    300,
  toastDuration:  3000,
} as const;
