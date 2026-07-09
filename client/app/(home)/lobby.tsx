/**
 * lobby.tsx (v5 — Patch 12: Fixed Layout + No-scroll page)
 * Layout: Header (fixed) -> Table List (scroll, ~75% สูง) -> Tier Rows+All+Footer (fixed, ~25% สูง)
 * ธีมสี: TriplePoker_WebsiteTheme_Spec_v1_0
 * The Sage Unicorn Studio Co., Ltd.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Platform, Modal } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useUserStore } from '../../src/store/userStore';
import { router } from 'expo-router';
import VIPSkinSelector from './components/VIPSkinSelector'
import { useUserSkins } from '../../src/hooks/useUserSkins'

const studioLogo = require('../../assets/images/sage_unicorn_logo_transparent.png');

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

const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean; badgeColor: string }> = {
  demo:        { label: 'Demo',          letter: 'D',  minToken: 0,       implemented: false, badgeColor: COLOR.greenHighlight },
  initiate:    { label: 'Initiate',      letter: 'C',  minToken: 100,     implemented: true,  badgeColor: COLOR.greenHighlight },
  adept:       { label: 'Adept',         letter: 'B',  minToken: 10_000,  implemented: true,  badgeColor: COLOR.goldPrimary },
  mastermind:  { label: 'Mastermind',    letter: 'A',  minToken: 40_000,  implemented: true,  badgeColor: COLOR.goldPrimary },
  high_noble:  { label: 'High Noble',    letter: 'S',  minToken: 100_000, implemented: true,  badgeColor: COLOR.red },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,       implemented: false, badgeColor: COLOR.goldDark },
};

const MOCK_USER_TOKEN = 25_000;

function meetsLastBossCondition(_token: number): boolean { return false; }
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
  const [showSkinModal, setShowSkinModal] = useState(false);

  // ── Multiplayer Matchmaking (Adept) ──────────────────────────
  const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';
  const socketRef = useRef<Socket | null>(null);
  const userId = useUserStore(s => s.userId); // ต้อง login เสมอ — Lobby อยู่ใต้ auth guard แล้ว ไม่มี guest mode
  const displayName = useUserStore(s => s.displayName) || 'Player';
  type MatchmakingStatus = 'idle' | 'queued' | 'matched';
  const [mmStatus, setMmStatus] = useState<MatchmakingStatus>('idle');
  const [mmSeats, setMmSeats] = useState<Array<{ type: string; name: string }>>([]);
  const [mmTimeoutAt, setMmTimeoutAt] = useState<number | null>(null);
  const [mmSecondsLeft, setMmSecondsLeft] = useState(0);

  useEffect(() => {
    if (mmStatus !== 'queued' || !mmTimeoutAt) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((mmTimeoutAt - Date.now()) / 1000));
      setMmSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mmStatus, mmTimeoutAt]);
  const { unlocked, active, loading: skinsLoading } = useUserSkins();

  const lastBossVisible = useMemo(() => meetsLastBossCondition(MOCK_USER_TOKEN), []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);

    if (selected === 'all') {
      const timer = setTimeout(() => {
        const allTiers: Tier[] = ['initiate', 'adept', 'mastermind', 'high_noble', 'demo'];
        setTables(allTiers.flatMap(t => buildMockTables(t, isEligible(t, MOCK_USER_TOKEN))));
        setLoading(false);
      }, 250);
      return () => clearTimeout(timer);
    }

    if (selected === 'initiate') {
      setTables(buildMockTables('initiate', true).map(t => ({ ...t, joinable: false })));
      setLoading(false);
    } else if (selected === 'adept') {
      // Patch Multiplayer: Adept ไม่มี mock — real matchmaking ใช้ปุ่ม Auto-Match แทน
      setTables([]);
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
  const handleEnterMastermind = () => router.push('/game/mastermind');
  const handleEnterHighNoble = () => router.push('/game/highNoble');

  const handleAutoMatchAdept = () => {
    setMmStatus('queued');
    setMmSeats([]);
    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('room_auto_match', { tier: 'adept', userId, userName: displayName });
    });

    socket.on('room_matched', (data: { room: any; seatIndex: number }) => {
      setMmSeats(data.room.seats);
      setMmTimeoutAt(data.room.timeoutAt);
    });

    socket.on('room_status', (data: { room: any }) => {
      if (data.room) setMmSeats(data.room.seats);
    });

    socket.on('room_ready', (data: { roomId: string; seats: any[] }) => {
      setMmStatus('matched');
      socket.disconnect();
      router.push(`/game/adept?roomId=${data.roomId}&userId=${userId}` as any);
    });

    socket.on('room_error', (data: { message: string }) => {
      setMmStatus('idle');
      socket.disconnect();
    });
  };

  const handleCancelMatchmaking = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setMmStatus('idle');
    setMmSeats([]);
    setMmTimeoutAt(null);
  };

  useEffect(() => {
    return () => { socketRef.current?.disconnect(); };
  }, []);
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
    <View style={s.root}>

      {/* ─── Header (fixed) ─── */}
      <View style={s.headerRow}>
        <Text style={s.header}>TriplePoker Lobby</Text>
        <TouchableOpacity onPress={() => router.push('/(home)/profile')} style={s.profileBtn}>
          <Text style={s.profileBtnTxt}>👤 Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Table List — Scroll Zone (~75% สูง) ─── */}
      <View style={s.scrollZone}>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={s.sectionTitle}>{sectionTitle}</Text>

          {selected === 'initiate' && (
            <TouchableOpacity style={s.enterBtn} onPress={handleEnterInitiate}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (สร้างโต๊ะของคุณ)</Text>
            </TouchableOpacity>
          )}

          {selected === 'mastermind' && (
            <TouchableOpacity style={s.enterBtn} onPress={handleEnterMastermind}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (1 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'high_noble' && (
            <TouchableOpacity style={s.enterBtn} onPress={handleEnterHighNoble}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (1 Human + จตุรเทพ AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'adept' && mmStatus === 'idle' && (
            <TouchableOpacity style={s.enterBtn} onPress={handleAutoMatchAdept}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (Auto-Match 3 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'adept' && mmStatus === 'queued' && (
            <View style={{
              backgroundColor: COLOR.bgSecondary, borderRadius: 12, borderWidth: 1.5,
              borderColor: COLOR.goldPrimary, padding: 16, alignItems: 'center', marginBottom: 12,
            }}>
              <Text style={{ color: COLOR.goldPrimary, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                🔍 กำลังหาผู้เล่น...
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {[0, 1, 2, 3].map(i => {
                  const seat = mmSeats[i];
                  const filled = seat && seat.type !== 'empty';
                  const isAI = seat?.type === 'ai';
                  return (
                    <View key={i} style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: filled ? (isAI ? 'rgba(255,215,106,0.2)' : 'rgba(141,255,181,0.2)') : 'rgba(255,255,255,0.05)',
                      borderWidth: 1.5, borderColor: filled ? (isAI ? COLOR.goldPrimary : COLOR.greenHighlight) : COLOR.borderPrimary,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 16 }}>{filled ? (isAI ? '🤖' : '👤') : '⬜'}</Text>
                    </View>
                  );
                })}
              </View>
              {mmSecondsLeft > 0 && (
                <Text style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 10 }}>
                  AI จะเข้ามาแทนที่ในอีก {mmSecondsLeft} วินาที ถ้าหา Human ไม่ครบ
                </Text>
              )}
              <TouchableOpacity onPress={handleCancelMatchmaking}
                style={{ borderWidth: 1, borderColor: COLOR.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
                <Text style={{ color: COLOR.red, fontSize: 12, fontWeight: '700' }}>ยกเลิก</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && <ActivityIndicator color={COLOR.goldPrimary} style={{ marginVertical: 12 }} />}

          {!loading && selected === 'adept' && tables.length === 0 && (
            <View style={{ paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
              <Text style={{ color: COLOR.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                ยังไม่มีห้องที่เปิดอยู่{'\n'}กด "เริ่มเล่น" เพื่อสร้างห้องใหม่
              </Text>
            </View>
          )}
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
                style={[s.joinIconBtn, { backgroundColor: table.joinable ? 'rgba(141,255,181,0.15)' : 'rgba(255,107,107,0.15)', borderColor: table.joinable ? COLOR.greenHighlight : COLOR.red }]}
              >
                <Text style={[s.joinIconTxt, { color: table.joinable ? COLOR.greenHighlight : COLOR.red }]}>
                  {table.joinable ? '✓' : '✗'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {!loading && !selected && (
            <Text style={{ color: COLOR.textTertiary, fontSize: 12 }}>— ยังไม่ได้เลือก Tier —</Text>
          )}
        </ScrollView>
      </View>

      {/* ─── Fixed Bottom Block (~25% สูง): All button + Tier Rows + Footer ─── */}
      <View style={s.fixedBottomBlock}>
        <TouchableOpacity
          onPress={() => setSelected('all')}
          style={[s.allBtn, selected === 'all' && s.allBtnActive]}
        >
          <Text style={s.allBtnTxt}>🌐 All Tables (ทุก Tier)</Text>
        </TouchableOpacity>

        
        {/* VIP Only: Select Skin Button */}
        <TouchableOpacity
          onPress={() => setShowSkinModal(true)}
          style={s.skinSelectorBtn}
        >
          <Text style={s.skinSelectorBtnTxt}>🎨 Select Skin (VIP)</Text>
        </TouchableOpacity>

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

        <View style={s.footer}>
          <Image source={studioLogo} style={s.footerLogo} resizeMode="contain" />
          <Text style={s.footerText}>TriplePoker</Text>
          <Text style={s.footerSub}>The Sage Unicorn Studio Co., Ltd.</Text>
        </View>
      </View>
    
      
            {/* VIP Skin Selector */}
      <VIPSkinSelector
        visible={showSkinModal}
        onClose={() => setShowSkinModal(false)}
        unlockedSkins={unlocked}
        activeSkin={active}
      />

      </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLOR.bgPrimary,
    paddingHorizontal: 16,
    paddingTop: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  header: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel' },
  profileBtn: { borderWidth: 1, borderColor: COLOR.goldPrimary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  profileBtnTxt: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '700' },

  // Scroll Zone กิน flex:3 ของพื้นที่ที่เหลือ (~75%), Fixed Bottom Block กิน flex:1 (~25%)
  scrollZone: { flex: 1, minHeight: 0, overflow: 'hidden' },
  sectionTitle: { color: COLOR.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6 },

  enterBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  enterBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },

  tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLOR.bgSecondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLOR.borderPrimary, marginBottom: 10 },
  tableId: { color: COLOR.textTertiary, fontSize: 10, fontFamily: 'JetBrains Mono' },
  tierTagSmall: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tierTagSmallTxt: { fontSize: 8, fontWeight: '700' },
  seatChip: { backgroundColor: COLOR.bgTertiary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  seatChipTxt: { color: COLOR.textSecondary, fontSize: 9 },
  timeoutTxt: { color: COLOR.goldPrimary, fontSize: 9, marginTop: 4, fontFamily: 'JetBrains Mono' },

  joinIconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  joinIconTxt: { fontSize: 18, fontWeight: '800' },

  fixedBottomBlock: { paddingTop: 10, flexShrink: 0 },

  allBtn: { borderRadius: 10, borderWidth: 1.5, borderColor: COLOR.greenHighlight, backgroundColor: COLOR.bgSecondary, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
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

  footer: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLOR.borderPrimary, marginTop: 10 },
  footerLogo: { width: 28, height: 28, opacity: 0.9, marginBottom: 4 },
  footerText: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel' },
  footerSub: { color: COLOR.textTertiary, fontSize: 8, marginTop: 2 },

    skinSelectorBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  skinSelectorBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLOR.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLOR.goldPrimary },
  modalCloseBtn: { fontSize: 24, color: COLOR.red },
  modalInfo: { color: COLOR.textSecondary, fontSize: 13, marginBottom: 20, lineHeight: 20 },
  modalCloseButton: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalCloseButtonTxt: { color: COLOR.bgPrimary, fontSize: 14, fontWeight: '700' },

});
