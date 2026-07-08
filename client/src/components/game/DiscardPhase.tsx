// ─────────────────────────────────────────────────────────────────────────────
// DiscardPhase.tsx — Drag-to-Discard + Best 3 Highlight (Pro+)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useTimer } from '../../hooks/useTimer';
import { emitDiscard } from '../../services/socketService';
import { COLORS, VALUE_LABELS, SUIT_SYMBOLS, SUIT_COLORS } from '../../constants/gameConstants';
import type { Card } from '../../types/game.types';

interface DiscardPhaseProps {
  pile3Cards: Card[];       // ไพ่ 5 ใบ
  community3: Card[];       // Community Pile 3 (3 ใบ)
  bestThreeSuggestion?: Card[]; // System แนะนำ
  timerSec: number;
}

export default function DiscardPhase({
  pile3Cards, community3, bestThreeSuggestion, timerSec,
}: DiscardPhaseProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set()); // kept card ids
  const [submitted, setSubmitted] = useState(false);

  const { remaining, progress, barColor } = useTimer({
    totalSec: timerSec,
    onExpire: () => {
      // หมดเวลา → ใช้ Best 3 ที่ system แนะนำ
      const kept = bestThreeSuggestion ?? pile3Cards.slice(0, 3);
      handleSubmit(kept);
    },
  });

  // ── Toggle card selection ─────────────────────────────────────────────────

  const toggleCard = (card: Card) => {
    if (submitted) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else {
        if (next.size >= 3) return prev; // เลือกได้สูงสุด 3 ใบ
        next.add(card.id);
      }
      return next;
    });
  };

  // ── Use suggestion ────────────────────────────────────────────────────────

  const useSuggestion = () => {
    if (!bestThreeSuggestion) return;
    setSelected(new Set(bestThreeSuggestion.map(c => c.id)));
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = (keptCards?: Card[]) => {
    if (submitted) return;
    const kept = keptCards ?? pile3Cards.filter(c => selected.has(c.id));
    if (kept.length !== 3) return;
    const discarded = pile3Cards.filter(c => !kept.find(k => k.id === c.id));
    setSubmitted(true);
    emitDiscard({ keptCards: kept, discardedCards: discarded });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discard Phase</Text>
      <Text style={styles.subtitle}>Keep 3 cards for Pile 3</Text>

      {/* Timer */}
      <View style={styles.timerTrack}>
        <View style={[styles.timerBar, { width: `${progress * 100}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.timerText}>{remaining}s</Text>

      {/* Community Cards (reference) */}
      <Text style={styles.sectionLabel}>Community Pile 3</Text>
      <View style={styles.cardRow}>
        {community3.map(c => (
          <CardChip key={c.id} card={c} selected={false} disabled />
        ))}
      </View>

      {/* Pile 3 Cards */}
      <Text style={styles.sectionLabel}>Your Pile 3 — select 3 to keep</Text>
      <View style={styles.cardRow}>
        {pile3Cards.map(c => (
          <CardChip
            key={c.id}
            card={c}
            selected={selected.has(c.id)}
            onPress={() => toggleCard(c)}
            isSuggested={bestThreeSuggestion?.some(s => s.id === c.id)}
          />
        ))}
      </View>

      {/* Best 3 suggestion */}
      {bestThreeSuggestion && (
        <TouchableOpacity style={styles.suggestionBtn} onPress={useSuggestion}>
          <Text style={styles.suggestionText}>✨ Use Best 3 Suggestion</Text>
        </TouchableOpacity>
      )}

      {/* Confirm */}
      <TouchableOpacity
        style={[styles.confirmBtn, (selected.size !== 3 || submitted) && styles.confirmBtnDisabled]}
        onPress={() => handleSubmit()}
        disabled={selected.size !== 3 || submitted}
      >
        <Text style={styles.confirmBtnText}>
          {submitted ? 'Submitted' : `Confirm (${selected.size}/3)`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── CardChip ─────────────────────────────────────────────────────────────────

function CardChip({
  card, selected, onPress, disabled, isSuggested,
}: {
  card: Card;
  selected: boolean;
  onPress?: () => void;
  disabled?: boolean;
  isSuggested?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        chipStyles.chip,
        selected && chipStyles.chipSelected,
        isSuggested && !selected && chipStyles.chipSuggested,
        disabled && chipStyles.chipDisabled,
      ]}
    >
      <Text style={[chipStyles.value, { color: SUIT_COLORS[card.suit] ?? '#fff' }]}>
        {VALUE_LABELS[card.value]}
      </Text>
      <Text style={chipStyles.suit}>{SUIT_SYMBOLS[card.suit]}</Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    width: 48, height: 68, borderRadius: 8, backgroundColor: '#1E293B',
    borderWidth: 1.5, borderColor: '#334155',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 4,
  },
  chipSelected:  { borderColor: COLORS.gold, backgroundColor: 'rgba(245,158,11,0.2)' },
  chipSuggested: { borderColor: COLORS.winGreen, borderStyle: 'dashed' },
  chipDisabled:  { opacity: 0.6 },
  value: { fontSize: 14, fontWeight: '800' },
  suit:  { fontSize: 12, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard, borderRadius: 16,
    padding: 16, alignItems: 'center',
  },
  title:    { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10 },
  timerTrack: {
    width: '100%', height: 6, backgroundColor: '#334155',
    borderRadius: 3, overflow: 'hidden', marginBottom: 4,
  },
  timerBar:    { height: '100%', borderRadius: 3 },
  timerText:   { color: COLORS.textSecondary, fontSize: 11, marginBottom: 12 },
  sectionLabel:{ color: COLORS.textSecondary, fontSize: 11, alignSelf: 'flex-start', marginBottom: 6, fontWeight: '600' },
  cardRow:     { flexDirection: 'row', marginBottom: 12 },
  suggestionBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.winGreen, marginBottom: 12,
  },
  suggestionText: { color: COLORS.winGreen, fontSize: 13, fontWeight: '600' },
  confirmBtn: {
    width: '100%', paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#475569' },
  confirmBtnText:     { color: '#0F172A', fontSize: 15, fontWeight: '800' },
});
