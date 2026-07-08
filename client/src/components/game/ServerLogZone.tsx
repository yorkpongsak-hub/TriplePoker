/**
 * ServerLogZone.tsx
 * โซนแสดง Server Activity Log + โฆษณาคั่น
 * - Chat bubble style — เขียว/แดง/ทอง/ม่วงตามประเภท event
 * - Ad คั่นทุก 25–40 วินาที (random)
 * - Online count อัพเดททุก 15 วินาที
 *
 * The Sage Unicorn Studio Co., Ltd.
 * Founder: Asst. Prof. Pongnathee Maneekul
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ── Types ──────────────────────────────────────────────────────────
type LogEventType =
  | 'join'
  | 'leave'
  | 'enter_table'
  | 'win'
  | 'lose'
  | 'auction'
  | 'challenge'
  | 'vip';

interface LogEvent {
  id: string;
  type: LogEventType | 'ad';
  icon: string;
  text: string;
  time: string;
  // สำหรับ ad bubble
  adText?: string;
  adCta?: string;
}

interface ServerLogZoneProps {
  onlineCount?: number;
  // TODO Sprint 7: เชื่อม Socket.IO events จริง
  // socketEvents?: LogEvent[];
}

// ── Theme Colors ───────────────────────────────────────────────────
const C = {
  bg:          '#080808',
  border:      'rgba(201,168,76,0.12)',
  titleColor:  'rgba(201,168,76,0.5)',
  onlineColor: 'rgba(74,154,90,0.7)',
  liveDot:     '#4a9a5a',
  textMuted:   '#888888',
  textTime:    '#333333',
  // event colors
  green:   '#4a9a5a',
  gold:    '#c9a84c',
  red:     '#a05050',
  purple:  '#c084fc',
  blue:    '#5090c0',
  // ad
  adBg:    'rgba(201,168,76,0.06)',
  adBord:  'rgba(201,168,76,0.18)',
  adBadge: 'rgba(201,168,76,0.5)',
  adCta:   '#c9a84c',
};

// ── Mock event generator (จะแทนด้วย Socket events จริงใน Sprint 7) ──
const MOCK_NAMES = [
  'SomchaiX', 'NongBeer', 'JaoPoker', 'WinWin99', 'BossKiller',
  'LuckyAce', 'ThaiDragon', 'PokerPro7', 'NakLeng', 'KingCard',
  'SiamAce', 'DevilKing', 'MegaBluff', 'CardShark', 'GoldHand',
];

const MOCK_TABLES = ['Table #1', 'Table #3', 'Table #7', 'Table #12', 'VIP Room'];

const MOCK_ADS = [
  { text: 'TriplePoker VIP — ปลดล็อคทุกฟีเจอร์', cta: 'ลอง 7 วันฟรี →' },
  { text: "Fortune's Spin — หมุนรับ Token สูงสุด 500!", cta: 'หมุนเลย →' },
  { text: 'TriplePoker Pro — ไม่มีโฆษณา + Exclusive Items', cta: 'อัพเกรด →' },
  { text: 'Token Pack — เติม Token วันนี้รับโบนัส 20%', cta: 'ซื้อเลย →' },
];

// random int ระหว่าง min–max
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randItem = <T,>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const timeNow = (): string => {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

let _idCounter = 0;
const nextId = (): string => `log_${++_idCounter}_${Date.now()}`;

// สร้าง random log event
const generateEvent = (): LogEvent => {
  const name  = randItem(MOCK_NAMES);
  const table = randItem(MOCK_TABLES);
  const tokens = randInt(50, 400);
  const types: Array<() => LogEvent> = [
    () => ({ id: nextId(), type: 'join',        icon: '🟢', text: `${name} joined the server`,              time: timeNow() }),
    () => ({ id: nextId(), type: 'leave',       icon: '🔴', text: `${name} left the server`,               time: timeNow() }),
    () => ({ id: nextId(), type: 'enter_table', icon: '🎮', text: `${name} entered ${table}`,               time: timeNow() }),
    () => ({ id: nextId(), type: 'win',         icon: '🏆', text: `${name} won +${tokens} tokens at ${table}`, time: timeNow() }),
    () => ({ id: nextId(), type: 'lose',        icon: '💀', text: `${name} lost -${randInt(50,200)} tokens`, time: timeNow() }),
    () => ({ id: nextId(), type: 'auction',     icon: '🔮', text: `${name} won a Blind Auction bid!`,       time: timeNow() }),
    () => ({ id: nextId(), type: 'challenge',   icon: '⚔️', text: `${name} challenged BOSS AI at ${table}`, time: timeNow() }),
    () => ({ id: nextId(), type: 'vip',         icon: '💎', text: `${name} upgraded to VIP`,               time: timeNow() }),
  ];
  return randItem(types)();
};

// สร้าง ad event
const generateAd = (): LogEvent => {
  const ad = randItem(MOCK_ADS);
  return {
    id: nextId(),
    type: 'ad',
    icon: '📢',
    text: '',
    time: timeNow(),
    adText: ad.text,
    adCta: ad.cta,
  };
};

// สีข้อความตาม event type
const getEventColor = (type: LogEventType | 'ad'): string => {
  switch (type) {
    case 'join':        return C.green;
    case 'leave':       return C.red;
    case 'win':         return C.gold;
    case 'lose':        return C.red;
    case 'auction':     return C.purple;
    case 'vip':         return C.purple;
    case 'challenge':   return C.blue;
    case 'enter_table': return C.textMuted;
    default:            return C.textMuted;
  }
};

// =================================================================
// MAIN COMPONENT
// =================================================================
const ServerLogZone: React.FC<ServerLogZoneProps> = ({
  onlineCount: externalCount,
}) => {
  const [logs, setLogs]       = useState<LogEvent[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(externalCount ?? 247);
  const flatListRef           = useRef<FlatList>(null);
  const liveDotAnim           = useRef(new Animated.Value(1)).current;
  const eventTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adTimerRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_LOGS              = 20; // เก็บ log สูงสุด 20 รายการ

  // ── Live dot pulse ────────────────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(liveDotAnim, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ── เพิ่ม log entry ───────────────────────────────────────────
  const addLog = useCallback((entry: LogEvent) => {
    setLogs(prev => {
      const next = [...prev, entry];
      // trim เกิน MAX_LOGS
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    });
    // scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);
  }, []);

  // ── Schedule random event ─────────────────────────────────────
  const scheduleEvent = useCallback(() => {
    const delay = randInt(1500, 3500);
    eventTimerRef.current = setTimeout(() => {
      addLog(generateEvent());
      scheduleEvent(); // recursive schedule
    }, delay);
  }, [addLog]);

  // ── Schedule ad (ทุก 25–40 วินาที) ───────────────────────────
  const scheduleAd = useCallback(() => {
    const delay = randInt(25000, 40000);
    adTimerRef.current = setTimeout(() => {
      addLog(generateAd());
      scheduleAd(); // recursive schedule
    }, delay);
  }, [addLog]);

  // ── Online count อัพเดททุก 15 วินาที ─────────────────────────
  useEffect(() => {
    if (externalCount !== undefined) {
      setOnlineCount(externalCount);
      return;
    }
    onlineTimerRef.current = setInterval(() => {
      setOnlineCount(randInt(180, 320));
    }, 15000);
    return () => {
      if (onlineTimerRef.current) clearInterval(onlineTimerRef.current);
    };
  }, [externalCount]);

  // ── Start timers ──────────────────────────────────────────────
  useEffect(() => {
    // seed initial logs
    const initial: LogEvent[] = [];
    for (let i = 0; i < 4; i++) initial.push(generateEvent());
    setLogs(initial);

    scheduleEvent();
    scheduleAd();

    return () => {
      if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
      if (adTimerRef.current)    clearTimeout(adTimerRef.current);
    };
  }, [scheduleEvent, scheduleAd]);

  // ── Render single log entry ───────────────────────────────────
  const renderItem = useCallback(({ item }: { item: LogEvent }) => {
    // Ad bubble
    if (item.type === 'ad') {
      return (
        <View style={styles.adBubble}>
          <View style={styles.adBadgeWrap}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>
          <Text style={styles.adText} numberOfLines={1}>
            {item.adText}
          </Text>
          <TouchableOpacity>
            <Text style={styles.adCta}>{item.adCta}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Normal event bubble
    const color = getEventColor(item.type);
    return (
      <View style={styles.logBubble}>
        <Text style={styles.logIcon}>{item.icon}</Text>
        <Text style={[styles.logText, { color }]} numberOfLines={1}>
          {item.text}
        </Text>
        <Text style={styles.logTime}>{item.time}</Text>
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item: LogEvent) => item.id, []);

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <View style={styles.root}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Animated.View style={[styles.liveDot, { opacity: liveDotAnim }]} />
          <Text style={styles.title}>SERVER ACTIVITY</Text>
        </View>
        <Text style={styles.onlineCount}>🟢 {onlineCount} online</Text>
      </View>

      {/* Log entries */}
      <FlatList
        ref={flatListRef}
        data={logs}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // performance
        removeClippedSubviews
        maxToRenderPerBatch={5}
        windowSize={5}
      />

    </View>
  );
};

// =================================================================
// STYLES
// =================================================================
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  // ── Header ─────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: C.liveDot,
  },
  title: {
    fontSize: 8,
    color: C.titleColor,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  onlineCount: {
    fontSize: 8,
    color: C.onlineColor,
    letterSpacing: 0.5,
  },
  // ── List ────────────────────────────────────────────────────────
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  // ── Normal bubble ───────────────────────────────────────────────
  logBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  logIcon: {
    fontSize: 9,
    lineHeight: 13,
  },
  logText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 13,
  },
  logTime: {
    fontSize: 7,
    color: C.textTime,
    lineHeight: 13,
    minWidth: 52,
    textAlign: 'right',
  },
  // ── Ad bubble ───────────────────────────────────────────────────
  adBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.adBg,
    borderWidth: 1,
    borderColor: C.adBord,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  adBadgeWrap: {
    borderWidth: 1,
    borderColor: C.adBadge,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  adBadgeText: {
    fontSize: 7,
    color: C.adBadge,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  adText: {
    flex: 1,
    fontSize: 9,
    color: '#666666',
    lineHeight: 13,
  },
  adCta: {
    fontSize: 9,
    color: C.adCta,
    fontWeight: '600',
  },
});

export default ServerLogZone;
