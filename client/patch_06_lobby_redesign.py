#!/usr/bin/env python3
"""
TriplePoker Patch 06 — Redesign Lobby UI
- ลิสต์โต๊ะขึ้นบนสุด
- Tier แสดงเป็นแถว: [Last Boss เต็มแถว ซ่อนไว้] -> [High Noble + Mastermind] -> [Adept + Initiate] -> [Demo เต็มแถว]
- เพิ่มปุ่ม "All" ดูทุกโต๊ะทุก Tier, joinable ตาม Token ผู้เล่น
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 patch_06_lobby_redesign.py
"""
import os

CLIENT_ROOT = os.getcwd()
LOBBY_PATH = os.path.join(CLIENT_ROOT, "app", "(home)", "lobby.tsx")

LOBBY_CONTENT = '''/**
 * lobby.tsx (v2 — Patch 06 Redesign)
 * Layout: ลิสต์โต๊ะขึ้นบนสุด -> Tier rows ด้านล่าง (Last Boss / S+A / B+C / D) -> ปุ่ม "All"
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
  joinable: boolean; // คำนวณจาก eligibility (token) ของ user ต่อ Tier นั้น
}

// ─── Config: Tier letter ตาม CoreRules (D->C->B->A->S->S+) ─────
const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean }> = {
  demo:        { label: 'Demo',        letter: 'D',  minToken: 0,       implemented: false },
  initiate:    { label: 'Initiate',    letter: 'C',  minToken: 100,     implemented: true },
  adept:       { label: 'Adept',       letter: 'B',  minToken: 10_000,  implemented: false },
  mastermind:  { label: 'Mastermind',  letter: 'A',  minToken: 40_000,  implemented: false },
  high_noble:  { label: 'High Noble',  letter: 'S',  minToken: 100_000, implemented: false },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,     implemented: false },
};

// TODO: เปลี่ยนเป็นค่า token จริงจาก user profile/store (ตอนนี้ mock ไว้ก่อน)
const MOCK_USER_TOKEN = 25_000;

// TODO: เปลี่ยนเป็นเงื่อนไขจริงของ The Last Boss (ดู CoreRules) — ตอนนี้ปิดไว้เสมอ
function meetsLastBossCondition(_token: number): boolean {
  return false;
}

function isEligible(tier: Tier, token: number): boolean {
  if (tier === 'last_boss') return meetsLastBossCondition(token);
  return token >= TIER_CONFIG[tier].minToken;
}

// ─── Mock data generator ────────────────────────────────────────
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
      joinable: false && eligible, // mock เสมอจนกว่า tier นั้น implement จริง (เก็บ eligible ไว้ใช้ตอน implement)
    };
  });
}

// ─── Tier grid rows ตาม spec: [LastBoss] / [HighNoble, Mastermind] / [Adept, Initiate] / [Demo] ───
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
      // TODO: ต่อ socket "lobby:subscribe" จริงแทน mock นี้
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
        style={[s.tierBtn, fullWidth && s.tierBtnFull, isSelected && s.tierBtnActive, locked && s.tierBtnLocked]}
      >
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

        {loading && <ActivityIndicator color="#c9a84c" style={{ marginVertical: 12 }} />}

        {!loading && selected && tables.map(table => (
          <View key={table.tableId} style={s.tableCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.tableId}>{table.tableId}</Text>
                {selected === 'all' && (
                  <View style={s.tierTagSmall}>
                    <Text style={s.tierTagSmallTxt}>[{TIER_CONFIG[table.tier].letter}] {TIER_CONFIG[table.tier].label}</Text>
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
              <Text style={s.joinBtnTxt}>
                {table.joinable ? 'Join' : (!isEligible(table.tier, MOCK_USER_TOKEN) ? 'Locked' : 'View Only')}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {!loading && !selected && (
          <Text style={{ color: '#666', fontSize: 12 }}>— ยังไม่ได้เลือก Tier —</Text>
        )}
      </View>

      {/* ─── "All" button ─── */}
      <TouchableOpacity
        onPress={() => setSelected('all')}
        style={[s.allBtn, selected === 'all' && s.allBtnActive]}
      >
        <Text style={s.allBtnTxt}>🌐 All Tables (ทุก Tier)</Text>
      </TouchableOpacity>

      {/* ─── Tier Rows ─── */}
      <View style={s.tierRowsWrap}>
        {TIER_ROWS.map((row, ri) => {
          if (row.length === 1 && row[0] === 'last_boss' && !lastBossVisible) {
            return null; // แถว Last Boss ไม่ render เลยจนกว่าจะผ่านเงื่อนไข
          }
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
  root: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { color: '#c9a84c', fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: 1 },

  tableListWrap: { gap: 10, marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },

  enterBtn: { backgroundColor: '#1a5e20', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(74,154,90,.5)' },
  enterBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,.15)' },
  tableId: { color: '#888', fontSize: 10 },
  tierTagSmall: { backgroundColor: 'rgba(56,189,248,.12)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tierTagSmallTxt: { color: '#38bdf8', fontSize: 8, fontWeight: '700' },
  seatChip: { backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  seatChipTxt: { color: '#ccc', fontSize: 9 },
  timeoutTxt: { color: '#c9a84c', fontSize: 9, marginTop: 4 },

  joinBtn: { backgroundColor: '#2a6e3a', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  joinBtnDisabled: { backgroundColor: '#333' },
  joinBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 11 },

  allBtn: { borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(56,189,248,.4)', backgroundColor: 'rgba(56,189,248,.08)', paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  allBtnActive: { borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.2)' },
  allBtnTxt: { color: '#38bdf8', fontWeight: '700', fontSize: 13 },

  tierRowsWrap: { gap: 8 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierBtn: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(201,168,76,.4)', backgroundColor: 'rgba(201,168,76,.08)', alignItems: 'center' },
  tierBtnFull: { flex: 1 },
  tierBtnActive: { borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.22)' },
  tierBtnLocked: { opacity: 0.35 },
  tierBtnTxt: { color: '#c9a84c', fontWeight: '700', fontSize: 13 },
  tierBtnTxtLocked: { color: '#888' },
  comingSoonTag: { color: '#ff9800', fontSize: 8, marginTop: 2, fontWeight: '700' },
});
'''


def main():
    print(f"📂 Working in: {CLIENT_ROOT}")
    if not os.path.isfile(LOBBY_PATH):
        print(f"❌ ไม่พบไฟล์เดิม: {LOBBY_PATH}")
        print("   (ต้องรัน patch_05_lobby_ui.py ก่อน — script นี้คือการ redesign ไฟล์ที่มีอยู่แล้ว)")
        return

    with open(LOBBY_PATH, "w", encoding="utf-8") as f:
        f.write(LOBBY_CONTENT)
    print(f"✅ เขียนทับ Lobby UI ใหม่ทั้งไฟล์: {LOBBY_PATH}")

    print("\n🎉 Patch 06 เสร็จสิ้น")
    print("ขั้นต่อไป: รัน expo start ใหม่ แล้วเช็ค:")
    print("  1. ลิสต์โต๊ะอยู่บนสุด")
    print("  2. แถว Tier: [Last Boss ไม่โผล่] / [High Noble + Mastermind] / [Adept + Initiate] / [Demo]")
    print("  3. ปุ่ม 'All Tables' กดแล้วเห็นโต๊ะทุก Tier ปนกัน พร้อม tag Tier ติดไว้ที่การ์ดแต่ละโต๊ะ")
    print("  4. โต๊ะของ Tier ที่ Token ไม่พอ -> ปุ่ม Join เป็น 'Locked'")

if __name__ == "__main__":
    main()
