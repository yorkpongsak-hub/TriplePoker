/**
 * lobby.tsx (v5 — Patch 12: Fixed Layout + No-scroll page)
 * Layout: Header (fixed) -> Table List (scroll, ~75% สูง) -> Tier Rows+All+Footer (fixed, ~25% สูง)
 * ธีมสี: TriplePoker_WebsiteTheme_Spec_v1_0
 * The Sage Unicorn Studio Co., Ltd.
 */
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Platform, Modal, Switch, TextInput, useWindowDimensions, Alert } from 'react-native';
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
import { ActiveTableSummary } from '../../src/types/spectator.types'
import { watchAd } from '../../src/services/adRewards'

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
  ['initiate', 'adept'],
  ['mastermind', 'high_noble'],
  ['grandmaster'],
  ['last_boss'],
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

  // จัดปุ่ม Profile (header) ให้ตรงแนว x กับปุ่ม Shop (menuBar ด้านล่าง) — menuBar ใช้ justifyContent:'space-evenly'
  // กับปุ่มขนาด sm (64px) 4 ปุ่ม จึงคำนวณ gap ซ้ายสุดของ Shop ด้วยสูตรเดียวกัน แทนเลขตายตัว กันพังเวลาจอกว้างไม่เท่ากัน
  const { width: screenWidth } = useWindowDimensions();
  const shopBtnLeftGap = Math.max(0, (screenWidth - 32 /* root paddingHorizontal 16*2 */ - 4 * 64) / 5);

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
  const [showLiveDialog, setShowLiveDialog] = useState(false);
  const [allowLiveTables, setAllowLiveTables] = useState(false);
  const [activeTablesExpanded, setActiveTablesExpanded] = useState(false);
  const [activeTables, setActiveTables] = useState<ActiveTableSummary[]>([]);
  const [privateDialog, setPrivateDialog] = useState<{ mode: 'CREATE' | 'JOIN'; tier: MatchmakingTier } | null>(null);
  const [privateUsesPin, setPrivateUsesPin] = useState(true);
  const [roomPin, setRoomPin] = useState('');
  const [matchmakingError, setMatchmakingError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem('settings.allowLiveTables'),
      AsyncStorage.getItem('lobby.activeTablesExpanded'),
      AsyncStorage.getItem('lobby.selectedTier'),
    ]).then(([allow, expanded, savedTier]) => {
      setAllowLiveTables(allow === 'true');
      setActiveTablesExpanded(expanded === 'true');
      if (savedTier && savedTier in TIER_CONFIG) setSelected(savedTier as Tier);
    });
  }, []);

  const selectTier = (tier: Tier) => {
    setSelected(tier);
    void AsyncStorage.setItem('lobby.selectedTier', tier);
  };

  const toggleActiveTables = () => setActiveTablesExpanded(value => {
    void AsyncStorage.setItem('lobby.activeTablesExpanded', String(!value));
    return !value;
  });

  const toggleAllowLive = (value: boolean) => {
    setAllowLiveTables(value);
    void AsyncStorage.setItem('settings.allowLiveTables', String(value));
  };

  // ── Batch 3A Task 1 — Decoy Matchmaking (Monarch v2.2) ───────────────────────────
  // แยก state จาก mm* ของจริงทั้งหมดโดยตั้งใจ (audit เตือนแล้ว: real queue อ่าน state จาก server
  // ตรงๆ ผ่าน room_status/room_matched — ผสมกันเสี่ยง edge case ของ queue จริงหลุด) สุ่มฝั่ง client
  // ล้วน ไม่แตะ server payload เลยตามมติลุงเยาะ
  const [monarchDecoyActive, setMonarchDecoyActive] = useState(false);
  const [monarchDecoySeats, setMonarchDecoySeats] = useState<Array<{ type: string; name: string }>>([]);
  const monarchDecoyRoomIdRef = useRef<string | null>(null);
  const monarchDecoyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearMonarchDecoyTimers = () => {
    monarchDecoyTimersRef.current.forEach(t => clearTimeout(t));
    monarchDecoyTimersRef.current = [];
  };
  // unmount (navigate away/back ระหว่าง decoy) ต้อง clear timer เสมอ กัน setTimeout ค้างยิง
  // router.push หลังออกจากหน้านี้ไปแล้ว (memory leak + อาจ crash ถ้า navigate ซ้อนตอน component ตายแล้ว)
  useEffect(() => () => clearMonarchDecoyTimers(), []);

  // ชื่อปลอมชุดเดียวกับ Minion pool ฝั่ง server (aiEngine.ts:59-63) — copy ตรงๆ เพราะ client เรียก
  // server code ไม่ได้ ชื่อกลุ่มนี้ pre-vetted อยู่แล้ว ไม่ต้อง validate ซ้ำ (มติ Batch 3 audit ข้อ A.4)
  const MONARCH_DECOY_NAMES = [
    'Alex', 'Bella', 'Charlie', 'Diana', 'Edward', 'Fiona', 'Gabriel', 'Hana', 'Ivan', 'Julia',
    'Kevin', 'Lily', 'Max', 'Natalie', 'Oliver', 'Prim', 'Queenie', 'Ryan', 'Sophia', 'Tom',
    'Uma', 'Vincent', 'Willow', 'Xander', 'Yuri',
  ];

  // สุ่ม 8-20s รวม แบ่ง 2 ช่วง (35-65% : เหลือ) ให้คนที่ 2/3 เข้าไม่พร้อมกัน สมจริงเทียบ queue จริง
  // (mini-audit: queue จริงไม่มีเวลาคงที่ อยู่ในช่วง 0-135s ตาม server population — 8-20s อยู่ในโซน
  // "แมตช์เร็ว" ที่พบได้จริง ไม่ใช่ค่าที่แต่งขึ้นลอยๆ)
  const startMonarchDecoy = (roomId: string) => {
    monarchDecoyRoomIdRef.current = roomId;
    clearMonarchDecoyTimers();

    const pool = [...MONARCH_DECOY_NAMES];
    const pickName = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const fakeName1 = pickName();
    const fakeName2 = pickName();

    // seat index 3 (boss) เว้นว่างตลอด decoy — เทียบ real queue ที่ seat บอสยังไม่โผล่จนกว่าห้องเต็มจริง
    setMonarchDecoySeats([
      { type: 'human', name: displayName }, { type: 'empty', name: '' },
      { type: 'empty', name: '' }, { type: 'empty', name: '' },
    ]);
    setMonarchDecoyActive(true);

    const totalMs = 8000 + Math.random() * 12000;
    const split1 = 0.35 + Math.random() * 0.3;
    const delay1 = Math.round(totalMs * split1);
    const delay2 = Math.round(totalMs - delay1);

    const t1 = setTimeout(() => {
      setMonarchDecoySeats([
        { type: 'human', name: displayName }, { type: 'human', name: fakeName1 },
        { type: 'empty', name: '' }, { type: 'empty', name: '' },
      ]);
      const t2 = setTimeout(() => {
        setMonarchDecoySeats([
          { type: 'human', name: displayName }, { type: 'human', name: fakeName1 },
          { type: 'human', name: fakeName2 }, { type: 'empty', name: '' },
        ]);
        // หน่วงสั้นๆ ให้เห็น 3/3 เต็มก่อน redirect จริง (เทียบ mmStatus='matched' ช่วงสั้นๆ ก่อนเด้งจริง)
        const t3 = setTimeout(() => {
          const rid = monarchDecoyRoomIdRef.current;
          setMonarchDecoyActive(false);
          if (rid) router.push(`/game/monarch?roomId=${rid}&userId=${userId}` as any);
        }, 600);
        monarchDecoyTimersRef.current.push(t3);
      }, delay2);
      monarchDecoyTimersRef.current.push(t2);
    }, delay1);
    monarchDecoyTimersRef.current.push(t1);
  };

  const handleCancelMonarchDecoy = () => {
    clearMonarchDecoyTimers();
    setMonarchDecoyActive(false);
    setMonarchDecoySeats([]);
    monarchDecoyRoomIdRef.current = null;
  };

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

  // Tier Unlock Celebration ย้ายไปหน้า Profile ทั้งหมดแล้ว (VFX เด้งตอนเปิดแอปที่ profile.tsx แทน)
  // profile ยังใช้ต่อที่นี่ (ส่ง avatarUrl เข้า room_auto_match ด้านล่าง)
  const profile = useAuthStore(s => s.profile);
  const accessToken = useAuthStore(s => s.session?.access_token ?? null);

  const handleEnterInitiate = () => { fadeOutBgm(); router.push('/game/initiate'); };
  const handleEnterMastermind = () => { fadeOutBgm(); router.push('/game/mastermind/select'); };
  const handleEnterGrandmaster = () => {
    const requiredCrown = 20; // 240 Crest / 12 Crest per Crown
    const crownBalance = profile?.crown_balance ?? 0;
    if (crownBalance < requiredCrown) {
      setBuyInToast(`Tier S requires 20 Crown. You have ${crownBalance}.`);
      return;
    }
    fadeOutBgm();
    router.push('/game/grandmaster');
  };
  const handleEnterSovereign = () => { fadeOutBgm(); router.push('/game/sovereign'); };

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

  // TODO: ต่อ AdMob rewarded ad SDK จริง — ตอนนี้เป็นปุ่มทดสอบชั่วคราว (มติลุงเยาะ 2026-08-13) เรียก
  // endpoint ให้เครดิตทันทีแทนการรอดูโฆษณาจริง จนกว่าจะมีบัญชี AdMob/Ad Unit ID มาต่อ SDK จริง
  const handleWatchAd = async () => {
    setInsufficientTier(null);
    pendingEnterRef.current = null;
    const result = await watchAd(accessToken);
    if (result.ok === false) {
      if (result.reason === 'cooldown') {
        const minutes = Math.ceil(result.retryAfterSeconds / 60);
        Alert.alert('Ad Cooldown', `Watch another ad in about ${minutes} min.`);
      } else {
        Alert.alert('Watch Ad', 'Something went wrong. Please try again.');
      }
      return;
    }
    Alert.alert('Ad Reward', `+${result.tokensAwarded} Token`);
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
  const handleAutoMatch = (
    tier: MatchmakingTier,
    liveMode: 'STANDARD' | 'LIVE' = 'STANDARD',
    options: { pin?: string; createPrivate?: boolean; forceNew?: boolean } = {},
  ) => {
    setMmStatus('queued');
    setMatchmakingError(null);
    setMmTier(tier);
    setMmSeats([]);
    const socket = io(SERVER_URL, { transports: ['websocket'], reconnection: false });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Bug C fix (2026-07-17): ส่ง avatarUrl ไปด้วย — server เก็บลง Seat แล้วส่งต่อให้ผู้เล่นคนอื่นเห็น
      // avatar กันใน round_start (เดิมไม่เคยส่ง เลยมีแต่ userName แต่ไม่มี avatar ของคนอื่นเลย)
      if (options.createPrivate) {
        socket.emit('room_create_private', { tier, userId, userName: displayName, pin: options.pin, accessToken });
      } else {
        socket.emit('room_auto_match', { tier, userId, userName: displayName, avatarUrl: profile?.avatar_url ?? undefined, liveMode, allowLiveTables, pin: options.pin, forceNew: options.forceNew, accessToken });
      }
    });

    socket.on('room_created', (data: { room: any }) => {
      setMmRoomId(data.room.roomId);
      setMmSeats(data.room.seats);
      setMmTimeoutAt(data.room.timeoutAt);
      setMmWaitStage(data.room.waitStage ?? null);
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

    // Sprint 2 (Boss Monarch 1v1) -> Batch 3A Task 1: server เจอ Monarch ตอน roll เข้า A+/High Noble
    // เดิม redirect ทันที (ผู้เล่นจับได้ว่าเจอ Monarch จากความเร็วเข้าเกม พัง fake-out) — ตอนนี้เข้าสู่
    // Decoy Matchmaking ก่อนเสมอ (ดู startMonarchDecoy) ตัด socket จริงทิ้งทันที (จังหวะเดียวกับเดิม
    // เป๊ะ — เลือกตอนเริ่ม decoy ไม่ใช่ตอนจบ เพราะไม่มีอะไรต้องคุยกับ server ระหว่าง decoy เลย ปล่อย
    // socket ค้างไว้เฉยๆ จะเปลืองทรัพยากรฟรีๆ + ต้องกัน stray event ที่ไม่เกี่ยวข้องมาแทรกโดยไม่จำเป็น)
    socket.on('monarch_encounter', (data: { roomId: string }) => {
      socket.disconnect();
      fadeOutBgm();
      startMonarchDecoy(data.roomId);
    });

    socket.on('room_error', (data: { code?: string; message: string }) => {
      setMmStatus('idle');
      const reason = data.code ?? data.message;
      setMatchmakingError(
        reason === 'INSUFFICIENT_TOKENS'
          ? 'A player does not have enough tokens for the High Noble buy-in.'
          : reason === 'ACTIVE_MATCH_EXISTS'
            ? 'A player still has an unfinished match. Please finish or recover that match first.'
            : data.message || 'Could not join the table. Please try again.',
      );
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
  const handleEnterHighNoble = () => isVip ? setShowLiveDialog(true) : handleAutoMatch('highNoble');

  const openPrivateDialog = (mode: 'CREATE' | 'JOIN', tier: MatchmakingTier) => {
    setRoomPin('');
    setPrivateUsesPin(mode === 'JOIN');
    setMatchmakingError(null);
    setPrivateDialog({ mode, tier });
  };

  const submitPrivateDialog = () => {
    if (!privateDialog) return;
    const needsPin = privateDialog.mode === 'JOIN' || privateUsesPin;
    if (needsPin && !/^\d{4}$/.test(roomPin)) {
      setMatchmakingError('PIN must contain exactly 4 digits.');
      return;
    }
    const { mode, tier } = privateDialog;
    const clientTier: Tier = tier === 'highNoble' ? 'high_noble' : 'adept';
    setPrivateDialog(null);
    runBuyInGate(clientTier, () => {
      if (mode === 'JOIN') handleAutoMatch(tier, 'STANDARD', { pin: roomPin });
      else if (privateUsesPin) handleAutoMatch(tier, 'STANDARD', { pin: roomPin, createPrivate: true });
      else handleAutoMatch(tier, 'STANDARD', { forceNew: true });
    });
  };

  // แทนที่ตำแหน่งเดิมของ Tier D: Demo (placeholder implemented:false ไม่เคยเล่นได้จริง — ดู audit)
  // เปิด Onboarding ตรงๆ ไม่ผ่าน Tier system แล้ว
  const handleHowToPlay = () => router.push('/(auth)/onboarding');

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

  // ── Lobby Subscribe (tierEligibility preview — ยังไม่มี UI ใช้จริง แค่เก็บ state ไว้ตรวจสอบ) ──
  // Socket แยกจาก socketRef ด้านบน (ตัวนั้นเป็น matchmaking socket แบบ transient เปิดเฉพาะตอนกด Play
  // แล้ว disconnect ทันทีที่ match ได้) — ตัวนี้ค้างอยู่ตลอดที่อยู่หน้า Lobby เพื่อรับ lobby:tables
  // payload ที่ตอนนี้พก tierEligibility (Token/Days/Skill gate ต่อ Tier) มาด้วยจาก lobbySocket.ts
  const lobbySocketRef = useRef<Socket | null>(null);
  const [tierEligibility, setTierEligibility] = useState<Record<string, {
    tokenOk: boolean; daysOk: boolean; skillOk: boolean; unlocked: boolean; daysRemaining?: number;
  }> | null>(null);

  useEffect(() => {
    if (!userId) return; // Lobby อยู่ใต้ auth guard เสมอ แต่กันไว้เผื่อ userId ยังไม่ hydrate ทัน
    const lobbySocket = io(SERVER_URL, { transports: ['websocket'], reconnection: false });
    lobbySocketRef.current = lobbySocket;

    lobbySocket.on('connect', () => {
      // tierEligibility เป็นข้อมูลระดับ user ไม่ใช่ระดับ tier — ค่า tier ที่ส่งไปแค่กำหนดว่า subscribe
      // room lobby:{tier} ไหน (ยังไม่มีจุดใช้จริงของ table list ส่วนนี้) เลือก 'adept' เพราะเป็น Tier
      // แรกที่มี Progression Gate จริง
      lobbySocket.emit('lobby:subscribe', { tier: 'adept', userId, accessToken });
    });

    lobbySocket.on('lobby:tables', (data: { tier: string; tables: any[]; tierEligibility?: Record<string, any>; vipPlusAccess?: { visible?: boolean } }) => {
      setTierEligibility(data.tierEligibility ?? null);
      console.log('[Lobby] tierEligibility:', data.tierEligibility);
    });
    lobbySocket.on('spectator:tables', (tables: ActiveTableSummary[]) => setActiveTables(tables));
    lobbySocket.emit('spectator:list', { tierId: 'A_PLUS' });

    return () => { lobbySocket.disconnect(); lobbySocketRef.current = null; };
  }, [userId, accessToken]);

  const renderTierButton = (tier: Tier, fullWidth: boolean) => {
    const cfg = TIER_CONFIG[tier];
    const locked = !isEligible(tier, tokenBalance, profile?.tier_unlocked_max);
    const isSelected = selected === tier;
    const buyInKey = TIER_TO_BUYIN_KEY[tier];
    return (
      <TouchableOpacity
        key={tier}
        disabled={locked}
        onPress={() => selectTier(tier)}
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
          {tier === 'grandmaster' && <Text style={s.buyInLabel}>Buy-in : 20 Crown</Text>}
        </View>
        {!cfg.implemented && <Text style={s.comingSoonTag}>Coming Soon</Text>}
      </TouchableOpacity>
    );
  };

  const sectionTitle =
    selected === 'all' ? 'All Tiers'
    : selected ? TIER_CONFIG[selected].label
    : 'Select a Tier above to view tables';

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

      {matchmakingError && !privateDialog && (
        <TouchableOpacity style={s.errorBanner} onPress={() => setMatchmakingError(null)}>
          <Text style={s.toastText}>{matchmakingError}</Text>
        </TouchableOpacity>
      )}

      <Modal transparent visible={privateDialog !== null} animationType="fade" onRequestClose={() => setPrivateDialog(null)}>
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateIcon}>{privateDialog?.mode === 'CREATE' ? '🔐' : '🔢'}</Text>
            <Text style={s.celebrateTitle}>{privateDialog?.mode === 'CREATE' ? 'OPEN VIP TABLE' : 'JOIN PRIVATE TABLE'}</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', fontWeight: '400', lineHeight: 20 }]}>
              {privateDialog?.mode === 'CREATE'
                ? 'Open a dedicated multiplayer table. Choose whether players need a 4-digit PIN.'
                : 'Enter the same 4-digit PIN set by the VIP table host.'}
            </Text>
            {privateDialog?.mode === 'CREATE' && (
              <View style={s.pinToggleRow}>
                <View style={{ flex: 1 }}><Text style={s.pinLabel}>Require PIN</Text><Text style={s.pinHelp}>{privateUsesPin ? 'Only players with this PIN can join' : 'Open to normal Auto-match players'}</Text></View>
                <Switch value={privateUsesPin} onValueChange={value => { setPrivateUsesPin(value); setMatchmakingError(null); }} trackColor={{ true: COLOR.goldPrimary }} />
              </View>
            )}
            {(privateDialog?.mode === 'JOIN' || privateUsesPin) && (
              <TextInput
                value={roomPin}
                onChangeText={text => { setRoomPin(text.replace(/\D/g, '').slice(0, 4)); setMatchmakingError(null); }}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLOR.textTertiary}
                accessibilityLabel="Private table four digit PIN"
                style={s.pinInput}
              />
            )}
            {matchmakingError && <Text style={s.pinError}>{matchmakingError}</Text>}
            {/* Batch 3 (VIP-01) — local override เฉพาะปุ่มคู่นี้ (flex:1 ให้กว้างเท่ากัน) ไม่แก้ s.celebrateBtn
                กลางที่ dialog อื่นในไฟล์นี้ใช้ร่วมด้วย (Not Enough Tokens / Entry Buy-in / Table Closed / Broadcast) */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.celebrateBtn, { flex: 1, borderColor: COLOR.red }]} onPress={() => { setPrivateDialog(null); setMatchmakingError(null); }}>
                <Text style={[s.celebrateBtnTxt, { color: COLOR.red }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.celebrateBtn, { flex: 1, backgroundColor: COLOR.goldPrimary }]} onPress={submitPrivateDialog}>
                <Text style={[s.celebrateBtnTxt, { color: COLOR.bgPrimary }]}>{privateDialog?.mode === 'CREATE' ? 'OPEN TABLE' : 'JOIN TABLE'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={showLiveDialog} animationType="fade" onRequestClose={() => setShowLiveDialog(false)}>
        <View style={s.celebrateOverlay}>
          <View style={s.celebrateCard}>
            <Text style={s.celebrateTitle}>BROADCAST THIS MATCH?</Text>
            <Text style={[s.celebrateTierName, { textAlign: 'center', fontWeight: '400', lineHeight: 21 }]}>
              Allow other players to watch this match with a 30-second delay.{`\n\n`}Hidden cards and private actions will never be shown.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.celebrateBtn} onPress={() => { setShowLiveDialog(false); handleAutoMatch('highNoble', 'STANDARD'); }}>
                <Text style={s.celebrateBtnTxt}>STANDARD</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.celebrateBtn, { backgroundColor: COLOR.red, borderColor: COLOR.red }]} onPress={() => { setShowLiveDialog(false); handleAutoMatch('highNoble', 'LIVE'); }}>
                <Text style={[s.celebrateBtnTxt, { color: '#fff' }]}>● GO LIVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Header (fixed) ─── */}
      <View style={[s.headerRow, { paddingLeft: shopBtnLeftGap }]}>
        <MenuButton icon="profile" label="Profile" size="sm" onPress={() => router.push('/(home)/profile')} />
        <Text style={s.header}>TriplePoker Lobby</Text>
      </View>

      {/* ─── Menu Bar (fixed) — Feedback A2: เหลือ 4 ปุ่ม กระจายเต็มความกว้าง ไม่ scroll แล้ว ─── */}
      <View style={s.menuBar}>
        <MenuButton icon="shop" label="Shop" size="sm" onPress={handleShopNav} vipShimmer={isVip} />
        <MenuButton icon="hall_of_fame" label="Hall of Fame" size="sm" onPress={() => router.push('/(home)/hall-of-fame')} vipShimmer={isVip} />
        <MenuButton icon="friends" label="Top10" size="sm" onPress={() => router.push('/(home)/top10')} vipShimmer={isVip} />
        <MenuButton icon="ranking" label="Ranking" size="sm" onPress={() => router.push('/(home)/stats')} vipShimmer={isVip} />
      </View>

      {/* Tier selector: D / C+B / A+A+ / S / S+. */}
      <ScrollView style={s.tierSelector} contentContainerStyle={{ gap: 6 }} nestedScrollEnabled>
        <TouchableOpacity style={[s.tierBtn, s.tierBtnFull]} onPress={handleHowToPlay}>
          <View style={[s.badgeDot, { backgroundColor: COLOR.goldPrimary }]} /><Text style={s.tierBtnTxt}>[D] Demo (How to Play)</Text>
        </TouchableOpacity>
        {TIER_ROWS.map((row, ri) => <View key={ri} style={s.tierRow}>{row.map(tier => renderTierButton(tier, true))}</View>)}
      </ScrollView>

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
              <Text style={s.enterBtnTxt}>▶ Play (Conquest Mode: 9 Sentinels)</Text>
            </TouchableOpacity>
          )}

          {selected === 'grandmaster' && (
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={s.enterBtn} onPress={handleEnterGrandmaster}>
                <Text style={s.enterBtnTxt}>▶ Play (Arena Auto-Match)</Text>
              </TouchableOpacity>
              <Text style={s.arenaMatchComposition}>2-3 Human + Boss AI</Text>
              <Text style={s.detailText}>Required reserve: 20 Crown · Your balance: {profile?.crown_balance ?? 0} Crown</Text>
              <TouchableOpacity style={s.enterBtn} onPress={handleEnterSovereign}>
                <Text style={s.enterBtnTxt}>♛ Sovereign Monthly Event</Text>
              </TouchableOpacity>
            </View>
          )}

          {selected === 'high_noble' && mmStatus === 'idle' && (
            <>
              <View style={s.tierDetail}>
                <Text style={s.detailTitle}>HIGH NOBLE — TIER A+</Text>
                {/* มติลุงเยาะ — ห้ามสปอยล์ชื่อ Monarch ก่อนผู้เล่นได้เจอจริง (card นี้เห็นได้ตั้งแต่ยังไม่ต่อคิวเลย) */}
                <Text style={s.detailText}>Ante: 250 / 500 / 1,000{`\n`}Players: 3 Humans + Boss AI{`\n`}Boss Encounter: Four Gods / Hidden Boss{`\n`}Auto-Sort Fee: 50%</Text>
              </View>
              <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('high_noble', handleEnterHighNoble)}>
                <Text style={s.enterBtnTxt}>ENTER HIGH NOBLE</Text>
              </TouchableOpacity>
              <View style={s.liveSetting}><View style={{ flex: 1 }}><Text style={s.detailTitle}>Allow matching into Live Tables</Text><Text style={s.detailText}>Default OFF · public cards only · 30s delay</Text></View><Switch value={allowLiveTables} onValueChange={toggleAllowLive} trackColor={{ true: COLOR.red }} /></View>
              <View style={s.privateActions}>
                {isVip && <TouchableOpacity style={s.privateBtn} onPress={() => openPrivateDialog('CREATE', 'highNoble')}><Text style={s.privateBtnText}>🔐 OPEN VIP TABLE</Text></TouchableOpacity>}
                {isVip && <TouchableOpacity style={s.privateBtn} onPress={() => openPrivateDialog('JOIN', 'highNoble')}><Text style={s.privateBtnText}>🔢 JOIN WITH PIN</Text></TouchableOpacity>}
              </View>
            </>
          )}

          {selected === 'adept' && mmStatus === 'idle' && (
            <>
              <TouchableOpacity style={s.enterBtn} onPress={() => runBuyInGate('adept', handleAutoMatchAdept)}>
                <Text style={s.enterBtnTxt}>▶ Play (Auto-Match 2 Human + AI)</Text>
              </TouchableOpacity>
              <View style={s.privateActions}>
                {isVip && <TouchableOpacity style={s.privateBtn} onPress={() => openPrivateDialog('CREATE', 'adept')}><Text style={s.privateBtnText}>🔐 OPEN VIP TABLE</Text></TouchableOpacity>}
                {isVip && <TouchableOpacity style={s.privateBtn} onPress={() => openPrivateDialog('JOIN', 'adept')}><Text style={s.privateBtnText}>🔢 JOIN WITH PIN</Text></TouchableOpacity>}
              </View>
            </>
          )}

          {/* Batch 3A Task 1: เพิ่ม !monarchDecoyActive กันโชว์ซ้อนกับ decoy block ด้านล่าง — ไม่แตะ
              เงื่อนไข/state เดิมของ queue จริงเลยแม้แต่จุดเดียว แค่เพิ่มเงื่อนไขต่อท้าย */}
          {(selected === 'adept' || selected === 'high_noble') && mmStatus === 'queued' && mmTier === (selected === 'high_noble' ? 'highNoble' : 'adept') && !monarchDecoyActive && (
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

          {/* Batch 3A Task 1 — Decoy Matchmaking: UI เหมือน real queue เป๊ะ (สายตาแยกไม่ออก) แต่อ่านจาก
              monarchDecoySeats (fake ล้วน, ไม่แตะ mmSeats/server เลย) แสดงเฉพาะ High Noble เพราะ Monarch
              redirect มาจาก High Noble เท่านั้น */}
          {selected === 'high_noble' && monarchDecoyActive && (
            <View style={{
              ...glassPanel,
              padding: 16, alignItems: 'center', marginBottom: 12,
            }}>
              <Text style={{ color: COLOR.goldPrimary, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                🔍 Finding players...
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {[0, 1, 2, 3].map(i => {
                  const seat = monarchDecoySeats[i];
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
              <TouchableOpacity onPress={handleCancelMonarchDecoy}
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
              Select a Tier above to start playing
            </Text>
          )}

          {!selected && (
            <Text style={{ color: COLOR.textTertiary, fontSize: 12, ...textOnGlass }}>— No Tier selected —</Text>
          )}

          <TouchableOpacity style={s.activeHeader} onPress={toggleActiveTables}>
            <Text style={s.detailTitle}>LIVE & ACTIVE TABLES</Text><Text style={s.detailTitle}>{activeTablesExpanded ? '▼' : '▶'}</Text>
          </TouchableOpacity>
          {!activeTablesExpanded && <Text style={s.activeCount}>{activeTables.length} tables currently playing</Text>}
          {activeTablesExpanded && activeTables.filter(table => selected === 'high_noble' || selected === 'all').map(table => (
            <View key={table.broadcastId} style={s.liveCard}>
              <Text style={s.liveTitle}>● {table.liveStatus} · {table.tierName.toUpperCase()}</Text>
              <Text style={s.detailText}>{table.bossName ?? 'Boss Encounter'}{`\n`}Round {table.round ?? 0} / {table.totalRounds ?? 5}{`\n`}{table.viewerCount} / {table.viewerLimit} Watching</Text>
              <TouchableOpacity disabled={!table.canWatch} style={[s.watchBtn, !table.canWatch && { opacity: 0.4 }]} onPress={() => router.push(`/game/spectator?broadcastId=${table.broadcastId}` as any)}>
                <Text style={s.enterBtnTxt}>{table.canWatch ? 'WATCH' : table.liveStatus}</Text>
              </TouchableOpacity>
            </View>
          ))}
          {activeTablesExpanded && activeTables.length === 0 && <Text style={s.activeCount}>No Live Tables in this tier.</Text>}
        </ScrollView>
      </View>

      <View style={s.footer}><Image source={studioLogo} style={s.footerLogo} resizeMode="contain" /><Text style={s.footerSub}>The Sage Unicorn Studio Co., Ltd.</Text></View>

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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, marginTop: 8, marginBottom: 12 }, // เดิม marginTop:50 hardcode ชดเชย status bar เอง — VipBackground มี SafeAreaView(top) ให้แล้ว เหลือแค่ breathing room ปกติ · เดิม space-between (ปุ่ม Profile ซ้าย, header ขวา) เปลี่ยนเป็นชิดซ้ายทั้งคู่
  header: { color: COLOR.goldPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel_700Bold', ...textOnGlass },

  menuBar: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginBottom: 10 }, // Feedback A2: เหลือ 4 ปุ่ม กระจายเต็มความกว้างแทน scroll
  tierSelector: { maxHeight: 164, marginBottom: 10 },

  // Scroll Zone กิน flex:3 ของพื้นที่ที่เหลือ (~75%), Fixed Bottom Block กิน flex:1 (~25%)
  scrollZone: { flex: 1, minHeight: 0, overflow: 'hidden' },
  sectionTitle: { color: COLOR.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 6, ...textOnGlass }, // ลอยตรงบนพื้นหลัง ไม่มี panel รอง

  enterBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  enterBtnTxt: { color: COLOR.bgPrimary, fontWeight: '700', fontSize: 13 },
  tierDetail: { ...glassPanelDense, padding: 14, marginBottom: 10 },
  detailTitle: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  detailText: { color: COLOR.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 6 },
  arenaMatchComposition: { color: COLOR.goldDark, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: -3 },
  liveSetting: { ...glassPanel, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privateActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  privateBtn: { flex: 1, borderWidth: 1, borderColor: COLOR.goldPrimary, backgroundColor: 'rgba(255,215,106,0.08)', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  privateBtnText: { color: COLOR.goldPrimary, fontSize: 10, fontWeight: '800' },
  pinToggleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 },
  pinLabel: { color: COLOR.textPrimary, fontSize: 13, fontWeight: '800' },
  pinHelp: { color: COLOR.textSecondary, fontSize: 9, marginTop: 3 },
  pinInput: { width: 180, marginTop: 14, borderWidth: 1.5, borderColor: COLOR.goldPrimary, borderRadius: 10, color: COLOR.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: 12, textAlign: 'center', paddingVertical: 10, paddingLeft: 12, backgroundColor: COLOR.bgPrimary },
  pinError: { color: COLOR.red, fontSize: 10, marginTop: 10, textAlign: 'center' },
  errorBanner: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 1001, backgroundColor: 'rgba(80,20,20,0.96)', borderWidth: 1.5, borderColor: COLOR.red, borderRadius: 10, padding: 12 },
  activeHeader: { ...glassPanelDense, padding: 13, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeCount: { color: COLOR.textTertiary, fontSize: 11, textAlign: 'center', paddingVertical: 12 },
  liveCard: { ...glassPanelDense, padding: 14, marginTop: 8, borderColor: COLOR.red },
  liveTitle: { color: COLOR.red, fontSize: 12, fontWeight: '900' },
  watchBtn: { backgroundColor: COLOR.goldPrimary, borderRadius: 7, paddingVertical: 9, alignItems: 'center', marginTop: 10 },

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
  footerText: { color: COLOR.goldPrimary, fontSize: 12, fontWeight: '800', letterSpacing: 1, fontFamily: 'Cinzel_700Bold', ...textOnGlass }, // ลอยตรงบนพื้นหลัง ไม่มี panel รอง
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
