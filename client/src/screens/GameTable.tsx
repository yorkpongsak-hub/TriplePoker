/**
 * GameTable.tsx -- v5
 * แก้ไขจาก v4:
 *   1. P2/P4 sideSeat -- คืน position:absolute + ปรับ column width = 72px (ความสูงไพ่หลัง rotate)
 *   2. Auto Sort -- disable หลังกด, re-enable เมื่อ user swap ไพ่
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Image, Platform, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { autoSort } from '../utils/autoSort';
import { router } from 'expo-router';

// -- Assets
const studioLogo  = require('../../assets/images/sage_unicorn_logo_transparent.png');
const cardBackImg = require('../../assets/images/card_back_default.png')
const tableImg    = require('../../assets/images/table_default.png');
const tripleSpade = require('../../assets/images/triple_poker_icon.png');

// -- Card image map
const CARD_IMG: Record<string, any> = {
  as:  require('../../assets/cards/classic/as.png'),
  '2s': require('../../assets/cards/classic/2s.png'),
  '3s': require('../../assets/cards/classic/3s.png'),
  '4s': require('../../assets/cards/classic/4s.png'),
  '5s': require('../../assets/cards/classic/5s.png'),
  '6s': require('../../assets/cards/classic/6s.png'),
  '7s': require('../../assets/cards/classic/7s.png'),
  '8s': require('../../assets/cards/classic/8s.png'),
  '9s': require('../../assets/cards/classic/9s.png'),
  '10s': require('../../assets/cards/classic/10s.png'),
  js:  require('../../assets/cards/classic/js.png'),
  qs:  require('../../assets/cards/classic/qs.png'),
  ks:  require('../../assets/cards/classic/ks.png'),
  ah:  require('../../assets/cards/classic/ah.png'),
  '2h': require('../../assets/cards/classic/2h.png'),
  '3h': require('../../assets/cards/classic/3h.png'),
  '4h': require('../../assets/cards/classic/4h.png'),
  '5h': require('../../assets/cards/classic/5h.png'),
  '6h': require('../../assets/cards/classic/6h.png'),
  '7h': require('../../assets/cards/classic/7h.png'),
  '8h': require('../../assets/cards/classic/8h.png'),
  '9h': require('../../assets/cards/classic/9h.png'),
  '10h': require('../../assets/cards/classic/10h.png'),
  jh:  require('../../assets/cards/classic/jh.png'),
  qh:  require('../../assets/cards/classic/qh.png'),
  kh:  require('../../assets/cards/classic/kh.png'),
  ad:  require('../../assets/cards/classic/ad.png'),
  '2d': require('../../assets/cards/classic/2d.png'),
  '3d': require('../../assets/cards/classic/3d.png'),
  '4d': require('../../assets/cards/classic/4d.png'),
  '5d': require('../../assets/cards/classic/5d.png'),
  '6d': require('../../assets/cards/classic/6d.png'),
  '7d': require('../../assets/cards/classic/7d.png'),
  '8d': require('../../assets/cards/classic/8d.png'),
  '9d': require('../../assets/cards/classic/9d.png'),
  '10d': require('../../assets/cards/classic/10d.png'),
  jd:  require('../../assets/cards/classic/jd.png'),
  qd:  require('../../assets/cards/classic/qd.png'),
  kd:  require('../../assets/cards/classic/kd.png'),
  ac:  require('../../assets/cards/classic/ac.png'),
  '2c': require('../../assets/cards/classic/2c.png'),
  '3c': require('../../assets/cards/classic/3c.png'),
  '4c': require('../../assets/cards/classic/4c.png'),
  '5c': require('../../assets/cards/classic/5c.png'),
  '6c': require('../../assets/cards/classic/6c.png'),
  '7c': require('../../assets/cards/classic/7c.png'),
  '8c': require('../../assets/cards/classic/8c.png'),
  '9c': require('../../assets/cards/classic/9c.png'),
  '10c': require('../../assets/cards/classic/10c.png'),
  jc:  require('../../assets/cards/classic/jc.png'),
  qc:  require('../../assets/cards/classic/qc.png'),
  kc:  require('../../assets/cards/classic/kc.png'),
};

const CW = 50;
const CH = 72;
const OVERLAP = -37;

// ไพ่ rotate 90/270: width กลายเป็น CH=72, height กลายเป็น CW=50
// column ต้องกว้าง CH=72 พอดีให้เห็นหลังไพ่ครบ
const SIDE_COL_W = 72;

interface CardData { id: string; key: string; }

// -- Demo: ไพ่ User 11 ใบ
const INIT_PILES: [CardData[], CardData[], CardData[]] = [
  [{ id:'c1', key:'ah' }, { id:'c2', key:'ks' }, { id:'c3', key:'qd' }],
  [{ id:'c4', key:'jc' }, { id:'c5', key:'10h' }, { id:'c6', key:'9s' }],
  [{ id:'c7', key:'8d' }, { id:'c8', key:'7c' }, { id:'c9', key:'6h' }, { id:'c10', key:'5s' }, { id:'c11', key:'4d' }],
];

// -- Community: ไม่ซ้ำกับ INIT_PILES
const COMM = [
  { pile: 'PILE 1', k1: '2h', k2: '3d' },
  { pile: 'PILE 2', k1: '4c', k2: '5h' },
  { pile: 'PILE 3', k1: '6s', k2: 'kd' },
];

// =================================================================
// SERVER LOG
// =================================================================
const NAMES  = ['SomchaiX','NongBeer','JaoPoker','WinWin99','ThaiDragon','LuckyAce','KingCard','PokerPro7'];
const TABLES = ['Table #1','Table #3','Table #7','VIP Room'];
const rnd = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const ServerLog = React.memo(() => {
  interface LogEntry { id: number; icon: string; text: string; time: string; }
  const [logs, setLogs]     = useState<LogEntry[]>([]);
  const [online, setOnline] = useState(247);
  const idRef   = useRef(0);
  const dotAnim = useRef(new Animated.Value(1)).current;

  const addLog = useCallback(() => {
    const n = rnd(NAMES), t = rnd(TABLES);
    const evts = [
      { icon: '🟢', text: `${n} joined the server` },
      { icon: '🎮', text: `${n} entered ${t}` },
      { icon: '🏆', text: `${n} won +${50 + Math.floor(Math.random() * 350)} tokens` },
      { icon: '💀', text: `${n} lost -${50 + Math.floor(Math.random() * 150)} tokens` },
      { icon: '🔮', text: `${n} won a Blind Auction!` },
      { icon: '💎', text: `${n} upgraded to VIP` },
    ];
    const ev  = rnd(evts);
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    setLogs(prev => {
      const next = [...prev, { id: ++idRef.current, ...ev, time }];
      return next.length > 8 ? next.slice(-8) : next;
    });
  }, []);

  useEffect(() => {
    for (let i = 0; i < 4; i++) setTimeout(() => addLog(), i * 200);
    let t: ReturnType<typeof setTimeout>;
    const sched = () => { t = setTimeout(() => { addLog(); sched(); }, 1500 + Math.random() * 2000); };
    sched();
    const oi = setInterval(() => setOnline(180 + Math.floor(Math.random() * 140)), 15000);
    const p = Animated.loop(Animated.sequence([
      Animated.timing(dotAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      Animated.timing(dotAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]));
    p.start();
    return () => { clearTimeout(t); clearInterval(oi); p.stop(); };
  }, [addLog]);

  return (
    <View style={s.logZone}>
      <View style={[StyleSheet.absoluteFill as any, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <Image source={tripleSpade} style={{ width: 160, height: 160, opacity: 0.22 }} resizeMode="contain" />
      </View>
      <View style={s.logHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Animated.View style={[s.liveDot, { opacity: dotAnim }]} />
          <Text style={s.logTitle}>SERVER ACTIVITY</Text>
        </View>
        <Text style={s.onlineTxt}>🟢 {online} online</Text>
      </View>
      <View style={s.logList}>
        {logs.map(l => (
          <View key={l.id} style={s.logBubble}>
            <Text style={{ fontSize: 9 }}>{l.icon}</Text>
            <Text style={s.logTxt} numberOfLines={1}>{l.text}</Text>
            <Text style={s.logTime}>{l.time}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

// =================================================================
// MAIN COMPONENT
// =================================================================
const GameTable: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isWeb  = Platform.OS === 'web';

  const [piles, setPiles]         = useState<[CardData[], CardData[], CardData[]]>(INIT_PILES);
  const [selected, setSelected]   = useState<{ pi: number; ci: number } | null>(null);
  const [isReady, setIsReady]     = useState(false);
  // [แก้ #2] Auto Sort state
  const [sortDone, setSortDone]   = useState(false);


  const timeLeft   = 45;
  const timeTotal  = 60;
  const timerRatio = timeLeft / timeTotal;
  const tbarColor  = timerRatio <= 0.10 ? '#cc2222' : timerRatio <= 0.30 ? '#c9a84c' : '#3daa4a';

  // -- Card swap: re-enable Auto Sort เมื่อ user swap
  const handleCardPress = useCallback((pi: number, ci: number) => {
    if (isReady) return;
    if (!selected) {
      setSelected({ pi, ci });
    } else {
      if (selected.pi === pi && selected.ci === ci) { setSelected(null); return; }
      const np = piles.map(p => [...p]) as [CardData[], CardData[], CardData[]];
      const tmp = np[selected.pi][selected.ci];
      np[selected.pi][selected.ci] = np[pi][ci];
      np[pi][ci] = tmp;
      setPiles(np);
      setSelected(null);
      // re-enable Auto Sort เมื่อไพ่ถูกสลับ
      setSortDone(false);
    }
  }, [isReady, selected, piles]);

  // -- Card back
  const CardBack: React.FC<{ w: number; h: number; ml?: number }> = ({ w, h, ml = 0 }) => (
    <View style={[s.cardBack, { width: w, height: h, borderRadius: w * 0.14, marginLeft: ml }]}>
      <Image source={cardBackImg} style={{ width: w, height: h }} resizeMode="cover" />
    </View>
  );

  // -- Avatar Bubble placeholder
  const AvatarBubble: React.FC<{ emoji: string; size?: number }> = ({ emoji, size = 36 }) => (
    <View style={[s.avatarBubble, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );

  // -- AI piles gap ลดครึ่งหนึ่ง
  const AIPiles = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {([3, 3, 5] as number[]).map((cnt, pi) => (
        <React.Fragment key={pi}>
          {pi > 0 && <View style={{ width: 4 }} />}
          <View style={{ flexDirection: 'row' }}>
            {Array.from({ length: cnt }).map((_, ci) => (
              <CardBack key={ci} w={50} h={72} ml={ci === 0 ? 0 : -37} />
            ))}
          </View>
        </React.Fragment>
      ))}
    </View>
  );

  // -- [แก้ #1] Side seat
  // sideSeatInner คืน position:absolute
  // P2 (270deg): anchor ขวาของ column → right:0
  // P4 (90deg):  anchor ซ้ายของ column → left:0
  const SideSeat: React.FC<{ rot: '270deg' | '90deg' }> = ({ rot }) => {
    // 5: 50+4x13=102, 3: 76, gap 8 => innerW=262, innerH=72
    // ขยับขึ้น 80% ของ CH(72)=57px → offset = 95-57 = 38
    const offset = 38;
    return (
      <View style={s.sideSeatWrap}>
        <View
          style={[
            s.sideSeatInner,
            { transform: [{ rotate: rot }], marginTop: offset },
          ]}
        >
          {([5, 3, 3] as number[]).map((cnt, pi) => (
            <React.Fragment key={pi}>
              {pi > 0 && <View style={{ width: 4 }} />}
              <View style={{ flexDirection: 'row' }}>
                {Array.from({ length: cnt }).map((_, ci) => (
                  <CardBack key={ci} w={50} h={72} ml={ci === 0 ? 0 : -37} />
                ))}
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  // -- Community row
  const CommRow: React.FC<{ pile: string; k1: string; k2: string }> = ({ pile, k1, k2 }) => (
    <View style={{ alignItems: 'flex-start', gap: 2 }}>
      <Text style={s.pileLabel}>{pile}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={s.commCard}>
          {CARD_IMG[k1] ? <Image source={CARD_IMG[k1]} style={{ width: 50, height: 72 }} resizeMode="cover" /> : null}
        </View>
        <View style={s.commCard}>
          {CARD_IMG[k2] ? <Image source={CARD_IMG[k2]} style={{ width: 50, height: 72 }} resizeMode="cover" /> : null}
        </View>
      </View>
    </View>
  );

  // -- User face card
  const FaceCard: React.FC<{ card: CardData; pi: number; ci: number; first: boolean }> = ({ card, pi, ci, first }) => {
    const isSel = selected?.pi === pi && selected?.ci === ci;
    return (
      <TouchableOpacity
        onPress={() => handleCardPress(pi, ci)}
        activeOpacity={0.85}
        style={[
          s.userCard,
          !first && { marginLeft: OVERLAP },
          isSel && s.userCardSel,
          { zIndex: ci },
        ]}
      >
        {CARD_IMG[card.key]
          ? <Image source={CARD_IMG[card.key]} style={{ width: CW, height: CH }} resizeMode="cover" />
          : <Text style={{ fontSize: 8 }}>{card.key}</Text>
        }
      </TouchableOpacity>
    );
  };

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={[s.root, isWeb && s.webOuter]}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <View style={[s.gameContainer, isWeb && s.webFrame]}>

        <View style={s.gameArea}>

          <View style={StyleSheet.absoluteFill as any} pointerEvents="none">
            <Image source={tableImg} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <View style={[StyleSheet.absoluteFill as any, s.logoWatermark]} pointerEvents="none">
            <Image source={tripleSpade} style={{ width: 120, height: 120, opacity: 0.07 }} resizeMode="contain" />
          </View>

          {/* TOP BAR */}
          <View style={[s.topBar, { paddingTop: isWeb ? 12 : insets.top + 4 }]}>
            <Image source={studioLogo} style={s.studioLogo} resizeMode="contain" />
            <View style={s.tierBadge}><Text style={s.tierText}>BEGINNER</Text></View>
            <View style={s.potBadge}><Text style={s.potText}>🪙 320</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                style={s.devBtn}
                onPress={() => router.push('/test/deal')}
              >
                <Text style={s.devBtnTxt}>🃏 DEV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.devBtn, { borderColor: 'rgba(74,222,128,0.6)', backgroundColor: 'rgba(74,222,128,0.15)' }]}
                onPress={() => router.push('/test/live')}
              >
                <Text style={[s.devBtnTxt, { color: '#4ade80' }]}>▶ LIVE</Text>
              </TouchableOpacity>
              <Text style={s.timerText}>45</Text>
            </View>
          </View>

          {/* TIMER BAR */}
          <View style={s.tbarWrap}>
            <View style={s.tbarBg}>
              <View style={[s.tbarFill, { width: `${timerRatio * 100}%` as any, backgroundColor: tbarColor }]} />
            </View>
          </View>

          {/* AI SEAT */}
          <View style={s.aiSeat}>
            <View style={s.aiRow}>
              <AvatarBubble emoji="🤖" size={36} />
              <Text style={s.aiName}>BOSS AI</Text>
              <View style={s.statusBadge}><Text style={s.statusText}>Arranging...</Text></View>
            </View>
            <AIPiles />
          </View>

          {/* MAIN AREA */}
          <View style={s.mainArea}>

            {/* P2 LEFT */}
            <View style={s.sideCol}>
              <Text style={s.sideName}>P2</Text>
              <AvatarBubble emoji="👤" size={36} />
              <SideSeat rot="270deg" />
            </View>

            {/* COMMUNITY ZONE */}
            <View style={s.commWrap}>
              <View style={{ alignItems: 'center', gap: 3, marginBottom: 6, width: '100%' }}>
                <Text style={s.auctionLbl}>Auction</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={s.auctionCard}>
                    <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />
                  </View>
                  <View style={s.auctionCard}>
                    <Image source={cardBackImg} style={{ width: 50, height: 72 }} resizeMode="cover" />
                  </View>
                </View>
              </View>
              {COMM.map((c, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={{ height: 4 }} />}
                  <CommRow pile={c.pile} k1={c.k1} k2={c.k2} />
                </React.Fragment>
              ))}
            </View>

            {/* P4 RIGHT */}
            <View style={s.sideCol}>
              <Text style={s.sideName}>P4</Text>
              <AvatarBubble emoji="👤" size={36} />
              <SideSeat rot="90deg" />
            </View>

          </View>

          {/* USER AREA */}
          <View style={s.userArea}>
            <Text style={[s.swapHint, { opacity: selected ? 1 : 0 }]}>กดไพ่ใบที่ต้องการสลับตำแหน่ง</Text>
            <View style={s.userLabels}>
              {['Pile 1', 'Pile 2', 'Pile 3'].map(l => (
                <Text key={l} style={s.pileLabel}>{l}</Text>
              ))}
            </View>
            <View style={s.userPilesRow}>
              <AvatarBubble emoji="👤" size={40} />
              {piles.map((pile, pi) => (
                <React.Fragment key={pi}>
                  {pi > 0 && <View style={{ width: 5 }} />}
                  <View style={{ flexDirection: 'row' }}>
                    {pile.map((card, ci) => (
                      <FaceCard key={card.id} card={card} pi={pi} ci={ci} first={ci === 0} />
                    ))}
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* ACTION BAR */}
          <View style={s.actionBar}>
            {/* [แก้ #2] Auto Sort disable หลังกด */}
            <TouchableOpacity
              style={[s.btnSort, sortDone && s.btnSortDone]}
              disabled={sortDone}
              onPress={() => {
                const sorted = autoSort(
                  [...piles[0], ...piles[1], ...piles[2]],
                  {
                    pile1: [COMM[0].k1, COMM[0].k2],
                    pile2: [COMM[1].k1, COMM[1].k2],
                    pile3: [COMM[2].k1, COMM[2].k2],
                  }
                );
                setPiles(sorted);
                setSelected(null);
                setSortDone(true);
              }}
            >
              <Text style={s.btnSortTxt}>{sortDone ? 'Sorted' : 'Auto Sort'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btnReady, isReady && s.btnReadyDone]}
              onPress={() => setIsReady(true)}
            >
              <Text style={s.btnReadyTxt}>{isReady ? 'WAITING...' : 'READY ✓'}</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* SERVER LOG */}
        <ServerLog />

      </View>
    </View>
  );
};

// =================================================================
// STYLES
// =================================================================
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#0a0a0a' },
  webOuter:      { alignItems: 'center', justifyContent: 'center' },
  webFrame:      { width: 390, height: 780, borderRadius: 40, borderWidth: 3, borderColor: '#333', overflow: 'hidden' },
  gameContainer: { flex: 1, flexDirection: 'column' },
  gameArea:      { flex: 85, backgroundColor: '#6aaf7f', overflow: 'hidden', position: 'relative' },
  feltOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  logoWatermark: { alignItems: 'center', justifyContent: 'center' },

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 6, zIndex: 2 },
  studioLogo: { width: 28, height: 28, opacity: 0.9 },
  tierBadge:  { borderWidth: 1.5, borderColor: '#38bdf8', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(56,189,248,0.12)' },
  tierText:   { fontSize: 8, color: '#38bdf8', letterSpacing: 2, fontWeight: '800' },
  potBadge:   { borderWidth: 1, borderColor: 'rgba(201,168,76,.4)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,.4)' },
  potText:    { fontSize: 10, fontWeight: '700', color: '#c9a84c' },
  timerText:  { fontSize: 20, fontWeight: '700', color: '#fff', minWidth: 32, textAlign: 'right' },

  tbarWrap: { paddingHorizontal: 12, paddingBottom: 2, zIndex: 2 },
  tbarBg:   { height: 3, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' },
  tbarFill: { height: '100%' as any, borderRadius: 2 },

  aiSeat:      { paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center', gap: 4, zIndex: 2 },
  aiRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiAvatar:    { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(201,168,76,.35)', backgroundColor: 'rgba(201,168,76,.08)', alignItems: 'center', justifyContent: 'center' },
  avatarBubble: { backgroundColor: '#132019', borderWidth: 2, borderColor: '#c9a84c', alignItems: 'center', justifyContent: 'center', shadowColor: '#c9a84c', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 },
  userAreaTop:  { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  aiName:      { fontSize: 9, color: '#ff3333', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '800' },
  statusBadge: { borderWidth: 1, borderColor: 'rgba(74,154,90,.2)', backgroundColor: 'rgba(74,154,90,.1)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  statusText:  { fontSize: 7, color: '#4a9a5a' },

  cardBack: { backgroundColor: '#091808', borderWidth: 1, borderColor: 'rgba(201,168,76,.5)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  mainArea: { flex: 1, flexDirection: 'row', zIndex: 2 },

  // [แก้ #1] sideCol width = SIDE_COL_W (72px = CH ของไพ่หลัง rotate)
  sideCol:       { width: SIDE_COL_W, alignItems: 'center', paddingTop: 4, gap: 2 },
  sideName:      { fontSize: 9, color: '#ffffff', letterSpacing: 1, fontWeight: '700' },
  sideSeatWrap:  { flex: 1, width: SIDE_COL_W, overflow: 'visible', justifyContent: 'center', alignItems: 'center' },
  // position:absolute คืนมา ให้ rotate แสดงออกนอก bounds
  sideSeatInner: { flexDirection: 'row', alignItems: 'center' },

  commWrap:    { flex: 1, paddingLeft: 4, alignItems: 'flex-start', justifyContent: 'center', zIndex: 2 },
  auctionLbl:  { fontSize: 7, color: 'rgba(160,80,220,.55)', letterSpacing: 1, textTransform: 'uppercase' },
  auctionCard: { width: 50, height: 72, borderRadius: 4, backgroundColor: '#091808', borderWidth: 2, borderColor: '#a855f7', overflow: 'hidden', shadowColor: '#a855f7', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 8, elevation: 8 },
  winSlot:     { width: 50, height: 72, borderRadius: 4, borderWidth: 1.5, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.06)', alignItems: 'center', justifyContent: 'center' },
  winSlotLbl:  { fontSize: 5, color: '#38bdf8', textTransform: 'uppercase', fontWeight: '700' },
  commCard:    { width: 50, height: 72, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(74,154,90,.75)', overflow: 'hidden' },
  pileLabel:   { fontSize: 7, color: 'rgba(201,168,76,.4)', letterSpacing: 0.5, textTransform: 'uppercase' },

  userArea:     { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4, borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,.15)', zIndex: 2 },
  userLabels:   { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 3 },
  userPilesRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-start' },
  userCard:     { width: CW, height: CH, borderRadius: 4, backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: 'rgba(201,168,76,.65)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userCardSel:  { borderColor: '#6ec87a', borderWidth: 2, transform: [{ translateY: -16 }] },
  swapHint:     { fontSize: 8, color: 'rgba(201,168,76,.9)', textAlign: 'center', marginBottom: 2 },

  actionBar:    { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10, zIndex: 2 },
  btnSort:      { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e07020', backgroundColor: '#e07020', alignItems: 'center' },
  // [แก้ #2] style เมื่อ sortDone
  btnSortDone:  { backgroundColor: '#6b4010', borderColor: '#6b4010' },
  btnSortTxt:   { fontSize: 11, fontWeight: '700', color: '#ffffff', letterSpacing: 0.5 },
  btnReady:     { flex: 2, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(74,154,90,.45)', backgroundColor: '#1a5e20', alignItems: 'center' },
  btnReadyDone: { backgroundColor: '#14481a', borderColor: 'rgba(74,154,90,.2)' },
  btnReadyTxt:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 1.5 },

  devBtn:    { backgroundColor: 'rgba(255,100,0,0.3)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,100,0,0.6)' },
  devBtnTxt: { color: '#ff6400', fontSize: 9, fontWeight: '700' },
  logZone:   { flex: 15, backgroundColor: '#080808', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,.12)' },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' },
  liveDot:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#4a9a5a' },
  logTitle:  { fontSize: 8, color: 'rgba(201,168,76,.5)', letterSpacing: 2, textTransform: 'uppercase' },
  onlineTxt: { fontSize: 8, color: 'rgba(74,154,90,.7)' },
  logList:   { flex: 1, paddingHorizontal: 8, paddingVertical: 3, gap: 3 },
  logBubble: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logTxt:    { flex: 1, fontSize: 9, color: '#888' },
  logTime:   { fontSize: 7, color: '#333', minWidth: 52, textAlign: 'right' },
});

export default GameTable;
