#!/usr/bin/env python3
"""
TriplePoker Patch 07 — Lobby UI ธีมสีทางการ (TriplePoker_WebsiteTheme_Spec_v1_0)
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 patch_07_lobby_official_theme.py
"""
import os

CLIENT_ROOT = os.getcwd()
LOBBY_PATH = os.path.join(CLIENT_ROOT, "app", "(home)", "lobby.tsx")

LOBBY_CONTENT = '''/**
 * lobby.tsx (v3 — Patch 07 Official Theme)
 * ธีมสี: TriplePoker_WebsiteTheme_Spec_v1_0 (Casino Felt + Luxury Gold)
 * The Sage Unicorn Studio Co., Ltd.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

type Tier = 'demo' | 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'last_boss';
type Selection = Tier | 'all';

interface SeatView { name: string; type: 'human' | 'bot' | 'ai' | 'empty'; }
interface TableView {
  tableId: string;
  tier: Tier;
  seats: SeatView[];
  secondsLeft: number | null;
  joinable: boolean;
}

// ─── Theme Colors (Website Theme Spec v1.0 — ใช้ทั้งแอป) ───────
const COLOR = {
  bgPrimary: '#0F2418',
  bgSecondary: '#163A25',
  bgTertiary: '#1C4830',
  goldPrimary: '#FFD76A',
  goldDark: '#FFC857',
  greenHighlight: '#8DFFB5',
  red: '#FF6B6B',
  textPrimary: '#F5F2E8',
  textSecondary: '#C8C4B0',
  textTertiary: '#7A7A6A',
  borderPrimary: '#2A4A34',
  borderSecondary: '#3A5A44',
};

// ─── Tier Config: badge color ตาม spec (เขียว->ทอง->แดง->ทองเข้ม) ──
const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean; badgeColor: string }> = {
  demo:        { label: 'Demo',          letter: 'D',  minToken: 0,       implemented: false, badgeColor: COLOR.greenHighlight },
  initiate:    { label: 'Initiate',      letter: 'C',  minToken: 100,     implemented: true,  badgeColor: COLOR.greenHighlight },
  adept:       { label: 'Adept',         letter: 'B',  minToken: 10_000,  implemented: false, badgeColor: COLOR.goldPrimary },
  mastermind:  { label: 'Mastermind',    letter: 'A',  minToken: 40_000,  implemented: false, badgeColor: COLOR.goldPrimary },
  high_noble:  { label: 'High Noble',    letter: 'S',  minToken: 100_000, implemented: false, badgeColor: COLOR.red },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,       implemented: false, badgeColor: COLOR.goldDark },
};

const MOCK_USER_TOKEN = 25_000; // TODO: ผูกกับ user store จริง

function meetsLastBossCondition(_token: number): boolean {
  return false; // TODO: เงื่อนไขจริงจาก CoreRules
}

function isEligible(tier: Tier, token: number): boolean {
  if (tier === 'last_boss') return meetsLastBossCondition(token);
  return token >= TIER_CONFIG[tier].minToken;
}

function buildMockTables(tier: Tier, eligible: boolean): TableView[] {
  const mockNames = ['ThaiDragon', 'WinWin99', 'PokerPro7', 'LuckyAce', 'KingCard'];
  const count = 2 + Math.floor(Math.random() * 2);
  return Array.from({ length: count }).map((_, i) => {
    const seatCount = 1 + Math.floor(Math.random() * 2);
    const seats: SeatView[] = Array.from({ length: 3 }).map((_, si) =>
      si < seatCount
        ? { name: mockNames[(i + si) % mockNames.length], type: 'human' }
        : { name: '— waiting —', type: 'empty' }
    );
    return {
      tableId: `mock_${tier}_${i + 1}`,
      tier,
      seats,
      secondsLeft: 180 - i * 40,
      joinable: false && eligible,
    };
  });
}

const TIER_ROWS: Tier[][] = [
  ['last_boss'],
  ['high_noble', 'mastermind'],
  ['adept', 'initiate'],
  ['demo'],
];

export default function LobbyScreen() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const [tables, setTables] = useState<TableView[]>([]);
  const [loading, setLoading] = useState(false);

  const lastBossVisible = useMemo(() => meetsLastBossCondition(MOCK_USER_TOKEN), []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);

    if (selected === 'all') {
      const timer = setTimeout(() => {
        const allTiers: Tier[] = ['initiate', 'adept', 'mastermind', 'high_noble', 'demo'];
        const merged = allTiers.flatMap(t => buildMockTables(t, isEligible(t, MOCK_USER_TOKEN)));
        setTables(merged);
        setLoading(false);
      }, 250);
      return () => clearTimeout(timer);
    }

    if (selected === 'initiate') {
      setTables(buildMockTables('initiate', true).map(t => ({ ...t, joinable: false })));
      setLoading(false);
    } else {
      const timer = setTimeout(() => {
        setTables(buildMockTables(selected, isEligible(selected, MOCK_USER_TOKEN)));
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selected]);

  const handleEnterInitiate = () => router.push('/game/initiate');

  const handleEnterTable = (table: TableView) => {
    if (!table.joinable) return;
    router.push(`/game/${table.tier}` as any);
  };

  const renderTierButton = (tier: Tier, fullWidth: boolean) => {
    const cfg = TIER_CONFIG[tier];
    const locked = !isEligible(tier, MOCK_USER_TOKEN);
    const isSelected = selected === tier;
    return (
      <TouchableOpacity
        key={tier}
        disabled={locked}
        onPress={() => setSelected(tier)}
        style={[
          s.tierBtn,
          fullWidth && s.tierBtnFull,
          { borderColor: isSelected ? cfg.badgeColor : COLOR.borderPrimary },
          isSelected && { backgroundColor: COLOR.bgTertiary },
          locked && s.tierBtnLocked,
        ]}
      >
        <View style={[s.badgeDot, { backgroundColor: cfg.badgeColor }]} />
        <Text style={[s.tierBtnTxt, locked && s.tierBtnTxtLocked]}>
          [{cfg.letter}] {cfg.label}{locked ? ' 🔒' : ''}
        </Text>
        {!cfg.implemented && <Text style={s.comingSoonTag}>Coming Soon</Text>}
      </TouchableOpacity>
    );
  };

  const sectionTitle =
    selected === 'all' ? 'All Tiers — Open Tables'
    : selected ? `${TIER_CONFIG[selected].label} — Open Tables`
    : 'เลือก Tier ด้านล่างเพื่อดูโต๊ะ';

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.header}>TriplePoker Lobby</Text>

      {/* ─── Table List (บนสุด) ─── */}
      <View style={s.tableListWrap}>
        <Text style={s.sectionTitle}>{sectionTitle}</Text>

        {selected === 'initiate' && (
          <TouchableOpacity style={s.enterBtn} onPress={handleEnterInitiate}>
            <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (สร้างโต๊ะของคุณ)</Text>
          </TouchableOpacity>
        )}

        {loading && <ActivityIndicator color={COLOR.goldPrimary} style={{ marginVertical: 12 }} />}

        {!loading && selected && tables.map(table => (
          <View key={table.tableId} style={s.tableCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.tableId}>{table.tableId}</Text>
                {selected === 'all' && (
                  <View style={[s.tierTagSmall, { borderColor: TIER_CONFIG[table.tier].badgeColor }]}>
                    <Text style={[s.tierTagSmallTxt, { color: TIER_CONFIG[table.tier].badgeColor }]}>
                      [{TIER_CONFIG[table.tier].letter}] {TIER_CONFIG[table.tier].label}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                {table.seats.map((seat, i) => (
                  <View key={i} style={s.seatChip}>
                    <Text style={s.seatChipTxt}>P{i + 1}: {seat.type === 'empty' ? '— ' : ''}{seat.name}</Text>
                  </View>
                ))}
              </View>
              {table.secondsLeft !== null && (
                <Text style={s.timeoutTxt}>⏱ {table.secondsLeft}s before timeout</Text>
              )}
            </View>
            <TouchableOpacity
              disabled={!table.joinable}
              onPress={() => handleEnterTable(table)}
              style={[s.joinBtn, !table.joinable && s.joinBtnDisabled]}
            >
              <Text style={[s.joinBtnTxt, !table.joinable && s.joinBtnTxtDisabled]}>
                {table.joinable ? 'Join' : (!isEligible(table.tier, MOCK_USER_TOKEN) ? 'Locked' : 'View Only')}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {!loading && !selected && (
          <Text style={{ color: COLOR.textTertiary, fontSize: 12 }}>— ยังไม่ได้เลือก Tier —</Text>
        )}
      </View>

      {/* ─── "All" button — Green Highlight ตาม spec (feature tag color) ─── */}
      <TouchableOpacity
        onPress={() => setSelected('all')}
        style={[s.allBtn, selected === 'all' && s.allBtnActive]}
      >
        <Text style={s.allBtnTxt}>🌐 All Tables (ทุก Tier)</Text>
      </TouchableOpacity>

      {/* ─── Tier Rows ─── */}
      <View style={s.tierRowsWrap}>
        {TIER_ROWS.map((row, ri) => {
          if (row.length === 1 && row[0] === 'last_boss' && !lastBossVisible) return null;
          const fullWidth = row.length === 1;
          return (
            <View key={ri} style={s.tierRow}>
              {row.map(tier => renderTierButton(tier, fullWidth))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bgPrimary, padding: 16 },
  header: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: 1, fontFamily: 'Cinzel' },

  tableListWrap: { gap: 10, marginBottom: 20 },
  sectionTitle: { color: COLOR.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6 },

  enterBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  enterBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },

  tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.bgSecondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLOR.borderPrimary },
  tableId: { color: COLOR.textTertiary, fontSize: 10, fontFamily: 'JetBrains Mono' },
  tierTagSmall: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tierTagSmallTxt: { fontSize: 8, fontWeight: '700' },
  seatChip: { backgroundColor: COLOR.bgTertiary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  seatChipTxt: { color: COLOR.textSecondary, fontSize: 9 },
  timeoutTxt: { color: COLOR.goldPrimary, fontSize: 9, marginTop: 4, fontFamily: 'JetBrains Mono' },

  joinBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  joinBtnDisabled: { backgroundColor: COLOR.bgTertiary, borderWidth: 1, borderColor: COLOR.borderSecondary },
  joinBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 11 },
  joinBtnTxtDisabled: { color: COLOR.textTertiary },

  allBtn: { borderRadius: 10, borderWidth: 1.5, borderColor: COLOR.greenHighlight, backgroundColor: COLOR.bgSecondary, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  allBtnActive: { backgroundColor: COLOR.bgTertiary },
  allBtnTxt: { color: COLOR.greenHighlight, fontWeight: '700', fontSize: 13 },

  tierRowsWrap: { gap: 8 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierBtn: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, backgroundColor: COLOR.bgSecondary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tierBtnFull: { flex: 1 },
  tierBtnLocked: { opacity: 0.35 },
  tierBtnTxt: { color: COLOR.textPrimary, fontWeight: '700', fontSize: 13 },
  tierBtnTxtLocked: { color: COLOR.textTertiary },
  comingSoonTag: { color: COLOR.goldDark, fontSize: 8, marginTop: 2, fontWeight: '700', position: 'absolute', bottom: 2, right: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
});
'''


def main():
    print(f"📂 Working in: {CLIENT_ROOT}")
    if not os.path.isfile(LOBBY_PATH):
        print(f"❌ ไม่พบไฟล์เดิม: {LOBBY_PATH}")
        return

    with open(LOBBY_PATH, "w", encoding="utf-8") as f:
        f.write(LOBBY_CONTENT)
    print(f"✅ เขียนทับ Lobby UI ด้วยธีมสีทางการ: {LOBBY_PATH}")
    print("\n🎉 Patch 07 เสร็จสิ้น — รีเฟรช browser (Ctrl+Shift+R) ดูธีมใหม่")
    print("   หมายเหตุ: ฟอนต์ Cinzel/JetBrains Mono อ้างชื่อไว้ใน style แล้ว แต่ต้อง load font จริงทีหลัง (ยังไม่ได้ตั้งค่า expo-font)")

if __name__ == "__main__":
    main()
