/**
 * GameTable1.tsx — Deal Test Screen
 * เทสรับไพ่จาก server: แสดงทั้ง 52 ใบ แบ่งตาม player
 * ตรวจสอบ: ครบ 52 ใบ, ไม่ซ้ำ, structure ถูกต้อง
 * The Sage Unicorn Studio Co., Ltd.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Image, ScrollView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { io, Socket } from 'socket.io-client';

// -- Card image map (key format: rank+suitChar เช่น 'ah','ks','10d')
const SUIT_CHAR: Record<string, string> = {
  spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c',
};

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

// แปลง Card object → key สำหรับ CARD_IMG
function cardKey(card: { rank: string; suit: string }): string {
  const r = card.rank.toLowerCase();
  const s = SUIT_CHAR[card.suit] ?? card.suit[0];
  return r + s;
}

// ── Types
interface Card { suit: string; rank: string; value: number; }
interface DealtPayload {
  roomId: string;
  tier: string;
  cards: Record<string, Card[]>;
  communityCards: { row1: Card[]; row2: Card[]; row3: Card[]; };
  blindAuction: Card[];
  totalCards: number;
  isValid: boolean;
  timer: number;
  timestamp: number;
}

const SERVER_URL = 'http://localhost:3001';
const ROOM_ID    = 'Beginner1';
const PLAYER_ID  = 'TestPlayer1';

const C = {
  bg:      '#080f0a',
  surface: '#0e1a13',
  border:  '#1e2e22',
  gold:    '#c9a84c',
  green:   '#2d6b3c',
  text:    '#e8dfc0',
  textSec: '#7a8a72',
  red:     '#ff3333',
  blue:    '#38bdf8',
  purple:  '#a855f7',
};

// ── Card component เล็ก
const CardFace: React.FC<{ card: Card }> = ({ card }) => {
  const key = cardKey(card);
  const img = CARD_IMG[key];
  return (
    <View style={s.cardWrap}>
      {img
        ? <Image source={img} style={s.cardImg} resizeMode="cover" />
        : <Text style={s.cardMiss}>{card.rank}{SUIT_CHAR[card.suit]}</Text>
      }
    </View>
  );
};

// ── Player section
const PlayerSection: React.FC<{
  label: string; cards: Card[]; isMe?: boolean;
}> = ({ label, cards, isMe }) => (
  <View style={[s.section, isMe && s.sectionMe]}>
    <Text style={[s.sectionLabel, isMe && { color: C.gold }]}>
      {label} ({cards.length} ใบ)
    </Text>
    <View style={s.cardRow}>
      {cards.map((c, i) => <CardFace key={i} card={c} />)}
    </View>
  </View>
);

// =================================================================
// MAIN
// =================================================================
const GameTable1: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus]   = useState<'idle' | 'connecting' | 'connected' | 'received' | 'error'>('idle');
  const [log, setLog]         = useState<string[]>([]);
  const [payload, setPayload] = useState<DealtPayload | null>(null);
  const [dupCheck, setDupCheck] = useState<{ hasDup: boolean; dups: string[] }>({ hasDup: false, dups: [] });

  const addLog = (msg: string) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()} ${msg}`]);

  // ตรวจหาไพ่ซ้ำ
  const checkDuplicates = (p: DealtPayload) => {
    const all: string[] = [];
    Object.values(p.cards).forEach(cards => cards.forEach(c => all.push(cardKey(c))));
    p.communityCards.row1.forEach(c => all.push(cardKey(c)));
    p.communityCards.row2.forEach(c => all.push(cardKey(c)));
    p.communityCards.row3.forEach(c => all.push(cardKey(c)));
    p.blindAuction.forEach(c => all.push(cardKey(c)));
    const seen = new Set<string>();
    const dups: string[] = [];
    all.forEach(k => { if (seen.has(k)) dups.push(k); else seen.add(k); });
    setDupCheck({ hasDup: dups.length > 0, dups });
  };

  const connect = () => {
    if (socketRef.current) socketRef.current.disconnect();
    setStatus('connecting');
    setLog([]);
    setPayload(null);
    addLog(`Connecting to ${SERVER_URL}...`);

    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
      addLog(`Connected — socket id: ${socket.id}`);
      addLog(`Joining room: ${ROOM_ID} as ${PLAYER_ID}`);
      socket.emit('player_join_room', {
        roomId: ROOM_ID,
        playerId: PLAYER_ID,
        tokenBalance: 5000,
        isVip: false,
      });
    });

    socket.on('player_joined', (data: any) => {
      addLog(`player_joined ack: ${JSON.stringify(data)}`);
    });

    socket.on('arrangement_start', (data: DealtPayload) => {
      setStatus('received');
      setPayload(data);
      checkDuplicates(data);
      addLog(`arrangement_start received!`);
      addLog(`isValid: ${data.isValid} | totalCards: ${data.totalCards}`);
      addLog(`Players: ${Object.keys(data.cards).join(', ')}`);
      addLog(`Community: row1=${data.communityCards.row1.length} row2=${data.communityCards.row2.length} row3=${data.communityCards.row3.length}`);
      addLog(`BlindAuction: ${data.blindAuction.length} ใบ`);
    });

    socket.on('connect_error', (err: any) => {
      setStatus('error');
      addLog(`Connection error: ${err.message}`);
    });

    socket.on('disconnect', () => {
      addLog('Disconnected');
      setStatus('idle');
    });
  };

  const disconnect = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus('idle');
    addLog('Manually disconnected');
  };

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  // ── Status badge
  const statusColor = {
    idle: C.textSec, connecting: C.gold,
    connected: C.blue, received: '#4ade80', error: C.red,
  }[status];

  const statusLabel = {
    idle: 'IDLE', connecting: 'CONNECTING...',
    connected: 'CONNECTED', received: 'DATA RECEIVED', error: 'ERROR',
  }[status];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>🃏 Deal Test — GameTable1</Text>
        <View style={[s.statusBadge, { borderColor: statusColor }]}>
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: C.green }]}
          onPress={connect}
          disabled={status === 'connecting'}
        >
          <Text style={s.btnTxt}>▶ Connect & Deal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: '#4a1010' }]}
          onPress={disconnect}
        >
          <Text style={s.btnTxt}>■ Disconnect</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Validation result */}
        {payload && (
          <View style={[s.validBox, { borderColor: payload.isValid && !dupCheck.hasDup ? '#4ade80' : C.red }]}>
            <Text style={s.validTitle}>📋 Validation Result</Text>
            <Text style={[s.validItem, { color: payload.isValid ? '#4ade80' : C.red }]}>
              {payload.isValid ? '✅' : '❌'} Total cards: {payload.totalCards} / 52
            </Text>
            <Text style={[s.validItem, { color: !dupCheck.hasDup ? '#4ade80' : C.red }]}>
              {!dupCheck.hasDup ? '✅' : '❌'} Duplicates: {dupCheck.hasDup ? dupCheck.dups.join(', ') : 'None'}
            </Text>
            <Text style={[s.validItem, { color: '#4ade80' }]}>
              ✅ Players dealt: {Object.keys(payload.cards).length} / 4
            </Text>
          </View>
        )}

        {/* Players */}
        {payload && (
          <>
            {Object.entries(payload.cards).map(([pid, cards]) => (
              <PlayerSection
                key={pid}
                label={pid === PLAYER_ID ? `👤 ${pid} (You)` : pid === 'AI' ? `🤖 ${pid}` : `👤 ${pid}`}
                cards={cards}
                isMe={pid === PLAYER_ID}
              />
            ))}

            {/* Community Cards */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: C.blue }]}>Community Cards</Text>
              {(['row1', 'row2', 'row3'] as const).map((row, i) => (
                <View key={row} style={{ marginBottom: 6 }}>
                  <Text style={s.rowLabel}>Pile {i + 1}</Text>
                  <View style={s.cardRow}>
                    {payload.communityCards[row].map((c, j) => <CardFace key={j} card={c} />)}
                  </View>
                </View>
              ))}
            </View>

            {/* Blind Auction */}
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: C.purple }]}>🔮 Blind Auction Cards</Text>
              <View style={s.cardRow}>
                {payload.blindAuction.map((c, i) => <CardFace key={i} card={c} />)}
              </View>
            </View>
          </>
        )}

        {/* Log */}
        <View style={s.logBox}>
          <Text style={s.logTitle}>📡 Socket Log</Text>
          {log.length === 0
            ? <Text style={s.logEmpty}>กด Connect & Deal เพื่อเริ่มเทส</Text>
            : log.map((l, i) => <Text key={i} style={s.logLine}>{l}</Text>)
          }
        </View>

      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingTop: 48, borderBottomWidth: 1, borderBottomColor: C.border },
  title:   { fontSize: 14, fontWeight: '800', color: C.gold, letterSpacing: 1 },
  statusBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  statusText:  { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  controls: { flexDirection: 'row', gap: 10, padding: 12 },
  btn:      { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnTxt:   { color: '#fff', fontSize: 12, fontWeight: '700' },

  scroll: { flex: 1 },

  validBox:   { margin: 12, padding: 14, borderRadius: 10, borderWidth: 1.5, backgroundColor: C.surface },
  validTitle: { color: C.text, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  validItem:  { fontSize: 11, marginBottom: 4, fontWeight: '600' },

  section:   { margin: 12, padding: 12, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  sectionMe: { borderColor: C.gold },
  sectionLabel: { color: C.blue, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  rowLabel:  { color: C.textSec, fontSize: 9, marginBottom: 4, letterSpacing: 0.5 },
  cardRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cardWrap:  { width: 40, height: 58, borderRadius: 3, overflow: 'hidden', backgroundColor: '#fdfaf3', borderWidth: 1, borderColor: C.border },
  cardImg:   { width: 40, height: 58 },
  cardMiss:  { fontSize: 8, color: '#333', textAlign: 'center', marginTop: 20 },

  logBox:   { margin: 12, padding: 12, backgroundColor: '#050d07', borderRadius: 10, borderWidth: 1, borderColor: C.border },
  logTitle: { color: C.textSec, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  logEmpty: { color: C.textSec, fontSize: 10, fontStyle: 'italic' },
  logLine:  { color: '#4ade80', fontSize: 9, fontFamily: 'monospace', marginBottom: 2 },
});

export default GameTable1;
