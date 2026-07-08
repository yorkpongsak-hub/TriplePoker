// ─────────────────────────────────────────────────────────────────────────────
// AuctionOverlay.tsx — Blind Auction UI (Pro+ เท่านั้น)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • Overlay มืดลง + ไพ่ 2 ใบ Blind แสดงตรงกลาง
//   • Dropdown 6 ระดับราคา + countdown bar สีแดง
//   • S3 Clan: Team Signal Window 5 วินาทีก่อน Bid
//   • ส่ง Bid ผ่าน socket เมื่อกดยืนยัน

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal,
  StyleSheet, ScrollView,
} from 'react-native';
import { useTimer } from '../../hooks/useTimer';
import { emitBid, emitTeamSignal } from '../../services/socketService';
import { COLORS, getBidLevels, ANIMATION } from '../../constants/gameConstants';
import type { Tier } from '../../types/game.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuctionOverlayProps {
  visible: boolean;
  tier: Tier;
  season: 'S1' | 'S2' | 'S3';
  phase: 'team_signal' | 'bidding';
  deadlineSec: number;
  onClose?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuctionOverlay({
  visible, tier, season, phase, deadlineSec, onClose,
}: AuctionOverlayProps) {
  const [selectedBid, setSelectedBid] = useState<number | null>(null);
  const [teamSignal, setTeamSignal] = useState<'want' | 'pass' | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const bidLevels = getBidLevels(tier);

  const { remaining, progress, barColor } = useTimer({
    totalSec: deadlineSec,
    onExpire: () => {
      // หมดเวลา → ส่ง bid 0 (ไม่ประมูล)
      if (!submitted) handleSubmitBid(0);
    },
  });

  // ── Team Signal (S3 Clan) ────────────────────────────────────────────────

  const handleTeamSignal = (signal: 'want' | 'pass') => {
    setTeamSignal(signal);
    emitTeamSignal(signal);
  };

  // ── Submit Bid ─────────────────────────────────────────────────────────────

  const handleSubmitBid = (amount: number) => {
    if (submitted) return;
    setSubmitted(true);
    emitBid(amount);
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>

          {/* Header */}
          <Text style={styles.title}>Blind Auction</Text>
          <Text style={styles.subtitle}>
            {phase === 'team_signal'
              ? 'Signal your team before bidding'
              : 'Place your blind bid'}
          </Text>

          {/* Countdown bar */}
          <View style={styles.timerTrack}>
            <View style={[styles.timerBar, { width: `${progress * 100}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={styles.timerText}>{remaining}s</Text>

          {/* Blind Cards (คว่ำ) */}
          <View style={styles.blindCards}>
            {[0, 1].map(i => (
              <View key={i} style={styles.blindCard}>
                <Text style={styles.blindCardText}>?</Text>
              </View>
            ))}
          </View>

          {/* Team Signal (S3 เท่านั้น) */}
          {season === 'S3' && phase === 'team_signal' && (
            <View style={styles.signalRow}>
              <Text style={styles.signalLabel}>Team Signal</Text>
              <View style={styles.signalBtns}>
                <TouchableOpacity
                  style={[styles.signalBtn, teamSignal === 'want' && styles.signalBtnActive]}
                  onPress={() => handleTeamSignal('want')}
                >
                  <Text style={styles.signalBtnText}>I Want It</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.signalBtn, teamSignal === 'pass' && styles.signalBtnActive]}
                  onPress={() => handleTeamSignal('pass')}
                >
                  <Text style={styles.signalBtnText}>Pass</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bid Levels */}
          {phase === 'bidding' && (
            <>
              <Text style={styles.bidLabel}>Select Bid Amount</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bidScroll}>
                {bidLevels.map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.bidChip, selectedBid === level && styles.bidChipSelected]}
                    onPress={() => setSelectedBid(level)}
                  >
                    <Text style={[styles.bidChipText, selectedBid === level && styles.bidChipTextSelected]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Confirm + Pass */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.passBtn}
                  onPress={() => handleSubmitBid(0)}
                >
                  <Text style={styles.passBtnText}>Pass</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, !selectedBid && styles.confirmBtnDisabled]}
                  onPress={() => selectedBid && handleSubmitBid(selectedBid)}
                  disabled={!selectedBid || submitted}
                >
                  <Text style={styles.confirmBtnText}>
                    {submitted ? 'Submitted' : `Bid ${selectedBid ?? '—'} T`}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.burnNote}>
                ⚡ Winner's bid is burned. Losers keep their tokens.
              </Text>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 20,
    width: '88%',
    alignItems: 'center',
  },
  title:    { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 12 },
  timerTrack: {
    width: '100%', height: 6, backgroundColor: '#334155',
    borderRadius: 3, overflow: 'hidden', marginBottom: 4,
  },
  timerBar:   { height: '100%', borderRadius: 3 },
  timerText:  { color: COLORS.textSecondary, fontSize: 12, marginBottom: 16 },
  blindCards: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  blindCard: {
    width: 56, height: 80, backgroundColor: '#EC4899',
    borderRadius: 8, justifyContent: 'center', alignItems: 'center',
  },
  blindCardText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  signalRow:  { width: '100%', marginBottom: 16 },
  signalLabel:{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 8, textAlign: 'center' },
  signalBtns: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  signalBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#475569',
  },
  signalBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(245,158,11,0.15)' },
  signalBtnText:   { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  bidLabel:  { color: COLORS.textSecondary, fontSize: 13, marginBottom: 8, alignSelf: 'flex-start' },
  bidScroll: { width: '100%', marginBottom: 16 },
  bidChip: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#475569',
    marginRight: 8, backgroundColor: '#1E293B',
  },
  bidChipSelected:     { borderColor: COLORS.gold, backgroundColor: 'rgba(245,158,11,0.2)' },
  bidChipText:         { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  bidChipTextSelected: { color: COLORS.gold },
  actionRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 12 },
  passBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#475569', alignItems: 'center',
  },
  passBtnText:    { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  confirmBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#475569' },
  confirmBtnText:     { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  burnNote: { color: COLORS.textSecondary, fontSize: 11, textAlign: 'center' },
});
