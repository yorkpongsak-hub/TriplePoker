// ─────────────────────────────────────────────────────────────────────────────
// PileReveal.tsx — Pile 1/2 Reveal Animation + Winner Glow Gold
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • แสดงผลการเปรียบ Pile พร้อม animation
//   • Winner seat กลาย gold glow + scale up
//   • Token animation ไหลเข้า-ออก
//   • Beginner: render ทั้ง 3 Pile พร้อมกัน
//   • Pro+: render ทีละ Pile ตาม pileNumber

import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, StyleSheet, ViewStyle,
} from 'react-native';
import type { PileResult } from '../../types/game.types';
import { COLORS, ANIMATION, HAND_RANK_NAMES } from '../../constants/gameConstants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PileRevealProps {
  result: PileResult;
  myPlayerId: string;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PileReveal({ result, myPlayerId, style }: PileRevealProps) {
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const tokenAnim  = useRef(new Animated.Value(0)).current;

  const isIWon = result.winnerId === myPlayerId;
  const isBurned = result.burned;

  // ── Winner animation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isBurned) return; // AI ชนะ → ไม่มี glow

    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        // Glow gold
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: ANIMATION.winnerGlow,
          useNativeDriver: true,
        }),
        // Scale up ช่วง 2 วินาทีสุดท้าย
        Animated.sequence([
          Animated.delay(400),
          Animated.spring(scaleAnim, {
            toValue: 1.05,
            useNativeDriver: true,
          }),
        ]),
        // Token flow animation
        Animated.timing(tokenAnim, {
          toValue: 1,
          duration: ANIMATION.tokenFlow,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const winnerRanking = result.rankings.find(r => r.playerId === result.winnerId);
  const handName = winnerRanking ? winnerRanking.handName : '—';

  const borderColor = isBurned
    ? COLORS.burnGray
    : result.winnerId === myPlayerId
    ? COLORS.goldGlow
    : COLORS.winGreen;

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  const tokenTranslate = tokenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { borderColor, transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      {/* Glow overlay */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: COLORS.gold, opacity: glowOpacity, borderRadius: 12 },
        ]}
      />

      {/* Pile header */}
      <Text style={styles.pileLabel}>Pile {result.pileNumber}</Text>

      {/* Pot info */}
      <View style={styles.potRow}>
        <Text style={styles.potLabel}>Pot</Text>
        <Text style={styles.potAmount}>{result.pot} T</Text>
      </View>

      {/* Winner */}
      {isBurned ? (
        <View style={styles.burnRow}>
          <Text style={styles.burnText}>🔥 Burned</Text>
          <Text style={styles.burnSub}>AI wins — no payout</Text>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.winnerRow,
            { opacity: glowAnim, transform: [{ translateY: tokenTranslate }] },
          ]}
        >
          <Text style={styles.winnerLabel}>Winner</Text>
          <Text style={styles.winnerName}>
            {result.winnerId === myPlayerId ? 'You' : result.winnerId.slice(0, 8)}
            {result.isTie ? ' 🎲' : ''}
          </Text>
          <Text style={styles.handName}>{handName}</Text>
          <Text style={styles.payoutText}>+{result.payout} T</Text>
          <Text style={styles.rakeText}>Rake: {result.rake} T</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    overflow: 'hidden',
  },
  pileLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  potRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  potLabel: { color: COLORS.textSecondary, fontSize: 12 },
  potAmount: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  burnRow: { alignItems: 'center', paddingVertical: 8 },
  burnText: { color: COLORS.burnGray, fontSize: 14, fontWeight: '700' },
  burnSub:  { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  winnerRow: { alignItems: 'center', paddingVertical: 4 },
  winnerLabel:{ color: COLORS.textSecondary, fontSize: 11, marginBottom: 2 },
  winnerName: { color: COLORS.gold, fontSize: 16, fontWeight: '800' },
  handName:   { color: COLORS.textPrimary, fontSize: 12, marginTop: 2 },
  payoutText: { color: COLORS.winGreen, fontSize: 18, fontWeight: '900', marginTop: 4 },
  rakeText:   { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
});
