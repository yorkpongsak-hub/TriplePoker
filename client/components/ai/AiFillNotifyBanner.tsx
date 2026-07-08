// ============================================================
// AiFillNotifyBanner.tsx — AI Fill Notification Banner
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// แสดงเมื่อ AI Fill เข้าร่วมโต๊ะ (FillResult.notify = true)
// Behavior:
//   1. Slide down จากด้านบน (300ms)
//   2. แสดงค้าง AUTO_HIDE_MS (default 3000ms)
//   3. Slide up หายไปเอง (300ms)
// ธีม: Dark Premium — Forest Green / Gold
// ============================================================

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  ViewStyle,
  Platform,
} from 'react-native';

// ─── Types ───────────────────────────────────────────────────
interface AiFillNotifyBannerProps {
  visible:      boolean;       // trigger แสดง/ซ่อน (true = แสดง)
  message?:     string;        // ข้อความ (default = มาตรฐาน spec)
  autoHideMs?:  number;        // ms ก่อนซ่อนอัตโนมัติ (default 3000)
  onHidden?:    () => void;    // callback เมื่อ banner ซ่อนครบแล้ว
  style?:       ViewStyle;
}

// ─── Constants ───────────────────────────────────────────────

// ข้อความมาตรฐานตาม spec
const DEFAULT_MESSAGE =
  'Waiting too long — AI players have joined to start the game';

const SLIDE_DURATION  = 300;   // ms สำหรับ slide animation
const DEFAULT_HIDE_MS = 3000;  // ms ค้างก่อนซ่อน
const BANNER_HEIGHT   = 56;    // px ความสูง banner (ใช้สำหรับ slide)

// ─── Color ───────────────────────────────────────────────────
const COLOR = {
  bg:       '#0d1f17',          // Forest Dark
  border:   '#1b6b3a',          // Emerald Green
  gold:     '#c9a84c',          // Gold accent
  textMain: '#e8f0e4',          // Off-white (อ่านง่ายบน dark)
  textSub:  '#6a8a7a',          // Muted green
  glow:     'rgba(27,107,58,0.4)',
};

// ============================
// Component หลัก
// ============================
export default function AiFillNotifyBanner({
  visible,
  message    = DEFAULT_MESSAGE,
  autoHideMs = DEFAULT_HIDE_MS,
  onHidden,
  style,
}: AiFillNotifyBannerProps) {

  // Animated value: translateY (เริ่มต้น = ลบ BANNER_HEIGHT → อยู่นอกจอด้านบน)
  const slideAnim = useRef(new Animated.Value(-BANNER_HEIGHT - 20)).current;

  // เก็บ ref ของ timeout เพื่อ clear เมื่อ unmount
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── ฟังก์ชัน slide up (ซ่อน) ──────────────────────────────
  const slideUp = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue:         -BANNER_HEIGHT - 20,
      duration:        SLIDE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden?.();
    });
  }, [slideAnim, onHidden]);

  // ─── ฟังก์ชัน slide down (แสดง) ────────────────────────────
  const slideDown = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue:         0,
      duration:        SLIDE_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;

      // ตั้ง timer auto-hide หลัง slide down เสร็จ
      hideTimer.current = setTimeout(() => {
        slideUp();
      }, autoHideMs);
    });
  }, [slideAnim, autoHideMs, slideUp]);

  // ─── Effect: ตอบสนองต่อ visible ─────────────────────────────
  useEffect(() => {
    // clear timer เก่าก่อนเสมอ
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (visible) {
      slideDown();
    } else {
      slideUp();
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible]);

  // ─── Render ──────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
        style,
      ]}
      pointerEvents="none"          // ไม่ block touch ด้านล่าง
    >
      {/* Glow bar ด้านบนสุด */}
      <View style={styles.topGlow} />

      {/* เนื้อหา banner */}
      <View style={styles.content}>

        {/* ไอคอนซ้าย */}
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>🤖</Text>
        </View>

        {/* ข้อความ */}
        <View style={styles.textWrap}>
          <Text style={styles.mainText} numberOfLines={2}>
            {message}
          </Text>
          <Text style={styles.subText}>Game will begin shortly</Text>
        </View>

        {/* Gold accent dot ขวา */}
        <View style={styles.accentDot} />
      </View>

      {/* Border เรืองแสงด้านล่าง */}
      <View style={styles.bottomBorder} />
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Container — position absolute ด้านบนหน้าจอ
  container: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    zIndex:          999,
    // Safe area padding สำหรับ notch
    paddingTop:      Platform.OS === 'ios' ? 44 : 24,
    backgroundColor: COLOR.bg,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    // Shadow กระจายลงด้านล่าง
    shadowColor:     '#1b6b3a',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.4,
    shadowRadius:    8,
    elevation:       12,
  },

  // Glow bar บนสุด
  topGlow: {
    height:          2,
    backgroundColor: COLOR.gold,
    opacity:         0.7,
  },

  // Row เนื้อหาหลัก
  content: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap:             12,
    minHeight:       BANNER_HEIGHT,
  },

  // วงกลมไอคอน
  iconWrap: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: '#142b1e',
    borderWidth:     1,
    borderColor:     COLOR.border,
    alignItems:      'center',
    justifyContent:  'center',
  },

  icon: {
    fontSize: 16,
  },

  // กลุ่มข้อความ
  textWrap: {
    flex: 1,
  },

  mainText: {
    fontSize:     12,
    fontWeight:   '600',
    color:        COLOR.textMain,
    lineHeight:   17,
    letterSpacing: 0.2,
  },

  subText: {
    fontSize:   10,
    color:      COLOR.textSub,
    marginTop:  2,
    fontStyle:  'italic',
    letterSpacing: 0.3,
  },

  // Gold dot accent ขวาสุด
  accentDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: COLOR.gold,
    opacity:         0.8,
  },

  // Border เรืองแสงด้านล่าง
  bottomBorder: {
    height:          1,
    backgroundColor: COLOR.border,
    opacity:         0.5,
    marginHorizontal: 16,
    marginBottom:    4,
  },
});
