import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Card, { CardRef } from './Card';
import { CardSide } from '../../hooks/useCardAnimation';

// ─── Types ───────────────────────────────────────────────────────────────────
interface PileCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
}

interface PlayerHand {
  playerId: string;
  displayName: string;
  cards: PileCard[];     // Pile 3 ของผู้เล่นคนนี้ (5 ใบ)
  isWinner?: boolean;
  tokenDelta?: number;   // +/- token หลังจบ match
}

interface GrandFinaleProps {
  hands: PlayerHand[];                        // ข้อมูลไพ่ทุกผู้เล่น
  onRevealComplete?: () => void;              // callback หลัง reveal ครบทุกใบ
  onCallFold?: (action: 'call' | 'fold') => void; // Pile 3 betting action
  isCurrentPlayer?: boolean;                 // แสดง Call/Fold button หรือไม่
}

// ─── Timing ──────────────────────────────────────────────────────────────────
// ระยะเวลาระหว่างการ reveal แต่ละผู้เล่น (ms)
const PLAYER_REVEAL_GAP = 800;

// ระยะเวลาระหว่างการ reveal แต่ละใบภายในผู้เล่นเดียวกัน (ms)
const CARD_REVEAL_GAP = 200;

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * GrandFinale
 * แสดง Pile 3 ของทุกผู้เล่น พร้อม slow reveal animation
 *
 * Sequence:
 *   1. ไพ่ทุกใบเริ่มคว่ำ (faceDown)
 *   2. reveal ทีละผู้เล่น (staggered) — ใน Tier Last Boss จะช้าเป็นพิเศษ
 *   3. แต่ละผู้เล่น: reveal ทีละใบ duration เพิ่มขึ้น (สร้าง tension)
 *   4. ใบสุดท้ายของผู้เล่นสุดท้าย: trigger glow effect
 *   5. ถ้า isWinner → trigger winner glow + token animation
 */
const GrandFinale: React.FC<GrandFinaleProps> = ({
  hands,
  onRevealComplete,
  onCallFold,
  isCurrentPlayer = false,
}) => {
  // ref 2D array — [playerIndex][cardIndex]
  const cardRefs = useRef<(CardRef | null)[][]>(
    hands.map((hand) => hand.cards.map(() => null)),
  );

  // winner glow opacity สำหรับแต่ละ seat
  const winnerGlowOpacity = useSharedValue<number>(0);

  // token delta label opacity — แสดง +/- token หลัง reveal
  const tokenLabelOpacity = useSharedValue<number>(0);

  // ─── Reveal Sequence ───────────────────────────────────────────────────
  // เริ่ม reveal ทีละผู้เล่น → ทีละใบ → duration เพิ่มขึ้น
  const startRevealSequence = useCallback(() => {
    const totalPlayers = hands.length;

    hands.forEach((hand, playerIdx) => {
      const playerDelay = playerIdx * PLAYER_REVEAL_GAP;
      const isLastPlayer = playerIdx === totalPlayers - 1;

      hand.cards.forEach((_, cardIdx) => {
        const isLastCard = cardIdx === hand.cards.length - 1;
        const isVeryLastCard = isLastPlayer && isLastCard;

        // delay รวม = ผู้เล่น gap + ใบก่อนหน้า gap
        const totalDelay = playerDelay + cardIdx * CARD_REVEAL_GAP;

        setTimeout(() => {
          const ref = cardRefs.current[playerIdx]?.[cardIdx];
          if (ref) {
            // slow reveal — duration เพิ่มขึ้นทีละใบ
            ref.slowReveal(cardIdx, isVeryLastCard);
          }

          // หลัง reveal ใบสุดท้ายของทุกผู้เล่น → trigger winner effects
          if (isVeryLastCard) {
            const revealDuration =
              500 + hand.cards.length * 200; // ประมาณ duration ของ slowReveal ใบสุดท้าย
            setTimeout(() => {
              triggerWinnerEffects();
              if (onRevealComplete) onRevealComplete();
            }, revealDuration);
          }
        }, totalDelay);
      });
    });
  }, [hands, onRevealComplete]);

  // ─── Winner Effects ────────────────────────────────────────────────────
  // Glow effect รอบ seat ผู้ชนะ + token label fade in
  const triggerWinnerEffects = useCallback(() => {
    // Glow pulse — fade in → hold → fade out (loop 2 ครั้ง)
    winnerGlowOpacity.value = withSequence(
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }),
      withTiming(0.4, { duration: 300 }),
      withTiming(1, { duration: 300 }),
      withDelay(800, withTiming(0, { duration: 600 })),
    );

    // Token label fade in หลัง glow เริ่ม
    tokenLabelOpacity.value = withDelay(
      400,
      withTiming(1, { duration: 300 }),
    );
  }, []);

  // auto-start reveal เมื่อ component mount
  useEffect(() => {
    // delay เล็กน้อยก่อนเริ่ม — ให้ UI render ก่อน
    const timer = setTimeout(() => {
      startRevealSequence();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // ─── Animated Styles ───────────────────────────────────────────────────
  const winnerGlowStyle = useAnimatedStyle(() => ({
    opacity: winnerGlowOpacity.value,
  }));

  const tokenLabelStyle = useAnimatedStyle(() => ({
    opacity: tokenLabelOpacity.value,
    transform: [
      {
        translateY: tokenLabelOpacity.value === 0 ? 10 : 0,
      },
    ],
  }));

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grand Finale</Text>
      <Text style={styles.subtitle}>Pile 3 Showdown</Text>

      {/* แสดงมือของทุกผู้เล่น */}
      {hands.map((hand, playerIdx) => (
        <View key={hand.playerId} style={styles.playerRow}>

          {/* ชื่อผู้เล่น */}
          <Text style={[
            styles.playerName,
            hand.isWinner && styles.playerNameWinner,
          ]}>
            {hand.displayName}
          </Text>

          {/* ไพ่ 5 ใบของผู้เล่นคนนี้ */}
          <View style={styles.cardsRow}>
            {hand.cards.map((card, cardIdx) => {
              const isLastCard = cardIdx === hand.cards.length - 1;
              const isLastPlayer = playerIdx === hands.length - 1;
              const isVeryLastCard = isLastPlayer && isLastCard;

              return (
                <View key={cardIdx} style={styles.cardWrapper}>
                  {/* ไพ่ — เริ่มต้น faceDown รอ slowReveal trigger */}
                  <Card
                    ref={(el) => {
                      if (cardRefs.current[playerIdx]) {
                        cardRefs.current[playerIdx][cardIdx] = el;
                      }
                    }}
                    suit={card.suit}
                    rank={card.rank}
                    faceDown={true}   // เริ่มคว่ำทุกใบ
                    dealDelay={0}     // ไม่ deal animation (ไพ่อยู่บนโต๊ะแล้ว)
                  />

                  {/* Glow overlay ใบสุดท้ายของผู้ชนะ */}
                  {isVeryLastCard && hand.isWinner && (
                    <Animated.View
                      style={[styles.cardGlowOverlay, winnerGlowStyle]}
                      pointerEvents="none"
                    />
                  )}
                </View>
              );
            })}
          </View>

          {/* Token delta label — แสดงหลัง reveal ครบ */}
          {hand.tokenDelta !== undefined && (
            <Animated.Text
              style={[
                styles.tokenDelta,
                hand.tokenDelta >= 0
                  ? styles.tokenDeltaPositive
                  : styles.tokenDeltaNegative,
                tokenLabelStyle,
              ]}
            >
              {hand.tokenDelta >= 0 ? '+' : ''}
              {hand.tokenDelta.toLocaleString()}
            </Animated.Text>
          )}

          {/* Winner glow border รอบ player row */}
          {hand.isWinner && (
            <Animated.View
              style={[styles.winnerBorder, winnerGlowStyle]}
              pointerEvents="none"
            />
          )}
        </View>
      ))}

      {/* Call / Fold buttons — แสดงเฉพาะ current player */}
      {isCurrentPlayer && onCallFold && (
        <View style={styles.actionBar}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.foldButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => onCallFold('fold')}
          >
            <Text style={styles.actionButtonText}>Fold</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.callButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => onCallFold('call')}
          >
            <Text style={styles.actionButtonText}>Call</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export default GrandFinale;

// ─── Styles ──────────────────────────────────────────────────────────────────
const GOLD = '#FFD700';
const WIN_GLOW = '#FFD70060'; // gold semi-transparent สำหรับ glow

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A', // สี game table
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: GOLD,
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: -8,
  },
  // ─── Player Row ──────────────────────────────────────────
  playerRow: {
    position: 'relative',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E0E0E0',
  },
  playerNameWinner: {
    color: GOLD,
    fontWeight: '800',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardWrapper: {
    position: 'relative',
  },
  // glow overlay ครอบไพ่ใบสุดท้ายผู้ชนะ
  cardGlowOverlay: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 12,
    backgroundColor: WIN_GLOW,
    borderWidth: 2,
    borderColor: GOLD,
  },
  // glow border รอบ player row ผู้ชนะ
  winnerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: GOLD,
  },
  // ─── Token Delta ─────────────────────────────────────────
  tokenDelta: {
    fontSize: 16,
    fontWeight: '800',
  },
  tokenDeltaPositive: {
    color: '#4CAF50',  // เขียว — ได้ token
  },
  tokenDeltaNegative: {
    color: '#EF5350',  // แดง — เสีย token
  },
  // ─── Action Bar ──────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foldButton: {
    backgroundColor: '#374151', // ปุ่ม Fold — เทาเข้ม
  },
  callButton: {
    backgroundColor: '#1B5E20', // ปุ่ม Call — เขียวเข้ม
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
