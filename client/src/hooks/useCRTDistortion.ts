import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  interpolate,
  Extrapolation,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 👾  RGB SHIFT
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useRGBShift
 * แยก R/G/B channel ออกจากกัน (chromatic aberration) — ฟีล จอเก่า / glitch
 * ใช้ 3 Animated.View ซ้อนกัน แต่ละอันมีสี tint ต่างกัน + offset เล็กน้อย
 *
 * ใช้กับ:
 *   - Eye of the Demon activate — จอบิดนิดหน่อย 1 วิ
 *   - Last Boss Encounter — RGB shift ต่อเนื่องตลอด
 *   - AI Boss กำลัง "อ่านใจ" — shift จาง + scanline
 *   - Serpent's Bluff (False Tell) — distort animation ของผู้เล่นที่ bluff
 *
 * วิธีใช้:
 *   const { redStyle, greenStyle, blueStyle, triggerShift, startLoopShift } = useRGBShift();
 *
 *   // ซ้อน 3 layer — green เป็น base (มองเห็นปกติ) R และ B offset
 *   <View style={styles.container}>
 *     <Animated.View style={[StyleSheet.absoluteFill, redStyle]}>
 *       <YourComponent tintColor="rgba(255,0,0,0.3)" />
 *     </Animated.View>
 *     <Animated.View style={[StyleSheet.absoluteFill, greenStyle]}>
 *       <YourComponent />  ← layer หลัก
 *     </Animated.View>
 *     <Animated.View style={[StyleSheet.absoluteFill, blueStyle]}>
 *       <YourComponent tintColor="rgba(0,0,255,0.3)" />
 *     </Animated.View>
 *   </View>
 */

export type RGBShiftIntensity = 'subtle' | 'medium' | 'heavy' | 'chaos';

const RGB_CONFIG: Record<RGBShiftIntensity, {
  maxOffset: number;   // px สูงสุดที่ R/B จะเบี่ยงไป
  flickerMs: number;   // ความเร็ว glitch (ms ต่อ step)
  opacity: number;     // ความเข้มของ R/B channel overlay
}> = {
  subtle: { maxOffset: 2,  flickerMs: 120, opacity: 0.18 }, // AI อ่านใจ
  medium: { maxOffset: 4,  flickerMs: 80,  opacity: 0.28 }, // Eye of Demon
  heavy:  { maxOffset: 7,  flickerMs: 50,  opacity: 0.40 }, // Last Boss encounter
  chaos:  { maxOffset: 12, flickerMs: 30,  opacity: 0.55 }, // demon mode max
};

export interface RGBShiftControls {
  redStyle:   ReturnType<typeof useAnimatedStyle>;
  greenStyle: ReturnType<typeof useAnimatedStyle>;
  blueStyle:  ReturnType<typeof useAnimatedStyle>;
  channelOpacity: ReturnType<typeof useSharedValue<number>>;
  triggerShift: (intensity?: RGBShiftIntensity, durationMs?: number) => void;
  startLoopShift: (intensity?: RGBShiftIntensity) => void;
  stopShift: () => void;
}

export function useRGBShift(): RGBShiftControls {
  // offset ของ R channel (ซ้าย-ขวา)
  const redOffsetX   = useSharedValue<number>(0);
  const redOffsetY   = useSharedValue<number>(0);
  // offset ของ B channel (ขวา-ซ้าย — ตรงข้าม R)
  const blueOffsetX  = useSharedValue<number>(0);
  const blueOffsetY  = useSharedValue<number>(0);
  // opacity ของ channel overlay
  const channelOpacity = useSharedValue<number>(0);

  const loopTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // สร้าง random glitch pattern (safe — ไม่ใช้ใน worklet)
  const buildGlitchSequence = useCallback((maxOffset: number, flickerMs: number, steps: number) => {
    // pattern X สำหรับ R channel
    const xPattern = Array.from({ length: steps }, (_, i) => {
      const factor = Math.sin(i * 1.7) * Math.cos(i * 0.9);
      return maxOffset * factor;
    });
    return xPattern;
  }, []);

  const triggerShift = useCallback((
    intensity: RGBShiftIntensity = 'medium',
    durationMs: number = 800,
  ) => {
    const { maxOffset, flickerMs, opacity } = RGB_CONFIG[intensity];
    const steps = Math.floor(durationMs / flickerMs);

    // fade in channel overlay
    channelOpacity.value = withTiming(opacity, { duration: 80 });

    // R channel: offset ไปทางขวา-บน
    const rPattern = buildGlitchSequence(maxOffset, flickerMs, steps);
    redOffsetX.value = withSequence(
      ...rPattern.map(v => withTiming(v, { duration: flickerMs, easing: Easing.linear })),
      withTiming(0, { duration: 100 }),
    );
    redOffsetY.value = withSequence(
      ...rPattern.map((_, i) =>
        withTiming(maxOffset * Math.sin(i * 0.7) * 0.4, { duration: flickerMs, easing: Easing.linear })
      ),
      withTiming(0, { duration: 100 }),
    );

    // B channel: offset ตรงข้าม R
    blueOffsetX.value = withSequence(
      ...rPattern.map(v => withTiming(-v * 0.8, { duration: flickerMs, easing: Easing.linear })),
      withTiming(0, { duration: 100 }),
    );
    blueOffsetY.value = withSequence(
      ...rPattern.map((_, i) =>
        withTiming(-maxOffset * Math.sin(i * 0.7) * 0.3, { duration: flickerMs, easing: Easing.linear })
      ),
      withTiming(0, { duration: 100 }),
    );

    // fade out หลัง glitch เสร็จ
    channelOpacity.value = withDelay(
      durationMs,
      withTiming(0, { duration: 300 }),
    );
  }, [buildGlitchSequence]);

  const startLoopShift = useCallback((intensity: RGBShiftIntensity = 'heavy') => {
    const { flickerMs } = RGB_CONFIG[intensity];

    // loop trigger shift ทุก 1.5–3 วิ (irregular — ดูธรรมชาติกว่า)
    triggerShift(intensity, 600);
    let nextDelay = 1500;
    const schedule = () => {
      loopTimer.current = setTimeout(() => {
        triggerShift(intensity, 400 + Math.random() * 400);
        nextDelay = 1200 + Math.random() * 1800;
        schedule();
      }, nextDelay);
    };
    schedule();
  }, [triggerShift]);

  const stopShift = useCallback(() => {
    if (loopTimer.current) {
      clearTimeout(loopTimer.current);
      loopTimer.current = null;
    }
    cancelAnimation(redOffsetX);
    cancelAnimation(redOffsetY);
    cancelAnimation(blueOffsetX);
    cancelAnimation(blueOffsetY);
    redOffsetX.value   = withTiming(0, { duration: 200 });
    redOffsetY.value   = withTiming(0, { duration: 200 });
    blueOffsetX.value  = withTiming(0, { duration: 200 });
    blueOffsetY.value  = withTiming(0, { duration: 200 });
    channelOpacity.value = withTiming(0, { duration: 200 });
  }, []);

  // R channel style — เลื่อนไปขวา-บน + red tint
  const redStyle = useAnimatedStyle(() => ({
    opacity: channelOpacity.value,
    transform: [
      { translateX: redOffsetX.value },
      { translateY: redOffsetY.value },
    ],
    // tint สีแดงทับ content
    backgroundColor: `rgba(255, 0, 0, ${channelOpacity.value * 0.15})`,
    mixBlendMode: 'screen', // NOTE: RN ยังไม่รองรับ mixBlendMode — ใช้ opacity แทน
  }));

  // Green channel — base layer (ไม่ขยับ แต่ opacity ลดเล็กน้อยระหว่าง glitch)
  const greenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      channelOpacity.value,
      [0, 0.55],
      [1, 0.85],
      Extrapolation.CLAMP,
    ),
  }));

  // B channel style — เลื่อนไปซ้าย-ล่าง + blue tint
  const blueStyle = useAnimatedStyle(() => ({
    opacity: channelOpacity.value,
    transform: [
      { translateX: blueOffsetX.value },
      { translateY: blueOffsetY.value },
    ],
    backgroundColor: `rgba(0, 100, 255, ${channelOpacity.value * 0.12})`,
  }));

  return {
    redStyle, greenStyle, blueStyle,
    channelOpacity,
    triggerShift, startLoopShift, stopShift,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// 📺  SCANLINE OFFSET
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useScanlineOffset
 * เส้น scanline เลื่อนขึ้น-ลง + กระตุก (glitch scanline) — ฟีล CRT monitor
 * ใช้ PNG เส้นเดียว tiled + translateY animation
 *
 * ใช้กับ:
 *   - Fog of War phase — scanline ทับบน fog (ฟีลลึกลับ)
 *   - Boss AI thinking — scanline ทับ avatar (ฟีล "machine")
 *   - Last Boss Encounter — scanline เต็มจอตลอด
 *   - CRT Distortion combo (รวมกับ RGB Shift)
 *
 * วิธีใช้:
 *   const { scanlineStyle, startScanline, stopScanline, glitchScanline } = useScanlineOffset();
 *
 *   // วาง overlay ทับ component เป้าหมาย
 *   <View style={{ overflow: 'hidden' }}>
 *     <TargetComponent />
 *     <Animated.Image
 *       source={require('../../assets/fx/scanline_tile.png')}
 *       style={[styles.scanlineOverlay, scanlineStyle]}
 *       resizeMode="repeat"
 *       pointerEvents="none"
 *     />
 *   </View>
 *
 * Asset ที่ต้องเตรียม:
 *   assets/fx/scanline_tile.png — เส้นดำโปร่งใส 1px × 4px (opacity 30%)
 *   สร้างได้ง่ายมาก: สี่เหลี่ยม 1×4px, บรรทัดที่ 1 = black 30%, 2-4 = transparent
 */

export interface ScanlineControls {
  scanlineStyle: ReturnType<typeof useAnimatedStyle>;
  startScanline: (speed?: 'slow' | 'normal' | 'fast') => void;
  stopScanline: () => void;
  glitchScanline: () => void;  // กระตุก scanline 1 ครั้ง
  scanlineOpacity: ReturnType<typeof useSharedValue<number>>;
}

const SCANLINE_SPEED = { slow: 8000, normal: 4000, fast: 1500 };

export function useScanlineOffset(): ScanlineControls {
  const translateY     = useSharedValue<number>(0);
  const scanlineOpacity = useSharedValue<number>(0);

  const startScanline = useCallback((speed: 'slow' | 'normal' | 'fast' = 'normal') => {
    const duration = SCANLINE_SPEED[speed];

    // fade in scanline overlay
    scanlineOpacity.value = withTiming(1, { duration: 400 });

    // เลื่อนขึ้น loop — 4px คือ tile height (seamless loop)
    translateY.value = withRepeat(
      withTiming(-4, { duration: duration / 4, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const stopScanline = useCallback(() => {
    cancelAnimation(translateY);
    scanlineOpacity.value = withTiming(0, { duration: 400 });
    translateY.value = withTiming(0, { duration: 200 });
  }, []);

  // กระตุก scanline ทันที — ใช้กับ RGB shift combo
  const glitchScanline = useCallback(() => {
    // jump translateY ไปจุดสุ่ม แล้วกลับมาเดิน smooth ต่อ
    translateY.value = withSequence(
      withTiming(-24, { duration: 40,  easing: Easing.linear }),
      withTiming(-8,  { duration: 30,  easing: Easing.linear }),
      withTiming(-16, { duration: 25,  easing: Easing.linear }),
      withTiming(-4,  { duration: 200, easing: Easing.linear }),
    );
    // opacity flicker ระหว่าง glitch
    scanlineOpacity.value = withSequence(
      withTiming(0.2, { duration: 30 }),
      withTiming(1.0, { duration: 30 }),
      withTiming(0.5, { duration: 25 }),
      withTiming(1.0, { duration: 100 }),
    );
  }, []);

  const scanlineStyle = useAnimatedStyle(() => ({
    opacity: scanlineOpacity.value * 0.35, // max opacity 35% — ไม่บดบัง content
    transform: [{ translateY: translateY.value }],
    // tiled scanline image — ครอบเต็ม parent
    position: 'absolute',
    top: -4, left: 0, right: 0, bottom: 0,
  }));

  return { scanlineStyle, startScanline, stopScanline, glitchScanline, scanlineOpacity };
}


// ─────────────────────────────────────────────────────────────────────────────
// ⚡  GLITCH SHAKE
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useGlitchShake
 * สั่นแบบ digital glitch — ต่างจาก screenShake ตรงที่
 * กระตุกเป็นช่วงๆ ไม่สม่ำเสมอ + มี horizontal tear (เหมือนสัญญาณขาดหาย)
 *
 * ใช้กับ:
 *   - Serpent's Bluff (False Tell) — distort UI ของผู้เล่นที่ bluff
 *   - ไพ่ cursed / Eye of Demon reveal
 *   - Last Boss เริ่ม encounter
 */

export interface GlitchShakeControls {
  glitchStyle: ReturnType<typeof useAnimatedStyle>;
  glitch: (durationMs?: number, onComplete?: () => void) => void;
  stopGlitch: () => void;
}

export function useGlitchShake(): GlitchShakeControls {
  const translateX = useSharedValue<number>(0);
  const translateY = useSharedValue<number>(0);
  const skewX      = useSharedValue<number>(0); // horizontal tear effect

  const glitch = useCallback((durationMs: number = 600, onComplete?: () => void) => {
    // pattern glitch — ไม่สม่ำเสมอโดยเจตนา
    const xPattern = [6, -4, 8, -6, 3, -7, 4, -2, 0];
    const yPattern = [2, -3, 1, -4, 2, -1, 3, -2, 0];
    const sPattern = [1.5, -2, 1, -1.5, 0.5, -1, 0.5, 0, 0]; // skew degrees
    const stepMs   = durationMs / xPattern.length;

    translateX.value = withSequence(
      ...xPattern.map(v => withTiming(v, { duration: stepMs, easing: Easing.linear })),
    );
    translateY.value = withSequence(
      ...yPattern.map(v => withTiming(v, { duration: stepMs, easing: Easing.linear })),
    );
    skewX.value = withSequence(
      ...sPattern.map((v, i) => {
        const isLast = i === sPattern.length - 1;
        return withTiming(v, {
          duration: stepMs,
          easing: Easing.linear,
        }, isLast && onComplete ? (finished) => {
          if (finished) runOnJS(onComplete)();
        } : undefined);
      }),
    );
  }, []);

  const stopGlitch = useCallback(() => {
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(skewX);
    translateX.value = withTiming(0, { duration: 100 });
    translateY.value = withTiming(0, { duration: 100 });
    skewX.value      = withTiming(0, { duration: 100 });
  }, []);

  const glitchStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { skewX: `${skewX.value}deg` },
    ],
  }));

  return { glitchStyle, glitch, stopGlitch };
}


// ─────────────────────────────────────────────────────────────────────────────
// 🎮  COMBINED HOOK — useCRTDistortion
// ─────────────────────────────────────────────────────────────────────────────
/**
 * useCRTDistortion
 * รวม RGB Shift + Scanline + Glitch Shake — ใช้สำหรับ
 * Last Boss Encounter / Eye of Demon / Full CRT mode
 *
 * 3 Preset modes:
 *   'eye_of_demon'   → RGB medium + scanline fast + glitch 1 ครั้ง
 *   'last_boss'      → RGB heavy loop + scanline normal + glitch periodic
 *   'serpents_bluff' → RGB subtle + glitch 1 ครั้ง (ไม่มี scanline)
 *
 * วิธีใช้:
 *   const crt = useCRTDistortion();
 *
 *   // Eye of Demon activate
 *   crt.activate('eye_of_demon');
 *   // หลัง 1.5 วิ deactivate อัตโนมัติ
 *
 *   // Last Boss Encounter
 *   crt.activate('last_boss');       // เปิดต่อเนื่อง
 *   crt.deactivate();                // ปิดเมื่อ encounter จบ
 */

export type CRTMode = 'eye_of_demon' | 'last_boss' | 'serpents_bluff' | 'ai_reading';

export interface CRTDistortionControls {
  rgb:      RGBShiftControls;
  scanline: ScanlineControls;
  glitch:   GlitchShakeControls;
  activate:   (mode: CRTMode, onComplete?: () => void) => void;
  deactivate: () => void;
}

const CRT_MODE_CONFIG: Record<CRTMode, {
  rgb: { intensity: RGBShiftIntensity; loop: boolean; duration?: number };
  scan: { speed: 'slow' | 'normal' | 'fast' | null };
  glitch: { count: number; interval: number };
  autoDismiss?: number; // ms — ถ้ากำหนด จะ deactivate อัตโนมัติ
}> = {
  eye_of_demon: {
    rgb:    { intensity: 'medium', loop: false, duration: 1200 },
    scan:   { speed: 'fast' },
    glitch: { count: 1, interval: 0 },
    autoDismiss: 1800,
  },
  last_boss: {
    rgb:    { intensity: 'heavy', loop: true },
    scan:   { speed: 'normal' },
    glitch: { count: -1, interval: 3000 }, // -1 = loop
  },
  serpents_bluff: {
    rgb:    { intensity: 'subtle', loop: false, duration: 800 },
    scan:   { speed: null }, // ไม่ใช้ scanline
    glitch: { count: 1, interval: 0 },
    autoDismiss: 1200,
  },
  ai_reading: {
    rgb:    { intensity: 'subtle', loop: true },
    scan:   { speed: 'slow' },
    glitch: { count: 0, interval: 0 },
  },
};

export function useCRTDistortion(): CRTDistortionControls {
  const rgb      = useRGBShift();
  const scanline = useScanlineOffset();
  const glitch   = useGlitchShake();

  const glitchTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deactivate = useCallback(() => {
    rgb.stopShift();
    scanline.stopScanline();
    glitch.stopGlitch();
    if (glitchTimer.current)  clearInterval(glitchTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    glitchTimer.current  = null;
    dismissTimer.current = null;
  }, [rgb, scanline, glitch]);

  const activate = useCallback((mode: CRTMode, onComplete?: () => void) => {
    deactivate(); // reset ก่อนเสมอ
    const cfg = CRT_MODE_CONFIG[mode];

    // RGB Shift
    if (cfg.rgb.loop) {
      rgb.startLoopShift(cfg.rgb.intensity);
    } else {
      rgb.triggerShift(cfg.rgb.intensity, cfg.rgb.duration);
    }

    // Scanline
    if (cfg.scan.speed) {
      scanline.startScanline(cfg.scan.speed);
      // glitch scanline sync กับ RGB shift
      setTimeout(() => scanline.glitchScanline(), 100);
    }

    // Glitch Shake
    if (cfg.glitch.count === 1) {
      glitch.glitch(500);
    } else if (cfg.glitch.count === -1) {
      // loop glitch ทุก interval
      glitch.glitch(400);
      glitchTimer.current = setInterval(() => {
        glitch.glitch(300 + Math.random() * 300);
        scanline.glitchScanline();
      }, cfg.glitch.interval);
    }

    // auto dismiss
    if (cfg.autoDismiss) {
      dismissTimer.current = setTimeout(() => {
        deactivate();
        onComplete?.();
      }, cfg.autoDismiss);
    } else if (onComplete) {
      // ถ้าไม่มี autoDismiss → เรียก onComplete ทันที (caller จัดการเอง)
      onComplete();
    }
  }, [rgb, scanline, glitch, deactivate]);

  return { rgb, scanline, glitch, activate, deactivate };
}

// ─────────────────────────────────────────────────────────────────────────────
// 📖 Integration Guide
// ─────────────────────────────────────────────────────────────────────────────
/*
  TriplePoker — useCRTDistortion Integration Map
  ===============================================

  👾 Eye of the Demon (hud/CompetitiveItems.tsx)
  ────────────────────────────────────────────────
  const crt = useCRTDistortion();
  socket.on('item_used', ({ item }) => {
    if (item === 'eye_of_demon') {
      crt.activate('eye_of_demon');
      // ครอบ GameTable ด้วย RGB layers ก่อน activate
    }
  });

  🔴 Last Boss Encounter (progression/LastBossEncounter.tsx)
  ───────────────────────────────────────────────────────────
  useEffect(() => {
    crt.activate('last_boss');
    return () => crt.deactivate(); // cleanup เมื่อ component unmount
  }, []);

  // render:
  // layer 0: Red channel  → <Animated.View style={crt.rgb.redStyle}>
  // layer 1: Green (base) → <Animated.View style={crt.rgb.greenStyle}> ← content จริง
  // layer 2: Blue channel → <Animated.View style={crt.rgb.blueStyle}>
  // layer 3: Scanline     → <Animated.Image style={crt.scanline.scanlineStyle} source={scanlinePNG} />
  // ทั้งหมดใน <Animated.View style={crt.glitch.glitchStyle}>  ← wrapper สั่น

  🐍 Serpent's Bluff (hud/FunItems.tsx)
  ───────────────────────────────────────
  // เมื่อผู้เล่น bluff — apply CRT เฉพาะ avatar ของผู้เล่นนั้น
  socket.on('serpents_bluff_used', ({ targetId }) => {
    if (targetId === myId) {
      crt.activate('serpents_bluff');
    }
  });

  🤖 AI Boss Reading (game/GameTable.tsx — Boss Tier)
  ────────────────────────────────────────────────────
  socket.on('ai_thinking_start', ({ tier }) => {
    if (tier === 'boss' || tier === 'last_boss') {
      crt.activate('ai_reading');
    }
  });
  socket.on('ai_thinking_end', () => {
    crt.deactivate();
  });

  Asset ที่ต้องเตรียม:
  ─────────────────────
  assets/fx/scanline_tile.png
    - ขนาด: 2 × 4 px
    - row 0: rgba(0,0,0,0.0)   ← โปร่งใส
    - row 1: rgba(0,0,0,0.25)  ← เส้นดำจาง
    - row 2: rgba(0,0,0,0.0)
    - row 3: rgba(0,0,0,0.12)
    - export PNG-8, repeat tile ด้วย resizeMode="repeat"
*/
