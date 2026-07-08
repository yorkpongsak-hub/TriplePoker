import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Card, { CardRef, Suit } from './Card';

// ─── Types ───────────────────────────────────────────────────────────────────
interface FogCard {
  suit: Suit;
  rank: string;
}

interface FogOfWarProps {
  cards: FogCard[];         // ไพ่ทั้งหมดที่ต้อง cover ด้วย Fog
  isRevealed: boolean;      // true = เปิด fog (flip ไพ่กลับเป็นหน้า)
  seatPosition: 'top' | 'left' | 'right' | 'bottom'; // ตำแหน่ง seat บนโต๊ะ
  onRevealComplete?: () => void;
}

// ─── Timing ──────────────────────────────────────────────────────────────────
// delay ระหว่าง flip แต่ละใบเมื่อ reveal (ms)
const CARD_STAGGER_DELAY = 80;

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * FogOfWar
 * Overlay ที่ซ่อนไพ่ของทุก seat ระหว่าง Pile 1/2 Resolution (Pro+ Tier)
 *
 * Sequence:
 *   - เริ่มต้น: ไพ่ทุกใบ faceDown (หลังไพ่)
 *   - เมื่อ isRevealed = true → flip ทีละใบ แบบ stagger (ซ้ายไปขวา)
 *   - ใช้ Card.ref.flip() จาก useCardAnimation hook
 *
 * Design rule:
 *   - Level 1 Effect — ต้องไม่บดบัง Call/Fold button ระหว่าง flip
 *   - flip animation ต้องเสร็จก่อน phase ถัดไปเริ่ม
 */
const FogOfWar: React.FC<FogOfWarProps> = ({
  cards,
  isRevealed,
  seatPosition,
  onRevealComplete,
}) => {
  // ref สำหรับ Card แต่ละใบ — ใช้สั่ง flip โดยตรง
  const cardRefs = useRef<(CardRef | null)[]>(cards.map(() => null));

  // fog overlay opacity — จางหายก่อน flip เริ่ม
  const fogOpacity = useSharedValue<number>(1);

  // ─── Reveal sequence ───────────────────────────────────────────────────
  // เมื่อ isRevealed เปลี่ยนเป็น true → fade fog → flip ทีละใบ
  const runRevealSequence = useCallback(() => {
    // Step 1: Fog overlay จาง (150ms)
    fogOpacity.value = withTiming(0, {
      duration: 150,
      easing: Easing.out(Easing.quad),
    });

    // Step 2: flip ไพ่ทีละใบ แบบ stagger
    cards.forEach((_, idx) => {
      const isLastCard = idx === cards.length - 1;
      setTimeout(() => {
        cardRefs.current[idx]?.flip('front');

        // หลังใบสุดท้าย flip เสร็จ → callback
        if (isLastCard) {
          const flipDuration = 400; // ตรงกับ DURATION.FLIP ใน useCardAnimation
          setTimeout(() => {
            if (onRevealComplete) onRevealComplete();
          }, flipDuration);
        }
      }, idx * CARD_STAGGER_DELAY);
    });
  }, [cards, onRevealComplete]);

  // ─── Cover sequence ────────────────────────────────────────────────────
  // เมื่อ isRevealed กลับเป็น false → flip ไพ่กลับเป็นหลัง + fade fog กลับมา
  const runCoverSequence = useCallback(() => {
    cards.forEach((_, idx) => {
      setTimeout(() => {
        cardRefs.current[idx]?.flip('back');
      }, idx * CARD_STAGGER_DELAY);
    });

    // fog overlay fade กลับหลัง flip ทุกใบเสร็จ
    const totalFlipTime = cards.length * CARD_STAGGER_DELAY + 400;
    setTimeout(() => {
      fogOpacity.value = withTiming(1, { duration: 200 });
    }, totalFlipTime);
  }, [cards]);

  // react ต่อ isRevealed prop
  useEffect(() => {
    if (isRevealed) {
      runRevealSequence();
    } else {
      runCoverSequence();
    }
  }, [isRevealed]);

  // ─── Animated Styles ───────────────────────────────────────────────────
  // fog overlay — semi-transparent เลเยอร์ปิดไพ่
  const fogOverlayStyle = useAnimatedStyle(() => ({
    opacity: fogOpacity.value,
  }));

  // ─── Layout ────────────────────────────────────────────────────────────
  // หมุน card row ตาม seat position
  const rowRotation = seatPosition === 'top' ? '180deg' : '0deg';

  return (
    <View style={styles.container}>

      {/* ไพ่ทุกใบ — เริ่มต้น faceDown */}
      <View style={[styles.cardsRow, { transform: [{ rotate: rowRotation }] }]}>
        {cards.map((card, idx) => (
          <Card
            key={idx}
            ref={(el) => { cardRefs.current[idx] = el; }}
            suit={card.suit}
            rank={card.rank}
            faceDown={true}          // เริ่มคว่ำ — fog ปิดอยู่
            dealDelay={0}            // ไม่ deal animation (ไพ่อยู่บนโต๊ะแล้ว)
          />
        ))}
      </View>

      {/* Fog Overlay — กึ่งโปร่งแสงปิดทับไพ่ เพื่อซ่อนจากตา */}
      <Animated.View
        style={[
          styles.fogOverlay,
          fogOverlayStyle,
          FOG_COLOR_BY_POSITION[seatPosition],
        ]}
        pointerEvents="none"  // ไม่บล็อก touch event ด้านล่าง
      />

    </View>
  );
};

export default FogOfWar;

// ─── Fog color ตาม seat position ─────────────────────────────────────────────
// แต่ละ seat มีสี fog ต่างกันเล็กน้อย — ช่วย UX แยก seat ได้ชัดขึ้น
const FOG_COLOR_BY_POSITION: Record<string, object> = {
  top:    { backgroundColor: 'rgba(20,  30,  60, 0.7)' },
  left:   { backgroundColor: 'rgba(20,  30,  60, 0.65)' },
  right:  { backgroundColor: 'rgba(20,  30,  60, 0.65)' },
  bottom: { backgroundColor: 'rgba(10,  20,  50, 0.8)' }, // ผู้เล่นเอง — fog เข้มกว่า
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'relative',  // สำหรับ overlay position
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  fogOverlay: {
    // ครอบทับ cardsRow ทั้งหมด
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 12,
    // backdrop blur — iOS (ใช้ BlurView ถ้าต้องการ blur จริงๆ ใน Sprint ถัดไป)
  },
});
