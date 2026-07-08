/**
 * ArrangementPhase.tsx
 * UI phase จัดไพ่ก่อนเริ่มเกม (Arrangement Phase)
 * - แสดงไพ่ 11 ใบของ User แบ่งเป็น 3 กอง (3-3-5)
 * - Auto Sort — จัดไพ่อัตโนมัติตามกฎ 3-3-5
 * - กดไพ่แล้วกดตำแหน่งอื่น = swap (ไม่ใช้ drag เพื่อ performance)
 * - READY — ส่ง arrangement ไปยัง server ผ่าน Socket
 * - Pile labels แสดงชื่อ Hand rank ของแต่ละกอง
 *
 * The Sage Unicorn Studio Co., Ltd.
 * Founder: Asst. Prof. Pongnathee Maneekul
 */

import React, { useCallback, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import Card, { Suit, Value } from './Card';

// ── Types ──────────────────────────────────────────────────────────
export interface CardData {
  id: string;     // unique id เช่น "heart_a"
  suit: Suit;
  value: Value;
}

// ตำแหน่งไพ่ใน pile: pileIndex (0-2) + cardIndex ใน pile
interface CardPosition {
  pileIndex: number;
  cardIndex: number;
}

export interface ArrangementPhaseProps {
  // ไพ่ 11 ใบที่ deal มาให้ผู้เล่น
  cards: CardData[];
  // callback เมื่อ player กด READY
  onReady: (arrangement: [CardData[], CardData[], CardData[]]) => void;
  // callback เมื่อ player กด Auto Sort
  onAutoSort?: () => void;
  // pile labels แสดง hand rank (อัพเดทจาก handEvaluator)
  pileHandRanks?: [string, string, string];
  // disable ปุ่มถ้ายังไม่ได้รับไพ่
  disabled?: boolean;
}

// ── Theme Colors ───────────────────────────────────────────────────
const C = {
  gold:       '#c9a84c',
  goldDim:    'rgba(201,168,76,0.4)',
  goldFaint:  'rgba(201,168,76,0.07)',
  green:      '#1a5e20',
  greenLight: '#2d8a35',
  greenBord:  'rgba(74,154,90,0.45)',
  greenGlow:  'rgba(45,138,53,0.45)',
  textGold:   'rgba(201,168,76,0.45)',
  textWhite:  '#ffffff',
  textReady:  '#00ff00',
  border:     'rgba(201,168,76,0.15)',
  selected:   '#6ec87a',
};

// ── Card sizes ─────────────────────────────────────────────────────
const CARD_W = 27;
const CARD_H = 39;
const OVERLAP = -10; // margin-left ของไพ่ซ้อน

// =================================================================
// MAIN COMPONENT
// =================================================================
const ArrangementPhase: React.FC<ArrangementPhaseProps> = ({
  cards,
  onReady,
  onAutoSort,
  pileHandRanks = ['', '', ''],
  disabled = false,
}) => {
  // ── แบ่งไพ่เป็น 3 pile ────────────────────────────────────────
  // เริ่มต้น: pile1=3ใบ, pile2=3ใบ, pile3=5ใบ
  const initPiles = useCallback((): [CardData[], CardData[], CardData[]] => {
    const c = [...cards];
    return [c.slice(0, 3), c.slice(3, 6), c.slice(6, 11)];
  }, [cards]);

  const [piles, setPiles] = useState<[CardData[], CardData[], CardData[]]>(initPiles);
  const [selected, setSelected] = useState<CardPosition | null>(null);
  const [isReady, setIsReady]   = useState(false);

  // ── กด READY ──────────────────────────────────────────────────
  const handleReady = useCallback(() => {
    if (isReady || disabled) return;
    setIsReady(true);
    onReady(piles);
    // TODO Sprint 4: socket.emit('player_ready', { arrangement: piles })
  }, [isReady, disabled, piles, onReady]);

  // ── กด Auto Sort ──────────────────────────────────────────────
  const handleAutoSort = useCallback(() => {
    if (isReady || disabled) return;
    // TODO Sprint 4: เรียก handEvaluator เพื่อ sort จริง
    // ตอนนี้ reset pile กลับเป็น 3-3-5 ตามลำดับที่ deal
    setPiles(initPiles());
    setSelected(null);
    onAutoSort?.();
    Vibration.vibrate(20);
  }, [isReady, disabled, initPiles, onAutoSort]);

  // ── กดเลือก/swap ไพ่ ──────────────────────────────────────────
  const handleCardPress = useCallback((pileIndex: number, cardIndex: number) => {
    if (isReady || disabled) return;

    if (!selected) {
      // ── เลือกไพ่ใบแรก ─────────────────────────────────────
      setSelected({ pileIndex, cardIndex });
      Vibration.vibrate(10);
    } else {
      // ── swap กับตำแหน่งที่กดครั้งสอง ──────────────────────
      const from = selected;
      const to   = { pileIndex, cardIndex };

      // กดไพ่ใบเดิม → deselect
      if (from.pileIndex === to.pileIndex && from.cardIndex === to.cardIndex) {
        setSelected(null);
        return;
      }

      // swap
      const newPiles = piles.map(p => [...p]) as [CardData[], CardData[], CardData[]];
      const fromCard = newPiles[from.pileIndex][from.cardIndex];
      const toCard   = newPiles[to.pileIndex][to.cardIndex];
      newPiles[from.pileIndex][from.cardIndex] = toCard;
      newPiles[to.pileIndex][to.cardIndex]     = fromCard;

      setPiles(newPiles);
      setSelected(null);
      Vibration.vibrate(15);
    }
  }, [isReady, disabled, selected, piles]);

  // ── Pile label text ───────────────────────────────────────────
  const PILE_NAMES = ['Pile 1', 'Pile 2', 'Pile 3'];

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={styles.root}>

      {/* ── Pile labels ────────────────────────────────────────── */}
      <View style={styles.labelsRow}>
        {PILE_NAMES.map((name, idx) => (
          <View key={idx} style={styles.labelGroup}>
            <Text style={styles.pileName}>{name}</Text>
            {pileHandRanks[idx] ? (
              <Text style={styles.handRank}>{pileHandRanks[idx]}</Text>
            ) : null}
          </View>
        ))}
      </View>

      {/* ── ไพ่ 3 pile ─────────────────────────────────────────── */}
      <View style={styles.pilesRow}>
        {piles.map((pile, pileIdx) => (
          <View key={pileIdx} style={styles.pileWrap}>
            {pile.map((card, cardIdx) => {
              const isSelected =
                selected?.pileIndex === pileIdx &&
                selected?.cardIndex === cardIdx;
              return (
                <TouchableOpacity
                  key={card.id}
                  onPress={() => handleCardPress(pileIdx, cardIdx)}
                  activeOpacity={0.85}
                  style={[
                    styles.cardTouch,
                    cardIdx > 0 && { marginLeft: OVERLAP },
                    isSelected && { zIndex: 5 },
                  ]}
                >
                  <Card
                    variant="face"
                    suit={card.suit}
                    value={card.value}
                    width={CARD_W}
                    height={CARD_H}
                    selected={isSelected}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <View style={styles.actionBar}>
        {/* Auto Sort */}
        <TouchableOpacity
          style={[styles.btnSort, (isReady || disabled) && styles.btnDisabled]}
          onPress={handleAutoSort}
          disabled={isReady || disabled}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSortText}>Auto Sort</Text>
        </TouchableOpacity>

        {/* READY */}
        <TouchableOpacity
          style={[
            styles.btnReady,
            isReady && styles.btnReadyDone,
            disabled && styles.btnDisabled,
          ]}
          onPress={handleReady}
          disabled={isReady || disabled}
          activeOpacity={0.85}
        >
          <Text style={styles.btnReadyText}>
            {isReady ? 'WAITING...' : 'READY ✓'}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

// =================================================================
// STYLES
// =================================================================
const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },

  // ── Labels ─────────────────────────────────────────────────────
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 3,
    paddingHorizontal: 8,
  },
  labelGroup: {
    alignItems: 'center',
    gap: 1,
  },
  pileName: {
    fontSize: 7,
    color: C.textGold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  handRank: {
    fontSize: 7,
    color: C.gold,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Piles ──────────────────────────────────────────────────────
  pilesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 5,
  },
  pileWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  cardTouch: {
    // zIndex จัดการผ่าน inline style
  },

  // ── Action Bar ─────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 2,
  },
  btnSort: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.goldDim,
    backgroundColor: C.goldFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSortText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.gold,
    letterSpacing: 0.5,
  },
  btnReady: {
    flex: 2,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.greenBord,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    // shadow
    shadowColor: C.greenGlow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  btnReadyDone: {
    backgroundColor: '#14481a',
    borderColor: 'rgba(74,154,90,0.2)',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnReadyText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textWhite,
    letterSpacing: 1.5,
  },
});

export default ArrangementPhase;
