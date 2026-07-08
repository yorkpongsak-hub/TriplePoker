import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  interpolateColor,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';
import { useCallback, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🌈  RAINBOW LABEL
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useRainbowLabel
 * เปลี่ยนสี text + drop-shadow วนซ้ำตาม Hue (HSL 0→360)
 * ใช้กับ: ชื่อผู้ชนะ · "FOUL!" · Grand Finale winner · Auction winner
 *
 * ใช้งาน:
 *   const { rainbowStyle, startRainbow, stopRainbow } = useRainbowLabel();
 *   <Animated.Text style={[styles.label, rainbowStyle]}>Winner!</Animated.Text>
 */

// จังหวะ hue cycle (ms ต่อรอบ) — ยิ่งน้อยยิ่งเร็ว
const RAINBOW_CYCLE_MS = 1200;

// สีที่ interpolate ผ่าน (ครบวงจร HSL แบบ approximated ด้วย RGB stops)
const RAINBOW_COLORS = [
  '#FF4444', // red
  '#FF8800', // orange
  '#FFD700', // gold / yellow
  '#44DD44', // green
  '#00BBFF', // cyan
  '#7744FF', // purple
  '#FF44AA', // pink
  '#FF4444', // กลับมา red (ปิด loop)
];

export interface RainbowLabelControls {
  rainbowStyle: ReturnType<typeof useAnimatedStyle>;
  startRainbow: () => void;
  stopRainbow: () => void;
}

export function useRainbowLabel(
  options: { cycleMs?: number; pulseScale?: boolean } = {},
): RainbowLabelControls {
  const { cycleMs = RAINBOW_CYCLE_MS, pulseScale = true } = options;

  // progress 0→1 วนซ้ำ — ใช้ interpolate เป็น color
  const colorProgress = useSharedValue<number>(0);

  // scale pulse เล็กน้อยให้รู้สึก "มีชีวิต"
  const scaleProgress = useSharedValue<number>(1);

  const startRainbow = useCallback(() => {
    // วน color progress ต่อเนื่องไม่หยุด
    colorProgress.value = withRepeat(
      withTiming(1, { duration: cycleMs, easing: Easing.linear }),
      -1,   // -1 = repeat ตลอดไป
      false, // false = ไม่ reverse (วนทิศเดิม)
    );

    if (pulseScale) {
      // scale 1.0 → 1.06 → 1.0 วนซ้ำ — subtle heartbeat
      scaleProgress.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: cycleMs / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.00, { duration: cycleMs / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    }
  }, [cycleMs, pulseScale]);

  const stopRainbow = useCallback(() => {
    cancelAnimation(colorProgress);
    cancelAnimation(scaleProgress);
    // fade กลับมาเป็นสีขาวปกติ
    colorProgress.value = withTiming(0, { duration: 300 });
    scaleProgress.value = withTiming(1, { duration: 300 });
  }, []);

  const rainbowStyle = useAnimatedStyle(() => {
    // interpolate progress → color จาก RAINBOW_COLORS array
    const inputRange = RAINBOW_COLORS.map((_, i) =>
      i / (RAINBOW_COLORS.length - 1),
    );
    const color = interpolateColor(colorProgress.value, inputRange, RAINBOW_COLORS);

    return {
      color,
      // drop shadow สีเดียวกับ text — glow effect ราคาถูก
      textShadowColor: color,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 12,
      transform: [{ scale: scaleProgress.value }],
    };
  });

  return { rainbowStyle, startRainbow, stopRainbow };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🔲  CHASING DASH LINES
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useChasingDash
 * เส้นประ (dash) วิ่งวนรอบกรอบ — ฟีล "ไฟประดับตู้เกมยุคเก่า"
 * ใช้กับ: กรอบ seat ผู้ชนะ · timer ใกล้หมด · ไพ่ที่ถูก select
 *
 * ต้องใช้ร่วมกับ react-native-svg <Rect> หรือ <Path> component
 * เพราะ dashOffset เป็น SVG property ไม่ใช่ RN style ปกติ
 *
 * ใช้งาน:
 *   const { animatedDashProps, startDash, stopDash } = useChasingDash({ dashLength: 12, gapLength: 8 });
 *
 *   <Svg width={W} height={H}>
 *     <AnimatedRect
 *       x="2" y="2" width={W-4} height={H-4}
 *       rx="10" ry="10"
 *       fill="none"
 *       stroke={color}
 *       strokeWidth={2}
 *       strokeDasharray={`${dashLength} ${gapLength}`}
 *       animatedProps={animatedDashProps}
 *     />
 *   </Svg>
 */

const DASH_CYCLE_MS = 800; // ms ต่อ 1 รอบ — ยิ่งน้อยวิ่งเร็วขึ้น

export interface ChasingDashOptions {
  dashLength?: number;   // ความยาว dash (px) — default 12
  gapLength?: number;    // ความยาว gap (px) — default 8
  cycleMs?: number;      // ความเร็ว (ms/รอบ) — default 800
  color?: string;        // สีเส้น — default gold
}

export interface ChasingDashControls {
  // animatedProps ส่งให้ AnimatedRect/AnimatedPath โดยตรง
  animatedDashProps: ReturnType<typeof useAnimatedProps>;
  // style สำหรับ wrapper View — ใช้กับ border ธรรมดาแทน SVG
  dashBorderStyle: ReturnType<typeof useAnimatedStyle>;
  startDash: (speed?: 'slow' | 'normal' | 'fast') => void;
  stopDash: () => void;
  // ค่าดิบสำหรับใช้เอง
  dashOffset: ReturnType<typeof useSharedValue<number>>;
}

export function useChasingDash(options: ChasingDashOptions = {}): ChasingDashControls {
  const {
    dashLength = 12,
    gapLength  = 8,
    cycleMs    = DASH_CYCLE_MS,
    color      = '#FFD700',
  } = options;

  const dashOffset = useSharedValue<number>(0);
  const glowIntensity = useSharedValue<number>(0); // glow รอบเส้น

  const SPEED_MAP = { slow: 1400, normal: 800, fast: 400 };

  const startDash = useCallback((speed: 'slow' | 'normal' | 'fast' = 'normal') => {
    const duration = SPEED_MAP[speed];
    const totalDash = dashLength + gapLength; // 1 unit = 1 dash + 1 gap

    // offset วิ่งจาก 0 → totalDash แล้ว reset (seamless loop)
    dashOffset.value = withRepeat(
      withTiming(totalDash, { duration, easing: Easing.linear }),
      -1,
      false,
    );

    // fade glow เข้ามา
    glowIntensity.value = withTiming(1, { duration: 300 });
  }, [dashLength, gapLength, cycleMs]);

  const stopDash = useCallback(() => {
    cancelAnimation(dashOffset);
    dashOffset.value = withTiming(0, { duration: 200 });
    glowIntensity.value = withTiming(0, { duration: 200 });
  }, []);

  // animatedProps สำหรับ react-native-svg AnimatedRect
  const animatedDashProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  // dashBorderStyle — fallback สำหรับ View ธรรมดา (ไม่ใช้ SVG)
  // ใช้ borderStyle: 'dashed' + rotate border color
  // NOTE: ไม่ smooth เท่า SVG แต่ไม่ต้องติดตั้ง dependency เพิ่ม
  const dashBorderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      glowIntensity.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      borderColor: color,
      borderWidth: 2,
      borderStyle: 'dashed',
      opacity,
      // shadow เลียนแบบ glow
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glowIntensity.value * 0.8,
      shadowRadius: 8,
      elevation: glowIntensity.value * 6,
    };
  });

  return { animatedDashProps, dashBorderStyle, startDash, stopDash, dashOffset };
}


// ─────────────────────────────────────────────────────────────────────────────
// 📳  SCREEN SHAKE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useScreenShake
 * สั่น translateX/Y สุ่มไปมา 200ms — รู้สึก "ทรงพลัง" โดยใช้ทรัพยากรเป็นศูนย์
 *
 * ใช้กับ: Foul detected · ชนะ All-in · Royal Flush เปิด · Grand Finale reveal
 *
 * ใช้งาน:
 *   const { shakeStyle, shake } = useScreenShake();
 *
 *   // ครอบ component ที่อยากให้สั่น
 *   <Animated.View style={[styles.gameTable, shakeStyle]}>
 *     ...
 *   </Animated.View>
 *
 *   // trigger เมื่อต้องการ
 *   shake('heavy');
 */

export type ShakeIntensity = 'light' | 'medium' | 'heavy';

const SHAKE_CONFIG: Record<ShakeIntensity, { amplitude: number; duration: number; steps: number }> = {
  light:  { amplitude: 3,  duration: 200, steps: 5 },   // เบา — ไพ่ถูกเลือก
  medium: { amplitude: 6,  duration: 280, steps: 7 },   // กลาง — Foul detected
  heavy:  { amplitude: 12, duration: 350, steps: 9 },   // หนัก — All-in win / Royal Flush
};

export interface ScreenShakeControls {
  shakeStyle: ReturnType<typeof useAnimatedStyle>;
  shake: (intensity?: ShakeIntensity, onComplete?: () => void) => void;
  shakeX: ReturnType<typeof useSharedValue<number>>;
  shakeY: ReturnType<typeof useSharedValue<number>>;
}

export function useScreenShake(): ScreenShakeControls {
  const shakeX = useSharedValue<number>(0);
  const shakeY = useSharedValue<number>(0);

  const shake = useCallback(
    (intensity: ShakeIntensity = 'medium', onComplete?: () => void) => {
      const { amplitude, duration, steps } = SHAKE_CONFIG[intensity];
      const stepDuration = duration / steps;

      // สร้าง sequence แบบ random-ish จาก pattern ที่ออกแบบไว้
      // (ไม่ใช้ Math.random ใน worklet — ใช้ pattern แทน)
      const xPattern = [1, -0.8, 0.6, -1, 0.4, -0.6, 0.2, -0.3, 0];
      const yPattern = [-0.5, 0.7, -0.4, 0.8, -0.3, 0.5, -0.6, 0.2, 0];

      // X axis shake
      shakeX.value = withSequence(
        ...xPattern.slice(0, steps).map((factor, i) =>
          withTiming(amplitude * factor, { duration: stepDuration, easing: Easing.linear })
        ),
        withTiming(0, { duration: stepDuration / 2 }, (finished) => {
          'worklet';
          // ไม่สามารถ call JS callback จาก worklet โดยตรง
          // ใช้ runOnJS ถ้าต้องการ callback
        }),
      );

      // Y axis shake — offset phase เล็กน้อยให้ไม่ sync กับ X
      shakeY.value = withDelay(
        stepDuration / 3,
        withSequence(
          ...yPattern.slice(0, steps).map((factor) =>
            withTiming(amplitude * factor * 0.6, { duration: stepDuration, easing: Easing.linear })
          ),
          withTiming(0, { duration: stepDuration / 2 }),
        ),
      );

      // callback หลัง shake เสร็จ (ใช้ setTimeout แทน worklet callback)
      if (onComplete) {
        setTimeout(onComplete, duration + stepDuration);
      }
    },
    [],
  );

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: shakeX.value },
      { translateY: shakeY.value },
    ],
  }));

  return { shakeStyle, shake, shakeX, shakeY };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🎮  COMBINED HOOK — useClassicVFX
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useClassicVFX
 * รวมทั้ง 3 effect ไว้ใน hook เดียว — ใช้ในกรณีที่ component ต้องการครบทุก effect
 *
 * ใช้งาน:
 *   const vfx = useClassicVFX();
 *
 *   // Rainbow winner name
 *   vfx.rainbow.startRainbow();
 *   <Animated.Text style={vfx.rainbow.rainbowStyle}>YOU WIN!</Animated.Text>
 *
 *   // Chasing dash กรอบ seat
 *   vfx.dash.startDash('fast');
 *   <Animated.View style={[styles.seatBorder, vfx.dash.dashBorderStyle]} />
 *
 *   // Screen shake เมื่อ foul
 *   vfx.shake.shake('heavy');
 *   <Animated.View style={[styles.table, vfx.shake.shakeStyle]}>...</Animated.View>
 */
export interface ClassicVFXControls {
  rainbow: RainbowLabelControls;
  dash: ChasingDashControls;
  shake: ScreenShakeControls;
}

export function useClassicVFX(options: {
  rainbowOptions?: Parameters<typeof useRainbowLabel>[0];
  dashOptions?: ChasingDashOptions;
} = {}): ClassicVFXControls {
  const rainbow = useRainbowLabel(options.rainbowOptions);
  const dash     = useChasingDash(options.dashOptions);
  const shake    = useScreenShake();

  return { rainbow, dash, shake };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📖  USAGE GUIDE สำหรับ Developer
// ─────────────────────────────────────────────────────────────────────────────
/*
  TriplePoker — Classic VFX Integration Map
  ==========================================

  🌈 Rainbow Label
  ─────────────────
  - EndOfMatch.tsx    → winner display name
  - GrandFinale.tsx   → isWinner player name
  - FoulAlert.tsx     → "FOUL DETECTED" text
  - AuctionOverlay.tsx → auction winner announcement

  🔲 Chasing Dash
  ─────────────────
  - GameTable.tsx     → active seat highlight (current player's turn)
  - Card.tsx          → selected card highlight (ArrangementPhase)
  - TimerHUD.tsx      → timer border เมื่อ < 5 วินาที (speed: 'fast')
  - AuctionOverlay.tsx → auction border ตลอดช่วง auction

  📳 Screen Shake
  ─────────────────
  - GameTable.tsx     → ครอบ table ทั้งหมด (target: shakeStyle ใส่ Animated.View ชั้นนอก)
  - GrandFinale.tsx   → trigger 'heavy' เมื่อ Royal Flush reveal
  - FoulChecker.tsx   → trigger 'medium' เมื่อ foul ถูกตรวจพบ
  - ArrangementPhase  → trigger 'light' เมื่อสลับไพ่ผิดกฎ

  Trigger Events (จาก gameStore / socket events):
  ─────────────────────────────────────────────────
  socket.on('foul_detected')    → shake('medium') + rainbow(foulText)
  socket.on('grand_finale_win') → shake('heavy')  + rainbow(winnerName) + dash('fast')
  socket.on('auction_start')    → dash.startDash('normal')
  socket.on('auction_end')      → dash.stopDash()
  socket.on('timer_critical')   → dash.startDash('fast')   // < 5s
*/
