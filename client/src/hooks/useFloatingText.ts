import { useRef, useCallback } from 'react';
import {
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type PopupPresetKey =
  | 'xp'
  | 'token_gain'
  | 'token_loss'
  | 'foul'
  | 'jackpot'
  | 'perfect'
  | 'streak'
  | 'critical'
  | 'custom';

export interface PopupConfig {
  color: string;
  shadowColor: string;
  fontSize: number;
  fontWeight: '400' | '600' | '700' | '800' | '900';
  riseDistance: number;   // px ที่ลอยขึ้น
  duration: number;       // ms รวม (scale + rise + fade)
  scalePeak: number;      // scale สูงสุดตอน pop
  prefix?: string;        // เช่น '+' หรือ '-'
  suffix?: string;        // เช่น ' XP'
}

export interface FloatingTextItem {
  id: string;
  text: string;
  config: PopupConfig;
  x: number;             // absolute x position (center ของ text)
  y: number;             // absolute y position (จุดเริ่มต้น)
  // shared values ของ item นี้ — FloatingTextLayer จะ subscribe
  opacity: ReturnType<typeof useSharedValue<number>>;
  translateY: ReturnType<typeof useSharedValue<number>>;
  scale: ReturnType<typeof useSharedValue<number>>;
}

export interface SpawnOptions {
  preset?: PopupPresetKey;
  text?: string;             // override text (ถ้าไม่ระบุ ใช้ preset default)
  x: number;                 // ตำแหน่ง spawn (center x)
  y: number;                 // ตำแหน่ง spawn (top y)
  offsetRandomX?: number;    // สุ่ม jitter X เพื่อไม่ทับกัน (default 0)
  customConfig?: Partial<PopupConfig>;
}

export interface UseFloatingTextReturn {
  items: React.MutableRefObject<FloatingTextItem[]>;
  spawn: (options: SpawnOptions) => void;
  spawnXP: (amount: number, x: number, y: number) => void;
  spawnToken: (amount: number, x: number, y: number) => void;
  spawnFoul: (x: number, y: number) => void;
  spawnJackpot: (x: number, y: number) => void;
  spawnPerfect: (x: number, y: number) => void;
  spawnStreak: (count: number, x: number, y: number) => void;
  // forceUpdate — FloatingTextLayer subscribe เพื่อ re-render
  version: ReturnType<typeof useSharedValue<number>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Configs
// ─────────────────────────────────────────────────────────────────────────────
export const POPUP_PRESETS: Record<PopupPresetKey, PopupConfig> = {
  xp: {
    color:        '#A5D6A7', // เขียวอ่อน
    shadowColor:  '#1B5E20',
    fontSize:     18,
    fontWeight:   '700',
    riseDistance: 70,
    duration:     1400,
    scalePeak:    1.2,
    suffix:       ' XP',
  },
  token_gain: {
    color:        '#FFD700', // ทอง
    shadowColor:  '#FF6F00',
    fontSize:     22,
    fontWeight:   '800',
    riseDistance: 90,
    duration:     1600,
    scalePeak:    1.3,
    prefix:       '+',
  },
  token_loss: {
    color:        '#EF9A9A', // แดงอ่อน
    shadowColor:  '#B71C1C',
    fontSize:     20,
    fontWeight:   '700',
    riseDistance: 60,
    duration:     1200,
    scalePeak:    1.1,
    prefix:       '-',
  },
  foul: {
    color:        '#FF1744', // แดงสด
    shadowColor:  '#FF1744',
    fontSize:     32,
    fontWeight:   '900',
    riseDistance: 50,
    duration:     1800,
    scalePeak:    1.5, // pop ใหญ่ — ต้องรู้สึกตกใจ
    prefix:       '',
  },
  jackpot: {
    color:        '#FFD700',
    shadowColor:  '#FF6D00',
    fontSize:     36,
    fontWeight:   '900',
    riseDistance: 110,
    duration:     2200,
    scalePeak:    1.6,
  },
  perfect: {
    color:        '#CE93D8', // ม่วงอ่อน
    shadowColor:  '#7B1FA2',
    fontSize:     28,
    fontWeight:   '900',
    riseDistance: 100,
    duration:     2000,
    scalePeak:    1.4,
  },
  streak: {
    color:        '#FF9800', // ส้ม
    shadowColor:  '#E65100',
    fontSize:     24,
    fontWeight:   '800',
    riseDistance: 80,
    duration:     1600,
    scalePeak:    1.3,
    suffix:       '🔥',
  },
  critical: {
    color:        '#FF5252',
    shadowColor:  '#FF1744',
    fontSize:     30,
    fontWeight:   '900',
    riseDistance: 85,
    duration:     1800,
    scalePeak:    1.5,
  },
  custom: {
    color:        '#FFFFFF',
    shadowColor:  '#000000',
    fontSize:     20,
    fontWeight:   '700',
    riseDistance: 70,
    duration:     1400,
    scalePeak:    1.2,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
let _idCounter = 0;
const nextId = () => `fp_${++_idCounter}_${Date.now()}`;

/**
 * useFloatingText
 * Spawn floating popup text animation ที่ตำแหน่งใดก็ได้บนหน้าจอ
 *
 * Architecture:
 *   - hook นี้เก็บ queue ของ items (ref — ไม่ trigger re-render)
 *   - แต่ละ item มี shared values ของตัวเอง (opacity, translateY, scale)
 *   - FloatingTextLayer subscribe `version` shared value เพื่อรู้ว่ามี item ใหม่
 *   - หลัง animation เสร็จ → item ถูกลบออกจาก queue อัตโนมัติ
 *
 * Performance:
 *   - ทุก animation วิ่งบน UI thread (Reanimated 3)
 *   - ไม่มี re-render ระหว่าง animation
 *   - queue cleanup อัตโนมัติ — ไม่ memory leak
 */
export function useFloatingText(): UseFloatingTextReturn {
  // ref เก็บ items ปัจจุบัน — ไม่ใช้ state เพื่อหลีกเลี่ยง re-render
  const items = useRef<FloatingTextItem[]>([]);

  // version เพิ่มขึ้น 1 ทุกครั้งที่ spawn — FloatingTextLayer ใช้ force update
  const version = useSharedValue<number>(0);

  // ─── ลบ item ออกจาก queue หลัง animation เสร็จ ─────────────────────────
  const removeItem = useCallback((id: string) => {
    items.current = items.current.filter((item) => item.id !== id);
    version.value += 1; // trigger re-render ของ layer
  }, []);

  // ─── Spawn core ──────────────────────────────────────────────────────────
  const spawn = useCallback(
    ({
      preset = 'custom',
      text,
      x,
      y,
      offsetRandomX = 0,
      customConfig,
    }: SpawnOptions) => {
      const baseConfig = POPUP_PRESETS[preset];
      const config: PopupConfig = { ...baseConfig, ...customConfig };

      // สร้าง shared values ใหม่สำหรับ item นี้
      const opacity    = useSharedValue(0);
      const translateY = useSharedValue(0);
      const scale      = useSharedValue(0.3);

      const id = nextId();
      const jitterX = offsetRandomX > 0
        ? (Math.random() - 0.5) * offsetRandomX * 2
        : 0;

      // ประกอบ text สุดท้าย
      const displayText = text ?? `${config.prefix ?? ''}${preset}`;

      const item: FloatingTextItem = {
        id,
        text: displayText,
        config,
        x: x + jitterX,
        y,
        opacity,
        translateY,
        scale,
      };

      items.current.push(item);
      version.value += 1; // แจ้ง Layer ว่ามี item ใหม่

      // ─── Animation Sequence ─────────────────────────────────────────────
      // Phase 1 (0–150ms):   scale 0.3 → scalePeak  (pop out)
      // Phase 2 (150–600ms): scale → 1.0 + เริ่มลอยขึ้น
      // Phase 3 (600ms–end): ลอยต่อ + fade out
      // ─────────────────────────────────────────────────────────────────────

      const { duration, scalePeak, riseDistance } = config;
      const popDuration   = 150;
      const holdDuration  = duration * 0.3;
      const fadeDuration  = duration * 0.5;

      // Scale: pop → settle → คงที่ระหว่างลอย
      scale.value = withSequence(
        withSpring(scalePeak, { damping: 8, stiffness: 300 }),
        withTiming(1.0, { duration: 100, easing: Easing.out(Easing.quad) }),
      );

      // Opacity: fade in เร็ว → hold → fade out ช้า
      opacity.value = withSequence(
        withTiming(1, { duration: popDuration, easing: Easing.out(Easing.quad) }),
        withDelay(
          holdDuration,
          withTiming(0, {
            duration: fadeDuration,
            easing: Easing.in(Easing.quad),
          }),
        ),
      );

      // TranslateY: ลอยขึ้น smooth ตลอด duration
      // ใช้ negative เพราะ Y บนหน้าจอ RN คือขึ้น = ลบ
      translateY.value = withTiming(-riseDistance, {
        duration: duration,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          runOnJS(removeItem)(id);
        }
      });
    },
    [removeItem],
  );

  // ─── Convenience spawners ────────────────────────────────────────────────

  const spawnXP = useCallback(
    (amount: number, x: number, y: number) => {
      spawn({
        preset: 'xp',
        text: `+${amount.toLocaleString()} XP`,
        x,
        y,
        offsetRandomX: 20,
      });
    },
    [spawn],
  );

  const spawnToken = useCallback(
    (amount: number, x: number, y: number) => {
      const isGain  = amount >= 0;
      spawn({
        preset: isGain ? 'token_gain' : 'token_loss',
        text: `${isGain ? '+' : ''}${amount.toLocaleString()}`,
        x,
        y,
        offsetRandomX: 15,
      });
    },
    [spawn],
  );

  const spawnFoul = useCallback(
    (x: number, y: number) => {
      spawn({ preset: 'foul', text: 'FOUL!', x, y });
    },
    [spawn],
  );

  const spawnJackpot = useCallback(
    (x: number, y: number) => {
      spawn({ preset: 'jackpot', text: 'JACKPOT!', x, y });
    },
    [spawn],
  );

  const spawnPerfect = useCallback(
    (x: number, y: number) => {
      spawn({ preset: 'perfect', text: 'PERFECT READ!', x, y });
    },
    [spawn],
  );

  const spawnStreak = useCallback(
    (count: number, x: number, y: number) => {
      spawn({
        preset: 'streak',
        text: `STREAK x${count}! 🔥`,
        x,
        y,
      });
    },
    [spawn],
  );

  return {
    items,
    spawn,
    spawnXP,
    spawnToken,
    spawnFoul,
    spawnJackpot,
    spawnPerfect,
    spawnStreak,
    version,
  };
}
