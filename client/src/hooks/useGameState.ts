// ─────────────────────────────────────────────────────────────────────────────
// useGameState.ts — Game State Subscription Hook
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import { useGameStore } from '../store/gameStore';
import { useUserStore } from '../store/userStore';
import { PROGRESSIVE_MECHANICS } from '../constants/gameConstants';

/** Hook หลักสำหรับ Game Components — ดึงทุกอย่างที่ต้องการจาก store */
export function useGameState() {
  const game = useGameStore();
  const { userId } = useUserStore();

  const mechanics = PROGRESSIVE_MECHANICS[game.tier];
  const isMyTurn = game.myPlayerId === userId;

  const myPlayer = game.players.find(p => p.id === game.myPlayerId);
  const opponents = game.players.filter(p => p.id !== game.myPlayerId);

  // ── Phase Checks ─────────────────────────────────────────────────────────

  const isArrangementPhase  = game.phase === 'arrangement';
  const isAuctionPhase      = game.phase === 'auction';
  const isDiscardPhase      = game.phase === 'discard';
  const isGrandFinalePhase  = game.phase === 'grand_finale';
  const isEndOfMatch        = game.phase === 'end_of_match';
  const isSimultaneous      = game.phase === 'simultaneous';

  // ── Feature Gates (ตาม tier) ─────────────────────────────────────────────

  const showFogOfWar        = mechanics.fogOfWar;
  const showAuction         = mechanics.blindAuction;
  const showDiscard         = mechanics.discardPhase;
  const showGrandFinale     = mechanics.grandFinaleBetting;

  return {
    ...game,
    mechanics,
    isMyTurn,
    myPlayer,
    opponents,
    isArrangementPhase,
    isAuctionPhase,
    isDiscardPhase,
    isGrandFinalePhase,
    isEndOfMatch,
    isSimultaneous,
    showFogOfWar,
    showAuction,
    showDiscard,
    showGrandFinale,
  };
}
