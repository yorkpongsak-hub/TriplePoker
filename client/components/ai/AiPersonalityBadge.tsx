// ============================================================
// AiPersonalityBadge.tsx — AI Personality Visual Badge
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// แสดงบน AI seat ตลอดเกม (ไม่ใช่แค่ตอน thinking)
// แต่ละ personality มี aura color + icon + label เป็นเอกลักษณ์
//
// Color Language (ตาม spec):
//   Reaper   → Red    (#aa3a3a) — ก้าวร้าว / อันตราย
//   The Crag → Orange (#c97a2a) — สุ่ม / โชค (heavy hitter)
//   Cortex   → Purple (#8a5aaa) — เวลา / มิติ (optimal)
//   Cipher   → Teal   (#4a9a8a) — ข้อมูล / Vision (chaos)
//   Last Boss → Gold  (#c9a84c) — ทรงพลัง / Premium
//   Minion   → Green  (#6aaa6a) — เริ่มต้น / ฝึกหัด
//   Elite    → Blue   (#5a9ec9) — มืออาชีพ
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  ViewStyle,
  Pressable,
} from 'react-native';
import type { AiPersonality } from '../ai/aiFillSystem';

// ─── Types ───────────────────────────────────────────────────
interface AiPersonalityBadgeProps {
  personality:  AiPersonality;
  isActive?:    boolean;       // true = กำลัง active (ตาของ AI) → aura pulse
  showTooltip?: boolean;       // true = แสดง tooltip คำอธิบาย personality
  style?:       ViewStyle;
}

// ─── Personality Full Config ──────────────────────────────────
interface PersonalityConfig {
  label:       string;
  subtitle:    string;         // คำอธิบายสั้นๆ ใน tooltip
  icon:        string;
  accentColor: string;         // สี aura / border
  glowColor:   string;         // สีเงา glow (ควรเป็น accentColor opacity ต่ำ)
  bgColor:     string;         // สีพื้นหลัง badge
  tier:        'beginner' | 'pro' | 'boss' | 'lastboss';
}

const PERSONALITY_CONFIG: Record<AiPersonality, PersonalityConfig> = {
  minion: {
    label:       'Minion',
    subtitle:    'Beginner AI — plays randomly',
    icon:        '🂠',
    accentColor: '#6aaa6a',
    glowColor:   'rgba(106,170,106,0.25)',
    bgColor:     '#0d1f12',
    tier:        'beginner',
  },
  elite: {
    label:       'Elite',
    subtitle:    'Pro AI — best of 5 arrangements',
    icon:        '♟',
    accentColor: '#5a9ec9',
    glowColor:   'rgba(90,158,201,0.25)',
    bgColor:     '#0d1520',
    tier:        'pro',
  },
  reaper: {
    label:       'Reaper',
    subtitle:    'Precision — locks Pile 3 at all costs',
    icon:        '☠️',
    accentColor: '#aa3a3a',
    glowColor:   'rgba(170,58,58,0.3)',
    bgColor:     '#1f0d0d',
    tier:        'boss',
  },
  crag: {
    label:       'The Crag',
    subtitle:    'Juggernaut — front-loads Pile 1 to dominate',
    icon:        '🪨',
    accentColor: '#c97a2a',
    glowColor:   'rgba(201,122,42,0.3)',
    bgColor:     '#1f1508',
    tier:        'boss',
  },
  cortex: {
    label:       'Cortex',
    subtitle:    'Optimal — 15 candidates, perfectly balanced',
    icon:        '🧠',
    accentColor: '#8a5aaa',
    glowColor:   'rgba(138,90,170,0.3)',
    bgColor:     '#130d1f',
    tier:        'boss',
  },
  cipher: {
    label:       'Cipher',
    subtitle:    'Chaos — 20% chance of unorthodox plays',
    icon:        '🎭',
    accentColor: '#4a9a8a',
    glowColor:   'rgba(74,154,138,0.3)',
    bgColor:     '#0d1a18',
    tier:        'boss',
  },
  lastBoss: {
    label:       'Last Boss',
    subtitle:    'DDE — near-optimal in 50 iterations',
    icon:        '👑',
    accentColor: '#c9a84c',
    glowColor:   'rgba(201,168,76,0.35)',
    bgColor:     '#1f1a08',
    tier:        'lastboss',
  },
};

// ─── Tier Label ──────────────────────────────────────────────
const TIER_LABEL: Record<PersonalityConfig['tier'], string> = {
  beginner: 'BEGINNER',
  pro:      'PRO',
  boss:     'BOSS',
  lastboss: 'LAST BOSS',
};

// ============================
// Component หลัก
// ============================
export default function AiPersonalityBadge({
  personality,
  isActive   = false,
  showTooltip = false,
  style,
}: AiPersonalityBadgeProps) {
  const cfg = PERSONALITY_CONFIG[personality];

  // Aura pulse animation — เมื่อ isActive (ตาของ AI)
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isActive) {
      // เริ่ม pulse loop
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue:         1,
            duration:        700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue:         0.4,
            duration:        700,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      // หยุด pulse → ค่า opacity กลับปกติ
      pulseLoop.current?.stop();
      Animated.timing(pulseAnim, {
        toValue:         0.4,
        duration:        300,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      pulseLoop.current?.stop();
    };
  }, [isActive]);

  return (
    <View style={[styles.wrapper, style]}>

      {/* Aura glow รอบ badge — pulse เมื่อ active */}
      <Animated.View
        style={[
          styles.aura,
          {
            backgroundColor: cfg.glowColor,
            opacity:          pulseAnim,
          },
        ]}
      />

      {/* Badge หลัก */}
      <View
        style={[
          styles.badge,
          {
            backgroundColor: cfg.bgColor,
            borderColor:      cfg.accentColor,
          },
        ]}
      >
        {/* Tier label บนสุด */}
        <Text style={[styles.tierLabel, { color: cfg.accentColor }]}>
          {TIER_LABEL[cfg.tier]}
        </Text>

        {/* Icon กลาง */}
        <Text style={styles.icon}>{cfg.icon}</Text>

        {/* ชื่อ personality */}
        <Text style={[styles.nameLabel, { color: cfg.accentColor }]}>
          {cfg.label}
        </Text>

        {/* Glow strip ด้านล่าง */}
        <View
          style={[
            styles.bottomStrip,
            { backgroundColor: cfg.accentColor },
          ]}
        />
      </View>

      {/* Tooltip — แสดงเมื่อ showTooltip = true */}
      {showTooltip && (
        <View style={[styles.tooltip, { borderColor: cfg.accentColor }]}>
          <Text style={[styles.tooltipTitle, { color: cfg.accentColor }]}>
            {cfg.icon}  {cfg.label}
          </Text>
          <Text style={styles.tooltipBody}>{cfg.subtitle}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    alignItems:     'center',
    justifyContent: 'center',
    position:       'relative',
  },

  // Aura glow — วนรอบ badge
  aura: {
    position:     'absolute',
    width:        96,
    height:       96,
    borderRadius: 48,
    // blur จริงต้องใช้ react-native-blur — ใช้ opacity + size แทน
  },

  // Badge กลาง
  badge: {
    width:           76,
    borderRadius:    10,
    borderWidth:     1.5,
    paddingVertical: 8,
    alignItems:      'center',
    overflow:        'hidden',
    // shadow
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.5,
    shadowRadius:    4,
    elevation:       5,
  },

  // TIER label (BEGINNER / PRO / BOSS / LAST BOSS)
  tierLabel: {
    fontSize:      7,
    fontWeight:    '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom:  4,
    opacity:       0.8,
  },

  // Icon emoji กลาง badge
  icon: {
    fontSize:     20,
    marginBottom: 4,
  },

  // ชื่อ personality
  nameLabel: {
    fontSize:      11,
    fontWeight:    '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom:  6,
  },

  // Strip เรืองแสงด้านล่าง
  bottomStrip: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    height:   2,
    opacity:  0.7,
  },

  // Tooltip popup
  tooltip: {
    position:        'absolute',
    bottom:          '110%',
    left:            '50%',
    // transform marginLeft ใน RN ไม่รองรับ % → ใช้ width fix
    width:           180,
    marginLeft:      -90,
    backgroundColor: '#0d1f17',
    borderRadius:    8,
    borderWidth:     1,
    padding:         10,
    // shadow
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.5,
    shadowRadius:    8,
    elevation:       10,
    zIndex:          100,
  },

  tooltipTitle: {
    fontSize:     12,
    fontWeight:   '700',
    marginBottom: 4,
  },

  tooltipBody: {
    fontSize:   10,
    color:      '#6a8a7a',
    lineHeight: 15,
    fontStyle:  'italic',
  },
});
