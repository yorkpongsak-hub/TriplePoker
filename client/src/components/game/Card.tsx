/**
 * Card.tsx
 * Component ไพ่ทุกประเภทใน TriplePoker
 * รองรับ: หน้าไพ่ (classic deck), หลังไพ่ (Triple Spade), auction card
 *
 * Asset naming ตาม AssetNaming_Spec_v1_0:
 *   card_[suit]_[value].png
 *   suit: spade | heart | diamond | club
 *   value: a | 2–10 | j | q | k
 *
 * The Sage Unicorn Studio Co., Ltd.
 * Founder: Asst. Prof. Pongnathee Maneekul
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  ImageStyle,
  Platform,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

// ── Types ──────────────────────────────────────────────────────────
export type Suit  = 'spade' | 'heart' | 'diamond' | 'club';
export type Value = 'a' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'j' | 'q' | 'k';

export type CardVariant =
  | 'face'     // หน้าไพ่ — แสดง rank + suit
  | 'back'     // หลังไพ่ — Triple Spade logo
  | 'auction'; // ไพ่ Auction — purple mystery

export interface CardProps {
  variant: CardVariant;
  suit?: Suit;
  value?: Value;
  // ขนาด
  width?: number;
  height?: number;
  // state
  selected?: boolean;  // ไพ่ที่เลือก — lift + green glow
  winner?: boolean;    // ไพ่ชนะ — gold pulse
  glow?: boolean;      // gold glow ทั่วไป (AI auction phase)
  faceDown?: boolean;  // บังคับ face card ให้แสดงหลัง (spectator mode)
  // style override
  style?: ViewStyle;
}

// ── Theme Colors ───────────────────────────────────────────────────
const C = {
  cardBg:       '#fdfaf3',
  cardBgAlt:    '#ede3cc',
  cardBack:     '#091808',
  cardBackBord: 'rgba(201,168,76,0.5)',
  cardBackGlow: 'rgba(201,168,76,0.85)',
  auctionBg:    '#160c1e',
  auctionBord:  'rgba(160,80,220,0.55)',
  auctionGlow:  'rgba(160,80,220,0.3)',
  red:          '#c0392b',
  black:        '#1a1a1a',
  gold:         '#c9a84c',
  green:        '#6ec87a',
};

// ── Suit symbols ───────────────────────────────────────────────────
const SUIT_SYMBOL: Record<Suit, string> = {
  spade:   '♠',
  heart:   '♥',
  diamond: '♦',
  club:    '♣',
};

// ── Value display (10 → "10", j → "J") ────────────────────────────
const VALUE_DISPLAY: Record<Value, string> = {
  a: 'A', '2': '2', '3': '3', '4': '4', '5': '5',
  '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  j: 'J', q: 'Q', k: 'K',
};

// ── ไพ่ที่เป็น red suits ───────────────────────────────────────────
const isRedSuit = (suit: Suit): boolean =>
  suit === 'heart' || suit === 'diamond';

// ── Static require map ครบ 52 ใบ ──────────────────────────────────
// React Native ต้องใช้ static require — ไม่รองรับ dynamic string path
const CARD_IMAGES: Record<string, any> = {
  // Spades
  'spade_a':   require('../../assets/cards/classic/as.png'),
  'spade_2':   require('../../assets/cards/classic/2s.png'),
  'spade_3':   require('../../assets/cards/classic/3s.png'),
  'spade_4':   require('../../assets/cards/classic/4s.png'),
  'spade_5':   require('../../assets/cards/classic/5s.png'),
  'spade_6':   require('../../assets/cards/classic/6s.png'),
  'spade_7':   require('../../assets/cards/classic/7s.png'),
  'spade_8':   require('../../assets/cards/classic/8s.png'),
  'spade_9':   require('../../assets/cards/classic/9s.png'),
  'spade_10':  require('../../assets/cards/classic/10s.png'),
  'spade_j':   require('../../assets/cards/classic/js.png'),
  'spade_q':   require('../../assets/cards/classic/qs.png'),
  'spade_k':   require('../../assets/cards/classic/ks.png'),
  // Hearts
  'heart_a':   require('../../assets/cards/classic/ah.png'),
  'heart_2':   require('../../assets/cards/classic/2h.png'),
  'heart_3':   require('../../assets/cards/classic/3h.png'),
  'heart_4':   require('../../assets/cards/classic/4h.png'),
  'heart_5':   require('../../assets/cards/classic/5h.png'),
  'heart_6':   require('../../assets/cards/classic/6h.png'),
  'heart_7':   require('../../assets/cards/classic/7h.png'),
  'heart_8':   require('../../assets/cards/classic/8h.png'),
  'heart_9':   require('../../assets/cards/classic/9h.png'),
  'heart_10':  require('../../assets/cards/classic/10h.png'),
  'heart_j':   require('../../assets/cards/classic/jh.png'),
  'heart_q':   require('../../assets/cards/classic/qh.png'),
  'heart_k':   require('../../assets/cards/classic/kh.png'),
  // Diamonds
  'diamond_a':  require('../../assets/cards/classic/ad.png'),
  'diamond_2':  require('../../assets/cards/classic/2d.png'),
  'diamond_3':  require('../../assets/cards/classic/3d.png'),
  'diamond_4':  require('../../assets/cards/classic/4d.png'),
  'diamond_5':  require('../../assets/cards/classic/5d.png'),
  'diamond_6':  require('../../assets/cards/classic/6d.png'),
  'diamond_7':  require('../../assets/cards/classic/7d.png'),
  'diamond_8':  require('../../assets/cards/classic/8d.png'),
  'diamond_9':  require('../../assets/cards/classic/9d.png'),
  'diamond_10': require('../../assets/cards/classic/10d.png'),
  'diamond_j':  require('../../assets/cards/classic/jd.png'),
  'diamond_q':  require('../../assets/cards/classic/qd.png'),
  'diamond_k':  require('../../assets/cards/classic/kd.png'),
  // Clubs
  'club_a':   require('../../assets/cards/classic/ac.png'),
  'club_2':   require('../../assets/cards/classic/2c.png'),
  'club_3':   require('../../assets/cards/classic/3c.png'),
  'club_4':   require('../../assets/cards/classic/4c.png'),
  'club_5':   require('../../assets/cards/classic/5c.png'),
  'club_6':   require('../../assets/cards/classic/6c.png'),
  'club_7':   require('../../assets/cards/classic/7c.png'),
  'club_8':   require('../../assets/cards/classic/8c.png'),
  'club_9':   require('../../assets/cards/classic/9c.png'),
  'club_10':  require('../../assets/cards/classic/10c.png'),
  'club_j':   require('../../assets/cards/classic/jc.png'),
  'club_q':   require('../../assets/cards/classic/qc.png'),
  'club_k':   require('../../assets/cards/classic/kc.png'),
};

// โลโก้ Triple Spade สำหรับ card back
const TRIPLE_SPADE = require('../../assets/images/triple_poker_icon.png');

// ── Helper: ดึงรูปไพ่จาก suit + value ────────────────────────────
export const getCardImage = (suit: Suit, value: Value) => {
  const key = `${suit}_${value}`;
  return CARD_IMAGES[key] ?? null;
};

// =================================================================
// MAIN COMPONENT
// =================================================================
const Card: React.FC<CardProps> = ({
  variant,
  suit,
  value,
  width  = 27,
  height = 39,
  selected  = false,
  winner    = false,
  glow      = false,
  faceDown  = false,
  style,
}) => {
  // ── Winner pulse animation ────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0.8)).current;
  const winnerPulseRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (winner) {
      winnerPulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.8, duration: 500, useNativeDriver: false }),
        ])
      );
      winnerPulseRef.current.start();
    } else {
      winnerPulseRef.current?.stop();
      pulseAnim.setValue(0.8);
    }
    return () => { winnerPulseRef.current?.stop(); };
  }, [winner]);

  // ── กำหนด border + shadow ตาม state ──────────────────────────
  const borderColor =
    winner   ? C.gold    :
    selected ? C.green   :
    glow     ? C.cardBackGlow :
    variant === 'auction' ? C.auctionBord :
    variant === 'back'    ? C.cardBackBord :
    'rgba(201,168,76,0.65)'; // face card default border

  const shadowColor =
    winner   ? C.gold           :
    selected ? C.green          :
    glow     ? C.gold           :
    variant === 'auction' ? C.auctionGlow :
    '#000000';

  const shadowOpacity =
    winner || selected || glow ? 0.8 : 0.4;

  const shadowRadius =
    winner ? 12 : selected ? 10 : glow ? 8 : 3;

  // ── ตัดสินใจ render variant ───────────────────────────────────
  const effectiveVariant = faceDown && variant === 'face' ? 'back' : variant;

  // ── Card Back ─────────────────────────────────────────────────
  if (effectiveVariant === 'back') {
    return (
      <Animated.View style={[
        styles.cardBase,
        {
          width,
          height,
          borderRadius: Math.round(width * 0.14),
          borderColor,
          backgroundColor: C.cardBack,
          shadowColor,
          shadowOpacity,
          shadowRadius,
        },
        style,
      ]}>
        <Image
          source={TRIPLE_SPADE}
          style={{
            width:  width  * 0.55,
            height: height * 0.55,
            opacity: 0.17,
          } as ImageStyle}
          resizeMode="contain"
        />
      </Animated.View>
    );
  }

  // ── Auction Card ──────────────────────────────────────────────
  if (effectiveVariant === 'auction') {
    return (
      <View style={[
        styles.cardBase,
        {
          width,
          height,
          borderRadius: Math.round(width * 0.14),
          borderColor: C.auctionBord,
          backgroundColor: C.auctionBg,
          shadowColor: C.auctionGlow,
          shadowOpacity: 1,
          shadowRadius: 8,
        },
        style,
      ]} />
    );
  }

  // ── Face Card ─────────────────────────────────────────────────
  if (!suit || !value) return null;

  const cardImage = getCardImage(suit, value);
  const textColor = isRedSuit(suit) ? C.red : C.black;
  const translateY = selected ? -5 : 0;

  return (
    <Animated.View style={[
      styles.cardBase,
      styles.faceCard,
      {
        width,
        height,
        borderRadius: Math.round(width * 0.14),
        borderColor,
        shadowColor,
        shadowOpacity,
        shadowRadius,
        transform: [{ translateY }],
        zIndex: selected ? 3 : 1,
      },
      style,
    ]}>
      {cardImage ? (
        // ── รูปไพ่จาก classic deck ────────────────────────────
        <Image
          source={cardImage}
          style={[styles.cardImage, { width, height }] as ImageStyle}
          resizeMode="cover"
        />
      ) : (
        // ── Fallback: แสดง rank + suit text ──────────────────
        <View style={styles.fallbackContent}>
          <Text style={[styles.fallbackRank, { color: textColor, fontSize: width * 0.36 }]}>
            {VALUE_DISPLAY[value]}
          </Text>
          <Text style={[styles.fallbackSuit, { color: textColor, fontSize: width * 0.3 }]}>
            {SUIT_SYMBOL[suit]}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

// =================================================================
// STYLES
// =================================================================
const styles = StyleSheet.create({
  cardBase: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // iOS shadow
    shadowOffset: { width: 0, height: 0 },
    // Android
    elevation: 4,
  },
  faceCard: {
    backgroundColor: '#fdfaf3',
  },
  cardImage: {
    // Image เต็ม card
  },
  fallbackContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  fallbackRank: {
    fontWeight: '700',
    lineHeight: undefined,
  },
  fallbackSuit: {
    fontWeight: '600',
    lineHeight: undefined,
  },
});

export default Card;
