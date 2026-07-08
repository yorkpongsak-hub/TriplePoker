// ============================================================
// AiThinkingIndicator.tsx — AI Seat "Thinking..." Animation
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// แสดงขณะ AI กำลังคำนวณ arrangement
// ซ่อนอัตโนมัติเมื่อ AI ตัดสินใจเสร็จ (isThinking = false)
// ธีม: Dark Premium — Forest Green / Gold
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import type { AiPersonality } from '../ai/aiFillSystem';

// ─── Types ───────────────────────────────────────────────────
interface AiThinkingIndicatorProps {
  personality: AiPersonality;
  isThinking:  boolean;         // true = แสดง animation | false = ซ่อน
  style?:      ViewStyle;
}

// ─── Personality Display Config ──────────────────────────────
const PERSONALITY_CONFIG: Record<AiPersonality, {
  label:      string;    // ชื่อที่แสดงบนที่นั่ง
  accentColor: string;   // สีเน้น personality
  icon:        string;   // emoji ประจำ personality
}> = {
  minion:   { label: 'Minion',    accentColor: '#6aaa6a', icon: '🂠'  },
  elite:    { label: 'Elite',     accentColor: '#5a9ec9', icon: '♟'  },
  reaper:   { label: 'Reaper',    accentColor: '#aa3a3a', icon: '☠️'  },
  crag:     { label: 'The Crag',  accentColor: '#c97a2a', icon: '🪨'  },
  cortex:   { label: 'Cortex',    accentColor: '#8a5aaa', icon: '🧠'  },
  cipher:   { label: 'Cipher',    accentColor: '#4a9a8a', icon: '🎭'  },
  lastBoss: { label: 'Last Boss', accentColor: '#c9a84c', icon: '👑'  },
};

// ─── Dot pulse timing ────────────────────────────────────────
const DOT_COUNT   = 3;
const DOT_DELAY   = 200; // ms ระหว่างจุดแต่ละจุด
const PULSE_CYCLE = 900; // ms รอบ pulse ทั้งหมด

// ============================
// Component หลัก
// ============================
export default function AiThinkingIndicator({
  personality,
  isThinking,
  style,
}: AiThinkingIndicatorProps) {
  const config = PERSONALITY_CONFIG[personality];

  // Animated values สำหรับ 3 จุด
  const dotAnims = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0))
  ).current;

  // Animated value สำหรับ fade in/out ทั้ง component
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ─── Fade in/out เมื่อ isThinking เปลี่ยน ────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue:         isThinking ? 1 : 0,
      duration:        250,
      useNativeDriver: true,
    }).start();
  }, [isThinking]);

  // ─── Dot pulse loop ──────────────────────────────────────
  useEffect(() => {
    if (!isThinking) return;

    // สร้าง loop animation สำหรับแต่ละจุด (stagger delay)
    const animations = dotAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * DOT_DELAY),
          Animated.timing(anim, {
            toValue:         1,
            duration:        PULSE_CYCLE / 2,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue:         0,
            duration:        PULSE_CYCLE / 2,
            useNativeDriver: true,
          }),
          // หน่วงเพื่อให้ loop สม่ำเสมอ
          Animated.delay((DOT_COUNT - 1 - i) * DOT_DELAY),
        ])
      )
    );

    // เริ่ม animation ทุกจุดพร้อมกัน
    const parallel = Animated.parallel(animations);
    parallel.start();

    return () => {
      // cleanup — reset ค่าทุกจุด
      parallel.stop();
      dotAnims.forEach(a => a.setValue(0));
    };
  }, [isThinking]);

  // ─── Render ──────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim },
        // ซ่อน pointer events เมื่อไม่ได้ thinking (ไม่ block touch)
        !isThinking && styles.hidden,
        style,
      ]}
      pointerEvents={isThinking ? 'none' : 'none'}
    >
      {/* กล่อง AI Seat */}
      <View style={[styles.card, { borderColor: config.accentColor }]}>

        {/* Icon + ชื่อ Personality */}
        <View style={styles.headerRow}>
          <Text style={styles.icon}>{config.icon}</Text>
          <Text style={[styles.label, { color: config.accentColor }]}>
            {config.label}
          </Text>
        </View>

        {/* "Thinking" text + Dot Pulse */}
        <View style={styles.thinkingRow}>
          <Text style={styles.thinkingText}>Thinking</Text>
          <View style={styles.dotsRow}>
            {dotAnims.map((anim, i) => {
              // แปลง opacity → translateY เพื่อให้จุดกระพริบขึ้น-ลง
              const translateY = anim.interpolate({
                inputRange:  [0, 1],
                outputRange: [0, -4],
              });
              const opacity = anim.interpolate({
                inputRange:  [0, 1],
                outputRange: [0.3, 1],
              });

              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    { backgroundColor: config.accentColor },
                    { opacity, transform: [{ translateY }] },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Glow bar ด้านล่าง — สีตาม personality */}
        <View style={[styles.glowBar, { backgroundColor: config.accentColor }]} />
      </View>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ซ่อนแต่ยังคง layout ไว้ (ไม่ขยับ layout เมื่อ hide)
  hidden: {
    pointerEvents: 'none' as any,
  },

  // กล่อง AI Seat — Dark Premium
  card: {
    width:           120,
    backgroundColor: '#0d1f17',          // พื้นเข้มเกือบดำ (Forest Dark)
    borderRadius:    10,
    borderWidth:     1.5,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow:        'hidden',
    // เงา glow เบาๆ
    shadowColor:     '#1b6b3a',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.4,
    shadowRadius:    6,
    elevation:       4,
  },

  // Row บน: icon + ชื่อ
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   6,
  },

  icon: {
    fontSize: 14,
  },

  label: {
    fontSize:    11,
    fontWeight:  '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Row ล่าง: "Thinking" + dots
  thinkingRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },

  thinkingText: {
    fontSize:   10,
    color:      '#6a8a7a',              // สี muted green
    fontStyle:  'italic',
    letterSpacing: 0.4,
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    marginTop:     1,
  },

  dot: {
    width:        4,
    height:       4,
    borderRadius: 2,
  },

  // Glow bar บนด้านล่าง card
  glowBar: {
    position:     'absolute',
    bottom:       0,
    left:         0,
    right:        0,
    height:       2,
    opacity:      0.6,
  },
});
