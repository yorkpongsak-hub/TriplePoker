/**
 * lobby.tsx (v5 — Patch 12: Fixed Layout + No-scroll page)
 * Layout: Header (fixed) -> Table List (scroll, ~75% สูง) -> Tier Rows+All+Footer (fixed, ~25% สูง)
 * ธีมสี: TriplePoker_WebsiteTheme_Spec_v1_0
 * The Sage Unicorn Studio Co., Ltd.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Platform, Modal } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useUserStore } from '../../src/store/userStore';
import { router } from 'expo-router';
import { useBgm, fadeOutBgm } from '../../src/services/bgmService'
import { useAuthStore } from '../../src/store/authStore'
import { MenuButton } from '../../src/components/ui/MenuButton'
import { ThemedBackground } from '../../src/components/ui/ThemedBackground'
import { glassPanel, glassPanelDense, textOnGlass } from '../../src/ui/glassStyles'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BUY_IN, BuyInTier, AD_RESCUE_AMOUNT } from '../../src/config/buyInConfig'
import { Tier, TIER_CONFIG, isEligible, meetsLastBossCondition } from '../../src/config/tierConfig'

const studioLogo = require('../../assets/images/sage_unicorn_logo_transparent.png');

type Selection = Tier | 'all';

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

// TIER_CONFIG/isEligible ย้ายไปไว้ที่ src/config/tierConfig.ts แล้ว (single source of truth ฝั่ง client)

// TriplePoker_BuyIn_Spec_v1_0 §2 — เทียบ Tier type ของ Lobby (snake_case) กับ key ของ BUY_IN (camelCase ตรงกับ server)
const TIER_TO_BUYIN_KEY: Partial<Record<Tier, BuyInTier>> = {
  initiate: 'initiate', adept: 'adept', mastermind: 'mastermind', high_noble: 'highNoble', last_boss: 'lastBoss',
};

const TIER_ROWS: Tier[][] = [
  ['last_boss'],
  ['high_noble', 'mastermind'],
  ['adept', 'initiate'],
  ['demo'],
];

// LobbyMatchmaking_Spec_v1_1 — M:SS format สำหรับ countdown ของ waiting_2nd stage (2 นาที)
const formatMMSS = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export default function LobbyScreen() {
  useBgm(); // LobbyMatchmaking_Spec_v1_0 §2 — BGM เล่นต่อเนื่องข้าม Profile/Shop/Lobby/Hall of Fame
  const [selected, setSelected] = useState<Selection | null>(null);

  // ── Multiplayer Matchmaking (Adept) ──────────────────────────
  const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';
  const socketRef = useRef<Socket | null>(null);
  const userId = useUserStore(s => s.userId); // ต้อง login เสมอ — Lobby อยู่ใต้ auth guard แล้ว ไม่มี guest mode
  const displayName = useUserStore(s => s.displayName) || 'Player';
  const tokenBalance = useUserStore(s => s.tokenBalance);
  const isVip = useUserStore(s => s.isVIP); // VIP Shimmer Effect — ใช้ state ที่มีอยู่แล้ว ไม่สร้าง state/query ใหม่
  type MatchmakingStatus = 'idle' | 'queued' | 'matched';
  type MatchmakingTier = 'adept' | 'highNoble';
  const [mmStatus, setMmStatus] = useState<MatchmakingStatus>('idle');
  const [mmTier, setMmTier] = useState<MatchmakingTier>('adept');
  const [mmSeats, setMmSeats] = useState<Array<{ type: string; name: string }>>([]);
  const [mmTimeoutAt, setMmTimeoutAt] = useState<number | null>(null);
  const [mmSecondsLeft, setMmSecondsLeft] = useState(0);
  const [mmRoomId, setMmRoomId] = useState<string | null>(null);
  // LobbyMatchmaking_Spec_v1_1 — stage ของ 2-stage wait timer ใหม่ (Adept/HighNoble ทั้งคู่) ใช้เลือก
  // ข้อความ countdown ที่ถูกต้อง (waiting_2nd = รอ 2 นาทีให้คนที่ 2, waiting_3rd = รอ 15 วิให้คนที่ 3)
  const [mmWaitStage, setMmWaitStage] = useState<'waiting_2nd' | 'waiting_3rd' | null>(null);
  // LobbyMatchmaking_Spec_v1_1 — "Table Closed" popup: Human>=2 ไม่ครบภายใน secondHumanWaitMs (2 นาที)
  // ไม่มี refund เพราะ escrow ไม่เคยถูกหักระหว่างรอ (ยืนยันจาก Step 3 — หักเฉพาะตอนห้องเต็มเท่านั้น)
  const [mmClosedInsufficientPlayers, setMmClosedInsufficientPlayers] = useState(false);
  const [mmClosedTier, setMmClosedTier] = useState<MatchmakingTier | null>(null);

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

  const lastBossVisible = useMemo(() => meetsLastBossCondition(tokenBalance), [tokenBalance]);

  // ── Tier Unlock Tracking (LobbyMatchmaking_Spec_v1_0 §1.3) ──
  // ไม่มี popup ใน Lobby แล้ว (การแสดงผล Tier ที่ปลดล็อกย้ายไปหน้า Profile) — เหลือแค่ mark
  // tier_unlock_celebrated เงียบๆ กัน newlyUnlocked ถูกคำนวณ/ยิงซ้ำทุกครั้งที่ profile/tokenBalance เปลี่ยน
  const session = useAuthStore(s => s.session);
  const profile = useAuthStore(s => s.profile);
  const refreshProfile = useAuthStore(s => s.refreshProfile);
  const celebratedCheckedRef = useRef(false);

  useEffect(() => {
    if (!profile || celebratedCheckedRef.current) return;
    celebratedCheckedRef.current = true;
    const celebrated = new Set(profile.tier_unlock_celebrated ?? []);
    const newlyUnlocked = (Object.keys(TIER_CONFIG) as Tier[])
      .filter(t => t !== 'demo' && isEligible(t, tokenBalance) && !celebrated.has(t));
    if (newlyUnlocked.length === 0) return;
    const token = session?.access_token;
    if (!token) return;
    (async () => {
      for (const tier of newlyUnlocked) {
        try {
          await fetch(`${SERVER_URL}/profile/celebrate-tier`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ tier }),
          });
        } catch (e) {
          console.error('[Lobby] celebrate-tier failed:', e);
        }
      }
      await refreshProfile();
    })();
  }, [profile, tokenBalance]);

  const handleEnterInitiate = () => { fadeOutBgm(); router.push('/game/initiate'); };
  const handleEnterMastermind = () => { fadeOutBgm(); router.push('/game/mastermind/select'); };

  // ─── Menu Bar (UI Button System) — ปุ่มที่ระบบหลังบ้านยังไม่มี โชว์ Toast "Coming Soon" แทนการซ่อน ───
  const [comingSoonMsg, setComingSoonMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!comingSoonMsg) return;
    const id = setTimeout(() => setComingSoonMsg(null), 2500);
    return () => clearTimeout(id);
  }, [comingSoonMsg]);
  const handleComingSoon = (label: string) => setComingSoonMsg(`${label} — Coming Soon`);
  const handleShopNav = () => router.push('/(home)/shop');

  // ─── Buy-in Entry Gate (TriplePoker_BuyIn_Spec_v1_0 §3) ───
  // การหักจริงเกิดที่ server เสมอ (escrowBuyIn) — ที่นี่แค่เช็คก่อนเข้าเพื่อ UX เท่านั้น
  const [insufficientTier, setInsufficientTier] = useState<Tier | null>(null);
  const [confirmBuyInTier, setConfirmBuyInTier] = useState<Tier | null>(null);
  const [buyInToast, setBuyInToast] = useState<string | null>(null);
  const pendingEnterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!buyInToast) return;
    const id = setTimeout(() => setBuyInToast(null), 2000);
    return () => clearTimeout(id);
  }, [buyInToast]);

  // เรียกก่อนเข้าโต๊ะเสมอ — ห่อ handler เข้าโต๊ะเดิม (handleEnterInitiate ฯลฯ) ไม่แก้ handler เดิมเลย
  const runBuyInGate = async (tier: Tier, proceed: () => void) => {
    const buyInKey = TIER_TO_BUYIN_KEY[tier];
    if (!buyInKey) { proceed(); return; } // demo/last_boss ยังไม่มี buy-in กำหนด
    const buyIn = BUY_IN[buyInKey];

    if (tokenBalance < buyIn) {
      pendingEnterRef.current = proceed;
      setInsufficientTier(tier);
      return;
    }

    const confirmed = await AsyncStorage.getItem(`buyInConfirmed_${tier}`);
    if (confirmed !== 'true') {
      pendingEnterRef.current = proceed;
      setConfirmBuyInTier(tier);
      return;
    }

    setBuyInToast(`Buy-in deducted: −${buyIn.toLocaleString('en-US')}`);
    proceed();
  };

  const handleConfirmBuyIn = async () => {
    const tier = confirmBuyInTier;
    setConfirmBuyInTier(null);
    if (!tier) return;
    await AsyncStorage.setItem(`buyInConfirmed_${tier}`, 'true');
    pendingEnterRef.current?.();
    pendingEnterRef.current = null;
  };

  const handleCancelConfirmBuyIn = () => {
    setConfirmBuyInTier(null);
    pendingEnterRef.current = null;
  };

  const handleWatchAd = () => {
    // TODO: ต่อ AdMob rewarded ad จริง — ดูจบแล้วเรียก server endpoint ให้เครดิต +AD_RESCUE_AMOUNT แล้ว refreshProfile()
    setInsufficientTier(null);
    pendingEnterRef.current = null;
    handleComingSoon('Watch Ad');
  };

  const handleBuyTokensNav = () => {
    setInsufficientTier(null);
    pendingEnterRef.current = null;
    router.push('/(home)/shop');
  };

  const handleCancelInsufficientTier = () => {
    setInsufficientTier(null);
    pendingEnterRef.current = null;
  };

  // ── Multiplayer Matchmaking (Adept / High Noble ใช้ pattern เดียวกัน) ─────
  const handleAutoMatch = (tier: MatchmakingTier) => {
    setMmStatus('queued');
    setMmTier(tier);
    setMmSeats([]);
    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Bug C fix (2026-07-17): ส่ง avatarUrl ไปด้วย — server เก็บลง Seat แล้วส่งต่อให้ผู้เล่นคนอื่นเห็น
      // avatar กันใน round_start (เดิมไม่เคยส่ง เลยมีแต่ userName แต่ไม่มี avatar ของคนอื่นเลย)
      socket.emit('room_auto_match', { tier, userId, userName: displayName, avatarUrl: profile?.avatar_url ?? undefined });
    });

    socket.on('room_matched', (data: { room: any; seatIndex: number }) => {
      setMmRoomId(data.room.roomId);
      setMmSeats(data.room.seats);
      setMmTimeoutAt(data.room.timeoutAt);
      setMmWaitStage(data.room.waitStage ?? null);
    });

    // room_status ยิงให้ทุกคนในห้องทุกครั้งที่มีคน join ใหม่ — ต้องอัปเดต timeoutAt/waitStage ด้วย
    // ไม่ใช่แค่ seats เฉยๆ เพราะ v1.1 เปลี่ยน timer ตอน human คนที่ 2 join (2 นาที → 15 วิ) เดิมโค้ด
    // ก่อนหน้านี้ไม่เคยอัปเดตพวกนี้เลย ทำให้ผู้เล่นที่รออยู่ก่อนเห็น countdown ค้างของ stage เก่า
    socket.on('room_status', (data: { room: any }) => {
      if (!data.room) return;
      setMmSeats(data.room.seats);
      setMmTimeoutAt(data.room.timeoutAt);
      setMmWaitStage(data.room.waitStage ?? null);
    });

    socket.on('room_ready', (data: { roomId: string; seats: any[] }) => {
      setMmStatus('matched');
      socket.disconnect();
      fadeOutBgm();
      const route = tier === 'highNoble' ? '/game/highNoble' : '/game/adept';
      router.push(`${route}?roomId=${data.roomId}&userId=${userId}` as any);
    });

    socket.on('room_error', (data: { message: string }) => {
      setMmStatus('idle');
      socket.disconnect();
    });

    // LobbyMatchmaking_Spec_v1_1 — Human>=2 บังคับ ไม่ครบภายใน secondHumanWaitMs (2 นาที) → server ปิดโต๊ะ
    // ไม่มี refund (escrow ไม่เคยถูกหักระหว่างรอ) — โชว์ popup พร้อมทางเลือกไป Tier รอง (Initiate/Mastermind)
    // ให้ผู้เล่นแทนที่จะปล่อยกลับหน้า Lobby เฉยๆ
    socket.on('room_closed_insufficient_players', (data: { roomId: string; tier: MatchmakingTier; message: string }) => {
      setMmClosedTier(data.tier);
      setMmClosedInsufficientPlayers(true);
      setMmStatus('idle');
      setMmSeats([]);
      setMmTimeoutAt(null);
      setMmWaitStage(null);
      setMmRoomId(null);
      socket.disconnect();
    });
  };

  const handleAutoMatchAdept = () => handleAutoMatch('adept');
  const handleEnterHighNoble = () => handleAutoMatch('highNoble');

  const handleCancelMatchmaking = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setMmStatus('idle');
    setMmSeats([]);
    setMmTimeoutAt(null);
    setMmWaitStage(null);
    setMmRoomId(null);
  };

  // LobbyMatchmaking_Spec_v1_1 — ปุ่มใน "Table Closed" popup: เสนอ Tier รองแทน (ใช้ handler/buy-in gate
  // เดิมที่มีอยู่แล้ว ไม่สร้างซ้ำ) หรือกลับไปหน้าเลือก Tier เฉยๆ
  const handleClosedPlayInitiate = () => {
    setMmClosedInsufficientPlayers(false);
    runBuyInGate('initiate', handleEnterInitiate);
  };
  const handleClosedPlayMastermind = () => {
    setMmClosedInsufficientPlayers(false);
    runBuyInGate('mastermind', handleEnterMastermind);
  };
  const handleClosedBackToLobby = () => {
    setMmClosedInsufficientPlayers(false);
    setMmClosedTier(null);
  };

  useEffect(() => {
    return () => { socketRef.current?.disconnect(); };
  }, []);

  const renderTierButton = (tier: Tier, fullWidth: boolean) => {
    const cfg = TIER_CONFIG[tier];
    const locked = !isEligible(tier, tokenBalance);
    const isSelected = selected === tier;
    const buyInKey = TIER_TO_BUYIN_KEY[tier];
    return (
      <TouchableOpacity
        key={tier}
        disabled={locked}
        onPress={() => setSelected(tier)}
        style={[
          s.tierBtn,
          fullWidth && s.tierBtnFull,
          { borderColor: isSelected ? cfg.badgeColor : COLOR.borderPrimary },
          locked && s.tierBtnLocked,
        ]}
      >
        <View style={[s.badgeDot, { backgroundColor: cfg.badgeColor }]} />
        <View style={{ alignItems: 'center' }}>
          <Text style={[s.tierBtnTxt, locked && s.tierBtnTxtLocked]}>
            [{cfg.letter}] {cfg.label}{locked ? ' 🔒' : ''}
          </Text>
          {/* TriplePoker_BuyIn_Spec_v1_0 §6 — JetBrains Mono, Gold #FFC857 (=COLOR.goldDark) */}
          {buyInKey && <Text style={s.buyInLabel}>Buy-in: {BUY_IN[buyInKey].toLocaleString('en-US')}</Text>}
        </View>
        {!cfg.implemented && <Text style={s.comingSoonTag}>Coming Soon</Text>}
      </TouchableOpacity>
    );
  };

  const sectionTitle =
    selected === 'all' ? 'All Tiers'
    : selected ? TIER_CONFIG[selected].label
    : 'Select a Tier below to view tables';

  return (
    <ThemedBackground isVip={isVip}>
    <View style={s.root}>

      {/* ─── Not Enough Tokens (Buy-in Spec §3) ─── */}
      {insufficientTier && (
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>🪙</Text>
            <Text style={s.celebrateTitle}>NOT ENOUGH TOKENS</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', marginBottom: 20 }]}>
              You need {BUY_IN[TIER_TO_BUYIN_KEY[insufficientTier]!].toLocaleString('en-US')} tokens to enter {TIER_CONFIG[insufficientTier].label}.
            </Text>
            <TouchableOpacity onPress={handleWatchAd} style={[s.celebrateBtn, { marginBottom: 10 }]}>
              <Text style={s.celebrateBtnTxt}>Watch Ad (+{AD_RESCUE_AMOUNT})</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBuyTokensNav} style={[s.celebrateBtn, { marginBottom: 10 }]}>
              <Text style={s.celebrateBtnTxt}>Buy Tokens</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancelInsufficientTier} style={[s.celebrateBtn, { borderColor: COLOR.red }]}>
              <Text style={[s.celebrateBtnTxt, { color: COLOR.red }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Entry Buy-in Confirm (ครั้งแรกต่อ Tier — Buy-in Spec §3) ─── */}
      {confirmBuyInTier && (
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>🪙</Text>
            <Text style={s.celebrateTitle}>ENTRY BUY-IN</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', marginBottom: 20 }]}>
              Entry Buy-in: {BUY_IN[TIER_TO_BUYIN_KEY[confirmBuyInTier]!].toLocaleString('en-US')} tokens.{'\n'}This amount is deducted now and settled when the match ends.
            </Text>
            <TouchableOpacity onPress={handleConfirmBuyIn} style={[s.celebrateBtn, { marginBottom: 10 }]}>
              <Text style={s.celebrateBtnTxt}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCancelConfirmBuyIn} style={[s.celebrateBtn, { borderColor: COLOR.red }]}>
              <Text style={[s.celebrateBtnTxt, { color: COLOR.red }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Table Closed — Not Enough Players (LobbyMatchmaking_Spec_v1_1) ───
          Human>=2 บังคับไม่ครบภายในเวลา — ไม่มี refund เพราะ escrow ยังไม่เคยหักตอน 'waiting' เลย ─── */}
      {mmClosedInsufficientPlayers && (
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>🚪</Text>
            <Text style={s.celebrateTitle}>TABLE CLOSED</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', marginBottom: 20 }]}>
              Not enough players — this tier requires at least 2 human players.
            </Text>
            {mmClosedTier === 'adept' && (
              <TouchableOpacity onPress={handleClosedPlayInitiate} style={[s.celebrateBtn, { marginBottom: 10 }]}>
                <Text style={s.celebrateBtnTxt}>Play Initiate instead</Text>
              </TouchableOpacity>
            )}
            {mmClosedTier === 'highNoble' && (
              <TouchableOpacity onPress={handleClosedPlayMastermind} style={[s.celebrateBtn, { marginBottom: 10 }]}>
                <Text style={s.celebrateBtnTxt}>Play Mastermind instead</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClosedBackToLobby} style={[s.celebrateBtn, { borderColor: COLOR.red }]}>
              <Text style={[s.celebrateBtnTxt, { color: COLOR.red }]}>Back to Lobby</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Toast: Buy-in deducted (ครั้งถัดไปหลัง confirm ครั้งแรกแล้ว) ─── */}
      {buyInToast && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{buyInToast}</Text>
        </View>
      )}

      {/* ─── Toast: Coming Soon (Menu Bar buttons ที่ระบบหลังบ้านยังไม่มี) ─── */}
      {comingSoonMsg && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{comingSoonMsg}</Text>
        </View>
      )}

      {/* ─── Header (fixed) ─── */}
      <View style={s.headerRow}>
        <Text style={s.header}>TriplePoker Lobby</Text>
        <TouchableOpacity onPress={() => router.push('/(home)/profile')} style={s.profileBtn}>
          <Text style={s.profileBtnTxt}>👤 Profile</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Menu Bar (fixed) — Feedback A2: เหลือ 4 ปุ่ม กระจายเต็มความกว้าง ไม่ scroll แล้ว ─── */}
      <View style={s.menuBar}>
        <MenuButton icon="shop" label="Shop" size="sm" onPress={handleShopNav} vipShimmer={isVip} />
        <MenuButton icon="hall_of_fame" label="Hall of Fame" size="sm" onPress={() => handleComingSoon('Hall of Fame')} vipShimmer={isVip} />
        <MenuButton icon="friends" label="Friends" size="sm" onPress={() => handleComingSoon('Friends')} vipShimmer={isVip} />
        <MenuButton icon="ranking" label="Ranking" size="sm" onPress={() => handleComingSoon('Ranking')} vipShimmer={isVip} />
      </View>

      {/* ─── Table List — Scroll Zone (~75% สูง) ─── */}
      <View style={s.scrollZone}>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={s.sectionTitle}>{sectionTitle}</Text>

          {selected === 'initiate' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('initiate', handleEnterInitiate)}>
              <Text style={s.enterBtnTxt}>▶ Play (Create Your Table)</Text>
            </TouchableOpacity>
          )}

          {selected === 'mastermind' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('mastermind', handleEnterMastermind)}>
              <Text style={s.enterBtnTxt}>▶ Play (1 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'high_noble' && mmStatus === 'idle' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('high_noble', handleEnterHighNoble)}>
              <Text style={s.enterBtnTxt}>▶ Play (Auto-Match 3 Human + Four Gods AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'adept' && mmStatus === 'idle' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('adept', handleAutoMatchAdept)}>
              <Text style={s.enterBtnTxt}>▶ Play (Auto-Match 3 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {(selected === 'adept' || selected === 'high_noble') && mmStatus === 'queued' && mmTier === (selected === 'high_noble' ? 'highNoble' : 'adept') && (
            <View style={{
              ...glassPanel, // เดิม COLOR.bgSecondary ทึบ
              padding: 16, alignItems: 'center', marginBottom: 12,
            }}>
              <Text style={{ color: COLOR.goldPrimary, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                🔍 Finding players...
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
              {/* LobbyMatchmaking_Spec_v1_1 — ข้อความ countdown ตาม waitStage: waiting_2nd (2 นาที รอ
                  human คนที่ 2, ยังไม่ครบ Human>=2 จะโดนปิดโต๊ะ) vs waiting_3rd (15 วิ รอคนที่ 3 ก่อนเติม AI) */}
              {mmSecondsLeft > 0 && mmWaitStage === 'waiting_2nd' && (
                <Text style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 10 }}>
                  Waiting for players... ({formatMMSS(mmSecondsLeft)})
                </Text>
              )}
              {mmSecondsLeft > 0 && mmWaitStage === 'waiting_3rd' && (
                <Text style={{ color: COLOR.textSecondary, fontSize: 11, marginBottom: 10 }}>
                  Starting in {mmSecondsLeft}... (waiting for one more player)
                </Text>
              )}
              <TouchableOpacity onPress={handleCancelMatchmaking}
                style={{ borderWidth: 1, borderColor: COLOR.red, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
                <Text style={{ color: COLOR.red, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {(selected === 'adept' || selected === 'high_noble') && mmStatus === 'idle' && (
            <View style={{ paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
              <Text style={{ color: COLOR.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18, ...textOnGlass }}>
                No open rooms yet{'\n'}Tap "Play" to create a new room
              </Text>
            </View>
          )}

          {selected === 'all' && (
            <Text style={{ color: COLOR.textTertiary, fontSize: 12, textAlign: 'center', paddingVertical: 24, ...textOnGlass }}>
              Select a Tier below to start playing
            </Text>
          )}

          {!selected && (
            <Text style={{ color: COLOR.textTertiary, fontSize: 12, ...textOnGlass }}>— No Tier selected —</Text>
          )}
        </ScrollView>
      </View>

      {/* ─── Fixed Bottom Block (~25% สูง): All button + Tier Rows + Footer ─── */}
      <View style={s.fixedBottomBlock}>
        <TouchableOpacity
          onPress={() => setSelected('all')}
          style={[s.allBtn, selected === 'all' && s.allBtnActive]}
        >
          <Text style={s.allBtnTxt}>🌐 All Tables (All Tiers)</Text>
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

      </View>
    </ThemedBackground>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent', // VipBackground ครอบพื้นหลังแล้ว — Free เห็น bgPrimary ผ่าน VipBackground fallback
    paddingHorizontal: 16,
    paddingTop: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 }, // เดิม marginTop:50 hardcode ชดเชย status bar เอง — VipBackground มี SafeAreaView(top) ให้แล้ว เหลือแค่ breathing room ปกติ
  header: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel', ...textOnGlass },
  profileBtn: { borderWidth: 1, borderColor: COLOR.goldPrimary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  profileBtnTxt: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '700', ...textOnGlass },

  menuBar: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginBottom: 10 }, // Feedback A2: เหลือ 4 ปุ่ม กระจายเต็มความกว้างแทน scroll

  // Scroll Zone กิน flex:3 ของพื้นที่ที่เหลือ (~75%), Fixed Bottom Block กิน flex:1 (~25%)
  scrollZone: { flex: 1, minHeight: 0, overflow: 'hidden' },
  sectionTitle: { color: COLOR.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6, ...textOnGlass }, // ลอยตรงบนพื้นหลัง ไม่มี panel รอง

  enterBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  enterBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },

  fixedBottomBlock: { paddingTop: 10, flexShrink: 0 },

  allBtn: { borderRadius: 10, borderWidth: 1.5, borderColor: COLOR.greenHighlight, backgroundColor: glassPanel.backgroundColor, paddingVertical: 12, alignItems: 'center', marginBottom: 10 }, // เดิม COLOR.bgSecondary ทึบ — คง border เขียว (สื่อความหมาย "all tables") ไว้ตามเดิม
  allBtnActive: { backgroundColor: glassPanelDense.backgroundColor },
  allBtnTxt: { color: COLOR.greenHighlight, fontWeight: '700', fontSize: 13 },

  tierRowsWrap: { gap: 8 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tierBtn: { ...glassPanelDense, flex: 1, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }, // เดิม COLOR.bgSecondary ทึบ — dense เพราะโชว์ Buy-in price
  tierBtnFull: { flex: 1 },
  tierBtnLocked: { opacity: 0.35 },
  tierBtnTxt: { color: COLOR.textPrimary, fontWeight: '700', fontSize: 13 },
  tierBtnTxtLocked: { color: COLOR.textTertiary },
  buyInLabel: { color: COLOR.goldDark, fontSize: 9, fontFamily: 'JetBrainsMono_400Regular', marginTop: 2 },
  comingSoonTag: { color: COLOR.goldDark, fontSize: 8, marginTop: 2, fontWeight: '700', position: 'absolute', bottom: 2, right: 6 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },

  footer: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLOR.borderPrimary, marginTop: 10 },
  footerLogo: { width: 28, height: 28, opacity: 0.9, marginBottom: 4 },
  footerText: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel', ...textOnGlass }, // ลอยตรงบนพื้นหลัง ไม่มี panel รอง
  footerSub: { color: COLOR.textTertiary, fontSize: 8, marginTop: 2, ...textOnGlass },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLOR.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLOR.goldPrimary },
  modalCloseBtn: { fontSize: 24, color: COLOR.red },
  modalInfo: { color: COLOR.textSecondary, fontSize: 13, marginBottom: 20, lineHeight: 20 },
  modalCloseButton: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  modalCloseButtonTxt: { color: COLOR.bgPrimary, fontSize: 14, fontWeight: '700' },

  celebrateOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    backgroundColor: 'rgba(5,10,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  celebrateCard: {
    ...glassPanelDense, // เดิม COLOR.bgSecondary ทึบ — dialog มักโชว์ตัวเลข token (Not Enough Tokens/Entry Buy-in) จึงใช้ dense
    width: '100%', maxWidth: 320, alignItems: 'center',
    paddingVertical: 32, paddingHorizontal: 20,
  },
  celebrateIcon: { fontSize: 48, marginBottom: 10 },
  celebrateTitle: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  celebrateTierName: { color: COLOR.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 22 },
  celebrateBtn: { borderWidth: 1.5, borderColor: COLOR.goldPrimary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 28, alignItems: 'center' },
  celebrateBtnTxt: { color: COLOR.goldPrimary, fontWeight: '800', letterSpacing: 1 },

  toastBanner: {
    position: 'absolute', top: 60, left: 16, right: 16, zIndex: 1000,
    backgroundColor: glassPanel.backgroundColor, // เดิม COLOR.bgSecondary ทึบ — คง border แดง (สื่อความหมาย alert) ไว้ตามเดิม
    borderWidth: 1.5, borderColor: COLOR.red, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: COLOR.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },

});
