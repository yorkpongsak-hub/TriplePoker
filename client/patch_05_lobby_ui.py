#!/usr/bin/env python3
"""
TriplePoker Patch 05 — Lobby UI: Tier Select + Table List (mock data) + ลิงค์จริงไป /game/{tier}
รันจาก: /mnt/c/Users/psm_y/OneDrive/เอกสาร/TriplePoker/client (WSL)
คำสั่ง: python3 patch_05_lobby_ui.py
"""
import os

CLIENT_ROOT = os.getcwd()
HOME_DIR = os.path.join(CLIENT_ROOT, "app", "(home)")

LOBBY_CONTENT = '''/**
 * lobby.tsx
 * Lobby — เลือก Tier แล้วดูลิสต์โต๊ะ (realtime สำหรับ Initiate, mock สำหรับ Tier อื่นที่ยังไม่ implement)
 * The Sage Unicorn Studio Co., Ltd.
 *
 * โครงสร้าง: Tier Select (บนสุด) -> Table List (ของ Tier ที่เลือก) ในหน้าเดียวกัน (ไม่แยก route)
 * ลิงค์จริง: Initiate -> /game/initiate (เกมจริงที่เสร็จแล้ว)
 * ลิงค์โครงสร้างไว้ (ยังไม่มีเนื้อหา): Adept/Mastermind/High Noble -> /game/{tier} (จะสร้างไล่หลัง)
 * Last Boss: ซ่อนไว้จนกว่าผู้เล่นผ่านเงื่อนไข (ดู meetsLastBossCondition)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

type Tier = 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'last_boss';

interface SeatView {
  name: string;
  type: 'human' | 'bot' | 'ai' | 'empty';
}

interface TableView {
  tableId: string;
  seats: SeatView[];      // P1-P3 (หรือ P1-P4 ตามที่จะโชว์)
  secondsLeft: number | null; // null = ไม่มี timeout (Initiate)
  joinable: boolean;
}

// ─── Config: ชื่อแสดง + token ขั้นต่ำต่อ Tier ───────────────────
const TIER_CONFIG: { key: Tier; label: string; minToken: number; implemented: boolean }[] = [
  { key: 'initiate',   label: 'Initiate',   minToken: 100,     implemented: true },
  { key: 'adept',      label: 'Adept',      minToken: 10_000,  implemented: false },
  { key: 'mastermind', label: 'Mastermind', minToken: 40_000,  implemented: false },
  { key: 'high_noble', label: 'High Noble', minToken: 100_000, implemented: false },
];

// TODO: เปลี่ยนเป็นค่า token จริงจาก user profile/store (ตอนนี้ mock ไว้ก่อน)
const MOCK_USER_TOKEN = 25_000;

// TODO: เปลี่ยนเป็นเงื่อนไขจริงของ The Last Boss (ดู CoreRules) — ตอนนี้ปิดไว้เสมอ
function meetsLastBossCondition(_token: number): boolean {
  return false;
}

// ─── Mock data generator สำหรับ Tier ที่ยังไม่ implement จริง ──
function buildMockTables(tier: Tier): TableView[] {
  const mockNames = ['ThaiDragon', 'WinWin99', 'PokerPro7', 'LuckyAce', 'KingCard'];
  const count = 2 + Math.floor(Math.random() * 2); // 2-3 โต๊ะ mock
  return Array.from({ length: count }).map((_, i) => {
    const seatCount = 1 + Math.floor(Math.random() * 2); // 1-2 คนรอ (mock)
    const seats: SeatView[] = Array.from({ length: 3 }).map((_, si) =>
      si < seatCount
        ? { name: mockNames[(i + si) % mockNames.length], type: 'human' }
        : { name: '— waiting —', type: 'empty' }
    );
    return {
      tableId: `mock_${tier}_${i + 1}`,
      seats,
      secondsLeft: 180 - i * 40,
      joinable: false, // mock เสมอ จนกว่าจะ implement จริง
    };
  });
}

export default function LobbyScreen() {
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [tables, setTables] = useState<TableView[]>([]);
  const [loading, setLoading] = useState(false);

  const visibleTiers = useMemo(() => {
    const base = TIER_CONFIG;
    if (meetsLastBossCondition(MOCK_USER_TOKEN)) {
      return [...base, { key: 'last_boss' as Tier, label: 'The Last Boss', minToken: 0, implemented: false }];
    }
    return base;
  }, []);

  useEffect(() => {
    if (!selectedTier) return;
    setLoading(true);

    if (selectedTier === 'initiate') {
      // TODO Patch ถัดไป: ต่อ socket "lobby:subscribe" จริง แทน mock นี้
      // ตอนนี้ Initiate เป็น view-only (ดูได้ ไม่กดเข้าโต๊ะคนอื่น) — กดเข้าเกมผ่านปุ่ม "เริ่มเล่น" แยกด้านล่างแทน
      setTables(buildMockTables('initiate').map(t => ({ ...t, joinable: false })));
      setLoading(false);
    } else {
      // Tier อื่นที่ยังไม่ implement จริง -> mock ทั้งหมด
      const timer = setTimeout(() => {
        setTables(buildMockTables(selectedTier));
        setLoading(false);
      }, 300); // delay สั้นๆให้ดูเหมือนกำลังโหลดจริง
      return () => clearTimeout(timer);
    }
  }, [selectedTier]);

  const handleEnterInitiate = () => {
    router.push('/game/initiate');
  };

  const handleEnterTable = (tier: Tier, table: TableView) => {
    if (!table.joinable) return;
    router.push(`/game/${tier}` as any);
  };

  return (
    <ScrollView style={s.root} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.header}>TriplePoker Lobby</Text>

      {/* ─── Tier Select ─── */}
      <View style={s.tierRow}>
        {visibleTiers.map(t => {
          const locked = MOCK_USER_TOKEN < t.minToken;
          const isSelected = selectedTier === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              disabled={locked}
              onPress={() => setSelectedTier(t.key)}
              style={[s.tierBtn, isSelected && s.tierBtnActive, locked && s.tierBtnLocked]}
            >
              <Text style={[s.tierBtnTxt, locked && s.tierBtnTxtLocked]}>
                {t.label}{locked ? ' 🔒' : ''}
              </Text>
              {!t.implemented && <Text style={s.comingSoonTag}>Coming Soon</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── Table List ─── */}
      {selectedTier && (
        <View style={s.tableListWrap}>
          <Text style={s.sectionTitle}>
            {TIER_CONFIG.find(t => t.key === selectedTier)?.label} — Open Tables
          </Text>

          {selectedTier === 'initiate' && (
            <TouchableOpacity style={s.enterBtn} onPress={handleEnterInitiate}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (สร้างโต๊ะของคุณ)</Text>
            </TouchableOpacity>
          )}

          {loading ? (
            <ActivityIndicator color="#c9a84c" style={{ marginTop: 12 }} />
          ) : (
            tables.map(table => (
              <View key={table.tableId} style={s.tableCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.tableId}>{table.tableId}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {table.seats.map((seat, i) => (
                      <View key={i} style={s.seatChip}>
                        <Text style={s.seatChipTxt}>
                          P{i + 1}: {seat.type === 'empty' ? '— ' : ''}{seat.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {table.secondsLeft !== null && (
                    <Text style={s.timeoutTxt}>⏱ {table.secondsLeft}s before timeout</Text>
                  )}
                </View>
                <TouchableOpacity
                  disabled={!table.joinable}
                  onPress={() => handleEnterTable(selectedTier, table)}
                  style={[s.joinBtn, !table.joinable && s.joinBtnDisabled]}
                >
                  <Text style={s.joinBtnTxt}>{table.joinable ? 'Join' : 'View Only'}</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a', padding: 16 },
  header: { color: '#c9a84c', fontSize: 20, fontWeight: '800', marginBottom: 16, letterSpacing: 1 },

  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tierBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(201,168,76,.4)', backgroundColor: 'rgba(201,168,76,.08)' },
  tierBtnActive: { borderColor: '#c9a84c', backgroundColor: 'rgba(201,168,76,.22)' },
  tierBtnLocked: { opacity: 0.35 },
  tierBtnTxt: { color: '#c9a84c', fontWeight: '700', fontSize: 13 },
  tierBtnTxtLocked: { color: '#888' },
  comingSoonTag: { color: '#ff9800', fontSize: 8, marginTop: 2, fontWeight: '700' },

  tableListWrap: { gap: 10 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },

  enterBtn: { backgroundColor: '#1a5e20', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(74,154,90,.5)' },
  enterBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },

  tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,.15)' },
  tableId: { color: '#888', fontSize: 10 },
  seatChip: { backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  seatChipTxt: { color: '#ccc', fontSize: 9 },
  timeoutTxt: { color: '#c9a84c', fontSize: 9, marginTop: 4 },

  joinBtn: { backgroundColor: '#2a6e3a', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  joinBtnDisabled: { backgroundColor: '#333' },
  joinBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 11 },
});
'''


def main():
    print(f"📂 Working in: {CLIENT_ROOT}")
    if not os.path.isdir(os.path.join(CLIENT_ROOT, "app")):
        print("❌ ไม่พบ app/ — กรุณารัน script นี้จาก client/ root")
        return

    os.makedirs(HOME_DIR, exist_ok=True)
    lobby_path = os.path.join(HOME_DIR, "lobby.tsx")

    if os.path.isfile(lobby_path):
        print(f"⚠️  มีไฟล์อยู่แล้ว ไม่เขียนทับ: {lobby_path}")
        print("    ถ้าต้องการเขียนทับ ให้ลบไฟล์เดิมก่อนแล้วรัน script นี้ใหม่")
        return

    with open(lobby_path, "w", encoding="utf-8") as f:
        f.write(LOBBY_CONTENT)
    print(f"✅ สร้าง Lobby UI: {lobby_path}")

    print("\n🎉 Patch 05 เสร็จสิ้น")
    print("ขั้นต่อไป:")
    print("  1. รัน Expo แล้วเข้าหน้า /(home)/lobby ดู Tier buttons + mock table list")
    print("  2. กด Initiate -> เห็นลิสต์โต๊ะ mock (view-only) + ปุ่ม 'เริ่มเล่น' ที่พาไป /game/initiate จริง")
    print("  3. กด Adept/Mastermind/High Noble -> เห็น mock table list, ปุ่ม Join disable (View Only)")
    print("  4. Last Boss ไม่โผล่ในลิสต์ Tier เลย (meetsLastBossCondition คืน false เสมอตอนนี้)")
    print("\nหมายเหตุ: MOCK_USER_TOKEN ใน lobby.tsx ตั้งไว้ 25,000 (mock) — แก้เป็นค่าจริงจาก user store ทีหลัง")

if __name__ == "__main__":
    main()
