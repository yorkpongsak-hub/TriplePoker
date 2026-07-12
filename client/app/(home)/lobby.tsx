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
import VIPSkinSelector from './components/VIPSkinSelector'
import { useUserSkins } from '../../src/hooks/useUserSkins'
import { useBgm, fadeOutBgm, playApplauseSfx } from '../../src/services/bgmService'
import { useAuthStore } from '../../src/store/authStore'
import { MenuButton } from '../../src/components/ui/MenuButton'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BUY_IN, BuyInTier, AD_RESCUE_AMOUNT } from '../../src/config/buyInConfig'

const studioLogo = require('../../assets/images/sage_unicorn_logo_transparent.png');

type Tier = 'demo' | 'initiate' | 'adept' | 'mastermind' | 'high_noble' | 'last_boss';
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

const TIER_CONFIG: Record<Tier, { label: string; letter: string; minToken: number; implemented: boolean; badgeColor: string }> = {
  demo:        { label: 'Demo',          letter: 'D',  minToken: 0,       implemented: false, badgeColor: COLOR.greenHighlight },
  initiate:    { label: 'Initiate',      letter: 'C',  minToken: 100,     implemented: true,  badgeColor: COLOR.greenHighlight },
  adept:       { label: 'Adept',         letter: 'B',  minToken: 10_000,  implemented: true,  badgeColor: COLOR.goldPrimary },
  mastermind:  { label: 'Mastermind',    letter: 'A',  minToken: 40_000,  implemented: true,  badgeColor: COLOR.goldPrimary },
  high_noble:  { label: 'High Noble',    letter: 'S',  minToken: 100_000, implemented: true,  badgeColor: COLOR.red },
  last_boss:   { label: 'The Last Boss', letter: 'S+', minToken: 0,       implemented: false, badgeColor: COLOR.goldDark },
};

// TriplePoker_BuyIn_Spec_v1_0 §2 — เทียบ Tier type ของ Lobby (snake_case) กับ key ของ BUY_IN (camelCase ตรงกับ server)
const TIER_TO_BUYIN_KEY: Partial<Record<Tier, BuyInTier>> = {
  initiate: 'initiate', adept: 'adept', mastermind: 'mastermind', high_noble: 'highNoble', last_boss: 'lastBoss',
};

function meetsLastBossCondition(_token: number): boolean { return false; }
function isEligible(tier: Tier, token: number): boolean {
  if (tier === 'last_boss') return meetsLastBossCondition(token);
  return token >= TIER_CONFIG[tier].minToken;
}

const TIER_ROWS: Tier[][] = [
  ['last_boss'],
  ['high_noble', 'mastermind'],
  ['adept', 'initiate'],
  ['demo'],
];

export default function LobbyScreen() {
  useBgm(); // LobbyMatchmaking_Spec_v1_0 §2 — BGM เล่นต่อเนื่องข้าม Profile/Shop/Lobby/Hall of Fame
  const [selected, setSelected] = useState<Selection | null>(null);
  const [showSkinModal, setShowSkinModal] = useState(false);

  // ── Multiplayer Matchmaking (Adept) ──────────────────────────
  const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';
  const socketRef = useRef<Socket | null>(null);
  const userId = useUserStore(s => s.userId); // ต้อง login เสมอ — Lobby อยู่ใต้ auth guard แล้ว ไม่มี guest mode
  const displayName = useUserStore(s => s.displayName) || 'Player';
  const tokenBalance = useUserStore(s => s.tokenBalance);
  type MatchmakingStatus = 'idle' | 'queued' | 'matched';
  type MatchmakingTier = 'adept' | 'highNoble';
  const [mmStatus, setMmStatus] = useState<MatchmakingStatus>('idle');
  const [mmTier, setMmTier] = useState<MatchmakingTier>('adept');
  const [mmSeats, setMmSeats] = useState<Array<{ type: string; name: string }>>([]);
  const [mmTimeoutAt, setMmTimeoutAt] = useState<number | null>(null);
  const [mmSecondsLeft, setMmSecondsLeft] = useState(0);
  const [mmRoomId, setMmRoomId] = useState<string | null>(null);
  // §4.4/§6.1: Waiting Timeout Dialog — โชว์ตอนรอบแรก (3 นาที) หมด (stage='first') หรือรอบ Deadlock ของ
  // High Noble (stage='deadlock', §6.1) — สิทธิ์กดจำกัดเฉพาะ Host เท่านั้นสำหรับ High Noble
  const [mmTimeoutDialog, setMmTimeoutDialog] = useState(false);
  const [mmDialogStage, setMmDialogStage] = useState<'first' | 'deadlock'>('first');
  const [mmHostUserId, setMmHostUserId] = useState<string | null>(null);
  const [mmDeletedMessage, setMmDeletedMessage] = useState<string | null>(null);

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

  const lastBossVisible = useMemo(() => meetsLastBossCondition(tokenBalance), [tokenBalance]);

  // ── Tier Unlock Celebration (ครั้งเดียวต่อ Tier — LobbyMatchmaking_Spec_v1_0 §1.3) ──
  const session = useAuthStore(s => s.session);
  const profile = useAuthStore(s => s.profile);
  const refreshProfile = useAuthStore(s => s.refreshProfile);
  const signOut = useAuthStore(s => s.signOut);
  const [celebrateQueue, setCelebrateQueue] = useState<Tier[]>([]);
  const [celebrating, setCelebrating] = useState<Tier | null>(null);
  const celebratedCheckedRef = useRef(false);

  // เช็คครั้งเดียวหลัง profile โหลดเสร็จ — เทียบ tier ที่ unlock แล้ว (token ถึง) กับ tier_unlock_celebrated เดิม
  useEffect(() => {
    if (!profile || celebratedCheckedRef.current) return;
    celebratedCheckedRef.current = true;
    const celebrated = new Set(profile.tier_unlock_celebrated ?? []);
    const newlyUnlocked = (Object.keys(TIER_CONFIG) as Tier[])
      .filter(t => t !== 'demo' && isEligible(t, tokenBalance) && !celebrated.has(t));
    if (newlyUnlocked.length > 0) setCelebrateQueue(newlyUnlocked);
  }, [profile, tokenBalance]);

  // ดึงคิวทีละ Tier — โชว์ celebration ทีละอันจนครบคิว
  useEffect(() => {
    if (celebrating || celebrateQueue.length === 0) return;
    const [next, ...rest] = celebrateQueue;
    setCelebrating(next);
    setCelebrateQueue(rest);
    playApplauseSfx();
  }, [celebrateQueue, celebrating]);

  const handleCelebrationDismiss = async () => {
    const tier = celebrating;
    setCelebrating(null);
    if (!tier) return;
    const token = session?.access_token;
    if (!token) return;
    try {
      await fetch(`${SERVER_URL}/profile/celebrate-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier }),
      });
      await refreshProfile();
    } catch (e) {
      console.error('[Lobby] celebrate-tier failed:', e);
    }
  };

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
  const handleExit = async () => {
    fadeOutBgm();
    await signOut();
    router.replace('/(auth)/login');
  };

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
      socket.emit('room_auto_match', { tier, userId, userName: displayName });
    });

    socket.on('room_matched', (data: { room: any; seatIndex: number }) => {
      setMmRoomId(data.room.roomId);
      setMmSeats(data.room.seats);
      setMmTimeoutAt(data.room.timeoutAt);
      setMmHostUserId(data.room.hostUserId ?? null);
    });

    socket.on('room_status', (data: { room: any }) => {
      if (data.room) setMmSeats(data.room.seats);
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

    // §4.4/§6.1: รอบแรก (3 นาที) หรือรอบ Deadlock (High Noble) หมด — โชว์ dialog ให้เลือก
    socket.on('room_wait_timeout_choice', (data: { roomId: string; stage: 'first' | 'deadlock'; hostUserId?: string }) => {
      setMmDialogStage(data.stage);
      if (data.hostUserId) setMmHostUserId(data.hostUserId);
      setMmTimeoutDialog(true);
    });

    // เลือก "Wait 2 More Minutes" สำเร็จ — ต่อเวลา ปิด dialog
    socket.on('room_wait_extended', (data: { roomId: string; timeoutAt: number }) => {
      setMmTimeoutDialog(false);
      setMmTimeoutAt(data.timeoutAt);
    });

    // รอบขยายหมดเวลาแบบไม่มีใครตอบ dialog ทัน หรือเลือก "Delete Table" — โต๊ะถูกลบ กลับ Lobby
    const handleRoomRemoved = (data: { roomId: string; message?: string }) => {
      setMmDeletedMessage(data.message ?? 'Table has been deleted.');
      setMmTimeoutDialog(false);
      setMmStatus('idle');
      setMmSeats([]);
      setMmTimeoutAt(null);
      setMmRoomId(null);
      setMmHostUserId(null);
      socket.disconnect();
    };
    socket.on('room_wait_timeout_expired', handleRoomRemoved);
    socket.on('room_deleted', handleRoomRemoved);
  };

  const handleTimeoutChoice = (choice: 'wait_2_more' | 'delete' | 'start_now') => {
    if (!mmRoomId) return;
    socketRef.current?.emit('room_timeout_choice', { roomId: mmRoomId, userId, choice });
    if (choice !== 'wait_2_more') setMmTimeoutDialog(false); // room_deleted/room_ready handler จะเคลียร์ state ที่เหลือ
  };

  // §6.1: สิทธิ์กด dialog จำกัดเฉพาะ Host เท่านั้นสำหรับ High Noble — Adept ไม่ gate (มี Human รอแค่คนเดียวเสมอ)
  const isTimeoutDialogHost = mmTier !== 'highNoble' || !mmHostUserId || userId === mmHostUserId;

  const handleAutoMatchAdept = () => handleAutoMatch('adept');
  const handleEnterHighNoble = () => handleAutoMatch('highNoble');

  const handleCancelMatchmaking = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setMmStatus('idle');
    setMmSeats([]);
    setMmTimeoutAt(null);
    setMmRoomId(null);
    setMmTimeoutDialog(false);
    setMmHostUserId(null);
  };

  // Toast แจ้งโต๊ะถูกลบ (timeout expired / delete) — auto-dismiss เอง
  useEffect(() => {
    if (!mmDeletedMessage) return;
    const id = setTimeout(() => setMmDeletedMessage(null), 4000);
    return () => clearTimeout(id);
  }, [mmDeletedMessage]);

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
          isSelected && { backgroundColor: COLOR.bgTertiary },
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
    : 'เลือก Tier ด้านล่างเพื่อดูโต๊ะ';

  return (
    <View style={s.root}>

      {/* ─── Tier Unlock Celebration (ครั้งเดียวต่อ Tier — §1.3) ───
          TODO: ใช้ sprite_tier_up.png (VFX ArtSpec v1.0) แทน placeholder นี้เมื่อมี asset จริง */}
      {celebrating && (
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>🎉</Text>
            <Text style={s.celebrateTitle}>TIER UNLOCKED!</Text>
            <Text style={s.celebrateTierName}>
              [{TIER_CONFIG[celebrating].letter}] {TIER_CONFIG[celebrating].label}
            </Text>
            <TouchableOpacity onPress={handleCelebrationDismiss} style={s.celebrateBtn}>
              <Text style={s.celebrateBtnTxt}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Waiting Timeout Dialog (§4.4/§6.1) — stage='first' (Wait 2 More/Delete) หรือ stage='deadlock'
          (Start Now Fill Minion AI/Delete, เฉพาะ High Noble) — High Noble จำกัดสิทธิ์กดเฉพาะ Host ─── */}
      {mmTimeoutDialog && (
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>⏱️</Text>
            <Text style={s.celebrateTitle}>{mmDialogStage === 'deadlock' ? 'TABLE STUCK' : 'STILL WAITING'}</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', marginBottom: 20 }]}>
              {isTimeoutDialogHost
                ? (mmDialogStage === 'deadlock'
                    ? 'Not enough players joined in time. Start now with a Minion AI filling the last seat, or delete this table?'
                    : 'No player has joined yet. Keep waiting a bit longer, or delete this table?')
                : 'Waiting for host decision…'}
            </Text>
            {isTimeoutDialogHost && (
              <>
                <TouchableOpacity
                  onPress={() => handleTimeoutChoice(mmDialogStage === 'deadlock' ? 'start_now' : 'wait_2_more')}
                  style={[s.celebrateBtn, { marginBottom: 10 }]}
                >
                  <Text style={s.celebrateBtnTxt}>
                    {mmDialogStage === 'deadlock' ? 'Start Now (Fill 1 Minion AI)' : 'Wait 2 More Minutes'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleTimeoutChoice('delete')} style={[s.celebrateBtn, { borderColor: COLOR.red }]}>
                  <Text style={[s.celebrateBtnTxt, { color: COLOR.red }]}>Delete Table</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

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

      {/* ─── Toast: Buy-in deducted (ครั้งถัดไปหลัง confirm ครั้งแรกแล้ว) ─── */}
      {buyInToast && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{buyInToast}</Text>
        </View>
      )}

      {/* ─── Toast: Table deleted / timeout expired ─── */}
      {mmDeletedMessage && (
        <View style={s.toastBanner}>
          <Text style={s.toastText}>{mmDeletedMessage}</Text>
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

      {/* ─── Menu Bar (fixed) — LobbyMatchmaking_Spec_v1_0 §1.2 — UI Button System ─── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.menuBar}
        contentContainerStyle={s.menuBarContent}
      >
        <MenuButton icon="shop" label="Shop" size="sm" onPress={handleShopNav} />
        <MenuButton icon="hall_of_fame" label="Hall of Fame" size="sm" onPress={() => handleComingSoon('Hall of Fame')} />
        <MenuButton icon="friends" label="Friends" size="sm" onPress={() => handleComingSoon('Friends')} />
        <MenuButton icon="ranking" label="Ranking" size="sm" onPress={() => handleComingSoon('Ranking')} />
        <MenuButton icon="daily_reward" label="Daily Reward" size="sm" onPress={() => handleComingSoon('Daily Reward')} />
        <MenuButton icon="quests" label="Quests" size="sm" onPress={() => handleComingSoon('Quests')} />
        <MenuButton icon="achievements" label="Achievements" size="sm" onPress={() => handleComingSoon('Achievements')} />
        <MenuButton icon="events" label="Events" size="sm" onPress={() => handleComingSoon('Events')} />
        <MenuButton icon="mail" label="Mail" size="sm" onPress={() => handleComingSoon('Mail')} />
        <MenuButton icon="settings" label="Settings" size="sm" onPress={() => handleComingSoon('Settings')} />
        <MenuButton icon="exit" label="Exit" size="sm" onPress={handleExit} />
      </ScrollView>

      {/* ─── Table List — Scroll Zone (~75% สูง) ─── */}
      <View style={s.scrollZone}>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={s.sectionTitle}>{sectionTitle}</Text>

          {selected === 'initiate' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('initiate', handleEnterInitiate)}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (สร้างโต๊ะของคุณ)</Text>
            </TouchableOpacity>
          )}

          {selected === 'mastermind' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('mastermind', handleEnterMastermind)}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (1 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'high_noble' && mmStatus === 'idle' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('high_noble', handleEnterHighNoble)}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (Auto-Match 3 Human + จตุรเทพ AI)</Text>
            </TouchableOpacity>
          )}

          {selected === 'adept' && mmStatus === 'idle' && (
            <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('adept', handleAutoMatchAdept)}>
              <Text style={s.enterBtnTxt}>▶ เริ่มเล่น (Auto-Match 3 Human + AI)</Text>
            </TouchableOpacity>
          )}

          {(selected === 'adept' || selected === 'high_noble') && mmStatus === 'queued' && mmTier === (selected === 'high_noble' ? 'highNoble' : 'adept') && (
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

          {(selected === 'adept' || selected === 'high_noble') && mmStatus === 'idle' && (
            <View style={{ paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
              <Text style={{ color: COLOR.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                ยังไม่มีห้องที่เปิดอยู่{'\n'}กด "เริ่มเล่น" เพื่อสร้างห้องใหม่
              </Text>
            </View>
          )}

          {selected === 'all' && (
            <Text style={{ color: COLOR.textTertiary, fontSize: 12, textAlign: 'center', paddingVertical: 24 }}>
              เลือก Tier ด้านล่างเพื่อเริ่มเล่น
            </Text>
          )}

          {!selected && (
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 50, marginBottom: 12 },
  header: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel' },
  profileBtn: { borderWidth: 1, borderColor: COLOR.goldPrimary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  profileBtnTxt: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '700' },

  menuBar: { flexGrow: 0, flexShrink: 0, marginBottom: 10 },
  menuBarContent: { flexDirection: 'row', gap: 14, paddingHorizontal: 2, paddingVertical: 2 },

  // Scroll Zone กิน flex:3 ของพื้นที่ที่เหลือ (~75%), Fixed Bottom Block กิน flex:1 (~25%)
  scrollZone: { flex: 1, minHeight: 0, overflow: 'hidden' },
  sectionTitle: { color: COLOR.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6 },

  enterBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  enterBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },

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
  buyInLabel: { color: COLOR.goldDark, fontSize: 9, fontFamily: 'JetBrainsMono_400Regular', marginTop: 2 },
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

  celebrateOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
    backgroundColor: 'rgba(5,10,8,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  celebrateCard: {
    width: '100%', maxWidth: 320, alignItems: 'center',
    backgroundColor: COLOR.bgSecondary, borderRadius: 16, borderWidth: 2, borderColor: COLOR.goldPrimary,
    paddingVertical: 32, paddingHorizontal: 20,
  },
  celebrateIcon: { fontSize: 48, marginBottom: 10 },
  celebrateTitle: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  celebrateTierName: { color: COLOR.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 22 },
  celebrateBtn: { borderWidth: 1.5, borderColor: COLOR.goldPrimary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 28, alignItems: 'center' },
  celebrateBtnTxt: { color: COLOR.goldPrimary, fontWeight: '800', letterSpacing: 1 },

  toastBanner: {
    position: 'absolute', top: 60, left: 16, right: 16, zIndex: 1000,
    backgroundColor: COLOR.bgSecondary, borderWidth: 1.5, borderColor: COLOR.red, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  toastText: { color: COLOR.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },

});
