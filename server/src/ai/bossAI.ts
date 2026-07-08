// ============================================================
// bossAI.ts — Boss AI (4 จตุรเทพ)
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// 4 จตุรเทพ แต่ละตัวมี Arrangement Strategy แยกกัน:
//   Reaper  → precision  : best_of_n N=5  · weight Pile 3 ×1.5
//   The Crag → juggernaut: best_of_n N=3  · weight Pile 1 ×1.5 (front-load)
//   Cortex  → optimal   : best_of_n N=15 · weight Pile 3 ×1.3
//   Cipher  → chaos     : 80% best_of_n N=5 · 20% unorthodox
// ============================================================

import { checkFoul, PlayerArrangement, CommunityCards } from '../game/foulChecker';
import { evaluateHand } from '../game/handEvaluator';
import { Card } from '../game/deck';

// ─── ประเภท Boss ─────────────────────────────────────────────
export type BossType = 'reaper' | 'crag' | 'cortex' | 'cipher';

const PILE1_SIZE = 3;
const PILE2_SIZE = 3;
const PILE3_SIZE = 5;
const MAX_ATTEMPTS_PER_CANDIDATE = 500;

const BOSS_N: Record<BossType, number> = {
  reaper: 5,
  crag:   3,
  cortex: 15,
  cipher: 5,
};

// ============================
// ฟังก์ชันหลัก — bossArrange
// ============================
export function bossArrange(
  bossType: BossType,
  cards: Card[],
  community: CommunityCards
): PlayerArrangement {
  if (cards.length !== PILE1_SIZE + PILE2_SIZE + PILE3_SIZE) {
    throw new Error(
      `bossArrange [${bossType}]: ต้องการ 11 ใบ แต่ได้รับ ${cards.length} ใบ`
    );
  }

  switch (bossType) {
    case 'reaper': return reaperArrange(cards, community);
    case 'crag':   return cragArrange(cards, community);
    case 'cortex': return cortexArrange(cards, community);
    case 'cipher': return cipherArrange(cards, community);
  }
}

// ─── Reaper: weight Pile 3 ×1.5 ──────────────────────────────
function reaperArrange(cards: Card[], community: CommunityCards): PlayerArrangement {
  const candidates = buildCandidates(cards, community, BOSS_N.reaper);
  return selectByWeightedScore(candidates, community, { pile1: 1.0, pile2: 1.0, pile3: 1.5 });
}

// ─── The Crag: weight Pile 1 ×1.5 ────────────────────────────
function cragArrange(cards: Card[], community: CommunityCards): PlayerArrangement {
  const candidates = buildCandidates(cards, community, BOSS_N.crag);
  return selectByWeightedScore(candidates, community, { pile1: 1.5, pile2: 1.0, pile3: 1.0 });
}

// ─── Cortex: N=15, weight Pile 3 ×1.3 ───────────────────────
function cortexArrange(cards: Card[], community: CommunityCards): PlayerArrangement {
  const candidates = buildCandidates(cards, community, BOSS_N.cortex);
  return selectByWeightedScore(candidates, community, { pile1: 1.0, pile2: 1.0, pile3: 1.3 });
}

// ─── Cipher: 80% normal / 20% unorthodox ─────────────────────
function cipherArrange(cards: Card[], community: CommunityCards): PlayerArrangement {
  if (Math.random() < 0.80) {
    const candidates = buildCandidates(cards, community, BOSS_N.cipher);
    return selectByWeightedScore(candidates, community, { pile1: 1.0, pile2: 1.0, pile3: 1.0 });
  }
  return cipherUnorthodoxArrange(cards, community);
}

function cipherUnorthodoxArrange(cards: Card[], community: CommunityCards): PlayerArrangement {
  const sorted = [...cards].sort((a, b) => compareCardRank(b) - compareCardRank(a));
  const candidate: PlayerArrangement = {
    pile1: sorted.slice(0, PILE1_SIZE),
    pile2: sorted.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE),
    pile3: sorted.slice(PILE1_SIZE + PILE2_SIZE),
  };

  if (!checkFoul(candidate, community).isFoul) return candidate;

  // Foul → fallback เป็น best_of_n
  const fallback = buildCandidates(cards, community, BOSS_N.cipher);
  if (fallback.length === 0) throw new Error('cipherUnorthodoxArrange: ไม่พบ valid arrangement');
  return selectByWeightedScore(fallback, community, { pile1: 1.0, pile2: 1.0, pile3: 1.0 });
}

// ─── Shared Helpers ───────────────────────────────────────────

function buildCandidates(
  cards: Card[],
  community: CommunityCards,
  n: number
): PlayerArrangement[] {
  const results: PlayerArrangement[] = [];

  for (let i = 0; i < n; i++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CANDIDATE; attempt++) {
      const shuffled = shuffleCards([...cards]);
      const arr: PlayerArrangement = {
        pile1: shuffled.slice(0, PILE1_SIZE),
        pile2: shuffled.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE),
        pile3: shuffled.slice(PILE1_SIZE + PILE2_SIZE),
      };
      if (!checkFoul(arr, community).isFoul) {
        results.push(arr);
        break;
      }
    }
  }
  return results;
}

function selectByWeightedScore(
  candidates: PlayerArrangement[],
  community: CommunityCards,
  weights: { pile1: number; pile2: number; pile3: number }
): PlayerArrangement {
  if (candidates.length === 0) throw new Error('selectByWeightedScore: ไม่มี candidate');

  let best      = candidates[0];
  let bestScore = calcWeightedScore(candidates[0], community, weights);

  for (let i = 1; i < candidates.length; i++) {
    const score = calcWeightedScore(candidates[i], community, weights);
    if (score > bestScore) {
      bestScore = score;
      best      = candidates[i];
    }
  }
  return best;
}

function calcWeightedScore(
  arr: PlayerArrangement,
  community: CommunityCards,
  weights: { pile1: number; pile2: number; pile3: number }
): number {
  const s1 = evaluateHand([...arr.pile1, ...community.row1]).score;
  const s2 = evaluateHand([...arr.pile2, ...community.row2]).score;
  const s3 = evaluateHand([...arr.pile3, ...community.row3]).score;
  return s1 * weights.pile1 + s2 * weights.pile2 + s3 * weights.pile3;
}

function compareCardRank(card: Card): number {
  return card.value;
}

function shuffleCards(cards: Card[]): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
