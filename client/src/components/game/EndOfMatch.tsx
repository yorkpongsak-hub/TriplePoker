// ─────────────────────────────────────────────────────────────────────────────
// EndOfMatch.tsx — Match Result + Rematch / Lobby Decision
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { useTimer } from '../../hooks/useTimer';
import { emitEndDecision } from '../../services/socketService';
import { COLORS } from '../../constants/gameConstants';
import type { MatchSummary, PlayerMatchSummary } from '../../types/game.types';

interface EndOfMatchProps {
  summary: MatchSummary;
  myPlayerId: string;
  decisionTimerSec: number;
}

export default function EndOfMatch({
  summary, myPlayerId, decisionTimerSec,
}: EndOfMatchProps) {
  const [decision, setDecision] = useState<'rematch' | 'lobby' | null>(null);

  const { remaining, progress, barColor } = useTimer({
    totalSec: decisionTimerSec,
    onExpire: () => {
      if (!decision) handleDecision('lobby');
    },
  });

  const mySummary = summary.playerSummaries.find(p => p.playerId === myPlayerId);
  const iWon = summary.winnerId === myPlayerId;

  const handleDecision = (d: 'rematch' | 'lobby') => {
    if (decision) return;
    setDecision(d);
    emitEndDecision(d);
  };

  return (
    <View style={styles.container}>
      {/* Win / Lose Header */}
      <Text style={[styles.resultTitle, iWon ? styles.winText : styles.loseText]}>
        {iWon ? '🏆 Victory!' : summary.winnerId ? 'Defeat' : 'Match Over'}
      </Text>

      {/* My Token Delta */}
      {mySummary && (
        <View style={styles.myDeltaRow}>
          <Text style={styles.myDeltaLabel}>Your Result</Text>
          <Text style={[
            styles.myDeltaAmount,
            mySummary.tokenDelta >= 0 ? styles.positive : styles.negative,
          ]}>
            {mySummary.tokenDelta >= 0 ? '+' : ''}{mySummary.tokenDelta} T
          </Text>
          <Text style={styles.myBalance}>Balance: {mySummary.newBalance} T</Text>
        </View>
      )}

      {/* All Players Summary */}
      <ScrollView style={styles.summaryList} showsVerticalScrollIndicator={false}>
        {summary.playerSummaries.map(ps => (
          <PlayerRow
            key={ps.playerId}
            summary={ps}
            isMe={ps.playerId === myPlayerId}
            isWinner={ps.playerId === summary.winnerId}
          />
        ))}
      </ScrollView>

      {/* Debt Indicator */}
      {mySummary?.hasDebt && mySummary.debtAction !== 'auto_forgive' && (
        <View style={styles.debtBanner}>
          <Text style={styles.debtText}>
            ⚠️ Debt: {mySummary.debtAmount} T — Check notification for options
          </Text>
        </View>
      )}

      {/* Decision Timer */}
      <View style={styles.timerTrack}>
        <View style={[styles.timerBar, { width: `${progress * 100}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.timerText}>{remaining}s to decide</Text>

      {/* Decision Buttons */}
      {!decision ? (
        <View style={styles.decisionRow}>
          <TouchableOpacity
            style={styles.lobbyBtn}
            onPress={() => handleDecision('lobby')}
          >
            <Text style={styles.lobbyBtnText}>Lobby</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rematchBtn}
            onPress={() => handleDecision('rematch')}
          >
            <Text style={styles.rematchBtnText}>Rematch</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.waitDecision}>
          <Text style={styles.waitDecisionText}>
            {decision === 'rematch' ? '⚡ Waiting for others...' : '👋 Returning to Lobby...'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

function PlayerRow({
  summary, isMe, isWinner,
}: {
  summary: PlayerMatchSummary;
  isMe: boolean;
  isWinner: boolean;
}) {
  return (
    <View style={[rowStyles.row, isMe && rowStyles.rowMe, isWinner && rowStyles.rowWinner]}>
      <View style={rowStyles.left}>
        {isWinner && <Text style={rowStyles.crownIcon}>👑 </Text>}
        <Text style={[rowStyles.name, isMe && rowStyles.nameMe]}>
          {isMe ? 'You' : summary.playerId.slice(0, 8)}
        </Text>
        {summary.hasDebt && <Text style={rowStyles.debtBadge}> 🔴</Text>}
      </View>
      <View style={rowStyles.right}>
        <Text style={[
          rowStyles.delta,
          summary.tokenDelta >= 0 ? rowStyles.positive : rowStyles.negative,
        ]}>
          {summary.tokenDelta >= 0 ? '+' : ''}{summary.tokenDelta} T
        </Text>
        <Text style={rowStyles.pile3}>{summary.pile3Wins}W Pile3</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: '#1E293B', marginBottom: 6,
  },
  rowMe:     { borderWidth: 1.5, borderColor: COLORS.gold },
  rowWinner: { backgroundColor: 'rgba(245,158,11,0.1)' },
  left:      { flexDirection: 'row', alignItems: 'center' },
  right:     { alignItems: 'flex-end' },
  crownIcon: { fontSize: 14 },
  name:      { color: COLORS.textSecondary, fontSize: 13 },
  nameMe:    { color: COLORS.textPrimary, fontWeight: '700' },
  debtBadge: { fontSize: 12 },
  delta:     { fontSize: 15, fontWeight: '800' },
  positive:  { color: COLORS.winGreen },
  negative:  { color: COLORS.loseRed },
  pile3:     { color: COLORS.textSecondary, fontSize: 10, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard, borderRadius: 16,
    padding: 16, alignItems: 'center', maxHeight: '90%',
  },
  resultTitle: { fontSize: 26, fontWeight: '900', marginBottom: 8 },
  winText:     { color: COLORS.gold },
  loseText:    { color: COLORS.textSecondary },
  myDeltaRow:  { alignItems: 'center', marginBottom: 14 },
  myDeltaLabel:{ color: COLORS.textSecondary, fontSize: 12 },
  myDeltaAmount:{ fontSize: 28, fontWeight: '900', marginTop: 2 },
  myBalance:   { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  positive:    { color: COLORS.winGreen },
  negative:    { color: COLORS.loseRed },
  summaryList: { width: '100%', maxHeight: 200, marginBottom: 12 },
  debtBanner: {
    backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, width: '100%',
  },
  debtText:  { color: COLORS.loseRed, fontSize: 12, textAlign: 'center' },
  timerTrack: {
    width: '100%', height: 4, backgroundColor: '#334155',
    borderRadius: 2, overflow: 'hidden', marginBottom: 4,
  },
  timerBar:  { height: '100%', borderRadius: 2 },
  timerText: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 12 },
  decisionRow: { flexDirection: 'row', gap: 12, width: '100%' },
  lobbyBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#475569', alignItems: 'center',
  },
  lobbyBtnText:   { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  rematchBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  rematchBtnText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  waitDecision:   { paddingVertical: 16 },
  waitDecisionText:{ color: COLORS.textSecondary, fontSize: 14 },
});
